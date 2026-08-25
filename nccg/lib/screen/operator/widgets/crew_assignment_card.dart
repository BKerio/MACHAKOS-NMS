import 'package:flutter/material.dart';
import 'package:nccg/method/api.dart';
import 'package:nccg/models/task.dart';
import 'package:nccg/models/vehicle.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/theme/tokens.dart';

/// Port of frontend/src/components/operator/CrewAssignmentCard.tsx.
///
/// Drivers only: picks the EMT and nurse riding on their ambulance. Someone
/// already riding elsewhere shows as "Taken" rather than being hidden, so the
/// driver can see where they went.
class CrewAssignmentCard extends StatefulWidget {
  final Vehicle myVehicle;
  final VoidCallback? onChanged;

  const CrewAssignmentCard({super.key, required this.myVehicle, this.onChanged});

  @override
  State<CrewAssignmentCard> createState() => _CrewAssignmentCardState();
}

class _CrewAssignmentCardState extends State<CrewAssignmentCard> {
  List<AssignableCrewMember> _members = [];
  bool _loading = true;
  String? _busyRole;

  String? _emtId;
  String? _nurseId;

  @override
  void initState() {
    super.initState();
    _emtId = widget.myVehicle.currentEmt?.id;
    _nurseId = widget.myVehicle.currentNurse?.id;
    _load();
  }

  @override
  void didUpdateWidget(CrewAssignmentCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.myVehicle.id != widget.myVehicle.id) {
      _emtId = widget.myVehicle.currentEmt?.id;
      _nurseId = widget.myVehicle.currentNurse?.id;
      _load();
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final members = await NmsApi.getAssignableCrew();
      if (!mounted) return;
      setState(() => _members = members);
    } catch (_) {
      // An empty roster renders the "ask an admin" hint, which is a fine fallback.
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _setSlot(String role, String? userId) async {
    setState(() => _busyRole = role);
    try {
      await NmsApi.assignVehicleCrew(widget.myVehicle.id, role: role, userId: userId);
      if (!mounted) return;
      setState(() {
        if (role == 'EMT') {
          _emtId = userId;
        } else {
          _nurseId = userId;
        }
      });
      await _load();
      widget.onChanged?.call();
      if (mounted) {
        final label = role == 'EMT' ? 'EMT' : 'nurse';
        API.showSnack(
          context,
          userId != null
              ? '$label added to ${widget.myVehicle.registrationNumber}.'
              : '$label removed from this ambulance.',
        );
      }
    } catch (e) {
      if (mounted) API.showSnack(context, errorMessage(e), success: false);
    } finally {
      if (mounted) setState(() => _busyRole = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final emts = _members.where((m) => m.role == 'EMT').toList();
    final nurses = _members.where((m) => m.role == 'NURSE').toList();

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CardHeader(
            icon: Icons.person_add_alt_1_rounded,
            iconBg: AppColors.greenDark,
            title: 'Assign crew',
            subtitle: 'Pick an EMT and nurse for ${widget.myVehicle.registrationNumber}. '
                'If someone shows Taken, they are already helping another ambulance.',
          ),
          const SizedBox(height: 16),
          _buildPicker('EMT', emts, _emtId),
          _buildPicker('NURSE', nurses, _nurseId),
        ],
      ),
    );
  }

  Widget _buildPicker(String role, List<AssignableCrewMember> options, String? currentId) {
    final busy = _busyRole == role;

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppLabel(role),
          const SizedBox(height: 8),
          if (_loading)
            const Skeleton(height: 40)
          else if (options.isEmpty)
            Text(
              'No ${role == 'EMT' ? 'EMTs' : 'nurses'} in your agency yet. Ask an admin to add them.',
              style: const TextStyle(fontSize: 14, color: AppColors.muted),
            )
          else ...[
            _NobodyOption(
              hasCurrent: currentId != null,
              onTap: currentId != null && !busy ? () => _setSlot(role, null) : null,
            ),
            const SizedBox(height: 8),
            for (final person in options) ...[
              _CrewOption(
                person: person,
                active: currentId == person.id,
                busy: busy,
                myVehicleId: widget.myVehicle.id,
                onSelect: () => _setSlot(role, person.id),
                onBlocked: (message) => API.showSnack(context, message, success: false),
              ),
              const SizedBox(height: 8),
            ],
          ],
        ],
      ),
    );
  }
}

class _NobodyOption extends StatelessWidget {
  final bool hasCurrent;
  final VoidCallback? onTap;

  const _NobodyOption({required this.hasCurrent, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.base),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: hasCurrent ? AppColors.surface : AppColors.greenLight,
          border: Border.all(color: hasCurrent ? AppColors.border : AppColors.green, width: 2),
          borderRadius: BorderRadius.circular(AppRadius.base),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              hasCurrent ? 'Remove from this ambulance' : 'Nobody assigned',
              style: TextStyle(
                fontSize: 14,
                fontWeight: hasCurrent ? FontWeight.w400 : FontWeight.w700,
                color: hasCurrent ? AppColors.muted : AppColors.green,
              ),
            ),
            if (hasCurrent) ...[
              const SizedBox(height: 2),
              const Text(
                'They stay on shift - no check-out needed',
                style: TextStyle(fontSize: 12, color: AppColors.muted),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CrewOption extends StatelessWidget {
  final AssignableCrewMember person;
  final bool active;
  final bool busy;
  final String myVehicleId;
  final VoidCallback onSelect;
  final void Function(String message) onBlocked;

  const _CrewOption({
    required this.person,
    required this.active,
    required this.busy,
    required this.myVehicleId,
    required this.onSelect,
    required this.onBlocked,
  });

  @override
  Widget build(BuildContext context) {
    final takenElsewhere = !active &&
        person.status == 'TAKEN' &&
        person.assignedVehicleId != null &&
        person.assignedVehicleId != myVehicleId;
    final otherAmbulance = person.assignedVehicleRegistration ?? 'another ambulance';

    return Opacity(
      opacity: takenElsewhere ? 0.75 : 1,
      child: InkWell(
        onTap: () {
          if (takenElsewhere) {
            onBlocked('${person.name} is with $otherAmbulance right now.');
            return;
          }
          if (busy) return;
          onSelect();
        },
        borderRadius: BorderRadius.circular(AppRadius.base),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: active ? AppColors.greenLight : AppColors.surface,
            border: Border.all(color: active ? AppColors.green : AppColors.border, width: 2),
            borderRadius: BorderRadius.circular(AppRadius.base),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      person.name,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: active ? FontWeight.w700 : FontWeight.w400,
                        color: AppColors.ink,
                      ),
                    ),
                    if (person.phone != null && person.phone!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(person.phone!, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                    ],
                    if (takenElsewhere) ...[
                      const SizedBox(height: 4),
                      Text('With $otherAmbulance',
                          style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 10),
              if (busy && active)
                const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2.2, color: AppColors.green),
                )
              else if (active)
                const Icon(Icons.check_rounded, size: 18, color: AppColors.green)
              else if (takenElsewhere)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.red,
                    borderRadius: BorderRadius.circular(AppRadius.xs),
                  ),
                  child: const Text(
                    'Taken',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
