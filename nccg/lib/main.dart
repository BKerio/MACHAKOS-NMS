import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:nccg/components/splash_screen.dart';
import 'package:nccg/theme/theme_controller.dart';


void main() async {
  WidgetsFlutterBinding.ensureInitialized();
// await Firebase.initializeApp();
  // await NotificationService().initialize();
  await ThemeController.instance.load();
  runApp(const MyApp());
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
