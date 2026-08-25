import 'package:flutter/material.dart';
import 'package:nccg/models/task.dart';
import 'package:nccg/theme/tokens.dart';

/// Port of frontend/src/components/operator/StatusBadge.tsx.
class StatusBadge extends StatelessWidget {
  final String status;
  const StatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) =>
      Pill(TaskStatus.label(status), tone: TaskStatus.tone(status));
}
