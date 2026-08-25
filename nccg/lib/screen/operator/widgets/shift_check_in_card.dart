import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:nccg/method/api.dart';
import 'package:nccg/models/vehicle.dart';
import 'package:nccg/services/geo.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/theme/tokens.dart';

/// Port of frontend/src/components/operator/ShiftCheckInCard.tsx.
///
/// The crew cannot be dispatched until they have checked in to a vehicle with a
/// GPS fix and an accountability selfie, so this is the first card on the
/// assignment screen.
class ShiftCheckInCard extends StatefulWidget {
  final String role;
  final String userId;

  /// Fires after a successful check-in or check-out so sibling cards refresh.
  final VoidCallback? onChanged;

  const ShiftCheckInCard({
    super.key,
    required this.role,
    required this.userId,
    this.onChanged,
  });

  @override
  State<ShiftCheckInCard> createState() => _ShiftCheckInCardState();
}

class _ShiftCheckInCardState extends State<ShiftCheckInCard> {
  Vehicle? _myVehicle;
  bool _loadingMine = true;

  bool _showPicker = false;
  List<Vehicle> _vehicles = [];
  bool _loadingVehicles = false;
  String? _vehiclesError;

  String? _checkInTargetId;
  bool _submitting = false;

  String get _roleLabel => switch (widget.role) {
    'DRIVER' => 'Driver',
    'EMT' => 'EMT',
    _ => 'Nurse',
  };

  @override
  void initState() {
    super.initState();
    _loadMine();
  }

  Future<void> _loadMine() async {
    setState(() => _loadingMine = true);
    try {
      final mine = await NmsApi.getMyCheckIn();
      if (!mounted) return;
      setState(() => _myVehicle = mine);
    } catch (_) {
      // Leaving _myVehicle null just shows the picker, which is the safe default.
    } finally {
      if (mounted) setState(() => _loadingMine = false);
    }
  }

  Future<void> _loadVehicles() async {
    setState(() {
      _loadingVehicles = true;
      _vehiclesError = null;
    });
    try {
      final list = await NmsApi.getAgencyVehicles();
      if (!mounted) return;
      setState(() => _vehicles = list);
    } catch (e) {
      if (!mounted) return;
      setState(() => _vehiclesError = errorMessage(e));
    } finally {
      if (mounted) setState(() => _loadingVehicles = false);
    }
  }

  void _togglePicker() {
    setState(() => _showPicker = !_showPicker);
    if (_showPicker && _vehicles.isEmpty) _loadVehicles();
  }

