import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nccg/screen/operator/operator_shell.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/theme/tokens.dart';

/// Flutter counterpart of frontend/src/pages/auth/LoginPage.tsx - same
/// co-branded card, Staff/Field Crew tabs, phone -> code steps, multi-role
/// picker and footer, so crews see one consistent sign-in across web and phone.
///
/// Only the Field Crew tab signs in here: the backend rejects password login
/// for Drivers/EMTs/Nurses, and this app has no dispatcher or admin screens to
/// land a staff account on.
class OtpLoginScreen extends StatefulWidget {
  const OtpLoginScreen({super.key});

  @override
  State<OtpLoginScreen> createState() => _OtpLoginScreenState();
}

enum _LoginMode { staff, field }

enum _OtpStep { phone, code }

const Map<String, String> _roleLabels = {
  'SUPER_ADMIN': 'Super Admin',
  'ADMIN': 'Admin',
  'DISPATCHER': 'Dispatcher',
  'WATCHER': 'Watcher',
  'PARTNER': 'Partner',
  'DRIVER': 'Driver',
  'EMT': 'EMT',
  'NURSE': 'Nurse',
};

const int _otpResendSeconds = 60;

/// Held between verify and select-role for accounts with more than one role.
class _PendingSelection {
  final String pendingToken;
  final List<String> roles;
  final String name;

  _PendingSelection({required this.pendingToken, required this.roles, required this.name});
}

class _OtpLoginScreenState extends State<OtpLoginScreen> {
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  final _codeFocus = FocusNode();

  _LoginMode _mode = _LoginMode.field;
  _OtpStep _otpStep = _OtpStep.phone;

  bool _submitting = false;
  bool _selectingRole = false;
  String _serverError = '';
  int _resendIn = 0;
  Timer? _resendTimer;

  _PendingSelection? _pendingSelection;

  @override
  void dispose() {
    _resendTimer?.cancel();
    _phoneController.dispose();
    _codeController.dispose();
    _codeFocus.dispose();
    super.dispose();
  }

