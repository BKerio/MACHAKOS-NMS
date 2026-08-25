import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:nccg/method/api.dart'; // Adjust path if needed

class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  Future<void> initialize() async {
    // Request permission
    NotificationSettings settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      print('User granted permission');

      // Initialize Local Notifications
      const AndroidInitializationSettings initializationSettingsAndroid =
          AndroidInitializationSettings('@mipmap/ic_launcher');

      // iOS settings
      const DarwinInitializationSettings initializationSettingsDarwin =
          DarwinInitializationSettings();

      const InitializationSettings initializationSettings =
          InitializationSettings(
            android: initializationSettingsAndroid,
            iOS: initializationSettingsDarwin,
          );

      await _localNotifications.initialize(settings: initializationSettings);

      // Handle foreground messages
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        print("Received foreground message: ${message.messageId}");
        print("Message data: ${message.data}");
        if (message.notification != null) {
            print("Message also has a notification: ${message.notification}");
        }
        _showNotification(message);
      });

      // Handle background/terminated messages when opened
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        print("Notification Clicked: ${message.data}");
        // Navigate or handle data
      });

      // Upload token if needed
      String? token = await _messaging.getToken();
      if (token != null) {
        print("FCM Token: $token");
        // We generally upload this after login, but good to have ready.
      }
    } else {
      print('User declined or has not accepted permission');
    }
  }

  // Upload token to backend
  Future<void> uploadToken({bool isLogin = false}) async {
    try {
      String? token = await _messaging.getToken();
      if (token != null) {
        await API().updateDeviceToken(token, welcome: isLogin);
        print("Device token updated on backend (welcome: $isLogin)");
      }
    } catch (e) {
      print("Failed to upload token: $e");
    }
  }

  Future<void> _showNotification(RemoteMessage message) async {
    print("Showing notification for message: ${message.messageId}");
    
    RemoteNotification? notification = message.notification;

    // Default title/body if not present in `notification` object (e.g. data-only message)
    String title = notification?.title ?? message.data['title'] ?? 'Notification';
    String body = notification?.body ?? message.data['body'] ?? message.data['message'] ?? '';

    // If we have a notification object OR sufficient data
    if ((notification != null) || (message.data.isNotEmpty)) {
      await _localNotifications.show(
        id: notification.hashCode,
        title: title,
        body: body,
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            'high_importance_channel',
            'High Importance Notifications',
            channelDescription:
                'This channel is used for important notifications.',
            importance: Importance.max,
            priority: Priority.high,
            icon: '@mipmap/ic_launcher',
          ),
          iOS: const DarwinNotificationDetails(),
        ),
      );
      print("Local notification executed.");
    } else {
        print("Message contained no notification and no suitable data to display.");
    }
  }
}
