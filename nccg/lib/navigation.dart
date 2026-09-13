import 'package:flutter/material.dart';

/// App-wide navigator key so code with no BuildContext of its own (notably
/// [NotificationService]'s background/tapped-notification handlers) can still
/// push a route. Attached to the [MaterialApp] in main.dart.
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();
