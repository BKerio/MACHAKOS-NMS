import 'package:flutter/material.dart';
import 'package:nccg/screen/operator/widgets/modal_sheet.dart';
import 'package:nccg/theme/tokens.dart';
import 'package:nccg/utils/closure_reasons.dart';

/// Port of frontend/src/components/operator/EndCaseModal.tsx, presented as a
/// bottom sheet since that is the mobile equivalent of the web's centred modal.
///
/// [onConfirm] should throw to keep the sheet open on failure; the sheet closes
/// itself once the call resolves.
class EndCaseModal extends StatefulWidget {
  final String caseNumber;
  final Future<void> Function(String reason) onConfirm;

  const EndCaseModal({super.key, required this.caseNumber, required this.onConfirm});

  static Future<void> show(
    BuildContext context, {
    required String caseNumber,
    required Future<void> Function(String reason) onConfirm,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => EndCaseModal(caseNumber: caseNumber, onConfirm: onConfirm),
    );
  }

  @override
  State<EndCaseModal> createState() => _EndCaseModalState();
}

class _EndCaseModalState extends State<EndCaseModal> {
  final _noteController = TextEditingController();
  String _selected = '';
  bool _submitting = false;

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  String get _reasonText => buildClosureReason(_selected, _noteController.text);

  bool get _canSubmit => _selected.isNotEmpty && _reasonText.length >= 10 && !_submitting;

  Future<void> _confirm() async {
    if (!_canSubmit) return;
    setState(() => _submitting = true);
    try {
      await widget.onConfirm(_reasonText);
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ModalSheetScaffold(
      headerColor: AppColors.red,
      eyebrow: 'END CASE',
      title: widget.caseNumber,
      busy: _submitting,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.redSoft,
              border: Border.all(color: AppColors.red),
              borderRadius: BorderRadius.circular(AppRadius.base),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.warning_amber_rounded, size: 18, color: AppColors.red),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'This closes the case at the current stage. A reason is required and will be '
                    'saved to the record.',
                    style: TextStyle(fontSize: 14, color: AppColors.red, height: 1.45),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const AppLabel('QUICK SELECT'),
          const SizedBox(height: 10),
          for (final preset in closureReasonPresets) ...[
            ChoiceRow(
              label: preset,
              active: _selected == preset,
              tone: AppColors.red,
              activeBackground: AppColors.redSoft,
              onTap: _submitting ? null : () => setState(() => _selected = preset),
            ),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 8),
          const AppLabel('ADDITIONAL NOTES (OPTIONAL)'),
          const SizedBox(height: 8),
          TextField(
            controller: _noteController,
            enabled: !_submitting,
            minLines: 3,
            maxLines: 5,
            style: const TextStyle(fontSize: 14, color: AppColors.ink),
            decoration: appInputDecoration(hintText: 'Any extra detail for dispatch...'),
            onChanged: (_) => setState(() {}),
          ),
        ],
      ),
      footer: Row(
        children: [
          Expanded(
            child: AppButton(
              label: 'Cancel',
              variant: AppButtonVariant.ghost,
              block: true,
              onPressed: _submitting ? null : () => Navigator.pop(context),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: AppButton(
              label: _submitting ? 'Ending...' : 'End case',
              icon: Icons.cancel_outlined,
              variant: AppButtonVariant.danger,
              block: true,
              busy: _submitting,
              onPressed: _canSubmit ? _confirm : null,
            ),
          ),
        ],
      ),
    );
  }
}
