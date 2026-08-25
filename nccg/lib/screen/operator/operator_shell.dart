import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:nccg/screen/operator/assignment_tab.dart';
import 'package:nccg/screen/operator/crew_tab.dart';
import 'package:nccg/screen/operator/activity_tab.dart';
import 'package:nccg/screen/operator/navigate_tab.dart';
import 'package:nccg/screen/operator/operator_drawer.dart';
import 'package:nccg/theme/tokens.dart';

/// The app chrome uses the same dark navy as the web console's sidebar
/// (`--nav-bg`); cards and accents use [AppColors.green].
const Color kOpPrimary = AppColors.navBg;

/// Root shell for the field-crew (Driver/EMT/Nurse) experience: a persistent
/// bottom tab bar for the primary actions, plus a Drawer (hamburger menu)
/// reachable from the top bar for everything else (History, Profile, Sign out).
/// Mirrors frontend/src/pages/operator/* and the Drawer/BottomNav split built
/// for the web app's Field Crew Login.
class OperatorShell extends StatefulWidget {
  const OperatorShell({super.key});

  @override
  State<OperatorShell> createState() => _OperatorShellState();
}

class _OperatorShellState extends State<OperatorShell> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  String? _role;
  String _name = '';
  int _tabIndex = 0;

  @override
  void initState() {
    super.initState();
    _loadUser();
  }

  Future<void> _loadUser() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _role = prefs.getString('role');
      _name = prefs.getString('name') ?? '';
    });
  }

  /// DRIVER gets a 4th "Navigate" tab; EMT/NURSE don't drive so they don't need it.
  List<_TabDef> get _tabs {
    final base = <_TabDef>[
      _TabDef('Assignment', Icons.local_hospital_rounded, const AssignmentTab()),
    ];
    if (_role == 'DRIVER') {
      base.add(_TabDef('Navigate', Icons.navigation_rounded, const NavigateTab()));
    }
    base.addAll([
      _TabDef('Crew', Icons.groups_rounded, const CrewTab()),
      _TabDef('Activity', Icons.timeline_rounded, const ActivityTab()),
    ]);
    return base;
  }

  String _greeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context) {
    if (_role == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator(color: kOpPrimary)));
    }

    final tabs = _tabs;
    final safeIndex = _tabIndex < tabs.length ? _tabIndex : 0;

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: AppColors.bg,
      drawer: OperatorDrawer(role: _role!, name: _name),
      appBar: AppBar(
        backgroundColor: kOpPrimary,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.menu_rounded, color: Colors.white),
          onPressed: () => _scaffoldKey.currentState?.openDrawer(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('${_greeting()}${_name.isNotEmpty ? ', ${_name.split(' ').first}' : ''}',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
            Text(_role ?? '', style: const TextStyle(fontSize: 11, color: Color(0xFF7E93A8), fontWeight: FontWeight.w600)),
          ],
        ),
      ),
      body: IndexedStack(
        index: safeIndex,
        children: tabs.map((t) => t.body).toList(),
      ),
      bottomNavigationBar: BottomNavigationBar(
        type: BottomNavigationBarType.fixed,
        currentIndex: safeIndex,
        selectedItemColor: kOpPrimary,
        unselectedItemColor: Colors.black38,
        selectedLabelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
        unselectedLabelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
        onTap: (i) => setState(() => _tabIndex = i),
        items: tabs
            .map((t) => BottomNavigationBarItem(icon: Icon(t.icon), label: t.label))
            .toList(),
      ),
    );
  }
}

class _TabDef {
  final String label;
  final IconData icon;
  final Widget body;
  _TabDef(this.label, this.icon, this.body);
}