  Future<void> _submitCheckIn(String vehicleId, GeoPoint coords, String selfiePath) async {
    setState(() => _submitting = true);
    try {
      await NmsApi.checkInToVehicle(vehicleId, lat: coords.lat, lng: coords.lng, selfiePath: selfiePath);
      if (!mounted) return;
      setState(() {
        _checkInTargetId = null;
        _showPicker = false;
      });
      await _loadMine();
      widget.onChanged?.call();
      if (mounted) {
        API.showSnack(context, 'Location and time captured. You are on shift.');
      }
    } catch (e) {
      if (mounted) API.showSnack(context, errorMessage(e), success: false);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _endShift() async {
    final vehicle = _myVehicle;
    if (vehicle == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.lg)),
        title: const Text(
          'End shift?',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.ink),
        ),
        content: const Text(
          'This will check you out of the vehicle so dispatch will stop assigning cases to this crew slot.',
          style: TextStyle(fontSize: 14, color: AppColors.muted, height: 1.45),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep shift', style: TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('End shift', style: TextStyle(color: AppColors.red, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _submitting = true);
    try {
      await NmsApi.checkOutFromVehicle(vehicle.id);
      await _loadMine();
      widget.onChanged?.call();
      if (mounted) API.showSnack(context, 'Your shift on this vehicle has ended.');
    } catch (e) {
      if (mounted) API.showSnack(context, errorMessage(e), success: false);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const CardHeader(
            icon: Icons.assignment_turned_in_rounded,
            iconBg: AppColors.green,
            title: 'Shift check-in',
            subtitle: 'Check in with a selfie and your location before dispatch can assign cases. '
                'Location access is required.',
          ),
          const SizedBox(height: 16),
          if (_loadingMine)
            const Skeleton(height: 72)
          else if (_myVehicle != null)
            _OnShiftPanel(
              vehicle: _myVehicle!,
              roleLabel: _roleLabel,
              busy: _submitting,
              onEndShift: _endShift,
            )
          else
            _buildPicker(),
        ],
      ),
    );
  }

  Widget _buildPicker() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppButton(
          label: _showPicker ? 'Hide vehicles' : 'Select vehicle to check in',
          icon: _showPicker ? Icons.keyboard_arrow_up_rounded : Icons.keyboard_arrow_down_rounded,
          block: true,
          onPressed: _togglePicker,
        ),
        if (_showPicker) ...[
          const SizedBox(height: 12),
          const AppLabel('WITH TRACKER - CHECK-IN'),
          const SizedBox(height: 8),
          if (_loadingVehicles)
            const Skeleton(height: 56)
          else if (_vehiclesError != null)
            Row(
              children: [
                Expanded(
                  child: Text(
                    _vehiclesError!,
                    style: const TextStyle(fontSize: 14, color: AppColors.red),
                  ),
                ),
                TextButton(
                  onPressed: _loadVehicles,
                  child: const Text('Retry',
                      style: TextStyle(color: AppColors.green, fontWeight: FontWeight.w700)),
                ),
              ],
            )
          else if (_vehicles.isEmpty)
            const Text(
              'No active GPS vehicles found for your agency.',
              style: TextStyle(fontSize: 14, color: AppColors.muted),
            )
          else
            ..._vehicles.map(_buildVehicleRow),
        ],
      ],
    );
  }

  Widget _buildVehicleRow(Vehicle vehicle) {
    final occupant = vehicle.occupantFor(widget.role);
    final isMine = occupant?.id == widget.userId;
    final isTaken = occupant != null && !isMine;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.surface,
            border: Border.all(color: AppColors.border),
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
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      isMine
                          ? 'You are checked in as $_roleLabel'
                          : isTaken
                              ? '$_roleLabel: ${occupant.name}'
                              : '$_roleLabel slot open',
                      style: const TextStyle(fontSize: 12, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              if (isTaken)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.surface3,
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                  ),
                  child: const Text(
                    'Taken',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.muted),
                  ),
                )
              else if (isMine)
                Container(
                  width: 28,
                  height: 28,
                  decoration: const BoxDecoration(color: AppColors.green, shape: BoxShape.circle),
                  child: const Icon(Icons.check_rounded, size: 16, color: Colors.white),
                )
              else
                AppButton(
                  label: 'Check in',
                  size: AppButtonSize.sm,
                  onPressed: _submitting
                      ? null
                      : () => setState(() => _checkInTargetId =
                          _checkInTargetId == vehicle.id ? null : vehicle.id),
                ),
            ],
          ),
        ),
        if (_checkInTargetId == vehicle.id)
          _CheckInPanel(
            vehicle: vehicle,
            isSubmitting: _submitting,
            onCancel: () => setState(() => _checkInTargetId = null),
            onSubmit: (coords, path) => _submitCheckIn(vehicle.id, coords, path),
          ),
      ],
    );
  }
}

/// The "On shift" summary shown once the crew member is checked in.
class _OnShiftPanel extends StatelessWidget {
  final Vehicle vehicle;
  final String roleLabel;
  final bool busy;
  final VoidCallback onEndShift;

  const _OnShiftPanel({
    required this.vehicle,
    required this.roleLabel,
    required this.busy,
    required this.onEndShift,
  });

  /// The backend seeds the location name with raw coordinates until reverse
  /// geocoding lands, so a "lat,lng" string means "still resolving".
  static bool _isCoordinateString(String value) =>
      RegExp(r'^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$').hasMatch(value.trim());

  String _placeLine() {
    final name = vehicle.checkInLocationName ?? vehicle.lastLocationName;
    if (name != null && name.isNotEmpty && !_isCoordinateString(name)) {
      return 'Logged in at $name';
    }
    return 'Logged in - resolving place name...';
  }

  String? _sinceLine() {
    final iso = vehicle.checkedInAt;
    if (iso == null) return null;
    final d = DateTime.tryParse(iso)?.toLocal();
    if (d == null) return null;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final hh = d.hour.toString().padLeft(2, '0');
    final mm = d.minute.toString().padLeft(2, '0');
    return 'Since ${d.day} ${months[d.month - 1]}, $hh:$mm';
  }

