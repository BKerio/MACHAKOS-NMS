import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:eoc_mcg/models/vehicle.dart';
import 'package:eoc_mcg/services/nms_api.dart';
import 'package:eoc_mcg/theme/tokens.dart';

/// Live fleet map for the crew home, matching the dispatch console:
/// green ready, yellow no driver, red engaged, gray unavailable.
/// Pins use the ambulance tracker, not a phone check-in.
class FleetStatusMap extends StatefulWidget {
  const FleetStatusMap({super.key});

  @override
  State<FleetStatusMap> createState() => _FleetStatusMapState();
}

enum _UnitStatus { ready, noDriver, engaged, unavailable }

class _FleetStatusMapState extends State<FleetStatusMap> {
  static const _fallback = LatLng(-1.52, 37.26);
  final _mapController = MapController();
  List<Vehicle> _vehicles = [];
  bool _fitted = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 60), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _mapController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final vehicles = await NmsApi.getAgencyVehicles();
      if (!mounted) return;
      setState(() => _vehicles = vehicles);
      _fitOnce(vehicles);
    } catch (_) {}
  }

  void _fitOnce(List<Vehicle> vehicles) {
    if (_fitted) return;
    final points = vehicles.map(_point).whereType<LatLng>().toList();
    if (points.isEmpty) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _fitted) return;
      _mapController.fitCamera(
        CameraFit.bounds(
          bounds: LatLngBounds.fromPoints(points),
          padding: const EdgeInsets.all(36),
          maxZoom: 13,
        ),
      );
      _fitted = true;
    });
  }

  static LatLng? _point(Vehicle v) {
    final lat = v.trackerLat ?? v.lastLat;
    final lng = v.trackerLng ?? v.lastLng;
    if (lat == null || lng == null) return null;
    return LatLng(lat, lng);
  }

  static _UnitStatus _status(Vehicle v) {
    if (!v.isActive || v.status == 'MAINTENANCE') return _UnitStatus.unavailable;
    if (v.status == 'BUSY') return _UnitStatus.engaged;
    if (v.currentDriver != null) return _UnitStatus.ready;
    return _UnitStatus.noDriver;
  }

  static Color _color(_UnitStatus status) => switch (status) {
    _UnitStatus.ready => const Color(0xFF22C55E),
    _UnitStatus.noDriver => const Color(0xFFEAB308),
    _UnitStatus.engaged => const Color(0xFFEF4444),
    _UnitStatus.unavailable => const Color(0xFF6B7280),
  };

  @override
  Widget build(BuildContext context) {
    final plotted = _vehicles.where((v) => _point(v) != null).toList();
    final time = TimeOfDay.now();
    final clock = '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';

    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: SizedBox(
        height: 280,
        child: Stack(
          children: [
            FlutterMap(
              mapController: _mapController,
              options: const MapOptions(initialCenter: _fallback, initialZoom: 10),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'ke.go.machakos.eocmcg',
                ),
                MarkerLayer(
                  markers: [
                    for (final v in plotted)
                      Marker(
                        point: _point(v)!,
                        width: 46,
                        height: 28,
                        child: Tooltip(
                          message: '${v.registrationNumber} · ${_status(v).name}',
                          child: _AmbulanceGlyph(color: _color(_status(v))),
                        ),
                      ),
                  ],
                ),
              ],
            ),
            Positioned(
              top: 10,
              right: 10,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.85),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      'LIVE  ·  ${plotted.length} unit${plotted.length == 1 ? '' : 's'}',
                      style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.4),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.7),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(clock, style: const TextStyle(color: Colors.white70, fontSize: 10, fontFamily: 'monospace')),
                  ),
                ],
              ),
            ),
            const Positioned(left: 10, bottom: 10, child: _Legend()),
          ],
        ),
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend();

  @override
  Widget build(BuildContext context) {
    const items = [
      (Color(0xFF22C55E), 'Ready'),
      (Color(0xFFEAB308), 'No Driver'),
      (Color(0xFFEF4444), 'Engaged'),
      (Color(0xFF6B7280), 'Unavailable'),
    ];
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 12, 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppShadows.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('LEGEND', style: TextStyle(fontSize: 8, fontWeight: FontWeight.w800, letterSpacing: 1.2, color: AppColors.muted)),
          const SizedBox(height: 6),
          for (final item in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(width: 8, height: 8, decoration: BoxDecoration(color: item.$1, shape: BoxShape.circle)),
                  const SizedBox(width: 6),
                  Text(item.$2, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.ink2)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Side-view ambulance, body colour = fleet status (same idea as the web map).
class _AmbulanceGlyph extends StatelessWidget {
  final Color color;
  const _AmbulanceGlyph({required this.color});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(painter: _AmbulancePainter(color), size: const Size(46, 28));
  }
}

class _AmbulancePainter extends CustomPainter {
  final Color color;
  _AmbulancePainter(this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final body = Paint()..color = color;
    final dark = Paint()..color = const Color(0xFF1F2937);
    final r = RRect.fromRectAndRadius(const Rect.fromLTWH(2, 8, 30, 14), const Radius.circular(3));
    canvas.drawRRect(r, body);
    final cab = Path()
      ..moveTo(32, 22)
      ..lineTo(32, 12)
      ..quadraticBezierTo(32, 8, 36, 8)
      ..lineTo(42, 8)
      ..quadraticBezierTo(45, 8, 45, 13)
      ..lineTo(45, 22)
      ..close();
    canvas.drawPath(cab, body);
    canvas.drawRRect(
      RRect.fromRectAndRadius(const Rect.fromLTWH(6, 11, 12, 8), const Radius.circular(1)),
      Paint()..color = Colors.white,
    );
    canvas.drawRect(const Rect.fromLTWH(10.5, 12, 3, 6), Paint()..color = const Color(0xFFE11D48));
    canvas.drawRect(const Rect.fromLTWH(8, 14, 8, 2.5), Paint()..color = const Color(0xFFE11D48));
    canvas.drawCircle(const Offset(14, 23), 3.2, dark);
    canvas.drawCircle(const Offset(36, 23), 3.2, dark);
  }

  @override
  bool shouldRepaint(covariant _AmbulancePainter oldDelegate) => oldDelegate.color != color;
}
