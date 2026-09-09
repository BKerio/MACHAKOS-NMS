import 'package:flutter/material.dart';
import 'package:nccg/models/task.dart';
import 'package:nccg/screen/operator/operator_shell.dart';
import 'package:nccg/screen/operator/widgets/activity_timeline.dart';
import 'package:nccg/screen/operator/widgets/status_badge.dart';
import 'package:nccg/theme/tokens.dart';
import 'package:nccg/utils/task_activities.dart';

/// Full detail view for one ended case, opened from a tap on its
/// [HistoryScreen] card. Mirrors the "Stages & activity" section a driver
/// sees when they expand a card on frontend/src/pages/operator/HistoryPage.tsx,
/// but as its own screen since the app list is a plain scroll, not an
/// accordion.
class HistoryDetailScreen extends StatelessWidget {
  final TaskHistoryItem item;
  const HistoryDetailScreen({super.key, required this.item});

  @override
  Widget build(BuildContext context) {
    final activities = buildTaskActivities(item, live: false);
    final endedAt = formatActivityTime(item.completedAt ?? item.cancelledAt ?? item.handedOverAt ?? item.receivedAt);

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
                if (endedAt != null) ...[
                  const SizedBox(height: 8),
                  _MetaRow(icon: Icons.schedule_rounded, text: 'Ended $endedAt'),
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
          const SizedBox(height: 8),
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
