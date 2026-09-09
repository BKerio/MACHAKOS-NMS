import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:nccg/config/server.dart';
import 'package:nccg/method/api.dart';
import 'package:nccg/models/checklist.dart';
import 'package:nccg/models/inventory.dart';
import 'package:nccg/models/task.dart';
import 'package:nccg/models/vehicle.dart';

/// Thin wrapper around the NMS backend's REST API, using the shared [API]
/// HTTP helper (adds the Bearer token + JSON headers automatically) and
/// parsing responses into the models in models/. Endpoint-for-endpoint mirror
/// of frontend/src/api/responder.ts.
class NmsApi {
  static Uri _u(String path) => Uri.parse('${Config.baseUrl}$path');

  static Map<String, dynamic> _unwrap(http.Response res) {
    Map<String, dynamic> body;
    try {
      final decoded = jsonDecode(res.body);
      if (decoded is! Map<String, dynamic>) {
        throw NmsApiException('Unexpected server response format.', res.statusCode);
      }
      body = decoded;
    } catch (e) {
      if (e is NmsApiException) rethrow;
      throw NmsApiException(
        'Could not read server response (${res.statusCode}). Check API URL: ${Config.baseUrl}',
        res.statusCode,
      );
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw NmsApiException(body['message'] as String? ?? 'Something went wrong', res.statusCode);
    }
    return body;
  }

  /// Wraps transport failures so the login screen can show a useful message
  /// instead of a generic "check your connection" fallback.
  static Future<http.Response> _post(String path, Map<String, dynamic> data) async {
    try {
      return await API().postRequest(url: _u(path), data: data);
    } on SocketException {
      throw NmsApiException(
        'Cannot reach the server at ${Config.baseUrl}. Check your internet connection.',
        0,
      );
    } on TimeoutException {
      throw NmsApiException('Request timed out. The server may be unreachable.', 0);
    }
  }

  // ── Auth (phone + OTP) ──────────────────────────────────────────────────

  /// Texts a 6-digit code to [phone]. Throws NmsApiException with the
  /// backend's message on failure (rate-limited, unknown phone, etc.).
  static Future<void> requestOtp(String phone) async {
    final res = await _post('/auth/otp/request', {'phone': phone});
    _unwrap(res);
  }

  /// Verifies [code] for [phone]. Returns the session payload as-is - caller
  /// decides how to handle requiresRoleSelection vs a full token.
  static Future<Map<String, dynamic>> verifyOtp(String phone, String code) async {
    final res = await _post('/auth/otp/verify', {'phone': phone, 'code': code});
    final body = _unwrap(res);
    return body['data'] as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> selectRole(String pendingToken, String role) async {
    final res = await http.post(
      _u('/auth/select-role'),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer $pendingToken',
      },
      body: jsonEncode({'role': role}),
    );
    final body = _unwrap(res);
    return body['data'] as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> me() async {
    final res = await API().getRequest(url: _u('/auth/me'));
    final body = _unwrap(res);
    return body['data'] as Map<String, dynamic>;
  }

  /// Updates the signed-in user's own name/phone, or changes their password
  /// (pass currentPassword + newPassword instead). Every signed-in role may
  /// call this - it's not gated to a subset like DRIVER/EMT/NURSE server-side.
  /// Mirrors updateMyProfile() in frontend/src/api/responder.ts.
  static Future<Map<String, dynamic>> updateMyProfile({
    String? name,
    String? phone,
    String? currentPassword,
    String? newPassword,
  }) async {
    final res = await API().patchRequest(
      url: _u('/auth/me'),
      data: {
        'name': ?name,
        'phone': ?phone,
        'currentPassword': ?currentPassword,
        'newPassword': ?newPassword,
      },
    );
    final body = _unwrap(res);
    return body['data'] as Map<String, dynamic>;
  }

  static Future<void> saveSession(Map<String, dynamic> session) async {
    final prefs = await SharedPreferences.getInstance();
    final user = session['user'] as Map<String, dynamic>;
    await prefs.setString('token', session['token'] as String);
    await prefs.setString('name', user['name'] as String? ?? '');
    await prefs.setString('user_id', user['id'] as String? ?? '');
    await prefs.setString('role', (user['activeRole'] ?? user['role']) as String? ?? '');
    await prefs.setString('phone', user['phone'] as String? ?? '');
  }

  static Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    for (final key in ['token', 'name', 'user_id', 'role', 'phone']) {
      await prefs.remove(key);
    }
  }

  // ── Active task / status lifecycle ──────────────────────────────────────

