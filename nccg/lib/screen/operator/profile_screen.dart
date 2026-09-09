import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/screen/operator/operator_shell.dart';

/// Self-service profile view, mirroring frontend/src/pages/shared/ProfilePage.tsx
/// (read-only for now - edit-profile comes in a later pass).
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Map<String, dynamic>? _user;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final user = await NmsApi.me();
      if (!mounted) return;
      setState(() => _user = user);
    } catch (_) {
      // Fall back to whatever's cached locally below.
      final prefs = await SharedPreferences.getInstance();
      if (!mounted) return;
      setState(() => _user = {
            'name': prefs.getString('name'),
            'phone': prefs.getString('phone'),
            'role': prefs.getString('role'),
          });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(backgroundColor: kOpPrimary, title: const Text('My Profile', style: TextStyle(color: Colors.white))),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: kOpPrimary))
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                _Field(label: 'Name', value: _user?['name']?.toString() ?? '-'),
                _Field(label: 'Phone', value: _user?['phone']?.toString() ?? '-'),
                _Field(label: 'Role', value: _user?['role']?.toString() ?? '-'),
                if (_user?['agency'] is Map) _Field(label: 'Agency', value: (_user!['agency']['name'] ?? '-').toString()),
              ],
            ),
    );
  }
}

class _Field extends StatelessWidget {
  final String label;
  final String value;
  const _Field({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE3E8E5)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label.toUpperCase(),
                style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Colors.black45, letterSpacing: 0.5)),
            const SizedBox(height: 4),
            Text(value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
