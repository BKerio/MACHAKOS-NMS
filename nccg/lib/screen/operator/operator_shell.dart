import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollDirection;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:nccg/screen/operator/assignment_tab.dart';
import 'package:nccg/screen/operator/crew_tab.dart';
import 'package:nccg/screen/operator/activity_tab.dart';
import 'package:nccg/screen/operator/navigate_tab.dart';
import 'package:nccg/screen/operator/operator_drawer.dart';
import 'package:nccg/screen/operator/profile_screen.dart';
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

  /// Twitter/X-style behaviour: the bottom tab bar collapses out of the way
  /// while a tab scrolls down, and comes back on scroll-up or once the tab
  /// is back at the top - see the NotificationListener in [build].
  bool _navVisible = true;

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
    final isDriver = _role == 'DRIVER';
    final base = <_TabDef>[
      _TabDef(
        'Assignment',
        Icons.local_hospital_rounded,
        // The Assignment card's own "Navigate" shortcut jumps here too - it
        // always lands at index 1 since Navigate is only ever inserted next.
        AssignmentTab(onNavigateToMap: isDriver ? () => setState(() => _tabIndex = 1) : null),
      ),
    ];
    if (isDriver) {
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

  String get _initials {
    final trimmed = _name.trim();
    if (trimmed.isEmpty) return '?';
    return trimmed.split(RegExp(r'\s+')).map((p) => p[0]).take(2).join().toUpperCase();
  }

  /// Twitter/X-style scroll handling: hide going down, show going up, and
  /// always show once a tab is scrolled back to its top.
  bool _handleScroll(ScrollNotification notification) {
    if (notification.metrics.pixels <= 0) {
      if (!_navVisible) setState(() => _navVisible = true);
      return false;
    }
    if (notification is UserScrollNotification) {
      final goingDown = notification.direction == ScrollDirection.reverse;
      final goingUp = notification.direction == ScrollDirection.forward;
      if (goingDown && _navVisible) {
        setState(() => _navVisible = false);
      } else if (goingUp && !_navVisible) {
        setState(() => _navVisible = true);
      }
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    if (_role == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator(color: kOpPrimary)));
    }

    final tabs = _tabs;
    final safeIndex = _tabIndex < tabs.length ? _tabIndex : 0;
    // Includes the device's bottom safe-area inset (home indicator etc.) so
    // collapsing the bar to 0 and back never clips it on notched phones.
    final navHeight = kBottomNavigationBarHeight + MediaQuery.of(context).padding.bottom;

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: AppColors.bg,
      drawer: OperatorDrawer(role: _role!, name: _name, onReturn: _loadUser),
      appBar: AppBar(
        backgroundColor: kOpPrimary,
        elevation: 2,
        shadowColor: Colors.black45,
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
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 14),
            child: GestureDetector(
              onTap: () async {
                await Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen()));
                await _loadUser();
              },
              child: CircleAvatar(
                radius: 16,
                backgroundColor: Colors.white,
                child: Text(
                  _initials,
                  style: const TextStyle(color: kOpPrimary, fontWeight: FontWeight.w800, fontSize: 12),
                ),
              ),
            ),
          ),
        ],
      ),
      body: NotificationListener<ScrollNotification>(
        onNotification: _handleScroll,
        child: IndexedStack(
          index: safeIndex,
          children: tabs.map((t) => t.body).toList(),
        ),
      ),
      bottomNavigationBar: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeInOut,
        height: _navVisible ? navHeight : 0,
        clipBehavior: Clip.hardEdge,
        decoration: const BoxDecoration(),
        child: OverflowBox(
          maxHeight: navHeight,
          alignment: Alignment.bottomCenter,
          child: BottomNavigationBar(
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
        ),
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
