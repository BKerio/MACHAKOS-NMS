import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
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

  Future<http.Response> deleteRequest({required Uri url}) async {
    try {
      final headers = await _header();
      return await http.delete(url, headers: headers).timeout(_timeout);
    } catch (e) {
      print(e.toString());
      rethrow;
    }
  }

  Future<Map<String, String>> _header() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('token');
    final headers = <String, String>{
      'Content-type': 'application/json',
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
    request.files.add(await http.MultipartFile.fromPath(fileField, filePath));
    return request.send().timeout(_timeout);
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
