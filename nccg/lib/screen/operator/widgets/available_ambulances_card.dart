import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:nccg/models/vehicle.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/theme/tokens.dart';
import 'package:url_launcher/url_launcher.dart';

/// Port of frontend/src/components/operator/AvailableAmbulancesCard.tsx.
///
/// Shows every GPS-tracked ambulance in the agency on a small map plus a list,
/// then the no-tracker partner ambulances as a reference-only roster.
class AvailableAmbulancesCard extends StatefulWidget {
  const AvailableAmbulancesCard({super.key});

  @override
  State<AvailableAmbulancesCard> createState() => _AvailableAmbulancesCardState();
}

class _AvailableAmbulancesCardState extends State<AvailableAmbulancesCard> {
  List<Vehicle> _vehicles = [];
  List<PartnerAmbulance> _partners = [];
  Vehicle? _myVehicle;
  bool _loading = true;

  /// Nairobi/Machakos fallback centre, matching the web card.
  static const _fallbackCentre = LatLng(-1.2921, 36.8219);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        NmsApi.getAgencyVehicles(),
        NmsApi.getPartnerAmbulances(),
        NmsApi.getMyCheckIn(),
      ]);
      if (!mounted) return;
      setState(() {
        _vehicles = results[0] as List<Vehicle>;
        _partners = results[1] as List<PartnerAmbulance>;
        _myVehicle = results[2] as Vehicle?;
      });
    } catch (_) {
      // Empty lists render the "none found" copy, which is an acceptable fallback.
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  static String _statusLabel(Vehicle v) {
    if (!v.isActive) return 'Offline';
    if (v.status == 'BUSY') return 'On case';
    if (v.status == 'MAINTENANCE') return 'Maintenance';
    if (v.currentDriver != null) return 'Available';
    return 'No driver';
  }

  static Color _statusColor(Vehicle v) {
    if (v.status == 'BUSY') return AppColors.green;
    if (v.status == 'MAINTENANCE') return AppColors.muted;
    if (v.currentDriver != null) return AppColors.green;
    return AppColors.red;
  }

  static bool _isCoordinateString(String value) =>
      RegExp(r'^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$').hasMatch(value.trim());

  static String _placeLabel(Vehicle v) {
    final name = v.lastLocationName ?? v.checkInLocationName;
    if (name != null && name.isNotEmpty && !_isCoordinateString(name)) return name;
    if (v.lastLat != null && v.lastLng != null) return 'Resolving place name...';
    return 'No GPS yet';
  }

  static String? _shortTime(String? iso) {
    if (iso == null) return null;
    final d = DateTime.tryParse(iso)?.toLocal();
    if (d == null) return null;
    return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final withCoords = _vehicles.where((v) => v.lastLat != null && v.lastLng != null).toList();
    final available = _vehicles
        .where((v) => v.status == 'READY' && v.currentDriver != null && v.isActive)
        .toList();

    final focus = (_myVehicle?.lastLat != null && _myVehicle?.lastLng != null)
        ? _myVehicle
        : (withCoords.isNotEmpty ? withCoords.first : null);
    final centre = focus?.lastLat != null && focus?.lastLng != null
        ? LatLng(focus!.lastLat!, focus.lastLng!)
        : _fallbackCentre;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CardHeader(
            icon: Icons.local_shipping_rounded,
            iconBg: AppColors.navBg,
            title: 'Ambulances & locations',
            subtitle: '${available.length} tracked ready · ${_partners.length} no tracker',
          ),
          const SizedBox(height: 14),

          if (withCoords.isNotEmpty) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadius.base),
              child: Container(
                height: 220,
                decoration: BoxDecoration(border: Border.all(color: AppColors.border)),
                child: _VehicleMap(centre: centre, vehicles: withCoords),
              ),
            ),
            const SizedBox(height: 14),
          ],

          if (_loading)
            const Skeleton(height: 60)
          else ...[
            _groupHeader('WITH TRACKER', _vehicles.length),
            const SizedBox(height: 8),
            if (_vehicles.isEmpty)
              const Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: Text(
                  'No GPS-tracked ambulances found for your agency.',
                  style: TextStyle(fontSize: 14, color: AppColors.muted),
                ),
              )
            else
              for (final v in _vehicles) ...[
                _TrackedRow(
                  vehicle: v,
                  isMine: _myVehicle?.id == v.id,
                  statusLabel: _statusLabel(v),
                  statusColor: _statusColor(v),
                  placeLabel: _placeLabel(v),
                  since: _shortTime(v.checkedInAt),
                ),
                const SizedBox(height: 8),
              ],

            const SizedBox(height: 4),
            _groupHeader('NO TRACKER · REFERENCE ONLY', _partners.length),
            const SizedBox(height: 8),
            if (_partners.isEmpty)
              const Text(
                'No no-tracker ambulances on the roster.',
                style: TextStyle(fontSize: 14, color: AppColors.muted),
              )
            else
              for (final p in _partners) ...[
                _PartnerRow(partner: p),
                const SizedBox(height: 8),
              ],
          ],
        ],
      ),
    );
  }

  Widget _groupHeader(String label, int count) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        AppLabel(label),
        Text('$count', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
      ],
    );
  }
}

