import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:nccg/navigation.dart';
import 'package:nccg/screen/operator/operator_shell.dart';
import 'package:nccg/services/nms_api.dart';

/// Must be a top-level (or static) function: the platform relaunches an
/// isolate to run this when a data/notification message arrives while the
/// app is backgrounded or terminated. Firebase must be re-initialized here -
/// it's a fresh isolate, not a continuation of main()'s.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint('Handling a background push message: ${message.messageId}');
}

/// Wraps Firebase Cloud Messaging + local notification display for new-case
/// alerts pushed from backend/src/modules/tasks/task.service.ts. Port of
/// Apiwapi's soko/lib/push_notifications.dart, adapted to this app's
/// phone+OTP/Bearer-token auth (soko's Members have no login of their own).
class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();

  static const _androidChannel = AndroidNotificationChannel(
    'high_importance_channel',
    'High Importance Notifications',
    description: 'Used for new-case alerts shown while the app is in the foreground.',
    importance: Importance.high,
  );

  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    await _setupLocalNotifications();

    final settings = await _messaging.requestPermission(alert: true, badge: true, sound: true);
    debugPrint('Notification permission status: ${settings.authorizationStatus}');

    // Foreground messages don't show a system notification by default, so
    // render one ourselves via flutter_local_notifications.
    FirebaseMessaging.onMessage.listen(_showForegroundNotification);

    // Tapped the system tray notification while the app was backgrounded.
    FirebaseMessaging.onMessageOpenedApp.listen(_handleTap);

    // App was launched by tapping a notification while fully terminated.
    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) _handleTap(initialMessage);

    // Re-sync whenever the token rotates - the caller (main.dart, right after
    // a successful login) uploads it once; this keeps the backend's copy
    // current for the lifetime of the session after that.
    _messaging.onTokenRefresh.listen((newToken) {
      debugPrint('FCM token refreshed');
      unawaited(uploadToken());
    });
  }

  Future<void> _setupLocalNotifications() async {
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings();
    const initSettings = InitializationSettings(android: androidInit, iOS: iosInit);

    await _localNotifications.initialize(
      settings: initSettings,
      onDidReceiveNotificationResponse: (details) {
        // Tapped the local notification rendered while foregrounded - no
        // RemoteMessage to hand off here, so just land on the app's home.
        _goToShell();
      },
    );

    await _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_androidChannel);
  }

  void _handleTap(RemoteMessage message) {
    debugPrint('Notification tapped: ${message.data}');
    // New-case alerts (see task.service.ts's push data payload) land the
    // crew straight on the Assignment tab instead of just the app's home.
    _goToShell(initialTabLabel: message.data['type'] == 'TASK_ASSIGNED' ? 'Assignment' : null);
  }

  void _goToShell({String? initialTabLabel}) {
    rootNavigatorKey.currentState?.pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => OperatorShell(initialTabLabel: initialTabLabel)),
      (route) => false,
    );
  }

  void _showForegroundNotification(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;

    _localNotifications.show(
      id: notification.hashCode,
      title: notification.title,
      body: notification.body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _androidChannel.id,
          _androidChannel.name,
          channelDescription: _androidChannel.description,
          icon: '@mipmap/ic_launcher',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: const DarwinNotificationDetails(),
      ),
    );
  }

  /// Registers (or refreshes) this device's FCM token with the backend for
  /// the signed-in user. Safe to call even if push was never initialized
  /// (e.g. permission denied) - just gets no token back and no-ops.
  Future<void> uploadToken() async {
    try {
      final token = await _messaging.getToken();
      if (token == null) return;
      await NmsApi.registerPushToken(token);
      debugPrint('Device push token registered');
    } catch (e) {
      debugPrint('Failed to register push token: $e');
    }
  }

  /// Clears this device's token from the backend on sign-out, so a shared/
  /// reissued device doesn't keep receiving another crew member's alerts.
  Future<void> clearToken() async {
    try {
      await NmsApi.unregisterPushToken();
    } catch (e) {
      debugPrint('Failed to clear push token: $e');
    }
  }
}
