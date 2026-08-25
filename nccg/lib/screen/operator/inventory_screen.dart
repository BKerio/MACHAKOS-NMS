import 'package:flutter/material.dart';
import 'package:nccg/screen/operator/operator_shell.dart';

/// Placeholder for now - frontend/src/pages/operator/InventoryPage.tsx has
/// full checkout/return flows that are out of scope for this navigation-shell
/// pass. Wired into the drawer so the tab exists and is reachable; the real
/// checkout UI comes in a later pass against /fleet/inventory endpoints.
class InventoryScreen extends StatelessWidget {
  const InventoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(backgroundColor: kOpPrimary, title: const Text('Inventory', style: TextStyle(color: Colors.white))),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.inventory_2_outlined, size: 48, color: Colors.black26),
              const SizedBox(height: 14),
              const Text('Inventory check-out is coming soon on mobile.',
                  textAlign: TextAlign.center, style: TextStyle(color: Colors.black54, fontSize: 14)),
              const SizedBox(height: 6),
              const Text('Use the web dashboard for now.',
                  textAlign: TextAlign.center, style: TextStyle(color: Colors.black38, fontSize: 12.5)),
            ],
          ),
        ),
      ),
    );
  }
}
