import 'package:flutter/material.dart';
import 'package:nccg/theme/tokens.dart';

/// Shared chrome for the operator bottom sheets, mirroring the structure of the
/// web modals: a coloured header with an eyebrow + title and a close button, a
/// scrolling body, then a footer pinned above the keyboard.
class ModalSheetScaffold extends StatelessWidget {
  final Color headerColor;
  final String eyebrow;
  final String title;
  final Widget body;
  final Widget footer;

  /// Blocks the close button while a submit is in flight.
  final bool busy;

  const ModalSheetScaffold({
    super.key,
    required this.headerColor,
    required this.eyebrow,
    required this.title,
    required this.body,
    required this.footer,
    this.busy = false,
  });

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);

    return Padding(
      padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(maxHeight: media.size.height * 0.92),
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
              child: Container(
                color: headerColor,
                padding: const EdgeInsets.fromLTRB(20, 16, 12, 16),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            eyebrow,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.4,
                              color: Colors.white.withValues(alpha: 0.8),
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            title,
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: busy ? null : () => Navigator.pop(context),
                      icon: Icon(
                        Icons.close_rounded,
                        color: Colors.white.withValues(alpha: busy ? 0.4 : 0.85),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: body,
              ),
            ),
            Container(
              padding: const EdgeInsets.all(20),
              decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: AppColors.border)),
              ),
              child: SafeArea(top: false, child: footer),
            ),
          ],
        ),
      ),
    );
  }
}

/// A single tappable preset row, matching the web's 2px-bordered option buttons
/// that turn the accent colour when selected.
class ChoiceRow extends StatelessWidget {
  final String label;
  final bool active;
  final Color tone;
  final Color activeBackground;
  final VoidCallback? onTap;

  const ChoiceRow({
    super.key,
    required this.label,
    required this.active,
    required this.tone,
    required this.activeBackground,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.base),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: active ? activeBackground : AppColors.surface,
          border: Border.all(color: active ? tone : AppColors.border, width: 2),
          borderRadius: BorderRadius.circular(AppRadius.base),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: active ? FontWeight.w700 : FontWeight.w400,
            color: active ? tone : AppColors.ink,
          ),
        ),
      ),
    );
  }
}