  void _startResendCountdown() {
    _resendTimer?.cancel();
    setState(() => _resendIn = _otpResendSeconds);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() => _resendIn = _resendIn <= 1 ? 0 : _resendIn - 1);
      if (_resendIn == 0) timer.cancel();
    });
  }

  Future<void> _requestCode() async {
    if (_submitting) return;
    final phone = _phoneController.text.trim();
    if (phone.length < 9) {
      setState(() => _serverError = 'Enter a valid phone number.');
      return;
    }

    setState(() {
      _serverError = '';
      _submitting = true;
    });
    try {
      await NmsApi.requestOtp(phone);
      if (!mounted) return;
      setState(() {
        _otpStep = _OtpStep.code;
        _codeController.clear();
      });
      _startResendCountdown();
      _codeFocus.requestFocus();
    } on NmsApiException catch (e) {
      if (mounted) setState(() => _serverError = e.message);
    } catch (e) {
      if (mounted) setState(() => _serverError = errorMessage(e));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _verifyCode() async {
    final code = _codeController.text.trim();
    if (code.length != 6 || _submitting) return;

    setState(() {
      _serverError = '';
      _submitting = true;
    });
    try {
      final session = await NmsApi.verifyOtp(_phoneController.text.trim(), code);
      if (!mounted) return;

      if (session['requiresRoleSelection'] == true) {
        final user = session['user'] as Map<String, dynamic>? ?? {};
        setState(() {
          _pendingSelection = _PendingSelection(
            pendingToken: session['pendingToken'] as String,
            roles: (session['roles'] as List<dynamic>).cast<String>(),
            name: user['name'] as String? ?? '',
          );
        });
        return;
      }

      await NmsApi.saveSession(session);
      _goToShell();
    } on NmsApiException catch (e) {
      if (mounted) {
        setState(() => _serverError = e.message);
        _codeController.clear();
      }
    } catch (_) {
      if (mounted) {
        setState(() => _serverError = 'Incorrect or expired code. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _chooseRole(String role) async {
    final pending = _pendingSelection;
    if (pending == null || _selectingRole) return;

    setState(() {
      _selectingRole = true;
      _serverError = '';
    });
    try {
      final session = await NmsApi.selectRole(pending.pendingToken, role);
      await NmsApi.saveSession(session);
      _goToShell();
    } on NmsApiException catch (e) {
      if (mounted) {
        setState(() {
          _serverError = e.message;
          _pendingSelection = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _serverError = 'That session expired. Please sign in again.';
          _pendingSelection = null;
        });
      }
    } finally {
      if (mounted) setState(() => _selectingRole = false);
    }
  }

  void _goToShell() {
    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const OperatorShell()),
    );
  }

  void _switchMode(_LoginMode next) {
    _resendTimer?.cancel();
    setState(() {
      _mode = next;
      _serverError = '';
      _pendingSelection = null;
      _otpStep = _OtpStep.phone;
      _codeController.clear();
      _resendIn = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: Container(
        // Mirrors the login page's radial wash above the card.
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment(0, -1.2),
            radius: 1.1,
            colors: [Color(0x141B5FAC), Color(0x001B5FAC)],
            stops: [0, 0.6],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 428),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _buildCard(),
                    const SizedBox(height: 18),
                    Text(
                      '© ${DateTime.now().year} Machakos County Government · '
                      'In partnership with Malteser International',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 12, color: AppColors.muted2, height: 1.5),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCard() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(AppRadius.lg),
        boxShadow: AppShadows.lg,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildCobrandHeader(),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 28, 24, 26),
            child: _pendingSelection != null ? _buildRolePicker() : _buildLoginBody(),
          ),
          _buildFooter(),
        ],
      ),
    );
  }

  Widget _buildCobrandHeader() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 26),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Image.asset('asset/nccg.jpg', height: 46, fit: BoxFit.contain),
          Container(
            width: 1,
            height: 40,
            margin: const EdgeInsets.symmetric(horizontal: 22),
            color: AppColors.border,
          ),
          Image.asset('asset/malteser.png', height: 38, fit: BoxFit.contain),
        ],
      ),
    );
  }

  Widget _buildFooter() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
      decoration: const BoxDecoration(
        color: AppColors.surface2,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: const Row(
        children: [
          Icon(Icons.verified_user_outlined, size: 15, color: AppColors.green),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'Authorized personnel only · All activity is logged and audited',
              style: TextStyle(fontSize: 12, color: AppColors.muted, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }

  // ── Multi-role picker ────────────────────────────────────────────────────

  Widget _buildRolePicker() {
    final pending = _pendingSelection!;
    final firstName = pending.name.isEmpty ? 'there' : pending.name.split(' ').first;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _BackLink(
          label: 'Back',
          onTap: () => setState(() {
            _pendingSelection = null;
            _serverError = '';
          }),
        ),
        const SizedBox(height: 8),
        const _Title('Choose a role'),
        const SizedBox(height: 5),
        _Subtitle(
          'Hi $firstName, your account holds more than one role. Pick which one to sign in as.',
        ),
        if (_serverError.isNotEmpty) ...[
          const SizedBox(height: 8),
          AlertError(_serverError),
        ],
        const SizedBox(height: 16),
        for (final role in pending.roles) ...[
          _RoleButton(
            label: _roleLabels[role] ?? role,
            busy: _selectingRole,
            onTap: _selectingRole ? null : () => _chooseRole(role),
          ),
          const SizedBox(height: 10),
        ],
      ],
    );
  }

  // ── Sign-in body ─────────────────────────────────────────────────────────

  Widget _buildLoginBody() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _Title('Login console'),
        const SizedBox(height: 5),
        const _Subtitle('Machakos County emergency dispatch console.'),
        const SizedBox(height: 14),
        _buildModeTabs(),
        if (_serverError.isNotEmpty) ...[
          const SizedBox(height: 16),
          AlertError(_serverError),
        ],
        const SizedBox(height: 16),
        if (_mode == _LoginMode.staff)
          _buildStaffNotice()
        else if (_otpStep == _OtpStep.phone)
          _buildPhoneStep()
        else
          _buildCodeStep(),
      ],
    );
  }

  Widget _buildModeTabs() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surface2,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          for (final mode in _LoginMode.values)
            Expanded(
              child: GestureDetector(
                onTap: () => _switchMode(mode),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 9),
                  decoration: BoxDecoration(
                    color: _mode == mode ? AppColors.surface : Colors.transparent,
                    border: Border.all(
                      color: _mode == mode ? AppColors.border : Colors.transparent,
                    ),
                    borderRadius: BorderRadius.circular(AppRadius.xs),
                  ),
                  child: Text(
                    mode == _LoginMode.staff ? 'Staff Login' : 'Field Crew Login',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: _mode == mode ? FontWeight.w700 : FontWeight.w600,
                      color: _mode == mode ? AppColors.ink : AppColors.muted,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// Staff (admin, dispatcher, watcher, partner) accounts have no screens in
  /// this app, so the tab points them at the web console instead of offering a
  /// sign-in that would dead-end.
  Widget _buildStaffNotice() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface2,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(AppRadius.base),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.desktop_windows_outlined, size: 18, color: AppColors.green),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Staff sign in on the web console',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Admins, dispatchers, watchers and partners use the browser console. '
                  'This app carries the field crew workflow only.',
                  style: TextStyle(fontSize: 13, color: AppColors.muted, height: 1.45),
                ),
                const SizedBox(height: 10),
                AppButton(
                  label: 'Use Field Crew Login',
                  icon: Icons.arrow_forward_rounded,
                  size: AppButtonSize.sm,
                  onPressed: () => _switchMode(_LoginMode.field),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPhoneStep() {
    final canSubmit = _phoneController.text.trim().length >= 9 && !_submitting;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _Subtitle(
          "For Drivers, EMTs, and Nurses. We'll text a 6-digit code to your registered phone number.",
        ),
        const SizedBox(height: 16),
        const _FieldLabel('Phone number'),
        const SizedBox(height: 6),
        TextField(
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          autofocus: true,
          textInputAction: TextInputAction.done,
          style: const TextStyle(fontSize: 14, color: AppColors.ink),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9+\s]'))],
          decoration: appInputDecoration(
            hintText: '07XX XXX XXX',
            prefixIcon: Icons.phone_android_rounded,
          ),
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) => canSubmit ? _requestCode() : null,
        ),
        const SizedBox(height: 20),
        AppButton(
          label: _submitting ? 'Sending code...' : 'Send code',
          icon: _submitting ? null : Icons.arrow_forward_rounded,
          size: AppButtonSize.lg,
          block: true,
          busy: _submitting,
          onPressed: canSubmit ? _requestCode : null,
        ),
      ],
    );
  }

  Widget _buildCodeStep() {
    final canSubmit = _codeController.text.trim().length == 6 && !_submitting;
    final phone = _phoneController.text.trim();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _BackLink(
          label: 'Change number',
          onTap: () {
            _resendTimer?.cancel();
            setState(() {
              _otpStep = _OtpStep.phone;
              _serverError = '';
              _resendIn = 0;
            });
          },
        ),
        const SizedBox(height: 16),
        _FieldLabel('Enter the 6-digit code sent to $phone'),
        const SizedBox(height: 6),
        TextField(
          controller: _codeController,
          focusNode: _codeFocus,
          keyboardType: TextInputType.number,
          autofillHints: const [AutofillHints.oneTimeCode],
          maxLength: 6,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            letterSpacing: 4,
            color: AppColors.ink,
          ),
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: appInputDecoration(
            hintText: '000000',
            prefixIcon: Icons.vpn_key_outlined,
          ).copyWith(counterText: ''),
          onChanged: (value) {
            setState(() {});
            if (value.length == 6) _verifyCode();
          },
        ),
        const SizedBox(height: 20),
        AppButton(
          label: _submitting ? 'Verifying...' : 'Verify & sign in',
          icon: _submitting ? null : Icons.arrow_forward_rounded,
          size: AppButtonSize.lg,
          block: true,
          busy: _submitting,
          onPressed: canSubmit ? _verifyCode : null,
        ),
        const SizedBox(height: 12),
        _ResendButton(
          secondsLeft: _resendIn,
          onTap: (_resendIn > 0 || _submitting) ? null : _requestCode,
        ),
      ],
    );
  }
}

