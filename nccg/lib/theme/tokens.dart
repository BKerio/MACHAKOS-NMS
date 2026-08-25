import 'package:flutter/material.dart';

/// Dart mirror of the design tokens in frontend/src/index.css, so the operator
/// app and the web console stay visually identical. Names match the CSS
/// variables (`--green` -> [AppColors.green]) to keep the two easy to diff.
///
/// Note `green` is the brand accent and is actually blue (#1B5FAC) on the web -
/// the token name is kept as-is rather than renamed, so a change on either side
/// is obvious.
class AppColors {
  static const green = Color(0xFF1B5FAC);
  static const greenDark = Color(0xFF164B87);
  static const greenDeep = Color(0xFF123A68);
  static const greenLight = Color(0xFFE7F0FA);
  static const greenBright = Color(0xFF2E86D6);

  static const gold = Color(0xFFD4A017);
  static const goldSoft = Color(0xFFFBF3DD);
  static const red = Color(0xFFD62828);
  static const redSoft = Color(0xFFFBEAEA);
  static const amber = Color(0xFFB7791F);
  static const amberSoft = Color(0xFFFBF1DD);
  static const blue = Color(0xFF2563EB);
  static const blueSoft = Color(0xFFE8EFFD);

  static const bg = Color(0xFFF4F7F5);
  static const bg2 = Color(0xFFEDF2EF);
  static const surface = Color(0xFFFFFFFF);
  static const surface2 = Color(0xFFF8FAF9);
  static const surface3 = Color(0xFFF1F5F3);
  static const border = Color(0xFFE3E8E5);
  static const borderStrong = Color(0xFFD3DAD6);
  static const ink = Color(0xFF15211B);
  static const ink2 = Color(0xFF3D4A44);
  static const muted = Color(0xFF6B7670);
  static const muted2 = Color(0xFF94A099);

  static const navBg = Color(0xFF0A1B2E);
  static const navMuted = Color(0xFF7E93A8);
}

class AppRadius {
  static const xs = 6.0;
  static const sm = 8.0;
  static const base = 12.0;
  static const lg = 16.0;
  static const xl = 22.0;
}

class AppShadows {
  static const sm = [
    BoxShadow(color: Color(0x0D10211A), blurRadius: 2, offset: Offset(0, 1)),
  ];
  static const md = [
    BoxShadow(color: Color(0x1410211A), blurRadius: 14, offset: Offset(0, 4)),
    BoxShadow(color: Color(0x0A10211A), blurRadius: 4, offset: Offset(0, 2)),
  ];
  static const lg = [
    BoxShadow(color: Color(0x2910211A), blurRadius: 50, offset: Offset(0, 18)),
    BoxShadow(color: Color(0x1410211A), blurRadius: 16, offset: Offset(0, 6)),
  ];
}

/// `.label` - the small uppercase-ish caption above form fields and list groups.
class AppLabel extends StatelessWidget {
  final String text;
  const AppLabel(this.text, {super.key});

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: const TextStyle(
      fontSize: 11,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.66,
      color: AppColors.muted,
    ),
  );
}

/// `.eyebrow` - like [AppLabel] but with wider tracking, used inside cards.
class Eyebrow extends StatelessWidget {
  final String text;
  const Eyebrow(this.text, {super.key});

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: const TextStyle(
      fontSize: 11,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.99,
      color: AppColors.muted,
    ),
  );
}

/// `.card` + `.card-pad`.
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  const AppCard({super.key, required this.child, this.padding = const EdgeInsets.all(20)});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(AppRadius.base),
        boxShadow: AppShadows.sm,
      ),
      child: child,
    );
  }
}

enum PillTone { red, green, amber, blue, gold, gray }

/// `.pill` + the `.pill-*` tone modifiers.
class Pill extends StatelessWidget {
  final String text;
  final PillTone tone;
  const Pill(this.text, {super.key, this.tone = PillTone.gray});

  static const _bg = {
    PillTone.red: AppColors.redSoft,
    PillTone.green: AppColors.greenLight,
    PillTone.amber: AppColors.amberSoft,
    PillTone.blue: AppColors.blueSoft,
    PillTone.gold: AppColors.goldSoft,
    PillTone.gray: AppColors.surface3,
  };

  static const _fg = {
    PillTone.red: AppColors.red,
    PillTone.green: AppColors.green,
    PillTone.amber: AppColors.amber,
    PillTone.blue: AppColors.blue,
    PillTone.gold: AppColors.gold,
    PillTone.gray: AppColors.muted,
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: _bg[tone],
        borderRadius: BorderRadius.circular(99),
        border: Border.all(
          color: tone == PillTone.gray ? AppColors.border : Colors.transparent,
        ),
      ),
      child: Text(
        text,
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, height: 1, color: _fg[tone]),
      ),
    );
  }
}

enum AppButtonVariant { primary, ghost, soft, danger, outlineDanger }

enum AppButtonSize { sm, base, lg }

