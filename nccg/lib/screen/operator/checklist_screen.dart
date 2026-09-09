import 'package:flutter/material.dart';
import 'package:nccg/method/api.dart';
import 'package:nccg/models/checklist.dart';
import 'package:nccg/models/inventory.dart';
import 'package:nccg/models/vehicle.dart';
import 'package:nccg/screen/operator/operator_shell.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/theme/tokens.dart';

/// Pre-dispatch equipment checklist for the crew's current vehicle - confirm
/// each active+required InventoryItem (vehicle tools and medical stock) is
/// present before dispatch can assign it a case. Mirrors
/// frontend/src/pages/operator/ChecklistPage.tsx. Whoever's currently checked
/// in (driver, EMT, or nurse) can confirm any item - it's a shared,
/// vehicle-level checklist, not scoped to one crew member.
class ChecklistScreen extends StatefulWidget {
  const ChecklistScreen({super.key});

  @override
  State<ChecklistScreen> createState() => _ChecklistScreenState();
}

class _ChecklistScreenState extends State<ChecklistScreen> {
  Vehicle? _myVehicle;
  VehicleChecklist? _checklist;
  bool _loading = true;
  final Set<String> _submitting = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    Vehicle? vehicle;
    try {
      vehicle = await NmsApi.getMyCheckIn();
    } catch (_) {
      vehicle = null;
    }
    VehicleChecklist? checklist;
    if (vehicle != null) {
      try {
        checklist = await NmsApi.getVehicleChecklist(vehicle.id);
      } catch (_) {
        // Leave null - the empty/error state below covers this.
      }
    }
    if (!mounted) return;
    setState(() {
      _myVehicle = vehicle;
      _checklist = checklist;
      _loading = false;
    });
  }

  Future<void> _confirm(VehicleChecklistItem item, String status, {String? note}) async {
    final vehicle = _myVehicle;
    if (vehicle == null) return;
    setState(() => _submitting.add(item.id));
    try {
      await NmsApi.submitChecklistItem(vehicle.id, itemId: item.id, status: status, note: note);
      final refreshed = await NmsApi.getVehicleChecklist(vehicle.id);
      if (!mounted) return;
      setState(() => _checklist = refreshed);
    } catch (e) {
      if (mounted) API.showSnack(context, errorMessage(e), success: false);
    } finally {
      if (mounted) setState(() => _submitting.remove(item.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(backgroundColor: kOpPrimary, title: const Text('Vehicle Checklist', style: TextStyle(color: Colors.white))),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: kOpPrimary))
          : _myVehicle == null
              ? _NotCheckedIn(onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  color: AppColors.green,
                  child: _buildBody(),
                ),
    );
  }

  Widget _buildBody() {
    final checklist = _checklist;
    if (checklist == null) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          AppCard(
            padding: const EdgeInsets.all(32),
            child: Column(
              children: [
                const Icon(Icons.cloud_off_rounded, size: 40, color: AppColors.muted2),
                const SizedBox(height: 12),
                const Text('Could not load the checklist.', style: TextStyle(fontSize: 14, color: AppColors.muted)),
                const SizedBox(height: 12),
                AppButton(label: 'Retry', variant: AppButtonVariant.soft, size: AppButtonSize.sm, onPressed: _load),
              ],
            ),
          ),
        ],
      );
    }

    final vehicleItems = checklist.items.where((i) => i.itemType == 'VEHICLE').toList();
    final medicalItems = checklist.items.where((i) => i.itemType == 'MEDICAL').toList();
    final byCategory = <String, List<VehicleChecklistItem>>{};
    for (final item in medicalItems) {
      (byCategory[item.category] ??= []).add(item);
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    checklist.summary.complete ? Icons.check_circle_rounded : Icons.warning_amber_rounded,
                    color: checklist.summary.complete ? AppColors.green : AppColors.amber,
                    size: 26,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${checklist.summary.confirmed}/${checklist.summary.totalRequired} confirmed overall',
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          checklist.summary.complete
                              ? 'Ready for dispatch'
                              : 'Confirm at least one medical item and one vehicle item to be dispatch-ready',
                          style: const TextStyle(fontSize: 12, color: AppColors.muted),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _GroupTag(label: 'Medical', ok: checklist.summary.medicalOk),
                  const SizedBox(width: 8),
                  _GroupTag(label: 'Vehicle', ok: checklist.summary.vehicleOk),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        if (vehicleItems.isNotEmpty) ...[
          const AppLabel('VEHICLE'),
          const SizedBox(height: 10),
          for (final item in vehicleItems) ...[
            _ChecklistRow(item: item, busy: _submitting.contains(item.id), onConfirm: (s, n) => _confirm(item, s, note: n)),
            const SizedBox(height: 10),
          ],
          const SizedBox(height: 8),
        ],

        for (final entry in byCategory.entries) ...[
          AppLabel(inventoryCategoryLabel(entry.key).toUpperCase()),
          const SizedBox(height: 10),
          for (final item in entry.value) ...[
            _ChecklistRow(item: item, busy: _submitting.contains(item.id), onConfirm: (s, n) => _confirm(item, s, note: n)),
            const SizedBox(height: 10),
          ],
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _GroupTag extends StatelessWidget {
  final String label;
  final bool ok;
  const _GroupTag({required this.label, required this.ok});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: ok ? AppColors.greenLight : AppColors.surface2,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        '${ok ? '✓' : '·'} $label',
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: ok ? AppColors.green : AppColors.muted),
      ),
    );
  }
}

