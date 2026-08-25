/// API base URL for the NMS backend.
///
/// Defaults to the production nginx proxy (same as the web app's
/// `VITE_API_BASE_URL`). Override for local development:
///
/// ```bash
/// # Android emulator → host machine's backend (no /api prefix)
/// flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
///
/// # Physical device on same Wi‑Fi → your PC's LAN IP
/// flutter run --dart-define=API_BASE_URL=http://192.168.1.42:3000
/// ```
class Config {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://192.168.100.147:3000/api',
  );
}