// ── Small presentational pieces ────────────────────────────────────────────

class _Title extends StatelessWidget {
  final String text;
  const _Title(this.text);

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: const TextStyle(
      fontSize: 24,
      fontWeight: FontWeight.w800,
      letterSpacing: -0.6,
      color: AppColors.ink,
    ),
  );
}

class _Subtitle extends StatelessWidget {
  final String text;
  const _Subtitle(this.text);

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: const TextStyle(fontSize: 14, color: AppColors.muted, height: 1.5),
  );
}

class _FieldLabel extends StatelessWidget {
  final String text;
  const _FieldLabel(this.text);

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.ink2),
  );
}

class _BackLink extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _BackLink({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.chevron_left_rounded, size: 16, color: AppColors.muted),
          const SizedBox(width: 2),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: AppColors.muted,
            ),
          ),
        ],
      ),
    );
  }
}

class _RoleButton extends StatelessWidget {
  final String label;
  final bool busy;
  final VoidCallback? onTap;

  const _RoleButton({required this.label, required this.busy, this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.sm),
      child: Container(
        width: double.infinity,
        height: 46,
        padding: const EdgeInsets.symmetric(horizontal: 18),
        decoration: BoxDecoration(
          color: AppColors.surface2,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(AppRadius.sm),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              label,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: AppColors.ink,
              ),
            ),
            busy
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.muted),
                  )
                : const Icon(Icons.arrow_forward_rounded, size: 16, color: AppColors.ink),
          ],
        ),
      ),
    );
  }
}

class _ResendButton extends StatelessWidget {
  final int secondsLeft;
  final VoidCallback? onTap;

  const _ResendButton({required this.secondsLeft, this.onTap});

  @override
  Widget build(BuildContext context) {
    final waiting = secondsLeft > 0;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.sm),
      child: Container(
        width: double.infinity,
        height: 40,
        decoration: BoxDecoration(
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(AppRadius.sm),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.refresh_rounded,
              size: 14,
              color: waiting ? AppColors.muted : AppColors.ink,
            ),
            const SizedBox(width: 8),
            Text(
              waiting ? 'Resend code in ${secondsLeft}s' : 'Resend code',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: waiting ? AppColors.muted : AppColors.ink,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
