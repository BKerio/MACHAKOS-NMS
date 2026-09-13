import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:nccg/screen/otp_login.dart';
import 'package:nccg/screen/operator/operator_shell.dart';
import 'package:nccg/screen/operator/history_screen.dart';
import 'package:nccg/screen/operator/profile_screen.dart';
import 'package:nccg/screen/operator/settings_screen.dart';
import 'package:nccg/services/notification_service.dart';
import 'package:nccg/theme/tokens.dart';

/// Slide-out menu reached from the top bar's hamburger icon: every
/// destination in the app, plus Sign out. Crew/Assignment/Activity switch the
/// shell's bottom tab (they already live there); History/Profile/Settings
/// push their own screen. Mirrors the "Field Operations" section of the web
/// sidebar (frontend/src/components/layout/Sidebar.tsx) collapsed into a
/// drawer.
class OperatorDrawer extends StatelessWidget {
  final String role;
  final String name;
  final String email;

  /// Called after returning from a pushed page (e.g. Profile), so the shell
  /// picks up a name/role change made there instead of showing stale text
  /// until some unrelated rebuild happens to touch it.
  final VoidCallback onReturn;

  /// Switches the shell's bottom tab to the one matching this label, for the
  /// items that duplicate a bottom tab instead of pushing a new screen.
  final ValueChanged<String> onSelectTab;

  const OperatorDrawer({
    super.key,
    required this.role,
    required this.name,
    required this.email,
    required this.onReturn,
    required this.onSelectTab,
  });

  Future<void> _signOut(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign Out'),
        content: const Text("Are you sure you want to sign out? You'll need to log in again."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Stay')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sign Out', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    await NotificationService().clearToken();
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    if (!context.mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const OtpLoginScreen()),
      (route) => false,
    );
  }

  void _selectTab(BuildContext context, String label) {
    Navigator.pop(context); // close the drawer first
    onSelectTab(label);
  }

  Future<void> _push(BuildContext context, Widget page) async {
    Navigator.pop(context); // close the drawer first
    await Navigator.push(context, MaterialPageRoute(builder: (_) => page));
    onReturn();
  }

  void _showHelp(BuildContext context) {
    Navigator.pop(context);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Help & Support'),
        content: const Text(
          'For an active case emergency, use your radio or call dispatch directly. '
          'For app issues, contact your system administrator.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final initial = name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();
    final topPadding = MediaQuery.of(context).padding.top;

    return Drawer(
      child: Column(
        children: [
          Container(
            width: double.infinity,
            padding: EdgeInsets.fromLTRB(20, topPadding + 20, 20, 24),
            color: kOpPrimary,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 30,
                  backgroundColor: AppColors.green,
                  child: Text(initial, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 24)),
                ),
                const SizedBox(height: 14),
                Text(
                  name.isEmpty ? 'Field Crew' : name,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 21),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Text(
                  role,
                  style: const TextStyle(color: Color(0xFF7E93A8), fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.8),
                ),
                if (email.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    email,
                    style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                _DrawerItem(icon: Icons.groups_outlined, label: 'Crew', onTap: () => _selectTab(context, 'Crew')),
                _DrawerItem(icon: Icons.local_hospital_outlined, label: 'Assignment', onTap: () => _selectTab(context, 'Assignment')),
                _DrawerItem(icon: Icons.monitor_heart_outlined, label: 'Activity', onTap: () => _selectTab(context, 'Activity')),
                _DrawerItem(icon: Icons.done_all_rounded, label: 'History', onTap: () => _push(context, const HistoryScreen())),
                _DrawerItem(icon: Icons.person_outline_rounded, label: 'Profile', onTap: () => _push(context, const ProfileScreen())),
                _DrawerItem(icon: Icons.settings_outlined, label: 'Settings', onTap: () => _push(context, const SettingsScreen())),
              ],
            ),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: Column(
              children: [
                _DrawerItem(
                  icon: Icons.help_outline_rounded,
                  label: 'Help & Support',
                  showChevron: false,
                  onTap: () => _showHelp(context),
                ),
                _DrawerItem(
                  icon: Icons.logout_rounded,
                  label: 'Sign out',
                  color: Colors.red,
                  showChevron: false,
                  onTap: () => _signOut(context),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _DrawerItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;
  final bool showChevron;

  const _DrawerItem({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
    this.showChevron = true,
  });

  @override
  Widget build(BuildContext context) {
    final c = color ?? const Color(0xFF3D4A44);
    return ListTile(
      leading: Icon(icon, color: c, size: 22),
      title: Text(label, style: TextStyle(color: c, fontWeight: FontWeight.w600, fontSize: 15)),
      trailing: showChevron ? const Icon(Icons.chevron_right_rounded, color: AppColors.muted2, size: 20) : null,
      onTap: onTap,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
    );
  }
}
