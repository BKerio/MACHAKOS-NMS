import 'package:flutter/material.dart';
import 'package:eoc_mcg/screen/operator/checklist_screen.dart';
import 'package:eoc_mcg/screen/operator/inventory_screen.dart';
import 'package:eoc_mcg/screen/operator/operator_shell.dart';
import 'package:eoc_mcg/screen/operator/profile_screen.dart';
import 'package:eoc_mcg/theme/tokens.dart';

/// Account-level settings, reached from the drawer. Also hosts Inventory and
/// Vehicle Checklist - they moved out of the drawer's main list (which now
/// mirrors the crew's primary destinations) but still need a way in.
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(backgroundColor: kOpPrimary, title: const Text('Settings', style: TextStyle(color: Colors.white))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          AppCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                _SettingsTile(
                  icon: Icons.person_outline_rounded,
                  title: 'Account',
                  subtitle: 'Name, phone number, and password',
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen())),
                ),
                const Divider(height: 1, indent: 16, endIndent: 16, color: AppColors.border),
                const _SettingsTile(
                  icon: Icons.notifications_outlined,
                  title: 'Notifications',
                  subtitle: 'Case alerts are managed in your phone\'s system settings',
                  onTap: null,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // Plain icon+label rows, matching how these two lived in the
          // drawer before Settings existed - no subtitle/chevron, just the
          // same flat list feel.
          AppCard(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(
              children: [
                _FlatItem(
                  icon: Icons.inventory_2_outlined,
                  label: 'Inventory',
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const InventoryScreen())),
                ),
                _FlatItem(
                  icon: Icons.fact_check_outlined,
                  label: 'Vehicle Checklist',
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ChecklistScreen())),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Icon + label row with no subtitle or chevron - matches how Inventory and
/// Vehicle Checklist looked as plain drawer items before they moved here.
class _FlatItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _FlatItem({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: AppColors.ink2, size: 22),
      title: Text(label, style: const TextStyle(color: AppColors.ink2, fontWeight: FontWeight.w600, fontSize: 14.5)),
      onTap: onTap,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 2),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  const _SettingsTile({required this.icon, required this.title, required this.subtitle, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: AppColors.ink2, size: 22),
      title: Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink)),
      subtitle: Text(subtitle, style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
      trailing: onTap != null ? const Icon(Icons.chevron_right_rounded, color: AppColors.muted2) : null,
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
    );
  }
}
