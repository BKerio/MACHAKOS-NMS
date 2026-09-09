import 'package:flutter/material.dart';
import 'package:nccg/method/api.dart';
import 'package:nccg/models/task.dart';
import 'package:nccg/models/vehicle.dart';
import 'package:nccg/screen/operator/history_screen.dart';
import 'package:nccg/screen/operator/patient_care_report_screen.dart';
import 'package:nccg/screen/operator/patient_data_screen.dart';
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

  Future<void> _openPatientData() async {
    final task = _task;
    if (task == null) return;
    final saved = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => PatientDataScreen(task: task)),
    );
    if (saved == true && mounted) await _load();
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
        if (_role == 'DRIVER') {
          await Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => PatientCareReportScreen(taskId: task.id, caseNumber: task.incident.caseNumber),
            ),
          );
        } else {
          Navigator.push(context, MaterialPageRoute(builder: (_) => const HistoryScreen()));
        }
        if (mounted) await _load();
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
    return Column(
      children: [
        _buildHeader(),
        Expanded(
          child: RefreshIndicator(
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
          ),
        ),
      ],
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 8, 0),
      child: Row(
        children: [
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Eyebrow('FIELD OPERATIONS'),
                SizedBox(height: 3),
                Text('Assignment', style: TextStyle(fontSize: 21, fontWeight: FontWeight.w700, color: AppColors.ink)),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded, color: AppColors.green),
          ),
        ],
      ),
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
              if (incident.isGbvCase || incident.massCasualty || (incident.alertNature ?? '').isNotEmpty) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (incident.isGbvCase) const Pill('GBV case', tone: PillTone.red),
                    if (incident.massCasualty)
                      Pill(
                        incident.massCasualtyCount != null
                            ? 'Mass casualty · ${incident.massCasualtyCount}'
                            : 'Mass casualty',
                        tone: PillTone.gray,
                      ),
                    if ((incident.alertNature ?? '').isNotEmpty)
                      Pill(
                        (incident.alertNatureDetail ?? '').isNotEmpty
                            ? '${incident.alertNature} · ${incident.alertNatureDetail}'
                            : incident.alertNature!,
                        tone: PillTone.gray,
                      ),
                  ],
                ),
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
                          if ((incident.subCounty ?? '').isNotEmpty || (incident.placeOfReferral ?? '').isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              [
                                if ((incident.subCounty ?? '').isNotEmpty) incident.subCounty!,
                                if ((incident.placeOfReferral ?? '').isNotEmpty) 'Referral: ${incident.placeOfReferral}',
                              ].join(' · '),
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

              if ((incident.patientContact ?? '').isNotEmpty) ...[
                const SizedBox(height: 10),
                GestureDetector(
                  onTap: () => launchUrl(Uri.parse('tel:${incident.patientContact}')),
                  child: Row(
                    children: [
                      const Icon(Icons.phone_outlined, size: 15, color: AppColors.muted),
                      const SizedBox(width: 8),
                      Text('Patient · ${incident.patientContact}',
                          style: const TextStyle(fontSize: 14, color: AppColors.muted)),
                    ],
                  ),
                ),
              ],

              if ((incident.nextOfKin ?? '').isNotEmpty || (incident.nextOfKinPhone ?? '').isNotEmpty) ...[
                const SizedBox(height: 10),
                GestureDetector(
                  onTap: (incident.nextOfKinPhone ?? '').isEmpty
                      ? null
                      : () => launchUrl(Uri.parse('tel:${incident.nextOfKinPhone}')),
                  child: Row(
                    children: [
                      const Icon(Icons.people_outline_rounded, size: 15, color: AppColors.muted),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          [
                            'Next of kin',
                            if ((incident.nextOfKin ?? '').isNotEmpty) incident.nextOfKin!,
                            if ((incident.nextOfKinPhone ?? '').isNotEmpty) incident.nextOfKinPhone!,
                          ].join(' · '),
                          style: const TextStyle(fontSize: 14, color: AppColors.muted),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              if (incident.vitals?.hasAny ?? false) ...[
                const SizedBox(height: 14),
                _VitalsBlock(
                  label: 'Patient vitals',
                  chips: [
                    ('Temp', incident.vitals?.temperature),
                    ('Pulse', incident.vitals?.pulseRate),
                    ('RR', incident.vitals?.respirationRate),
                    ('BP', incident.vitals?.bp),
                    ('SPO₂', incident.vitals?.spo2),
                    ('FH', incident.vitals?.fh),
                  ],
                ),
              ],

              if (incident.maternityVitals?.hasAny ?? false) ...[
                const SizedBox(height: 10),
                _VitalsBlock(
                  label: 'Maternity vitals',
                  chips: [
                    ('Parity', incident.maternityVitals?.parity),
                    ('Gravid', incident.maternityVitals?.gravid),
                    ('FHR', incident.maternityVitals?.fetalHeartRate),
                    ('Dilatation', incident.maternityVitals?.cervicalDilatation),
                    ('BP', incident.maternityVitals?.bp),
                    ('Pulse', incident.maternityVitals?.pulse),
                    ('Temp', incident.maternityVitals?.temperature),
                    ('SPO₂', incident.maternityVitals?.spo2),
                  ],
                ),
              ],

              if ((incident.dispatcherComments ?? '').isNotEmpty) ...[
                const SizedBox(height: 10),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.surface2,
                    borderRadius: BorderRadius.circular(AppRadius.base),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const AppLabel('DISPATCHER NOTES'),
                      const SizedBox(height: 4),
                      Text(incident.dispatcherComments!, style: const TextStyle(fontSize: 14, color: AppColors.ink2)),
                    ],
                  ),
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

        const SizedBox(height: 12),
        AppButton(
          label: 'Patient / Clinical Notes',
          icon: Icons.description_outlined,
          variant: AppButtonVariant.soft,
          block: true,
          onPressed: _openPatientData,
        ),

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

/// A labelled group of vitals chips, mirroring the web's VitalChip row -
/// blank values are dropped rather than shown empty.
class _VitalsBlock extends StatelessWidget {
  final String label;
  final List<(String, String?)> chips;
  const _VitalsBlock({required this.label, required this.chips});

  @override
  Widget build(BuildContext context) {
    final filled = chips.where((c) => (c.$2 ?? '').trim().isNotEmpty).toList();
    if (filled.isEmpty) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.surface2, borderRadius: BorderRadius.circular(AppRadius.base)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppLabel(label.toUpperCase()),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final chip in filled)
                Container(
                  constraints: const BoxConstraints(minWidth: 92),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    border: Border.all(color: AppColors.border),
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(chip.$1, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                      const SizedBox(height: 2),
                      Text(chip.$2!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.ink)),
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