/// OpenStreetMap preview using the same Carto tiles as the web app's Leaflet
/// fallback, so no API key is needed on mobile.
class _VehicleMap extends StatelessWidget {
  final LatLng centre;
  final List<Vehicle> vehicles;

  const _VehicleMap({required this.centre, required this.vehicles});

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      options: MapOptions(
        initialCenter: centre,
        initialZoom: 11,
        interactionOptions: const InteractionOptions(
          flags: InteractiveFlag.pinchZoom | InteractiveFlag.drag | InteractiveFlag.doubleTapZoom,
        ),
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
          userAgentPackageName: 'ke.go.machakos.nccg',
        ),
        MarkerLayer(
          markers: [
            for (final v in vehicles)
              Marker(
                point: LatLng(v.lastLat!, v.lastLng!),
                width: 34,
                height: 34,
                child: Tooltip(
                  message: v.registrationNumber,
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.green,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 2),
                      boxShadow: AppShadows.sm,
                    ),
                    child: const Icon(Icons.local_shipping_rounded, size: 16, color: Colors.white),
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _TrackedRow extends StatelessWidget {
  final Vehicle vehicle;
  final bool isMine;
  final String statusLabel;
  final Color statusColor;
  final String placeLabel;
  final String? since;

  const _TrackedRow({
    required this.vehicle,
    required this.isMine,
    required this.statusLabel,
    required this.statusColor,
    required this.placeLabel,
    required this.since,
  });

  @override
  Widget build(BuildContext context) {
    final driver = vehicle.currentDriver;
    final showSince = since != null && driver != null;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isMine ? AppColors.greenLight : AppColors.surface,
        border: Border.all(color: isMine ? AppColors.green : AppColors.border),
        borderRadius: BorderRadius.circular(AppRadius.base),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 10,
            height: 10,
            margin: const EdgeInsets.only(top: 5),
            decoration: BoxDecoration(color: statusColor, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${vehicle.registrationNumber}${isMine ? ' · You' : ''}',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
                const SizedBox(height: 2),
                Text(
                  '$statusLabel${driver != null ? ' · ${driver.name}' : ''}',
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
                const SizedBox(height: 4),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.location_on_outlined, size: 12, color: AppColors.green),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        '$placeLabel${showSince ? ' · since $since' : ''}',
                        style: const TextStyle(fontSize: 12, color: AppColors.muted),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PartnerRow extends StatelessWidget {
  final PartnerAmbulance partner;
  const _PartnerRow({required this.partner});

  @override
  Widget build(BuildContext context) {
    final place = partner.baseLocation ?? partner.notes;
    final phone = partner.contactPhone;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(AppRadius.base),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 10,
            height: 10,
            margin: const EdgeInsets.only(top: 5),
            decoration: const BoxDecoration(color: AppColors.muted, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  partner.registrationNumber,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
                const SizedBox(height: 2),
                Text(
                  'No GPS · ${partner.agencyName ?? 'County / EOC'}'
                  '${partner.vehicleType != null ? ' · ${partner.vehicleType}' : ''}',
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
                if (place != null && place.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.location_on_outlined, size: 12, color: AppColors.green),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(place, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                      ),
                    ],
                  ),
                ],
                if (phone != null && phone.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  InkWell(
                    onTap: () => launchUrl(Uri.parse('tel:$phone')),
                    child: Row(
                      children: [
                        const Icon(Icons.phone_rounded, size: 12, color: AppColors.green),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            '${partner.contactName != null ? '${partner.contactName} · ' : ''}$phone',
                            style: const TextStyle(fontSize: 12, color: AppColors.green),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