  @override
  Widget build(BuildContext context) {
    final since = _sinceLine();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface2,
        borderRadius: BorderRadius.circular(AppRadius.base),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Eyebrow('ON SHIFT'),
                    const SizedBox(height: 4),
                    Text(
                      vehicle.registrationNumber,
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: AppColors.ink),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$roleLabel · IMEI ${vehicle.imei}',
                      style: const TextStyle(fontSize: 14, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              AppButton(
                label: 'End shift',
                size: AppButtonSize.sm,
                variant: AppButtonVariant.outlineDanger,
                busy: busy,
                onPressed: onEndShift,
              ),
            ],
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Divider(height: 1, color: AppColors.border),
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.location_on_outlined, size: 16, color: AppColors.green),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_placeLine(), style: const TextStyle(fontSize: 14, color: AppColors.ink)),
                    if (since != null) ...[
                      const SizedBox(height: 2),
                      Text(since, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Inline panel that captures the GPS fix and selfie, then submits.
class _CheckInPanel extends StatefulWidget {
  final Vehicle vehicle;
  final bool isSubmitting;
  final VoidCallback onCancel;
  final void Function(GeoPoint coords, String selfiePath) onSubmit;

  const _CheckInPanel({
    required this.vehicle,
    required this.isSubmitting,
    required this.onCancel,
    required this.onSubmit,
  });

  @override
  State<_CheckInPanel> createState() => _CheckInPanelState();
}

class _CheckInPanelState extends State<_CheckInPanel> {
  GeoPoint? _coords;
  String? _locError;
  bool _locating = false;
  XFile? _selfie;

  Future<void> _captureLocation() async {
    setState(() {
      _locating = true;
      _locError = null;
    });
    try {
      final pos = await getCurrentPosition();
      if (!mounted) return;
      setState(() => _coords = pos);
    } on GeoException catch (e) {
      if (mounted) setState(() => _locError = e.message);
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _captureSelfie() async {
    final shot = await ImagePicker().pickImage(
      source: ImageSource.camera,
      preferredCameraDevice: CameraDevice.front,
      imageQuality: 70,
    );
    if (shot != null && mounted) setState(() => _selfie = shot);
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = _coords != null && _selfie != null && !widget.isSubmitting;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface2,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(AppRadius.base),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Check in to ${widget.vehicle.registrationNumber}',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
              ),
              IconButton(
                onPressed: widget.isSubmitting ? null : widget.onCancel,
                icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.muted),
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Location
          Row(
            children: [
              AppButton(
                label: _locating
                    ? 'Locating...'
                    : _coords != null
                        ? 'Location captured'
                        : 'Capture location',
                icon: _coords != null ? Icons.check_rounded : Icons.location_on_outlined,
                size: AppButtonSize.sm,
                variant: _coords != null ? AppButtonVariant.soft : AppButtonVariant.primary,
                busy: _locating,
                onPressed: widget.isSubmitting ? null : _captureLocation,
              ),
            ],
          ),
          if (_locError != null) ...[
            const SizedBox(height: 6),
            Text(_locError!, style: const TextStyle(fontSize: 12, color: AppColors.red)),
          ],
          const SizedBox(height: 12),

          // Selfie
          Row(
            children: [
              AppButton(
                label: _selfie != null ? 'Retake selfie' : 'Take accountability selfie',
                icon: Icons.photo_camera_outlined,
                size: AppButtonSize.sm,
                variant: _selfie != null ? AppButtonVariant.soft : AppButtonVariant.primary,
                onPressed: widget.isSubmitting ? null : _captureSelfie,
              ),
              if (_selfie != null) ...[
                const SizedBox(width: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                  child: Image.file(File(_selfie!.path), width: 40, height: 40, fit: BoxFit.cover),
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),

          const Text(
            'Location and a selfie are required before dispatch can assign cases to you.',
            style: TextStyle(fontSize: 12, color: AppColors.muted, height: 1.4),
          ),
          const SizedBox(height: 14),

          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: 'Cancel',
                  size: AppButtonSize.sm,
                  variant: AppButtonVariant.ghost,
                  block: true,
                  onPressed: widget.isSubmitting ? null : widget.onCancel,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: AppButton(
                  label: widget.isSubmitting ? 'Checking in...' : 'Complete check-in',
                  icon: Icons.check_rounded,
                  size: AppButtonSize.sm,
                  block: true,
                  busy: widget.isSubmitting,
                  onPressed: canSubmit ? () => widget.onSubmit(_coords!, _selfie!.path) : null,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
