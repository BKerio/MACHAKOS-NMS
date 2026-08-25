import 'package:flutter/material.dart';
import 'package:nccg/models/task.dart';
import 'package:nccg/screen/operator/widgets/activity_timeline.dart';
import 'package:nccg/screen/operator/widgets/status_badge.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/theme/tokens.dart';
import 'package:nccg/utils/task_activities.dart';

/// Mirrors frontend/src/pages/operator/ActivityPage.tsx: the live stage
/// timeline for the case the crew is on right now. Ended cases move to History.
class ActivityTab extends StatefulWidget {
  const ActivityTab({super.key});

  @override
  State<ActivityTab> createState() => _ActivityTabState();
}

class _ActivityTabState extends State<ActivityTab> {
  CrewTask? _task;
  bool _loading = true;
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
    try {
      final task = await NmsApi.getActiveTask();
      if (!mounted) return;
      setState(() => _task = task);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.green,
      child: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.green))
          : _task == null
              ? _buildEmpty()
              : _buildTimeline(_task!),
    );
  }

  Widget _buildEmpty() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        AppCard(
          padding: const EdgeInsets.all(36),
          child: Column(
            children: [
              const Icon(Icons.history_rounded, size: 44, color: AppColors.muted2),
              const SizedBox(height: 16),
              Text(
                _error != null ? 'Could not load activity' : 'No active case',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.ink),
              ),
              const SizedBox(height: 8),
              Text(
                _error ??
                    'When you are assigned a case, real-time stages and timestamps will appear here. '
                        'Ended cases move to History.',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14, color: AppColors.muted, height: 1.45),
              ),
              const SizedBox(height: 16),
              AppButton(
                label: 'Refresh',
                variant: AppButtonVariant.soft,
                size: AppButtonSize.sm,
                onPressed: _load,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTimeline(CrewTask task) {
    final activities = buildTaskActivities(task, live: true);
    final assignedAt = formatActivityTime(task.receivedAt) ?? '-';

    return ListView(
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
                          task.incident.caseNumber,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: AppColors.ink,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          task.incident.chiefComplaint,
                          style: const TextStyle(fontSize: 14, color: AppColors.muted),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  StatusBadge(status: task.status),
                ],
              ),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Divider(height: 1, color: AppColors.border),
              ),
              _MetaRow(
                icon: Icons.location_on_outlined,
                text: [
                  task.incident.locationName,
                  if (task.incident.subCounty != null && task.incident.subCounty!.isNotEmpty)
                    task.incident.subCounty!,
                ].join(' · '),
              ),
              const SizedBox(height: 8),
              _MetaRow(icon: Icons.schedule_rounded, text: 'Assigned $assignedAt'),
            ],
          ),
        ),
        const SizedBox(height: 16),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const AppLabel('LIVE STAGES'),
              const SizedBox(height: 12),
              ActivityTimeline(activities: activities),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            'Stages update as the crew advances the case. When the case is ended or completed, '
            'it moves to History.',
            style: TextStyle(fontSize: 12, color: AppColors.muted, height: 1.45),
          ),
        ),
        const SizedBox(height: 8),
      ],
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
