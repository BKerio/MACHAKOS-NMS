import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:nccg/models/patient_care_report.dart';
import 'package:nccg/models/task.dart';
import 'package:nccg/screen/operator/operator_shell.dart';
import 'package:nccg/screen/operator/patient_care_report_screen.dart';
import 'package:nccg/screen/operator/pcr_viewer_screen.dart';
import 'package:nccg/screen/operator/widgets/activity_timeline.dart';
import 'package:nccg/screen/operator/widgets/status_badge.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/theme/tokens.dart';
import 'package:nccg/utils/task_activities.dart';

/// Full detail view for one ended case, opened from a tap on its
/// [HistoryScreen] card. Mirrors the "Stages & activity" + "PCR reports"
/// sections a driver sees when they expand a card on
/// frontend/src/pages/operator/HistoryPage.tsx, but as its own screen since
/// the app list is a plain scroll, not an accordion.
class HistoryDetailScreen extends StatefulWidget {
  final TaskHistoryItem item;
  const HistoryDetailScreen({super.key, required this.item});

  @override
  State<HistoryDetailScreen> createState() => _HistoryDetailScreenState();
}

class _HistoryDetailScreenState extends State<HistoryDetailScreen> {
  List<PatientCareReport>? _pcrItems;
  bool _pcrLoading = true;
  String? _pcrError;
  String? _role;
  String? _viewingId;

  @override
  void initState() {
    super.initState();
    _loadRole();
    _loadPcrs();
  }

  Future<void> _loadRole() async {
    final prefs = await SharedPreferences.getInstance();
    if (mounted) setState(() => _role = prefs.getString('role'));
  }

  Future<void> _loadPcrs() async {
    setState(() {
      _pcrLoading = true;
      _pcrError = null;
    });
    try {
      final reports = await NmsApi.getPatientCareReports(widget.item.id);
      if (!mounted) return;
      setState(() => _pcrItems = reports);
    } catch (e) {
      if (mounted) setState(() => _pcrError = errorMessage(e));
    } finally {
      if (mounted) setState(() => _pcrLoading = false);
    }
  }

  bool get _canUploadPcr => _role == 'DRIVER' && widget.item.status == TaskStatus.completed;

  void _uploadPcr() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PatientCareReportScreen(taskId: widget.item.id, caseNumber: widget.item.caseNumber),
      ),
    );
  }

  void _viewPcr(PatientCareReport report) {
    setState(() => _viewingId = report.id);
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => PcrViewerScreen(taskId: widget.item.id, report: report)))
        .whenComplete(() {
      if (mounted) setState(() => _viewingId = null);
    });
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final activities = buildTaskActivities(item, live: false);
    final stagesCount = activities.where((a) => a.timestamp != null).length;
    final endedAt = formatActivityTime(item.completedAt ?? item.cancelledAt ?? item.handedOverAt ?? item.receivedAt);
    final metaParts = [
      if (endedAt != null) 'Ended $endedAt',
      if (item.pcrCount > 0) '${item.pcrCount} PCR',
      if (stagesCount > 0) '$stagesCount stages',
    ];

    return Scaffold(
      appBar: AppBar(
        backgroundColor: kOpPrimary,
        title: Text(item.caseNumber, style: const TextStyle(color: Colors.white)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.caseNumber,
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.ink),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            item.chiefComplaint.isEmpty ? 'No chief complaint recorded' : item.chiefComplaint,
                            style: const TextStyle(fontSize: 14, color: AppColors.muted),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    StatusBadge(status: item.status),
                  ],
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Divider(height: 1, color: AppColors.border),
                ),
                _MetaRow(icon: Icons.local_shipping_outlined, text: item.registrationNumber),
                if (item.locationName.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _MetaRow(icon: Icons.location_on_outlined, text: item.locationName),
                ],
                if (metaParts.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _MetaRow(icon: Icons.schedule_rounded, text: metaParts.join(' · ')),
                ],
              ],
            ),
          ),
          if (item.status == TaskStatus.cancelled && (item.cancelReason ?? '').isNotEmpty) ...[
            const SizedBox(height: 16),
            AppCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.cancel_outlined, size: 18, color: AppColors.red),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(item.cancelReason!, style: const TextStyle(fontSize: 14, color: AppColors.red)),
                  ),
                ],
              ),
            ),
          ],
          if (item.status == TaskStatus.handedOver && (item.handoverReason ?? '').isNotEmpty) ...[
            const SizedBox(height: 16),
            AppCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.swap_horiz_rounded, size: 18, color: AppColors.gold),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text('Transferred: ${item.handoverReason!}',
                        style: const TextStyle(fontSize: 14, color: AppColors.gold)),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const AppLabel('STAGES & ACTIVITY'),
                const SizedBox(height: 12),
                ActivityTimeline(activities: activities),
              ],
            ),
          ),
          const SizedBox(height: 16),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const AppLabel('PCR REPORTS'),
                const SizedBox(height: 12),
                _buildPcrSection(),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  Widget _buildPcrSection() {
    if (_pcrLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 4),
        child: SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.green),
        ),
      );
    }
    if (_pcrError != null) {
      return Text(_pcrError!, style: const TextStyle(fontSize: 14, color: AppColors.red));
    }
    final items = _pcrItems ?? [];
    if (items.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('No PCR reports uploaded yet.', style: TextStyle(fontSize: 14, color: AppColors.muted)),
          if (_canUploadPcr) ...[
            const SizedBox(height: 10),
            AppButton(
              label: 'Upload PCR',
              icon: Icons.cloud_upload_outlined,
              variant: AppButtonVariant.soft,
              size: AppButtonSize.sm,
              onPressed: _uploadPcr,
            ),
          ],
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final report in items) ...[
          _PcrCard(
            report: report,
            viewing: _viewingId == report.id,
            onView: () => _viewPcr(report),
          ),
          if (report != items.last) const SizedBox(height: 10),
        ],
        if (_canUploadPcr) ...[
          const SizedBox(height: 10),
          AppButton(
            label: 'Upload another PCR',
            icon: Icons.cloud_upload_outlined,
            variant: AppButtonVariant.soft,
            size: AppButtonSize.sm,
            onPressed: _uploadPcr,
          ),
        ],
      ],
    );
  }
}

class _PcrCard extends StatelessWidget {
  final PatientCareReport report;
  final bool viewing;
  final VoidCallback onView;
  const _PcrCard({required this.report, required this.viewing, required this.onView});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface2,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(AppRadius.base),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 2),
            child: Icon(Icons.description_outlined, size: 18, color: AppColors.green),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  formatActivityTime(report.createdAt) ?? report.createdAt,
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
                if (report.note.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(report.note, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                ],
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${report.typeLabel} · ${report.sizeLabel}',
                        style: const TextStyle(fontSize: 11, color: AppColors.muted2),
                      ),
                    ),
                    AppButton(
                      label: 'View',
                      icon: Icons.visibility_outlined,
                      variant: AppButtonVariant.soft,
                      size: AppButtonSize.sm,
                      busy: viewing,
                      onPressed: viewing ? null : onView,
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

class _MetaRow extends StatelessWidget {
  final IconData icon;
  final String text;
  const _MetaRow({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 15, color: AppColors.muted),
        const SizedBox(width: 8),
        Expanded(
          child: Text(text, style: const TextStyle(fontSize: 14, color: AppColors.muted)),
        ),
      ],
    );
  }
}
