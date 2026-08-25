import 'package:nccg/models/task.dart';

/// Port of frontend/src/utils/taskActivities.ts, which turns a task's stage
/// timestamps into the ordered list the timeline renders.
enum ActivityState { done, active, upcoming, skipped }

class TaskActivity {
  final String key;
  final String status;
  final String label;
  final String? timestamp;
  final ActivityState state;

  TaskActivity({
    required this.key,
    required this.status,
    required this.label,
    required this.timestamp,
    required this.state,
  });
}

class _StageDef {
  final String status;
  final String label;
  final String? Function(TaskStageTimes t) getTime;
  const _StageDef(this.status, this.label, this.getTime);
}

final List<_StageDef> _stageDefs = [
  _StageDef(TaskStatus.pending, 'Case assigned', (t) => t.receivedAt),
  _StageDef(TaskStatus.accepted, TaskStatus.labels[TaskStatus.accepted]!, (t) => t.acceptedAt),
  // No dedicated en-route column on the backend, so this reuses acceptedAt.
  _StageDef(TaskStatus.enRoute, TaskStatus.labels[TaskStatus.enRoute]!, (t) => t.acceptedAt),
  _StageDef(TaskStatus.atScene, 'Arrived at scene', (t) => t.sceneArrivalAt),
  _StageDef(TaskStatus.patientPicked, TaskStatus.labels[TaskStatus.patientPicked]!, (t) => t.patientPickAt),
  _StageDef(TaskStatus.atHospital, 'Arrived at the hospital', (t) => t.facilityArrivalAt),
  _StageDef(TaskStatus.completed, TaskStatus.labels[TaskStatus.completed]!, (t) => t.completedAt),
];

const List<String> _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const List<String> _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

String _two(int n) => n.toString().padLeft(2, '0');

String _clock(DateTime d) {
  final hour12 = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final suffix = d.hour < 12 ? 'AM' : 'PM';
  return '$hour12:${_two(d.minute)} $suffix';
}

/// e.g. "Aug 25, 2:07 PM"
String? formatActivityTime(String? iso) {
  if (iso == null) return null;
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return null;
  return '${_months[d.month - 1]} ${d.day}, ${_clock(d)}';
}

/// e.g. "Tue, Aug 25, 2:07:31 PM"
String? formatActivityTimeFull(String? iso) {
  if (iso == null) return null;
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return null;
  final hour12 = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final suffix = d.hour < 12 ? 'AM' : 'PM';
  return '${_weekdays[d.weekday - 1]}, ${_months[d.month - 1]} ${d.day}, '
      '$hour12:${_two(d.minute)}:${_two(d.second)} $suffix';
}

int _currentIndex(String status) {
  if (status == TaskStatus.cancelled || status == TaskStatus.handedOver) return -1;
  return TaskStatus.order.indexOf(status);
}

/// Builds the staged activity list for an active ([live] true) or historical task.
List<TaskActivity> buildTaskActivities(TaskStageTimes source, {bool live = false}) {
  final curIdx = _currentIndex(source.status);
  final cancelled = source.status == TaskStatus.cancelled;
  final handedOver = source.status == TaskStatus.handedOver;

  final stages = <TaskActivity>[];

  for (final def in _stageDefs) {
    final idx = TaskStatus.order.indexOf(def.status);
    final raw = def.getTime(source);
    // Don't credit acceptedAt to EN_ROUTE until the crew is actually en route.
    final timestamp = def.status == TaskStatus.enRoute && curIdx < TaskStatus.order.indexOf(TaskStatus.enRoute)
        ? null
        : raw;

    ActivityState state;
    if (cancelled || handedOver) {
      state = timestamp != null ? ActivityState.done : ActivityState.skipped;
    } else if (curIdx > idx ||
        (curIdx == idx && def.status != TaskStatus.pending && timestamp != null)) {
      state = curIdx == idx ? ActivityState.active : ActivityState.done;
    } else if (curIdx == idx) {
      state = ActivityState.active;
    } else if (live) {
      state = ActivityState.upcoming;
    } else {
      state = timestamp != null ? ActivityState.done : ActivityState.skipped;
    }

    // History only keeps stages that were actually reached.
    if (!live && timestamp == null && def.status != TaskStatus.pending) {
      state = ActivityState.skipped;
    }

    stages.add(TaskActivity(
      key: def.status,
      status: def.status,
      label: def.label,
      timestamp: timestamp,
      state: state,
    ));
  }

  if (cancelled) {
    stages.add(TaskActivity(
      key: TaskStatus.cancelled,
      status: TaskStatus.cancelled,
      label: TaskStatus.labels[TaskStatus.cancelled]!,
      timestamp: source.cancelledAt,
      state: ActivityState.done,
    ));
  }

  if (handedOver) {
    stages.add(TaskActivity(
      key: TaskStatus.handedOver,
      status: TaskStatus.handedOver,
      label: TaskStatus.labels[TaskStatus.handedOver]!,
      timestamp: source.handedOverAt,
      state: ActivityState.done,
    ));
  }

  if (live) {
    return stages
        .where((s) =>
            (s.status != TaskStatus.cancelled && s.status != TaskStatus.handedOver) ||
            cancelled ||
            handedOver)
        .toList();
  }

  return stages
      .where((s) =>
          s.status == TaskStatus.pending ||
          s.status == TaskStatus.cancelled ||
          s.status == TaskStatus.handedOver ||
          s.timestamp != null ||
          s.state == ActivityState.done ||
          s.state == ActivityState.active)
      .toList();
}
