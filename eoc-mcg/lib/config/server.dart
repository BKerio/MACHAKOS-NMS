class Config {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://machakos.brighton.co.ke/api',
  );
}
