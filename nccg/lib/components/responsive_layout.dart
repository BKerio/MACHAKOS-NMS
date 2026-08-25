import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

class ResponsiveBreakpoints {
  const ResponsiveBreakpoints._();

  static const double tablet = 768;
  static const double desktop = 1024;
}

class ResponsiveLayout extends StatelessWidget {
  final Widget mobile;
  final Widget desktop;
  final double desktopBreakpoint;

  const ResponsiveLayout({
    super.key,
    required this.mobile,
    required this.desktop,
    this.desktopBreakpoint = ResponsiveBreakpoints.desktop,
  });

  static bool isDesktopPlatform() {
    if (kIsWeb) return true;
    return <TargetPlatform>{
      TargetPlatform.macOS,
      TargetPlatform.windows,
      TargetPlatform.linux,
    }.contains(defaultTargetPlatform);
  }

  static bool isDesktopWidth(
    BuildContext context, {
    double breakpoint = ResponsiveBreakpoints.desktop,
  }) {
    return MediaQuery.of(context).size.width >= breakpoint;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isDesktop = constraints.maxWidth >= desktopBreakpoint;
        return isDesktop ? desktop : mobile;
      },
    );
  }
}

class DesktopPageShell extends StatelessWidget {
  final Widget child;
  final double maxWidth;
  final EdgeInsetsGeometry padding;

  const DesktopPageShell({
    super.key,
    required this.child,
    this.maxWidth = 1200,
    this.padding = const EdgeInsets.symmetric(horizontal: 64, vertical: 32),
  });

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

class DesktopScaffoldFrame extends StatelessWidget {
  final Widget child;
  final Color backgroundColor;

  const DesktopScaffoldFrame({
    super.key,
    required this.child,
    this.backgroundColor = const Color(0xFFF7F8FA),
    String title = '',
    Color primaryColor = const Color(0xFF35C2C1),
  });

  @override
  Widget build(BuildContext context) {
    return Container(color: backgroundColor, child: child);
  }
}