  static Future<CrewTask?> getActiveTask() async {
    final res = await API().getRequest(url: _u('/tasks/active'));
    final body = _unwrap(res);
    final data = body['data'];
    if (data == null) return null;
    return CrewTask.fromJson(data as Map<String, dynamic>);
  }

  static Future<List<TaskHistoryItem>> getTaskHistory({int page = 1, int limit = 20}) async {
    final res = await API().getRequest(url: _u('/tasks/history?page=$page&limit=$limit'));
    final body = _unwrap(res);
    final data = body['data'] as List<dynamic>? ?? [];
    return data.map((e) => TaskHistoryItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<void> updateTaskStatus(String taskId, String status, {String? reason}) async {
    final res = await API().patchRequest(
      url: _u('/tasks/$taskId/status'),
      data: {'status': status, 'reason': ?reason},
    );
    _unwrap(res);
  }

  /// Closes the incident behind a task at its current stage, with a reason that
  /// is written to the case record.
  static Future<void> closeIncident(String incidentId, String reason) async {
    final res = await API().postRequest(url: _u('/incidents/$incidentId/close'), data: {'reason': reason});
    _unwrap(res);
  }

  /// Saves the crew's clinical notes for the active task's incident. Mirrors
  /// submitPatientData() in frontend/src/api/responder.ts.
  static Future<void> submitPatientData(
    String taskId, {
    required String preHospitalManagement,
    String? dispatcherChallenges,
  }) async {
    final res = await API().postRequest(
      url: _u('/tasks/$taskId/patient-data'),
      data: {
        'preHospitalManagement': preHospitalManagement,
        'dispatcherChallenges': ?dispatcherChallenges,
      },
    );
    _unwrap(res);
  }

  /// Uploads the Patient Care Report photo/document for a task, with an
  /// optional note. Mirrors uploadPatientCareReport() in
  /// frontend/src/api/responder.ts - a bigger timeout than the rest of the
  /// API since it's a file upload, not a small JSON payload.
  static Future<void> uploadPatientCareReport(
    String taskId, {
    String? note,
    required String filePath,
  }) async {
    final streamed = await API().uploadMultipart(
      url: _u('/tasks/$taskId/patient-care-report'),
      fields: {'note': ?note},
      fileField: 'file',
      filePath: filePath,
      timeout: const Duration(seconds: 60),
    );
    _unwrap(await http.Response.fromStream(streamed));
  }

  /// Passes a live case to another crew. The case stays open; [autoAssign] lets
  /// the backend pick the nearest free unit instead of [newVehicleId].
  static Future<void> handoverTask(
    String taskId, {
    required String reason,
    bool autoAssign = true,
    String? newVehicleId,
  }) async {
    final res = await API().postRequest(
      url: _u('/tasks/$taskId/reassign'),
      data: {
        'reason': reason,
        'autoAssign': autoAssign,
        'newVehicleId': ?newVehicleId,
      },
    );
    _unwrap(res);
  }

  // ── Inventory (crew stock cart) ──────────────────────────────────────────
  // Mirrors frontend/src/api/inventory.ts.

  static Future<List<InventoryItem>> getAvailableInventory() async {
    final res = await API().getRequest(url: _u('/inventory'));
    final body = _unwrap(res);
    final data = body['data'] as List<dynamic>? ?? [];
    return data.map((e) => InventoryItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Checks the given [items] (itemId -> quantity) out onto the crew's
  /// currently-checked-in vehicle.
  static Future<void> checkoutInventory(List<Map<String, dynamic>> items) async {
    final res = await API().postRequest(url: _u('/inventory/checkout'), data: {'items': items});
    _unwrap(res);
  }

  static Future<List<InventoryCheckout>> getMyInventory() async {
    final res = await API().getRequest(url: _u('/inventory/my'));
    final body = _unwrap(res);
    final data = body['data'] as List<dynamic>? ?? [];
    return data.map((e) => InventoryCheckout.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<void> returnInventory(String checkoutId, int quantity) async {
    final res = await API().postRequest(
      url: _u('/inventory/checkouts/$checkoutId/return'),
      data: {'quantity': quantity},
    );
    _unwrap(res);
  }

  // ── Pre-dispatch vehicle equipment checklist ─────────────────────────────
  // Mirrors frontend/src/api/checklist.ts against the same
  // GET/POST /fleet/:vehicleId/checklist endpoints.

  static Future<VehicleChecklist> getVehicleChecklist(String vehicleId) async {
    final res = await API().getRequest(url: _u('/fleet/$vehicleId/checklist'));
    final body = _unwrap(res);
    return VehicleChecklist.fromJson(body['data'] as Map<String, dynamic>);
  }

  static Future<void> submitChecklistItem(
    String vehicleId, {
    required String itemId,
    required String status,
    String? note,
  }) async {
    final res = await API().postRequest(
      url: _u('/fleet/$vehicleId/checklist'),
      data: {'itemId': itemId, 'status': status, 'note': ?note},
    );
    _unwrap(res);
  }

  // ── Fleet / crew ─────────────────────────────────────────────────────────

  static Future<List<Vehicle>> getAgencyVehicles() async {
    final res = await API().getRequest(url: _u('/fleet/vehicles'));
    final body = _unwrap(res);
    final data = body['data'] as List<dynamic>? ?? [];
    return data.map((e) => Vehicle.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<List<PartnerAmbulance>> getPartnerAmbulances() async {
    final res = await API().getRequest(url: _u('/fleet/partner-ambulances'));
    final body = _unwrap(res);
    final data = body['data'] as List<dynamic>? ?? [];
    return data.map((e) => PartnerAmbulance.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Null if the signed-in user hasn't checked in to a vehicle this shift.
  static Future<Vehicle?> getMyCheckIn() async {
    final res = await API().getRequest(url: _u('/fleet/my-checkin'));
    final body = _unwrap(res);
    final data = body['data'];
    if (data == null) return null;
    return Vehicle.fromJson(data as Map<String, dynamic>);
  }

  /// Starts a shift on [vehicleId]. The GPS fix and accountability selfie are
  /// both mandatory server-side before dispatch will assign cases.
  static Future<void> checkInToVehicle(
    String vehicleId, {
    required double lat,
    required double lng,
    required String selfiePath,
  }) async {
    final streamed = await API().uploadMultipart(
      url: _u('/fleet/$vehicleId/checkin'),
      fields: {'lat': '$lat', 'lng': '$lng'},
      fileField: 'file',
      filePath: selfiePath,
    );
    _unwrap(await http.Response.fromStream(streamed));
  }

  static Future<void> checkOutFromVehicle(String vehicleId) async {
    final res = await API().deleteRequest(url: _u('/fleet/$vehicleId/checkin'));
    _unwrap(res);
  }

  static Future<List<AssignableCrewMember>> getAssignableCrew() async {
    final res = await API().getRequest(url: _u('/fleet/crew-members'));
    final body = _unwrap(res);
    final data = body['data'] as List<dynamic>? ?? [];
    return data.map((e) => AssignableCrewMember.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Sets (or clears, with a null [userId]) the EMT or nurse slot on a vehicle.
  /// [role] must be 'EMT' or 'NURSE'.
  static Future<void> assignVehicleCrew(
    String vehicleId, {
    required String role,
    required String? userId,
  }) async {
    final res = await API().postRequest(
      url: _u('/fleet/$vehicleId/crew'),
      data: {role == 'EMT' ? 'emtId' : 'nurseId': userId},
    );
    _unwrap(res);
  }

  /// Free ambulances that already have a driver, nearest first when a
  /// reference point is supplied.
  static Future<List<Vehicle>> getAvailableHandoverVehicles({
    String? excludeVehicleId,
    double? lat,
    double? lng,
  }) async {
    final params = <String, String>{
      'excludeVehicleId': ?excludeVehicleId,
      if (lat != null) 'lat': '$lat',
      if (lng != null) 'lng': '$lng',
    };
    final query = params.isEmpty ? '' : '?${Uri(queryParameters: params).query}';
    final res = await API().getRequest(url: _u('/fleet/available-for-handover$query'));
    final body = _unwrap(res);
    final data = body['data'] as List<dynamic>? ?? [];
    return data.map((e) => Vehicle.fromJson(e as Map<String, dynamic>)).toList();
  }
}

class NmsApiException implements Exception {
  final String message;
  final int statusCode;
  NmsApiException(this.message, this.statusCode);

  @override
  String toString() => message;
}

/// Mirrors getErrorMessage() in frontend/src/api/responder.ts: prefer the
/// backend's message, then any transport error, then a generic fallback.
String errorMessage(Object? err) {
  if (err is NmsApiException) return err.message;
  if (err is SocketException) {
    return 'Cannot reach the server. Check your internet connection and API URL.';
  }
  if (err is TimeoutException) {
    return 'Request timed out. The server may be unreachable.';
  }
  if (err == null) return 'Something went wrong. Please try again.';
  return 'Something went wrong. Please try again.';
}
