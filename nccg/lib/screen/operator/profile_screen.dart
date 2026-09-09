import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:nccg/method/api.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/screen/operator/operator_shell.dart';
import 'package:nccg/theme/tokens.dart';

/// Self-service profile view, mirroring frontend/src/pages/shared/ProfilePage.tsx:
/// every signed-in role (Driver/EMT/Nurse included) can update their own name,
/// phone, and password here. Email stays read-only - only an admin can change it.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Map<String, dynamic>? _user;
  bool _loading = true;

  late final _nameController = TextEditingController();
  late final _phoneController = TextEditingController();
  bool _savingProfile = false;

  bool _showPasswordForm = false;
  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _showCurrent = false;
  bool _showNew = false;
  bool _savingPassword = false;

  @override
  void initState() {
    super.initState();
    _nameController.addListener(() => setState(() {}));
    _phoneController.addListener(() => setState(() {}));
    _load();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    Map<String, dynamic>? user;
    try {
      user = await NmsApi.me();
    } catch (_) {
      // Fall back to whatever's cached locally.
      final prefs = await SharedPreferences.getInstance();
      user = {
        'name': prefs.getString('name'),
        'phone': prefs.getString('phone'),
        'role': prefs.getString('role'),
      };
    }
    if (!mounted) return;
    setState(() {
      _user = user;
      _nameController.text = user?['name']?.toString() ?? '';
      _phoneController.text = user?['phone']?.toString() ?? '';
      _loading = false;
    });
  }

  bool get _profileDirty =>
      _nameController.text.trim() != (_user?['name']?.toString() ?? '').trim() ||
      _phoneController.text.trim() != (_user?['phone']?.toString() ?? '').trim();

  Future<void> _saveProfile() async {
    final name = _nameController.text.trim();
    if (name.length < 2) {
      API.showSnack(context, 'Name must be at least 2 characters', success: false);
      return;
    }
    setState(() => _savingProfile = true);
    try {
      final phone = _phoneController.text.trim();
      final updated = await NmsApi.updateMyProfile(name: name, phone: phone.isEmpty ? null : phone);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('name', updated['name']?.toString() ?? name);
      await prefs.setString('phone', updated['phone']?.toString() ?? '');
      if (!mounted) return;
      setState(() {
        _user = updated;
        _nameController.text = updated['name']?.toString() ?? name;
        _phoneController.text = updated['phone']?.toString() ?? '';
      });
      API.showSnack(context, 'Your details have been saved.');
    } catch (e) {
      if (mounted) API.showSnack(context, errorMessage(e), success: false);
    } finally {
      if (mounted) setState(() => _savingProfile = false);
    }
  }

  Future<void> _savePassword() async {
    final current = _currentPasswordController.text;
    final next = _newPasswordController.text;
    final confirm = _confirmPasswordController.text;
    if (current.isEmpty) {
      API.showSnack(context, 'Enter your current password', success: false);
      return;
    }
    if (next.length < 8) {
      API.showSnack(context, 'Password must be at least 8 characters', success: false);
      return;
    }
    if (next != confirm) {
      API.showSnack(context, "New passwords don't match", success: false);
      return;
    }
    setState(() => _savingPassword = true);
    try {
      await NmsApi.updateMyProfile(currentPassword: current, newPassword: next);
      _currentPasswordController.clear();
      _newPasswordController.clear();
      _confirmPasswordController.clear();
      if (!mounted) return;
      setState(() => _showPasswordForm = false);
      API.showSnack(context, 'Use your new password next time you sign in.');
    } catch (e) {
      if (mounted) API.showSnack(context, errorMessage(e), success: false);
    } finally {
      if (mounted) setState(() => _savingPassword = false);
    }
  }

  String _roleLabel(String role) =>
      role.split('_').map((w) => w.isEmpty ? w : '${w[0]}${w.substring(1).toLowerCase()}').join(' ');

  @override
  Widget build(BuildContext context) {
    final role = _user?['role']?.toString() ?? '';
    final agencyName = (_user?['agency'] is Map) ? (_user!['agency']['name']?.toString() ?? '') : '';
    final email = _user?['email']?.toString() ?? '';
    final displayName = _nameController.text.trim().isNotEmpty ? _nameController.text.trim() : (_user?['name']?.toString() ?? '');
    final initials = displayName.isEmpty
        ? '?'
        : displayName.trim().split(RegExp(r'\s+')).map((p) => p[0]).take(2).join().toUpperCase();

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(backgroundColor: kOpPrimary, title: const Text('My Profile', style: TextStyle(color: Colors.white))),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: kOpPrimary))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Identity header
                AppCard(
                  padding: EdgeInsets.zero,
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.surface2,
                      borderRadius: BorderRadius.circular(AppRadius.base),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: AppColors.ink, borderRadius: BorderRadius.circular(AppRadius.base)),
                          child: Text(initials, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                displayName.isEmpty ? 'Your name' : displayName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
                              ),
                              const SizedBox(height: 6),
                              Wrap(
                                spacing: 8,
                                runSpacing: 4,
                                crossAxisAlignment: WrapCrossAlignment.center,
                                children: [
                                  if (role.isNotEmpty)
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: AppColors.surface,
                                        border: Border.all(color: AppColors.border),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        _roleLabel(role),
                                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.ink, letterSpacing: 0.4),
                                      ),
                                    ),
                                  if (agencyName.isNotEmpty)
                                    Text(agencyName, style: const TextStyle(fontSize: 11.5, color: AppColors.muted, fontWeight: FontWeight.w600)),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                // Editable details
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const AppLabel('FULL NAME'),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _nameController,
                        enabled: !_savingProfile,
                        style: const TextStyle(fontSize: 14, color: AppColors.ink),
                        decoration: appInputDecoration(hintText: 'Your full name', prefixIcon: Icons.person_outline_rounded),
                      ),
                      const SizedBox(height: 16),
                      const AppLabel('PHONE NUMBER'),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _phoneController,
                        enabled: !_savingProfile,
                        keyboardType: TextInputType.phone,
                        style: const TextStyle(fontSize: 14, color: AppColors.ink),
                        decoration: appInputDecoration(hintText: '+254...', prefixIcon: Icons.phone_outlined),
                      ),
                      const SizedBox(height: 16),
                      const AppLabel('EMAIL ADDRESS'),
                      const SizedBox(height: 6),
                      TextField(
                        enabled: false,
                        controller: TextEditingController(text: email),
                        style: const TextStyle(fontSize: 14, color: AppColors.muted),
                        decoration: appInputDecoration(prefixIcon: Icons.mail_outline_rounded),
                      ),
                      const SizedBox(height: 6),
                      const Text('Contact an admin to change your email.', style: TextStyle(fontSize: 11, color: AppColors.muted)),
                      const SizedBox(height: 18),
                      AppButton(
                        label: _savingProfile ? 'Saving…' : 'Save changes',
                        icon: Icons.check_rounded,
                        block: true,
                        busy: _savingProfile,
                        onPressed: (_profileDirty && !_savingProfile) ? _saveProfile : null,
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 16),

                // Password
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 38,
                            height: 38,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(color: AppColors.surface2, borderRadius: BorderRadius.circular(AppRadius.sm)),
                            child: const Icon(Icons.key_outlined, size: 18, color: AppColors.ink),
                          ),
                          const SizedBox(width: 12),
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Password', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink)),
                                SizedBox(height: 2),
                                Text('Change your sign-in password', style: TextStyle(fontSize: 11.5, color: AppColors.muted)),
                              ],
                            ),
                          ),
                          if (!_showPasswordForm)
                            AppButton(
                              label: 'Change',
                              variant: AppButtonVariant.soft,
                              size: AppButtonSize.sm,
                              onPressed: () => setState(() => _showPasswordForm = true),
                            ),
                        ],
                      ),
                      if (_showPasswordForm) ...[
                        const SizedBox(height: 18),
                        const AppLabel('CURRENT PASSWORD'),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _currentPasswordController,
                          enabled: !_savingPassword,
                          obscureText: !_showCurrent,
                          style: const TextStyle(fontSize: 14, color: AppColors.ink),
                          decoration: appInputDecoration(
                            prefixIcon: Icons.lock_outline_rounded,
                            suffixIcon: IconButton(
                              icon: Icon(_showCurrent ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 18),
                              onPressed: () => setState(() => _showCurrent = !_showCurrent),
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                        const AppLabel('NEW PASSWORD'),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _newPasswordController,
                          enabled: !_savingPassword,
                          obscureText: !_showNew,
                          style: const TextStyle(fontSize: 14, color: AppColors.ink),
                          decoration: appInputDecoration(
                            hintText: 'Minimum 8 characters',
                            prefixIcon: Icons.lock_outline_rounded,
                            suffixIcon: IconButton(
                              icon: Icon(_showNew ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 18),
                              onPressed: () => setState(() => _showNew = !_showNew),
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                        const AppLabel('CONFIRM NEW PASSWORD'),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _confirmPasswordController,
                          enabled: !_savingPassword,
                          obscureText: !_showNew,
                          style: const TextStyle(fontSize: 14, color: AppColors.ink),
                          decoration: appInputDecoration(prefixIcon: Icons.lock_outline_rounded),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(
                              child: AppButton(
                                label: 'Cancel',
                                variant: AppButtonVariant.ghost,
                                block: true,
                                onPressed: _savingPassword
                                    ? null
                                    : () {
                                        _currentPasswordController.clear();
                                        _newPasswordController.clear();
                                        _confirmPasswordController.clear();
                                        setState(() => _showPasswordForm = false);
                                      },
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: AppButton(
                                label: _savingPassword ? 'Updating…' : 'Update password',
                                block: true,
                                busy: _savingPassword,
                                onPressed: _savingPassword ? null : _savePassword,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}
