import 'package:flutter/material.dart';
import 'package:nccg/method/api.dart';
import 'package:nccg/models/task.dart';
import 'package:nccg/screen/operator/operator_shell.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/theme/tokens.dart';

/// Clinical notes for the crew's active task, mirroring
/// frontend/src/pages/operator/PatientDataPage.tsx. The web page re-fetches
/// the active task itself; here the caller (AssignmentTab) already has it
/// loaded, so it's passed straight in instead of a redundant round-trip.
class PatientDataScreen extends StatefulWidget {
  final CrewTask task;
  const PatientDataScreen({super.key, required this.task});

  @override
  State<PatientDataScreen> createState() => _PatientDataScreenState();
}

class _PatientDataScreenState extends State<PatientDataScreen> {
  late final _managementController =
      TextEditingController(text: widget.task.incident.preHospitalManagement ?? '');
  late final _challengesController =
      TextEditingController(text: widget.task.incident.dispatcherChallenges ?? '');
  bool _saving = false;

  @override
  void dispose() {
    _managementController.dispose();
    _challengesController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final management = _managementController.text.trim();
    if (management.isEmpty) {
      API.showSnack(context, 'Please describe vitals, interventions and treatment given.', success: false);
      return;
    }
    setState(() => _saving = true);
    try {
      await NmsApi.submitPatientData(
        widget.task.id,
        preHospitalManagement: management,
        dispatcherChallenges: _challengesController.text.trim().isEmpty ? null : _challengesController.text.trim(),
      );
      if (!mounted) return;
      API.showSnack(context, 'Clinical notes have been saved.');
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) API.showSnack(context, errorMessage(e), success: false);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final vitals = widget.task.incident.vitals;
    final maternity = widget.task.incident.maternityVitals;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: kOpPrimary,
        title: const Text('Clinical Notes', style: TextStyle(color: Colors.white)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (vitals != null && vitals.hasAny) ...[
            _VitalsSummaryCard(
              title: 'Watcher vitals (read-only)',
              rows: [
                ('Temp', vitals.temperature),
                ('Pulse', vitals.pulseRate),
                ('RR', vitals.respirationRate),
                ('BP', vitals.bp),
                ('SPO₂', vitals.spo2),
                ('FH', vitals.fh),
              ],
            ),
            const SizedBox(height: 14),
          ],
          if (maternity != null && maternity.hasAny) ...[
            _VitalsSummaryCard(
              title: 'Maternity vitals (read-only)',
              rows: [
                ('Parity', maternity.parity),
                ('Gravid', maternity.gravid),
                ('FHR', maternity.fetalHeartRate),
                ('Dilatation', maternity.cervicalDilatation),
                ('BP', maternity.bp),
                ('Pulse', maternity.pulse),
                ('Temp', maternity.temperature),
                ('SPO₂', maternity.spo2),
                ('Mode of delivery', maternity.modeOfDelivery),
                ('Baby condition', maternity.conditionOfBaby),
              ],
            ),
            const SizedBox(height: 14),
          ],
          const AppLabel('PRE-HOSPITAL MANAGEMENT *'),
          const SizedBox(height: 6),
          const Text(
            'Vitals, interventions, patient condition, and treatment given.',
            style: TextStyle(fontSize: 12, color: AppColors.muted),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _managementController,
            enabled: !_saving,
            minLines: 6,
            maxLines: 10,
            style: const TextStyle(fontSize: 14, color: AppColors.ink),
            decoration: appInputDecoration(hintText: 'e.g. Patient conscious, BP 120/80, O2 administered...'),
          ),
          const SizedBox(height: 18),
          const AppLabel('CHALLENGES (OPTIONAL)'),
          const SizedBox(height: 6),
          const Text(
            'Access issues, delays, or complications encountered.',
            style: TextStyle(fontSize: 12, color: AppColors.muted),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _challengesController,
            enabled: !_saving,
            minLines: 4,
            maxLines: 6,
            style: const TextStyle(fontSize: 14, color: AppColors.ink),
            decoration: appInputDecoration(hintText: 'e.g. Heavy traffic, narrow access road...'),
          ),
          const SizedBox(height: 22),
          AppButton(
            label: _saving ? 'Saving…' : 'Save Notes',
            icon: Icons.save_outlined,
            size: AppButtonSize.lg,
            block: true,
            busy: _saving,
            onPressed: _saving ? null : _save,
          ),
        ],
      ),
    );
  }
}

class _VitalsSummaryCard extends StatelessWidget {
  final String title;
  final List<(String, String?)> rows;
  const _VitalsSummaryCard({required this.title, required this.rows});

  @override
  Widget build(BuildContext context) {
    final filled = rows.where((r) => (r.$2 ?? '').trim().isNotEmpty).toList();
    if (filled.isEmpty) return const SizedBox.shrink();

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink)),
          const SizedBox(height: 10),
          for (final row in filled)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(row.$1, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted)),
                  Flexible(
                    child: Text(
                      row.$2!,
                      textAlign: TextAlign.end,
                      style: const TextStyle(fontSize: 13, color: AppColors.ink2),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
