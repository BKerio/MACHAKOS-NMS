import 'package:geolocator/geolocator.dart';

class GeoPoint {
  final double lat;
  final double lng;
  const GeoPoint(this.lat, this.lng);
}

/// Raised with a message that is safe to show the crew directly.
class GeoException implements Exception {
  final String message;
  GeoException(this.message);

  @override
  String toString() => message;
}

/// Native equivalent of getCurrentPosition() in frontend/src/api/responder.ts.
/// Walks the permission ladder first so the crew gets a specific instruction
/// ("turn on GPS" vs "allow location in Settings") instead of a bare failure.
Future<GeoPoint> getCurrentPosition() async {
  if (!await Geolocator.isLocationServiceEnabled()) {
    throw GeoException('Turn on location/GPS on this device, then try again.');
  }

  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }

  if (permission == LocationPermission.deniedForever) {
    throw GeoException('Location is blocked for this app. Enable it in Settings to check in.');
  }
  if (permission == LocationPermission.denied) {
    throw GeoException('Location access is needed to check in.');
  }

  try {
    final pos = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 20),
      ),
    );
    return GeoPoint(pos.latitude, pos.longitude);
  } catch (_) {
    throw GeoException('Could not get a GPS fix. Move to open sky and try again.');
  }
}
