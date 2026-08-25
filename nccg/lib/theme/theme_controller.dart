import 'package:flutter/material.dart';
import 'package:nccg/screen/color_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ThemeController extends ChangeNotifier {
  static final ThemeController instance = ThemeController._internal();
  ThemeController._internal();

  static const String _prefsA11y = 'app_accessibility_enabled';
  static const String _prefsTextScale = 'app_text_scale';
  static const String _prefsHighContrast = 'app_high_contrast';
  static const String _prefsBoldText = 'app_bold_text';
  static const String _prefsDarkMode = 'app_dark_mode';

  bool _isDarkMode = false;
  bool get isDarkMode => _isDarkMode;

  bool _accessibilityEnabled = false;
  bool get accessibilityEnabled => _accessibilityEnabled;

  double _textScaleFactor = 1.0;
  double get textScaleFactor => _textScaleFactor;

  bool _highContrast = false;
  bool get highContrast => _highContrast;

  bool _boldText = false;
  bool get boldText => _boldText;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();

    _accessibilityEnabled = prefs.getBool(_prefsA11y) ?? false;
    _textScaleFactor =
        prefs.getDouble(_prefsTextScale) ?? (_accessibilityEnabled ? 1.2 : 1.0);
    _highContrast = prefs.getBool(_prefsHighContrast) ?? _accessibilityEnabled;
    _boldText = prefs.getBool(_prefsBoldText) ?? false;
    _isDarkMode = prefs.getBool(_prefsDarkMode) ?? false;

    notifyListeners();
  }

  Future<void> setAccessibilityEnabled(bool enabled) async {
    _accessibilityEnabled = enabled;

    if (enabled) {
      _textScaleFactor = _textScaleFactor < 1.1 ? 1.2 : _textScaleFactor;
      _highContrast = true;
    } else {
      _textScaleFactor = 1.0;
      _highContrast = false;
    }

    await _savePrefs();
    notifyListeners();
  }

  Future<void> setTextScale(double scale) async {
    _textScaleFactor = scale.clamp(0.9, 1.8);
    await _savePrefs();
    notifyListeners();
  }

  Future<void> setHighContrast(bool value) async {
    _highContrast = value;
    await _savePrefs();
    notifyListeners();
  }

  Future<void> setBoldText(bool value) async {
    _boldText = value;
    await _savePrefs();
    notifyListeners();
  }

  Future<void> setDarkMode(bool value) async {
    _isDarkMode = value;
    await _savePrefs();
    notifyListeners();
  }

  Future<void> toggleDarkMode() async {
    _isDarkMode = !_isDarkMode;
    await _savePrefs();
    notifyListeners();
  }

  Future<void> _savePrefs() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_prefsA11y, _accessibilityEnabled);
    await prefs.setDouble(_prefsTextScale, _textScaleFactor);
    await prefs.setBool(_prefsHighContrast, _highContrast);
    await prefs.setBool(_prefsBoldText, _boldText);
    await prefs.setBool(_prefsDarkMode, _isDarkMode);
  }

  /// Returns an adaptive theme that respects accessibility preferences.
  ThemeData getAdaptiveTheme({bool? dark}) {
    final isDark = dark ?? _isDarkMode;
    final base = isDark
        ? ThemeData.dark(useMaterial3: true)
        : FlexFundTheme.theme;

    final scheme = base.colorScheme.copyWith(
      primary: isDark
          ? FlexFundTheme.lightBlue
          : (_highContrast
                ? FlexFundTheme.darkGreen
                : FlexFundTheme.primaryGreen),
      secondary: isDark
          ? FlexFundTheme.primaryBlue
          : (_highContrast
                ? FlexFundTheme.darkBlue
                : FlexFundTheme.primaryBlue),
      surface: isDark ? const Color(0xFF0F1113) : FlexFundTheme.lightGray,
      onSurface: isDark ? FlexFundTheme.white : FlexFundTheme.darkGray,
      error: FlexFundTheme.errorRed,
    );

    var themed = base.copyWith(
      colorScheme: scheme,
      textTheme: base.textTheme.apply(
        bodyColor: isDark ? FlexFundTheme.white : FlexFundTheme.darkGray,
        displayColor: isDark ? FlexFundTheme.white : FlexFundTheme.darkGray,
      ),
      visualDensity: VisualDensity.adaptivePlatformDensity,
    );

    if (_boldText) {
      themed = themed.copyWith(
        textTheme: themed.textTheme.copyWith(
          displayLarge: themed.textTheme.displayLarge?.copyWith(fontWeight: FontWeight.bold),
          displayMedium: themed.textTheme.displayMedium?.copyWith(fontWeight: FontWeight.bold),
          displaySmall: themed.textTheme.displaySmall?.copyWith(fontWeight: FontWeight.bold),
          headlineLarge: themed.textTheme.headlineLarge?.copyWith(fontWeight: FontWeight.bold),
          headlineMedium: themed.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
          headlineSmall: themed.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
          titleLarge: themed.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
          titleMedium: themed.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
          titleSmall: themed.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
          bodyLarge: themed.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700),
          bodyMedium: themed.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
          bodySmall: themed.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
          labelLarge: themed.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
          labelMedium: themed.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w600),
          labelSmall: themed.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w600),
        ),
      );
    }

    return themed;
  }
}