class _NotCheckedIn extends StatelessWidget {
  final VoidCallback onRetry;
  const _NotCheckedIn({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        AppCard(
          padding: const EdgeInsets.all(36),
          child: Column(
            children: [
              const Icon(Icons.assignment_outlined, size: 44, color: AppColors.muted2),
              const SizedBox(height: 14),
              const Text('Not checked in', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink)),
              const SizedBox(height: 6),
              const Text(
                'Check in to a vehicle on the Crew tab to confirm its equipment checklist.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: AppColors.muted),
              ),
              const SizedBox(height: 14),
              AppButton(label: 'Refresh', variant: AppButtonVariant.soft, size: AppButtonSize.sm, onPressed: onRetry),
            ],
          ),
        ),
      ],
    );
  }
}

class _ChecklistRow extends StatefulWidget {
  final VehicleChecklistItem item;
  final bool busy;
  final void Function(String status, String? note) onConfirm;
  const _ChecklistRow({required this.item, required this.busy, required this.onConfirm});

  @override
  State<_ChecklistRow> createState() => _ChecklistRowState();
}

class _ChecklistRowState extends State<_ChecklistRow> {
  bool _noting = false;
  late final _noteController = TextEditingController(text: widget.item.note ?? '');

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(AppRadius.base),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink)),
                    if (item.status != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        [
                          item.status == 'OK' ? 'Confirmed' : 'Issue flagged',
                          if (item.checkedByName != null) item.checkedByName!,
                        ].join(' · '),
                        style: const TextStyle(fontSize: 12, color: AppColors.muted),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _StatusButton(
                icon: Icons.check_circle_outline_rounded,
                label: 'OK',
                active: item.status == 'OK',
                activeColor: AppColors.green,
                busy: widget.busy,
                onTap: () => widget.onConfirm('OK', null),
              ),
              const SizedBox(width: 6),
              _StatusButton(
                icon: Icons.warning_amber_rounded,
                label: 'Issue',
                active: item.status == 'ISSUE',
                activeColor: AppColors.red,
                busy: widget.busy,
                onTap: () => setState(() => _noting = !_noting),
              ),
            ],
          ),
          if (_noting) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _noteController,
                    enabled: !widget.busy,
                    style: const TextStyle(fontSize: 13, color: AppColors.ink),
                    decoration: appInputDecoration(hintText: "What's wrong? (optional)"),
                  ),
                ),
                const SizedBox(width: 8),
                AppButton(
                  label: 'Flag',
                  variant: AppButtonVariant.danger,
                  size: AppButtonSize.sm,
                  busy: widget.busy,
                  onPressed: () {
                    final note = _noteController.text.trim();
                    widget.onConfirm('ISSUE', note.isEmpty ? null : note);
                    setState(() => _noting = false);
                  },
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _StatusButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool active;
  final Color activeColor;
  final bool busy;
  final VoidCallback onTap;

  const _StatusButton({
    required this.icon,
    required this.label,
    required this.active,
    required this.activeColor,
    required this.busy,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: busy ? null : onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: active ? activeColor : AppColors.surface2,
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: active ? activeColor : AppColors.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: active ? Colors.white : AppColors.ink2),
            const SizedBox(width: 4),
            Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: active ? Colors.white : AppColors.ink2)),
          ],
        ),
      ),
    );
  }
}
