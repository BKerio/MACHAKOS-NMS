import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:mime/mime.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/material.dart';
import 'package:nccg/config/server.dart';

class API {
  // Without this, an unreachable server (wrong network, server down, etc.)
  // hangs on the OS's default TCP timeout - often 60s+ - before any request
  // fails. Every call below is capped so a bad connection fails fast instead
  // of leaving the UI stuck waiting.
  static const Duration _timeout = Duration(seconds: 8);

  // Unified snackbar helper - constrained width on tablets so it doesn't dominate the screen
  static void showSnack(BuildContext context, String message,
      {bool success = true}) {
    final width = MediaQuery.of(context).size.width;
    final isWideScreen = width >= 600;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          message,
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w600,
            fontSize: isWideScreen ? 14 : null,
          ),
        ),
        backgroundColor: success ? Colors.green : Colors.red,
        behavior: SnackBarBehavior.floating,
        width: isWideScreen ? 420 : null,
        margin: isWideScreen ? null : const EdgeInsets.fromLTRB(16, 0, 16, 16),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }

  Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('token');
  }

  Future<http.Response> postRequest({
    required Uri url,
    required Map<String, dynamic> data,
  }) async {
    try {
      final headers = await _header();
      return await http
          .post(url, body: jsonEncode(data), headers: headers)
          .timeout(_timeout);
    } catch (e) {
      print(e.toString());
      rethrow;
    }
  }

  Future<http.Response> getRequest({required Uri url}) async {
    try {
      final headers = await _header();
      return await http.get(url, headers: headers).timeout(_timeout);
    } catch (e) {
      print(e.toString());
      rethrow;
    }
  }

  /// Downloads a raw file (e.g. a PCR report attachment) with the Bearer
  /// token attached but no Accept/Content-Type override, since the response
  /// isn't JSON. Longer default timeout than [getRequest] - a file download
  /// is bigger than a small JSON payload.
  Future<http.Response> getFileRequest({required Uri url, Duration? timeout}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('token');
      final headers = <String, String>{
        if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
      };
      return await http.get(url, headers: headers).timeout(timeout ?? const Duration(seconds: 30));
    } catch (e) {
      print(e.toString());
      rethrow;
    }
  }

  Future<http.Response> putRequest({
    required Uri url,
    required Map<String, dynamic> data,
  }) async {
    try {
      final headers = await _header();
      return await http
          .put(url, body: jsonEncode(data), headers: headers)
          .timeout(_timeout);
    } catch (e) {
      print(e.toString());
      rethrow;
    }
  }

  Future<http.Response> patchRequest({
    required Uri url,
    required Map<String, dynamic> data,
  }) async {
    try {
      final headers = await _header();
      return await http
          .patch(url, body: jsonEncode(data), headers: headers)
          .timeout(_timeout);
    } catch (e) {
      print(e.toString());
      rethrow;
    }
  }

  /// No-body request (nothing here ever sends a DELETE payload) - deliberately
  /// omits Content-Type. Sending 'application/json' with an empty body makes
  /// Fastify's JSON body parser reject the request ("Body cannot be empty
  /// when content-type is set to 'application/json'"), which is what broke
  /// vehicle checkout (DELETE /fleet/:vehicleId/checkin has no body at all).
  Future<http.Response> deleteRequest({required Uri url}) async {
    try {
      final headers = await _header(withContentType: false);
      return await http.delete(url, headers: headers).timeout(_timeout);
    } catch (e) {
      print(e.toString());
      rethrow;
    }
  }

  Future<Map<String, String>> _header({bool withContentType = true}) async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    final headers = <String, String>{
      if (withContentType) 'Content-type': 'application/json',
      'Accept': 'application/json',
    };
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  Future<http.StreamedResponse> uploadMultipart({
    required Uri url,
    required Map<String, String> fields,
    required String fileField,
    required String filePath,
    bool requireAuth = true,
    Duration? timeout,
  }) async {
    final request = http.MultipartRequest('POST', url);
    request.fields.addAll(fields);

    // Add Accept header to ensure JSON response
    request.headers['Accept'] = 'application/json';

    if (requireAuth) {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('token');
      if (token != null && token.isNotEmpty) {
        request.headers['Authorization'] = 'Bearer $token';
      }
    }
    request.files.add(await _multipartFileFromPath(fileField, filePath));
    return request.send().timeout(timeout ?? _timeout);
  }

  /// `http.MultipartFile.fromPath` defaults to `application/octet-stream`
  /// when no [MediaType] is given - it does NOT sniff the file extension.
  /// Left as-is, every upload (check-in selfies, PCR photos) would carry that
  /// generic content type regardless of what image format it actually is,
  /// which is what made the backend's `mimetype.startsWith('image/')` check
  /// reject every check-in. Detecting it via `package:mime` here makes any
  /// image type (jpg, png, heic, webp, ...) - or any other file type - carry
  /// its real content type.
  Future<http.MultipartFile> _multipartFileFromPath(String field, String filePath) async {
    final mimeType = lookupMimeType(filePath);
    return http.MultipartFile.fromPath(
      field,
      filePath,
      contentType: mimeType != null ? MediaType.parse(mimeType) : null,
    );
  }

  Future<http.StreamedResponse> uploadMultipartWithFiles({
    required Uri url,
    required Map<String, String> fields,
    required List<http.MultipartFile> files,
    bool requireAuth = true,
  }) async {
    final request = http.MultipartRequest('POST', url);
    request.fields.addAll(fields);
    
    // Add Accept header to ensure JSON response
    request.headers['Accept'] = 'application/json';
    
    if (requireAuth) {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('token');
      if (token != null && token.isNotEmpty) {
        request.headers['Authorization'] = 'Bearer $token';
      }
    }
    
    // Add all files to the request
    request.files.addAll(files);

    return request.send().timeout(_timeout);
  }
  Future<http.Response> updateDeviceToken(String token, {bool welcome = false}) async {
    return await postRequest(
      url: Uri.parse('${Config.baseUrl}/update-device-token'),
      data: {
        'token': token,
        'welcome': welcome,
      },
    );
  }
}
