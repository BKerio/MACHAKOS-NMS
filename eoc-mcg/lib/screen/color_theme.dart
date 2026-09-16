import 'package:flutter/material.dart';

class FlexFundTheme {
  // Primary Colors
  static const Color primaryGreen = Color(0xFF157F3D);
  static const Color darkGreen = Color(0xFF0F5A2E);
  static const Color lightGreen = Color(0xFF6CC07C);

  // Accent Colors
  static const Color primaryOrange = Color(0xFFF57C00);
  static const Color darkOrange = Color(0xFFE65100);
  static const Color softOrange = Color(0xFFFFB74D);

  // Secondary Colors
  static const Color primaryBlue = Color(0xFF1976D2);
  static const Color darkBlue = Color(0xFF0D47A1);
  static const Color lightBlue = Color(0xFF64B5F6);

  // Neutral Colors
  static const Color white = Color(0xFFFFFFFF);
  static const Color lightGray = Color(0xFFF5F5F5);
  static const Color mediumGray = Color(0xFFBDBDBD);
  static const Color darkGray = Color(0xFF212121);

  // Functional Colors
  static const Color successGreen = Color(0xFF1B8E5A);
  static const Color errorRed = Color(0xFFD32F2F);

  // Text Styles
  static const TextStyle headlineLarge = TextStyle(
    fontSize: 28,
    fontWeight: FontWeight.bold,
    color: darkGray,
  );

  static const TextStyle headlineMedium = TextStyle(
    fontSize: 22,
    fontWeight: FontWeight.bold,
    color: darkGray,
  );

  static const TextStyle headlineSmall = TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.w600,
    color: darkGray,
  );

  static const TextStyle bodyLarge = TextStyle(fontSize: 16, color: darkGray);

  static const TextStyle bodyMedium = TextStyle(fontSize: 14, color: darkGray);

  static const TextStyle bodySmall = TextStyle(fontSize: 12, color: mediumGray);

  static const TextStyle buttonText = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.bold,
    color: white,
  );

  // Reusable Input Decoration for TextFormFields
  static InputDecoration textFieldDecoration({
    String? labelText,
    String? hintText,
    IconData? suffixIcon,
    String? prefixText,
    IconData? prefixIcon,
    VoidCallback? suffixIconOnPressed,
    bool isPassword = false,
  }) {
    return InputDecoration(
      filled: true,
      fillColor: Colors.white,
      labelText: labelText,
      hintText: hintText,
      prefixText: prefixText,
      hintStyle: bodyMedium.copyWith(color: mediumGray),
      labelStyle: bodyMedium.copyWith(color: darkGray),
      contentPadding: const EdgeInsets.symmetric(
        vertical: 16.0,
        horizontal: 12.0,
      ),

      alignLabelWithHint: true,
      border: OutlineInputBorder(
        borderSide: const BorderSide(color: mediumGray, width: 1.0),
        borderRadius: BorderRadius.circular(8.0),
      ),

      enabledBorder: OutlineInputBorder(
        borderSide: BorderSide(color: Colors.grey.shade300, width: 2.0),
        borderRadius: BorderRadius.circular(8.0),
      ),
      focusedBorder: OutlineInputBorder(
        borderSide: const BorderSide(color: primaryGreen, width: 2.0),
        borderRadius: BorderRadius.circular(8.0),
      ),
      prefixIcon: Icon(prefixIcon, color: FlexFundTheme.primaryGreen),
      suffixIcon: suffixIcon != null
          ? IconButton(
              onPressed: suffixIconOnPressed,
              icon: Icon(suffixIcon, color: mediumGray),
            )
          : null,
    );
  }

  static ThemeData get theme {
    return ThemeData(
      primaryColor: primaryGreen,
      scaffoldBackgroundColor: white,
      colorScheme: ColorScheme(
        primary: primaryGreen,
        secondary: primaryBlue,
        surface: lightGray,
        error: errorRed,
        onPrimary: white,
        onSecondary: white,
        onSurface: darkGray,
        onError: white,
        brightness: Brightness.light,
      ),
      textTheme: const TextTheme(
        displayLarge: headlineLarge,
        displayMedium: headlineMedium,
        displaySmall: headlineSmall,
        bodyLarge: bodyLarge,
        bodyMedium: bodyMedium,
        bodySmall: bodySmall,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: primaryGreen,
        foregroundColor: white,
        elevation: 0,
      ),
      buttonTheme: const ButtonThemeData(
        buttonColor: primaryOrange,
        textTheme: ButtonTextTheme.primary,
      ),
    );
  }
}
