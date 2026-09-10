import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nccg/screen/operator/widgets/activity_timeline.dart';
import 'package:nccg/utils/task_activities.dart';

/// Regression test for a layout bug where the dot-and-connector timeline used
/// by the operator app's history detail screen (and live Activity tab) threw
/// "RenderFlex children have non-zero flex but incoming height constraints
/// are unbounded" for every row but the last, leaving the whole "Stages &
/// activity" section blank. Fixed by wrapping the row in IntrinsicHeight so
/// the connector line's Expanded gets a bounded height to divide up.
void main() {
  testWidgets('ActivityTimeline renders multiple rows without a layout error', (tester) async {
    final activities = [
      TaskActivity(key: 'a', status: 'PENDING', label: 'Case assigned', timestamp: '2026-09-09T09:25:11.575Z', state: ActivityState.done),
      TaskActivity(key: 'b', status: 'ACCEPTED', label: 'Accepted', timestamp: '2026-09-09T09:27:18.686Z', state: ActivityState.done),
      TaskActivity(key: 'c', status: 'COMPLETED', label: 'Completed', timestamp: '2026-09-09T09:27:35.524Z', state: ActivityState.done),
    ];

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SingleChildScrollView(child: ActivityTimeline(activities: activities))),
    ));

    expect(tester.takeException(), isNull);
    expect(find.text('Case assigned'), findsOneWidget);
    expect(find.text('Completed'), findsOneWidget);
  });
}
