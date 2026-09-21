class Config {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://machakos.brighton.co.ke/api',
  );

  /// Web OAuth client ID from Google Cloud Console. Passed as
  /// `serverClientId` so Android/iOS return an ID token the backend can verify.
  /// Override at build time with:
  /// `--dart-define=GOOGLE_SERVER_CLIENT_ID=....apps.googleusercontent.com`
  static const String googleServerClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
    defaultValue: '537089294294-te4foeg622pda9jlss2mvtnn6alt8sr3.apps.googleusercontent.com',
  );

  static bool get googleSignInConfigured => googleServerClientId.isNotEmpty;
}
