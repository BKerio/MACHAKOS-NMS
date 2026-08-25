import 'package:flutter/material.dart';
import 'package:nccg/models/vehicle.dart';
import 'package:nccg/screen/operator/widgets/modal_sheet.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/theme/tokens.dart';
import 'package:nccg/utils/closure_reasons.dart';

/// The payload the sheet hands back to its caller.
class HandoverRequest {
  final String reason;
  final bool autoAssign;
  final String? newVehicleId;

  HandoverRequest({required this.reason, required this.autoAssign, this.newVehicleId});
}

/// Port of frontend/src/components/operator/HandoverModal.tsx: passes a live
/// case to a nearby free ambulance without cancelling it.
class HandoverModal extends StatefulWidget {
  final String caseNumber;
  final String currentVehicleId;
  final double? referenceLat;
  final double? referenceLng;
  final Future<void> Function(HandoverRequest request) onConfirm;

  const HandoverModal({
    super.key,
    required this.caseNumber,
    required this.currentVehicleId,
    this.referenceLat,
    this.referenceLng,
    required this.onConfirm,
  });

  static Future<void> show(
    BuildContext context, {
    required String caseNumber,
    required String currentVehicleId,
    double? referenceLat,
    double? referenceLng,
    required Future<void> Function(HandoverRequest request) onConfirm,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => HandoverModal(
        caseNumber: caseNumber,
        currentVehicleId: currentVehicleId,
        referenceLat: referenceLat,
        referenceLng: referenceLng,
        onConfirm: onConfirm,
      ),
    );
  }

  @override
  State<HandoverModal> createState() => _HandoverModalState();
}

class _HandoverModalState extends State<HandoverModal> {
  final _noteController = TextEditingController();

  String _selected = '';
  bool _autoAssign = true;
  String? _pickedVehicleId;

