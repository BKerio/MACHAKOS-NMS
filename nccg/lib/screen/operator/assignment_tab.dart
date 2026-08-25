import 'package:flutter/material.dart';
import 'package:nccg/method/api.dart';
import 'package:nccg/models/task.dart';
import 'package:nccg/models/vehicle.dart';
import 'package:nccg/screen/operator/widgets/end_case_modal.dart';
import 'package:nccg/screen/operator/widgets/handover_modal.dart';
import 'package:nccg/screen/operator/widgets/status_badge.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/theme/tokens.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

/// Mirrors frontend/src/pages/operator/AssignmentPage.tsx: the crew's current
/// case, the single "advance the stage" action, and the driver-only escape
/// hatches (end the case, or transfer it to a nearby unit).
class AssignmentTab extends StatefulWidget {
  const AssignmentTab({super.key});

  @override
  State<AssignmentTab> createState() => _AssignmentTabState();
}

class _AssignmentTabState extends State<AssignmentTab> {
  CrewTask? _task;
  Vehicle? _myVehicle;
  String? _role;

  bool _loading = true;
  bool _updating = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final prefs = await SharedPreferences.getInstance();
    try {
      final task = await NmsApi.getActiveTask();
      Vehicle? mine;
      try {
        mine = await NmsApi.getMyCheckIn();
      } catch (_) {
        mine = null;
      }
      if (!mounted) return;
      setState(() {
        _task = task;
        _myVehicle = mine;
        _role = prefs.getString('role');
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Could not load your assignment. Pull down to retry.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
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
      await _load();
    } catch (e) {
      if (mounted) API.showSnack(context, errorMessage(e), success: false);
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  Future<void> _endCase() async {
    final task = _task;
    if (task == null) return;

    await EndCaseModal.show(
      context,
      caseNumber: task.incident.caseNumber,
      onConfirm: (reason) async {
        await NmsApi.closeIncident(task.incidentId, reason);
        if (!mounted) return;
        API.showSnack(context, 'Case ended. Saved to History with stage timestamps.');
        await _load();
      },
    );
  }

  Future<void> _transferCase() async {
    final task = _task;
    if (task == null) return;

    await HandoverModal.show(
      context,
      caseNumber: task.incident.caseNumber,
      currentVehicleId: task.vehicleId,
      referenceLat: _myVehicle?.lastLat ?? task.incident.lat,
      referenceLng: _myVehicle?.lastLng ?? task.incident.lng,
      onConfirm: (request) async {
        await NmsApi.handoverTask(
          task.id,
          reason: request.reason,
          autoAssign: request.autoAssign,
          newVehicleId: request.newVehicleId,
        );
        if (!mounted) return;
        API.showSnack(context, 'Case transferred. It stays open for the receiving crew.');
        await _load();
      },
    );
  }

  Future<void> _openMaps() async {
    final incident = _task?.incident;
    if (incident?.lat == null || incident?.lng == null) return;
    await launchUrl(
      Uri.parse('https://maps.google.com/?q=${incident!.lat},${incident.lng}'),
      mode: LaunchMode.externalApplication,
    );
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.green,
      child: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.green))
          : _error != null
              ? _ScrollableCentre(
                  child: _EmptyState(
                    icon: Icons.cloud_off_rounded,
                    title: 'Something went wrong',
                    message: _error!,
                    actionLabel: 'Retry',
                    onAction: _load,
                  ),
                )
              : _task == null
                  ? _buildNoAssignment()
                  : _buildTask(_task!),
    );
  }

