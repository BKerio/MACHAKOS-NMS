import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:nccg/screen/otp_login.dart';
import 'package:nccg/screen/operator/operator_shell.dart';
import 'package:nccg/screen/operator/checklist_screen.dart';
import 'package:nccg/screen/operator/history_screen.dart';
import 'package:nccg/screen/operator/inventory_screen.dart';
import 'package:nccg/screen/operator/profile_screen.dart';

/// Slide-out menu reached from the top bar's hamburger icon. Holds everything
/// that doesn't fit in the bottom tab bar - History, Inventory, Profile,
/// Sign out - mirroring the "Field Operations" section of the web sidebar
/// (frontend/src/components/layout/Sidebar.tsx) collapsed into a drawer.
class OperatorDrawer extends StatelessWidget {
  final String role;
  final String name;

  /// Called after returning from a pushed page (e.g. Profile), so the shell
  /// picks up a name/role change made there instead of showing stale text
  /// until some unrelated rebuild happens to touch it.
  final VoidCallback onReturn;

  const OperatorDrawer({super.key, required this.role, required this.name, required this.onReturn});

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

    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    if (!context.mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const OtpLoginScreen()),
      (route) => false,
    );
  }

  Future<void> _push(BuildContext context, Widget page) async {
    Navigator.pop(context); // close the drawer first
    await Navigator.push(context, MaterialPageRoute(builder: (_) => page));
    onReturn();
  }

  @override
  Widget build(BuildContext context) {
    final initials = name.trim().isEmpty
        ? '?'
        : name.trim().split(RegExp(r'\s+')).map((p) => p[0]).take(2).join().toUpperCase();

    return Drawer(
      child: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(20, 54, 20, 22),
            color: kOpPrimary,
            child: Row(
              children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: Colors.white,
                  child: Text(initials, style: const TextStyle(color: kOpPrimary, fontWeight: FontWeight.w800, fontSize: 16)),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name.isEmpty ? 'Field Crew' : name,
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15),
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 2),
                      Text(role, style: const TextStyle(color: Color(0xFF7E93A8), fontSize: 12, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                _DrawerItem(icon: Icons.history_rounded, label: 'History', onTap: () => _push(context, const HistoryScreen())),
                _DrawerItem(icon: Icons.inventory_2_outlined, label: 'Inventory', onTap: () => _push(context, const InventoryScreen())),
                _DrawerItem(icon: Icons.fact_check_outlined, label: 'Vehicle Checklist', onTap: () => _push(context, const ChecklistScreen())),
                _DrawerItem(icon: Icons.person_outline_rounded, label: 'My Profile', onTap: () => _push(context, const ProfileScreen())),
              ],
            ),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.all(12),
            child: _DrawerItem(
              icon: Icons.logout_rounded,
              label: 'Sign Out',
              color: Colors.red,
              onTap: () => _signOut(context),
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

  const _DrawerItem({required this.icon, required this.label, required this.onTap, this.color});

  @override
  Widget build(BuildContext context) {
    final c = color ?? const Color(0xFF3D4A44);
    return ListTile(
      leading: Icon(icon, color: c, size: 22),
      title: Text(label, style: TextStyle(color: c, fontWeight: FontWeight.w600, fontSize: 14.5)),
      onTap: onTap,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 2),
    );
  }
}
