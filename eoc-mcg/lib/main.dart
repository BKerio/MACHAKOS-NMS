import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:eoc_mcg/components/splash_screen.dart';
import 'package:eoc_mcg/firebase_options.dart';
import 'package:eoc_mcg/navigation.dart';
import 'package:eoc_mcg/services/notification_service.dart';
import 'package:eoc_mcg/theme/theme_controller.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await _initPushNotifications();
  await ThemeController.instance.load();
  runApp(const MyApp());
}

/// Wired up to the `eoc-mcg` Firebase project (see lib/firebase_options.dart,
/// generated via `flutterfire configure`) - guarded so a misconfigured/
/// unreachable project just disables push instead of crashing launch.
Future<void> _initPushNotifications() async {
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    await NotificationService().initialize();
  } catch (e) {
    debugPrint('Push notifications unavailable (Firebase not configured?): $e');
  }
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  @override
  void initState() {
    super.initState();
    ThemeController.instance.addListener(_onThemeChange);
  }

  @override
  void dispose() {
    ThemeController.instance.removeListener(_onThemeChange);
    super.dispose();
  }

  void _onThemeChange() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final themeController = ThemeController.instance;

    return MaterialApp(
      navigatorKey: rootNavigatorKey,
      title: 'NMS Field Crew',
      debugShowCheckedModeBanner: false,
      theme: themeController.getAdaptiveTheme(),
      scrollBehavior: AppScrollBehavior(),

      builder: (context, child) {
        final scale = themeController.textScaleFactor;
        final media = MediaQuery.of(context);
        return MediaQuery(
          data: media.copyWith(textScaler: TextScaler.linear(scale)),
          child: child ?? const SizedBox.shrink(),
        );
      },

      home: const SplashScreen(),
    );
  }
}

class AppScrollBehavior extends MaterialScrollBehavior {
  @override
  Set<PointerDeviceKind> get dragDevices => {
        PointerDeviceKind.touch,
        PointerDeviceKind.mouse,
        PointerDeviceKind.trackpad,
        PointerDeviceKind.stylus,
        PointerDeviceKind.unknown,
      };
}
