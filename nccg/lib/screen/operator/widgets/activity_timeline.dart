import 'package:flutter/material.dart';
import 'package:nccg/models/task.dart';
import 'package:nccg/theme/tokens.dart';
import 'package:nccg/utils/task_activities.dart';

/// Port of frontend/src/components/operator/ActivityTimeline.tsx: a vertical
/// rail of stage dots joined by a connector that is filled up to the stage the
/// crew has actually reached.
class ActivityTimeline extends StatelessWidget {
  final List<TaskActivity> activities;
  final String emptyMessage;

  const ActivityTimeline({
    super.key,
    required this.activities,
    this.emptyMessage = 'No stage activity recorded yet.',
  });

  @override
  Widget build(BuildContext context) {
    if (activities.isEmpty) {
      return Text(
        emptyMessage,
        style: const TextStyle(fontSize: 14, color: AppColors.muted),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < activities.length; i++)
          _TimelineRow(item: activities[i], isLast: i == activities.length - 1),
      ],
    );
  }
}

class _TimelineRow extends StatelessWidget {
  final TaskActivity item;
  final bool isLast;

  const _TimelineRow({required this.item, required this.isLast});

  @override
  Widget build(BuildContext context) {
    final done = item.state == ActivityState.done;
    final active = item.state == ActivityState.active;
    final upcoming = item.state == ActivityState.upcoming;
    final skipped = item.state == ActivityState.skipped;

    final reached = done || active;
    final dotColor = reached ? AppColors.green : AppColors.border;

    final labelColor = item.status == TaskStatus.cancelled
        ? AppColors.red
        : item.status == TaskStatus.handedOver
            ? AppColors.gold
            : (upcoming || skipped ? AppColors.muted : AppColors.ink);

    final subtitle = item.timestamp != null
        ? formatActivityTimeFull(item.timestamp)!
        : active
            ? 'In progress'
            : upcoming
                ? 'Upcoming'
                : skipped
                    ? '-'
                    : 'Pending';

    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 52),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 24,
            child: Column(
              children: [
                Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
                  child: done
                      ? const Icon(Icons.check_rounded, size: 12, color: Colors.white)
                      : active
                          ? Center(
                              child: Container(
                                width: 8,
                                height: 8,
                                decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                              ),
                            )
                          : null,
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.only(top: 2),
                      constraints: const BoxConstraints(minHeight: 24),
                      color: reached ? AppColors.green : AppColors.border,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 1, bottom: 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.label,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: reached ? FontWeight.w700 : FontWeight.w500,
                      color: labelColor,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(fontSize: 12, color: AppColors.muted),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
