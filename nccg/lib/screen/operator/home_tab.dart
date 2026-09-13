import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:nccg/models/task.dart';
import 'package:nccg/models/vehicle.dart';
import 'package:nccg/screen/operator/history_screen.dart';
import 'package:nccg/screen/operator/profile_screen.dart';
import 'package:nccg/screen/operator/widgets/crew_assignment_card.dart';
import 'package:nccg/screen/operator/widgets/shift_check_in_card.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/theme/tokens.dart';

/// Landing tab for field crew: which ambulance they're checked into, their
/// crew (drivers only), and quick shortcuts to the rest of the app -
/// Assignment (badged when a case is active), Activity, History, Profile.
class HomeTab extends StatefulWidget {
  /// Switches the shell to the bottom tab with this label (Assignment/Activity).
  final ValueChanged<String> onSelectTab;

  const HomeTab({super.key, required this.onSelectTab});

  @override
  State<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<HomeTab> {
  String? _role;
  String _userId = '';
  Vehicle? _myVehicle;
  CrewTask? _activeTask;
  int _historyCount = 0;
  bool _loading = true;

  /// Bumped on check-in/out so the check-in and crew cards rebuild with fresh data.
  int _refreshToken = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    Vehicle? vehicle;
    CrewTask? task;
    int historyCount = 0;
    try {
      vehicle = await NmsApi.getMyCheckIn();
    } catch (_) {
      vehicle = null;
    }
    try {
      task = await NmsApi.getActiveTask();
    } catch (_) {
      task = null;
    }
    try {
      historyCount = await NmsApi.getTaskHistoryCount();
    } catch (_) {
      historyCount = 0;
    }
    if (!mounted) return;
    setState(() {
      _role = prefs.getString('role');
      _userId = prefs.getString('user_id') ?? '';
      _myVehicle = vehicle;
      _activeTask = task;
      _historyCount = historyCount;
      _loading = false;
    });
  }

  Future<void> _refresh() async {
    setState(() => _refreshToken++);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: AppColors.green));
    }

    final isDriver = _role == 'DRIVER';

    return RefreshIndicator(
      onRefresh: _refresh,
      color: AppColors.green,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ShiftCheckInCard(
            key: ValueKey('home-checkin-$_refreshToken'),
            role: _role ?? '',
            userId: _userId,
            onChanged: _refresh,
          ),
          if (isDriver && _myVehicle != null) ...[
            const SizedBox(height: 16),
            CrewAssignmentCard(
              key: ValueKey('home-crew-${_myVehicle!.id}-$_refreshToken'),
              myVehicle: _myVehicle!,
              onChanged: _refresh,
            ),
          ],
          const SizedBox(height: 20),
          const AppLabel('QUICK ACCESS'),
          const SizedBox(height: 10),
          _QuickAccessGrid(activeTask: _activeTask, historyCount: _historyCount, onSelectTab: widget.onSelectTab),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _QuickAccessGrid extends StatelessWidget {
  final CrewTask? activeTask;
  final int historyCount;
  final ValueChanged<String> onSelectTab;

  const _QuickAccessGrid({required this.activeTask, required this.historyCount, required this.onSelectTab});

  @override
  Widget build(BuildContext context) {
    final hasActiveTask = activeTask != null;
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.55,
      children: [
        _QuickAccessTile(
          icon: Icons.local_hospital_rounded,
          label: 'Assignment',
          subtitle: hasActiveTask ? activeTask!.incident.caseNumber : 'No active case',
          dotBadge: hasActiveTask,
          onTap: () => onSelectTab('Assignment'),
        ),
        _QuickAccessTile(
          icon: Icons.timeline_rounded,
          label: 'Activity',
          subtitle: hasActiveTask ? 'Live stages' : 'Nothing live',
          onTap: () => onSelectTab('Activity'),
        ),
        _QuickAccessTile(
          icon: Icons.done_all_rounded,
          label: 'History',
          subtitle: historyCount > 0 ? '$historyCount attended' : 'No cases yet',
          countBadge: historyCount,
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const HistoryScreen())),
        ),
        _QuickAccessTile(
          icon: Icons.person_outline_rounded,
          label: 'Profile',
          subtitle: 'Your account',
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen())),
        ),
      ],
    );
  }
}

class _QuickAccessTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final VoidCallback onTap;

  /// Plain presence dot (e.g. "there is an active case"), no number.
  final bool dotBadge;

  /// A count badge (e.g. cases attended). Hidden when null or <= 0.
  final int? countBadge;

  const _QuickAccessTile({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.onTap,
    this.dotBadge = false,
    this.countBadge,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppRadius.base),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.base),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.border),
            borderRadius: BorderRadius.circular(AppRadius.base),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(color: AppColors.greenLight, borderRadius: BorderRadius.circular(AppRadius.sm)),
                    child: Icon(icon, size: 18, color: AppColors.green),
                  ),
                  if (dotBadge)
                    Positioned(
                      top: -2,
                      right: -2,
                      child: Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          color: AppColors.red,
                          shape: BoxShape.circle,
                          border: Border.all(color: AppColors.surface, width: 1.5),
                        ),
                      ),
                    )
                  else if ((countBadge ?? 0) > 0)
                    Positioned(
                      top: -6,
                      right: -8,
                      child: Container(
                        constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        decoration: BoxDecoration(
                          color: AppColors.green,
                          borderRadius: BorderRadius.circular(9),
                          border: Border.all(color: AppColors.surface, width: 1.5),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          countBadge! > 99 ? '99+' : '$countBadge',
                          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white, height: 1),
                        ),
                      ),
                    ),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink)),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11.5, color: AppColors.muted),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
