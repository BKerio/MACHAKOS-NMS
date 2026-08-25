import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:nccg/method/api.dart';
import 'package:nccg/models/task.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/screen/operator/operator_shell.dart';

/// Driver-only tab: hands the active incident's coordinates off to the
/// device's own maps app, mirroring frontend/src/pages/operator/NavigatePage.tsx
/// (the web app draws its own in-app map; on-device Google/Apple Maps turn-by-turn
/// is the better fit for a driver actually behind the wheel).
class NavigateTab extends StatefulWidget {
  const NavigateTab({super.key});

  @override
  State<NavigateTab> createState() => _NavigateTabState();
}

class _NavigateTabState extends State<NavigateTab> {
  CrewTask? _task;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final task = await NmsApi.getActiveTask();
      if (!mounted) return;
      setState(() => _task = task);
    } catch (_) {
      // Stay on the empty state - the refresh control lets them retry.
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openMaps() async {
    final incident = _task?.incident;
    if (incident?.lat == null || incident?.lng == null) return;
    final uri = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=${incident!.lat},${incident.lng}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else if (mounted) {
      API.showSnack(context, 'Could not open Maps on this device.', success: false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      color: kOpPrimary,
      child: _loading
          ? const Center(child: CircularProgressIndicator(color: kOpPrimary))
          : _task == null
              ? ListView(children: const [
                  SizedBox(height: 140),
                  Center(child: Text('No active assignment to navigate to.', style: TextStyle(color: Colors.black54))),
                ])
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFE3E8E5)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.location_on_rounded, color: kOpPrimary, size: 30),
                          const SizedBox(height: 10),
                          Text(_task!.incident.locationName,
                              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: kOpPrimary)),
                          const SizedBox(height: 6),
                          Text(_task!.incident.caseNumber, style: const TextStyle(fontSize: 12.5, color: Colors.black54)),
                          if (_task!.incident.lat == null || _task!.incident.lng == null) ...[
                            const SizedBox(height: 14),
                            const Text('No GPS coordinates on this incident yet.',
                                style: TextStyle(color: Colors.black45, fontSize: 12.5)),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    if (_task!.incident.lat != null && _task!.incident.lng != null)
                      SizedBox(
                        height: 52,
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: kOpPrimary,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          ),
                          onPressed: _openMaps,
                          icon: const Icon(Icons.navigation_rounded, color: Colors.white),
                          label: const Text('Open in Maps', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
                        ),
                      ),
                  ],
                ),
    );
  }
}
