import 'package:flutter/material.dart';
import 'package:nccg/models/vehicle.dart';
import 'package:nccg/screen/operator/widgets/available_ambulances_card.dart';
import 'package:nccg/screen/operator/widgets/crew_assignment_card.dart';
import 'package:nccg/screen/operator/widgets/shift_check_in_card.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/theme/tokens.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Mirrors frontend/src/pages/operator/CrewPage.tsx: shift check-in, then the
/// crew picker for drivers who are on a vehicle, then the fleet roster.
class CrewTab extends StatefulWidget {
  const CrewTab({super.key});

  @override
  State<CrewTab> createState() => _CrewTabState();
}

class _CrewTabState extends State<CrewTab> {
  String? _role;
  String _userId = '';
  Vehicle? _myVehicle;
  bool _loading = true;

  /// Bumped on check-in/out so the child cards rebuild with fresh data.
  int _refreshToken = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    Vehicle? mine;
    try {
      mine = await NmsApi.getMyCheckIn();
    } catch (_) {
      mine = null;
    }
    if (!mounted) return;
    setState(() {
      _role = prefs.getString('role');
      _userId = prefs.getString('user_id') ?? '';
      _myVehicle = mine;
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
            key: ValueKey('checkin-$_refreshToken'),
            role: _role ?? '',
            userId: _userId,
            onChanged: _refresh,
          ),
          if (isDriver && _myVehicle != null) ...[
            const SizedBox(height: 16),
            CrewAssignmentCard(
              key: ValueKey('crew-${_myVehicle!.id}-$_refreshToken'),
              myVehicle: _myVehicle!,
              onChanged: _refresh,
            ),
          ],
          const SizedBox(height: 16),
          AvailableAmbulancesCard(key: ValueKey('fleet-$_refreshToken')),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
