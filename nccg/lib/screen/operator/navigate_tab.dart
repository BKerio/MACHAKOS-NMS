import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';
import 'package:nccg/method/api.dart';
import 'package:nccg/models/task.dart';
import 'package:nccg/screen/operator/operator_shell.dart';
import 'package:nccg/screen/operator/patient_care_report_screen.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/theme/tokens.dart';

/// Driver-only tab: in-app turn-by-turn-style navigation to the active
/// incident. Mirrors frontend/src/pages/operator/NavigatePage.tsx - the
/// scene, the driver's live position and the route all stay inside the app
/// instead of handing the driver off to an external Maps/Uber app.
///
/// Route line comes from OSRM's free public routing API (no API key, same
/// "no key needed" tier as the Carto tiles used elsewhere - see
/// widgets/available_ambulances_card.dart) rather than Google Directions,
/// which needs a billed Google Cloud project.
class NavigateTab extends StatefulWidget {
  const NavigateTab({super.key});

  @override
  State<NavigateTab> createState() => _NavigateTabState();
}

class _NavigateTabState extends State<NavigateTab> {
  CrewTask? _task;
  bool _loading = true;
  bool _updating = false;

  LatLng? _me;
  String? _locError;
  StreamSubscription<Position>? _posSub;

  List<LatLng>? _route;
  bool _routeLoading = false;
  String? _distanceText;
  String? _durationText;

  final MapController _mapController = MapController();
  bool _didInitialFit = false;

  @override
  void initState() {
    super.initState();
    _load();
    _startTracking();
  }

  @override
  void dispose() {
    _posSub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final task = await NmsApi.getActiveTask();
      if (!mounted) return;
      setState(() => _task = task);
      _maybeFetchRoute();
    } catch (_) {
      // Stay on the empty state - the refresh control lets them retry.
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _startTracking() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        if (mounted) setState(() => _locError = 'Turn on location/GPS on this device.');
        return;
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        if (mounted) setState(() => _locError = 'Location access is needed to navigate.');
        return;
      }