  Widget _buildNoAssignment() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (_myVehicle == null) ...[
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.surface2,
              border: Border.all(color: AppColors.border),
              borderRadius: BorderRadius.circular(AppRadius.base),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.gpp_maybe_outlined, size: 20, color: AppColors.green),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Check in to your vehicle on the Crew tab before dispatch can assign cases to you.',
                    style: TextStyle(fontSize: 14, color: AppColors.muted, height: 1.45),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
        _EmptyState(
          icon: Icons.local_shipping_outlined,
          title: 'No active assignment',
          message: _myVehicle != null
              ? 'You are on shift. You will be notified when dispatch assigns a case to your crew.'
              : 'You will be notified when dispatch assigns a case to your crew.',
          actionLabel: 'Refresh now',
          onAction: _load,
        ),
      ],
    );
  }

  Widget _buildTask(CrewTask task) {
    final incident = task.incident;
    final nextLabel = TaskStatus.actionLabel(task.status);
    final isDriver = _role == 'DRIVER';
    final hasCoords = incident.lat != null && incident.lng != null;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      incident.caseNumber,
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: AppColors.ink),
                    ),
                  ),
                  StatusBadge(status: task.status),
                ],
              ),
              if (incident.massCasualty) ...[
                const SizedBox(height: 12),
                const Pill('Mass casualty', tone: PillTone.red),
              ],
              const SizedBox(height: 12),
              Text(
                incident.chiefComplaint,
                style: const TextStyle(fontSize: 16, color: AppColors.ink2, height: 1.4),
              ),
              const SizedBox(height: 16),

              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.surface2,
                  borderRadius: BorderRadius.circular(AppRadius.base),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.location_on_outlined, size: 18, color: AppColors.green),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            incident.locationName,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: AppColors.ink,
                            ),
                          ),
                          if (incident.subCounty != null && incident.subCounty!.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              incident.subCounty!,
                              style: const TextStyle(fontSize: 12, color: AppColors.muted),
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (hasCoords)
                      IconButton(
                        tooltip: 'Navigate',
                        onPressed: _openMaps,
                        icon: const Icon(Icons.navigation_outlined, size: 18, color: AppColors.green),
                      ),
                  ],
                ),
              ),

              if (incident.patientName != null && incident.patientName!.isNotEmpty) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Icon(Icons.people_outline_rounded, size: 15, color: AppColors.muted),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        [
                          incident.patientName!,
                          if (incident.patientAge != null && incident.patientAge!.isNotEmpty)
                            incident.patientAge!,
                          if (incident.patientGender != null && incident.patientGender!.isNotEmpty)
                            incident.patientGender!,
                        ].join(' · '),
                        style: const TextStyle(fontSize: 14, color: AppColors.muted),
                      ),
                    ),
                  ],
                ),
              ],

              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.surface3,
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.local_shipping_outlined, size: 16, color: AppColors.muted),
                    const SizedBox(width: 8),
                    Text(
                      'Unit ${task.vehicle.registrationNumber}',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),

        if (nextLabel != null) ...[
          const SizedBox(height: 16),
          AppButton(
            label: nextLabel,
            icon: Icons.arrow_forward_rounded,
            size: AppButtonSize.lg,
            block: true,
            busy: _updating,
            onPressed: _updating ? null : _advance,
          ),
        ],

        if (isDriver) ...[
          const SizedBox(height: 12),
          AppButton(
            label: 'End case (any stage)',
            icon: Icons.cancel_outlined,
            variant: AppButtonVariant.outlineDanger,
            block: true,
            onPressed: _endCase,
          ),
          const SizedBox(height: 12),
          AppButton(
            label: 'Transfer case to nearby unit',
            icon: Icons.swap_horiz_rounded,
            variant: AppButtonVariant.soft,
            block: true,
            onPressed: _transferCase,
          ),
        ],
        const SizedBox(height: 8),
      ],
    );
  }
}

/// Card-styled empty/error state matching the web's centred placeholder.
class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const _EmptyState({
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(36),
      child: Column(
        children: [
          Icon(icon, size: 48, color: AppColors.muted2),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.ink),
          ),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, color: AppColors.muted, height: 1.45),
          ),
          if (actionLabel != null) ...[
            const SizedBox(height: 16),
            AppButton(
              label: actionLabel!,
              variant: AppButtonVariant.soft,
              size: AppButtonSize.sm,
              onPressed: onAction,
            ),
          ],
        ],
      ),
    );
  }
}

/// Keeps an empty state pull-to-refreshable while still centring it.
class _ScrollableCentre extends StatelessWidget {
  final Widget child;
  const _ScrollableCentre({required this.child});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Center(child: Padding(padding: const EdgeInsets.all(16), child: child)),
        ),
      ),
    );
  }
}