  List<Vehicle> _vehicles = [];
  bool _loading = true;
  String? _error;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadVehicles();
  }

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _loadVehicles() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await NmsApi.getAvailableHandoverVehicles(
        excludeVehicleId: widget.currentVehicleId,
        lat: widget.referenceLat,
        lng: widget.referenceLng,
      );
      if (!mounted) return;
      setState(() => _vehicles = list);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  static String formatDistance(double? km) {
    if (km == null || km.isNaN || km.isInfinite) return 'Distance unknown';
    if (km < 1) return '${(km * 1000).round()} m away';
    return '${km.toStringAsFixed(1)} km away';
  }

  String get _reasonText => _selected.isEmpty ? '' : buildHandoverReason(_selected, _noteController.text);

  bool get _hasReceiver => _autoAssign ? _vehicles.isNotEmpty : _pickedVehicleId != null;

  bool get _canSubmit =>
      _selected.isNotEmpty && _reasonText.length >= 5 && !_submitting && _hasReceiver;

  Future<void> _confirm() async {
    if (!_canSubmit) return;
    setState(() => _submitting = true);
    try {
      await widget.onConfirm(HandoverRequest(
        reason: _reasonText,
        autoAssign: _autoAssign,
        newVehicleId: _autoAssign ? null : _pickedVehicleId,
      ));
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final nearest = _vehicles.isNotEmpty ? _vehicles.first : null;

    return ModalSheetScaffold(
      headerColor: AppColors.navBg,
      eyebrow: 'TRANSFER CASE',
      title: widget.caseNumber,
      busy: _submitting,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.surface2,
              border: Border.all(color: AppColors.border),
              borderRadius: BorderRadius.circular(AppRadius.base),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.swap_horiz_rounded, size: 18, color: AppColors.green),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Pass this live case to a nearby free ambulance that already has a driver. '
                    'The case stays open - it is not cancelled - and dispatch plus the receiving '
                    'crew are notified for the log.',
                    style: TextStyle(fontSize: 14, color: AppColors.muted, height: 1.45),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const AppLabel('WHY ARE YOU TRANSFERRING?'),
          const SizedBox(height: 10),
          for (final preset in handoverReasonPresets) ...[
            ChoiceRow(
              label: preset,
              active: _selected == preset,
              tone: AppColors.green,
              activeBackground: AppColors.greenLight,
              onTap: _submitting ? null : () => setState(() => _selected = preset),
            ),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 8),
          const AppLabel('EXTRA NOTES FOR DISPATCH'),
          const SizedBox(height: 8),
          TextField(
            controller: _noteController,
            enabled: !_submitting,
            minLines: 2,
            maxLines: 4,
            style: const TextStyle(fontSize: 14, color: AppColors.ink),
            decoration: appInputDecoration(hintText: 'Anything the next crew should know...'),
            onChanged: (_) => setState(() {}),
          ),

          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Divider(height: 1, color: AppColors.border),
          ),

          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Send to nearest free unit',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _loading
                          ? 'Looking for nearby ambulances...'
                          : nearest != null
                              ? 'Suggested: ${nearest.registrationNumber} · ${formatDistance(nearest.distanceKm)}'
                              : 'No free ambulances with a driver right now',
                      style: const TextStyle(fontSize: 12, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
              Switch(
                value: _autoAssign,
                activeThumbColor: Colors.white,
                activeTrackColor: AppColors.green,
                onChanged: (_submitting || _vehicles.isEmpty)
                    ? null
                    : (value) => setState(() {
                          _autoAssign = value;
                          if (value) _pickedVehicleId = null;
                        }),
              ),
            ],
          ),

          if (!_autoAssign) ...[
            const SizedBox(height: 12),
            const AppLabel('CHOOSE A NEARBY FREE AMBULANCE'),
            const SizedBox(height: 10),
            if (_loading)
              const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2.2, color: AppColors.green),
              )
            else if (_error != null)
              Text(_error!, style: const TextStyle(fontSize: 14, color: AppColors.red))
            else if (_vehicles.isEmpty)
              const Text(
                'No other free ambulances with a checked-in driver are nearby. Stay with the case '
                'or call dispatch.',
                style: TextStyle(fontSize: 14, color: AppColors.muted),
              )
            else
              for (final v in _vehicles) ...[
                _VehicleOption(
                  vehicle: v,
                  active: _pickedVehicleId == v.id,
                  onTap: _submitting
                      ? null
                      : () => setState(
                          () => _pickedVehicleId = _pickedVehicleId == v.id ? null : v.id),
                ),
                const SizedBox(height: 8),
              ],
          ],

          if (!_loading && _vehicles.isEmpty) ...[
            const SizedBox(height: 12),
            const Text(
              'A receiving ambulance is required so the case stays active for patients and the log.',
              style: TextStyle(fontSize: 14, color: AppColors.red, height: 1.45),
            ),
          ],
        ],
      ),
      footer: Row(
        children: [
          Expanded(
            child: AppButton(
              label: 'Keep case',
              variant: AppButtonVariant.ghost,
              block: true,
              onPressed: _submitting ? null : () => Navigator.pop(context),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: AppButton(
              label: _submitting ? 'Transferring...' : 'Transfer case',
              icon: Icons.swap_horiz_rounded,
              block: true,
              busy: _submitting,
              onPressed: _canSubmit ? _confirm : null,
            ),
          ),
        ],
      ),
    );
  }
}

class _VehicleOption extends StatelessWidget {
  final Vehicle vehicle;
  final bool active;
  final VoidCallback? onTap;

  const _VehicleOption({required this.vehicle, required this.active, this.onTap});

  @override
  Widget build(BuildContext context) {
    final driver = vehicle.currentDriver?.name ?? 'Driver';
    final emt = vehicle.currentEmt != null ? ' · EMT ${vehicle.currentEmt!.name}' : '';
    final place = vehicle.lastLocationName != null ? ' · ${vehicle.lastLocationName}' : '';

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.base),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: active ? AppColors.greenLight : AppColors.surface,
          border: Border.all(color: active ? AppColors.green : AppColors.border, width: 2),
          borderRadius: BorderRadius.circular(AppRadius.base),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    vehicle.registrationNumber,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: active ? FontWeight.w700 : FontWeight.w400,
                      color: AppColors.ink,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '$driver$emt$place',
                    style: const TextStyle(fontSize: 12, color: AppColors.muted),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              decoration: BoxDecoration(
                color: active ? AppColors.green : AppColors.surface3,
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
              child: Text(
                _HandoverModalState.formatDistance(vehicle.distanceKm),
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: active ? Colors.white : AppColors.green,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