/// `.btn` and its variants/sizes. [busy] swaps the leading icon for a spinner
/// so callers don't each re-implement the loading state.
class AppButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final AppButtonVariant variant;
  final AppButtonSize size;
  final bool busy;
  final bool block;

  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.variant = AppButtonVariant.primary,
    this.size = AppButtonSize.base,
    this.busy = false,
    this.block = false,
  });

  double get _height => switch (size) {
    AppButtonSize.sm => 34,
    AppButtonSize.base => 40,
    AppButtonSize.lg => 46,
  };

  double get _fontSize => switch (size) {
    AppButtonSize.sm => 13,
    AppButtonSize.base => 14,
    AppButtonSize.lg => 15,
  };

  double get _padding => switch (size) {
    AppButtonSize.sm => 12,
    AppButtonSize.base => 16,
    AppButtonSize.lg => 22,
  };

  double get _radius => size == AppButtonSize.sm ? AppRadius.xs : AppRadius.sm;

  Color get _bg => switch (variant) {
    AppButtonVariant.primary => AppColors.green,
    AppButtonVariant.ghost => Colors.transparent,
    AppButtonVariant.soft => AppColors.surface3,
    AppButtonVariant.danger => AppColors.red,
    AppButtonVariant.outlineDanger => Colors.transparent,
  };

  Color get _fg => switch (variant) {
    AppButtonVariant.primary => Colors.white,
    AppButtonVariant.ghost => AppColors.ink2,
    AppButtonVariant.soft => AppColors.ink,
    AppButtonVariant.danger => Colors.white,
    AppButtonVariant.outlineDanger => AppColors.red,
  };

  Color get _borderColor => switch (variant) {
    AppButtonVariant.ghost => AppColors.borderStrong,
    AppButtonVariant.soft => AppColors.border,
    AppButtonVariant.outlineDanger => AppColors.red,
    _ => Colors.transparent,
  };

  @override
  Widget build(BuildContext context) {
    final disabled = onPressed == null || busy;

    final content = Row(
      mainAxisSize: block ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (busy)
          SizedBox(
            width: _fontSize + 2,
            height: _fontSize + 2,
            child: CircularProgressIndicator(strokeWidth: 2.2, color: _fg),
          )
        else if (icon != null)
          Icon(icon, size: _fontSize + 2, color: _fg),
        if (busy || icon != null) const SizedBox(width: 8),
        Flexible(
          child: Text(
            label,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: _fontSize, fontWeight: FontWeight.w600, color: _fg),
          ),
        ),
      ],
    );

    return Opacity(
      opacity: disabled ? 0.65 : 1,
      child: Material(
        color: _bg,
        borderRadius: BorderRadius.circular(_radius),
        child: InkWell(
          onTap: disabled ? null : onPressed,
          borderRadius: BorderRadius.circular(_radius),
          child: Container(
            height: _height,
            width: block ? double.infinity : null,
            padding: EdgeInsets.symmetric(horizontal: _padding),
            decoration: BoxDecoration(
              border: Border.all(color: _borderColor),
              borderRadius: BorderRadius.circular(_radius),
            ),
            child: Center(child: content),
          ),
        ),
      ),
    );
  }
}

/// The icon-tile + title + subtitle header used at the top of every operator
/// card on the web (a coloured rounded square, then two lines of text).
class CardHeader extends StatelessWidget {
  final IconData icon;
  final Color iconBg;
  final String title;
  final String subtitle;

  const CardHeader({
    super.key,
    required this.icon,
    required this.iconBg,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(AppRadius.base)),
          child: Icon(icon, size: 22, color: Colors.white),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: const TextStyle(fontSize: 14, color: AppColors.muted, height: 1.35),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// `.skel` - the grey loading placeholder.
class Skeleton extends StatelessWidget {
  final double height;
  const Skeleton({super.key, required this.height});

  @override
  Widget build(BuildContext context) => Container(
    height: height,
    decoration: BoxDecoration(
      color: AppColors.surface3,
      borderRadius: BorderRadius.circular(AppRadius.sm),
    ),
  );
}

/// `.alert-error` - the inline red banner used on the login screen.
class AlertError extends StatelessWidget {
  final String message;
  const AlertError(this.message, {super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.redSoft,
        border: Border.all(color: AppColors.red.withValues(alpha: 0.22)),
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline_rounded, size: 16, color: AppColors.red),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: AppColors.red,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// `.input` - shared decoration so every text field matches the web console.
InputDecoration appInputDecoration({
  String? hintText,
  IconData? prefixIcon,
  Widget? suffixIcon,
  bool hasError = false,
}) {
  OutlineInputBorder border(Color color, [double width = 1]) => OutlineInputBorder(
    borderRadius: BorderRadius.circular(AppRadius.sm),
    borderSide: BorderSide(color: color, width: width),
  );

  return InputDecoration(
    filled: true,
    fillColor: AppColors.surface,
    hintText: hintText,
    hintStyle: const TextStyle(fontSize: 14, color: AppColors.muted2, fontWeight: FontWeight.w400),
    isDense: true,
    contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 13),
    prefixIcon: prefixIcon != null
        ? Icon(prefixIcon, size: 16, color: AppColors.muted)
        : null,
    prefixIconConstraints: const BoxConstraints(minWidth: 40, minHeight: 40),
    suffixIcon: suffixIcon,
    enabledBorder: border(hasError ? AppColors.red : AppColors.borderStrong),
    focusedBorder: border(hasError ? AppColors.red : AppColors.green, 1.6),
    disabledBorder: border(AppColors.border),
    errorBorder: border(AppColors.red),
    focusedErrorBorder: border(AppColors.red, 1.6),
  );
}
jj