      _posSub = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 25),
      ).listen((pos) {
        if (!mounted) return;
        setState(() {
          _me = LatLng(pos.latitude, pos.longitude);
          _locError = null;
        });
        _fitToRouteOnce();
        _maybeFetchRoute();
      });
    } catch (_) {
      if (mounted) setState(() => _locError = 'Could not start GPS tracking.');
    }
  }

  void _fitToRouteOnce() {
    if (_didInitialFit || _me == null) return;
    final incident = _task?.incident;
    if (incident?.lat == null || incident?.lng == null) return;
    _didInitialFit = true;
    final dest = LatLng(incident!.lat!, incident.lng!);
    _mapController.fitCamera(
      CameraFit.coordinates(
        coordinates: [_me!, dest],
        padding: const EdgeInsets.fromLTRB(40, 100, 40, 220),
      ),
    );
  }

  Future<void> _maybeFetchRoute() async {
    final incident = _task?.incident;
    final me = _me;
    if (me == null || incident?.lat == null || incident?.lng == null) return;

    setState(() => _routeLoading = true);
    try {
      final dest = LatLng(incident!.lat!, incident.lng!);
      final url = Uri.parse(
        'https://router.project-osrm.org/route/v1/driving/'
        '${me.longitude},${me.latitude};${dest.longitude},${dest.latitude}'
        '?overview=full&geometries=geojson',
      );
      final res = await http.get(url).timeout(const Duration(seconds: 12));
      if (res.statusCode != 200) return;

      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final routes = data['routes'] as List?;
      if (routes == null || routes.isEmpty) return;
      final route = routes.first as Map<String, dynamic>;
      final coords = (route['geometry']?['coordinates'] as List?) ?? [];
      final points = coords.map((c) => LatLng((c as List)[1] as double, c[0] as double)).toList();

      if (!mounted || points.isEmpty) return;
      setState(() {
        _route = points;
        _distanceText = _formatKm((route['distance'] as num).toDouble());
        _durationText = _formatDuration((route['duration'] as num).toDouble());
      });
    } catch (_) {
      // Keep whatever route we already had (or none) - a straight-line
      // distance still shows via _statusLine below.
    } finally {
      if (mounted) setState(() => _routeLoading = false);
    }
  }

  static String _formatKm(double meters) {
    final km = meters / 1000;
    return km < 1 ? '${meters.round()} m' : '${km.toStringAsFixed(1)} km';
  }

  static String _formatDuration(double seconds) {
    final mins = (seconds / 60).round();
    if (mins < 60) return '$mins min';
    final h = mins ~/ 60;
    final m = mins % 60;
    return m > 0 ? '$h hr $m min' : '$h hr';
  }

  double? _straightLineKm() {
    final incident = _task?.incident;
    if (_me == null || incident?.lat == null || incident?.lng == null) return null;
    return const Distance().as(LengthUnit.Kilometer, _me!, LatLng(incident!.lat!, incident.lng!));
  }

  String get _statusLine {
    if (_distanceText != null && _durationText != null) return '$_durationText · $_distanceText';
    if (_routeLoading && _me != null) return 'Calculating route…';
    final km = _straightLineKm();
    if (km != null) {
      final label = km < 1 ? '${(km * 1000).round()} m' : '${km.toStringAsFixed(1)} km';
      return '$label away · straight line';
    }
    return _locError ?? 'Locating you…';
  }

  Future<void> _advance() async {
    final task = _task;
    if (task == null) return;
    final next = TaskStatus.next(task.status);
    if (next == null) return;

    setState(() => _updating = true);
    try {
      await NmsApi.updateTaskStatus(task.id, next);
      if (!mounted) return;
      API.showSnack(context, TaskStatus.actionLabel(task.status) ?? 'Status updated');
      if (next == TaskStatus.completed) {
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => PatientCareReportScreen(taskId: task.id, caseNumber: task.incident.caseNumber),
          ),
        );
      }
      if (mounted) await _load();
    } catch (e) {
      if (mounted) API.showSnack(context, errorMessage(e), success: false);
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: kOpPrimary));
    }
    final task = _task;
    if (task == null) {
      return RefreshIndicator(
        onRefresh: _load,
        color: kOpPrimary,
        child: ListView(children: const [
          SizedBox(height: 140),
          Center(child: Text('No active assignment to navigate to.', style: TextStyle(color: Colors.black54))),
        ]),
      );
    }

    final incident = task.incident;
    final hasCoords = incident.lat != null && incident.lng != null;
    final nextLabel = TaskStatus.actionLabel(task.status);
    final canAdvance = TaskStatus.next(task.status) != null;
    final dest = hasCoords ? LatLng(incident.lat!, incident.lng!) : null;
    final centre = _me ?? dest ?? const LatLng(-1.2921, 36.8219);

    return Column(
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          color: AppColors.navBg,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                incident.caseNumber.isNotEmpty ? incident.caseNumber : incident.locationName,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15),
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text(_statusLine, style: const TextStyle(color: AppColors.navMuted, fontSize: 12.5)),
            ],
          ),
        ),
        Expanded(
          child: !hasCoords
              ? const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text('No GPS coordinates on this incident yet.', style: TextStyle(color: Colors.black54)),
                  ),
                )
              : Stack(
                  children: [
                    FlutterMap(
                      mapController: _mapController,
                      options: MapOptions(initialCenter: centre, initialZoom: 14),
                      children: [
                        TileLayer(
                          urlTemplate: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                          userAgentPackageName: 'ke.go.machakos.nccg',
                        ),
                        if (_route != null)
                          PolylineLayer(polylines: [
                            Polyline(points: _route!, strokeWidth: 5, color: kOpPrimary),
                          ]),
                        MarkerLayer(markers: [
                          Marker(
                            point: dest!,
                            width: 40,
                            height: 40,
                            alignment: Alignment.topCenter,
                            child: const Icon(Icons.location_on_rounded, color: AppColors.red, size: 40),
                          ),
                          if (_me != null)
                            Marker(
                              point: _me!,
                              width: 26,
                              height: 26,
                              child: Container(
                                decoration: BoxDecoration(
                                  color: kOpPrimary,
                                  shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white, width: 3),
                                  boxShadow: AppShadows.md,
                                ),
                              ),
                            ),
                        ]),
                      ],
                    ),
                    Positioned(
                      right: 12,
                      bottom: canAdvance ? 96 : 16,
                      child: FloatingActionButton.small(
                        heroTag: 'navigate-recentre',
                        backgroundColor: Colors.white,
                        foregroundColor: kOpPrimary,
                        onPressed: () {
                          if (_me != null) {
                            _mapController.fitCamera(CameraFit.coordinates(
                              coordinates: [_me!, dest],
                              padding: const EdgeInsets.fromLTRB(40, 100, 40, 220),
                            ));
                          }
                        },
                        child: const Icon(Icons.my_location_rounded),
                      ),
                    ),
                  ],
                ),
        ),
        if (canAdvance && nextLabel != null)
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: SizedBox(
                height: 52,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: kOpPrimary,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  onPressed: _updating ? null : _advance,
                  icon: _updating
                      ? const SizedBox(
                          width: 18, height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.arrow_forward_rounded, color: Colors.white),
                  label: Text(nextLabel, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
