import 'package:flutter/material.dart';
import 'package:nccg/method/api.dart';
import 'package:nccg/models/inventory.dart';
import 'package:nccg/models/vehicle.dart';
import 'package:nccg/screen/operator/operator_shell.dart';
import 'package:nccg/screen/operator/widgets/modal_sheet.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/theme/tokens.dart';

/// Browse central stock and check it out onto the crew's ambulance, or return
/// unused quantities. Mirrors frontend/src/pages/operator/InventoryPage.tsx.
class InventoryScreen extends StatefulWidget {
  const InventoryScreen({super.key});

  @override
  State<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends State<InventoryScreen> {
  Vehicle? _myVehicle;
  List<InventoryItem> _items = [];
  List<InventoryCheckout> _myStock = [];
  bool _loading = true;

  final _searchController = TextEditingController();
  String _category = 'ALL';

  /// itemId -> quantity. Shared (by reference) with the cart sheet while it's
  /// open, so edits made there don't need a separate round-trip back here.
  final Map<String, int> _cart = {};

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() => setState(() {}));
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    Vehicle? vehicle;
    try {
      vehicle = await NmsApi.getMyCheckIn();
    } catch (_) {
      vehicle = null;
    }
    List<InventoryItem> items = [];
    try {
      items = await NmsApi.getAvailableInventory();
    } catch (_) {
      // Leave empty - the empty state below covers this.
    }
    List<InventoryCheckout> mine = [];
    if (vehicle != null) {
      try {
        mine = await NmsApi.getMyInventory();
      } catch (_) {
        // Non-fatal - the "on vehicle" card just stays hidden.
      }
    }
    if (!mounted) return;
    setState(() {
      _myVehicle = vehicle;
      _items = items;
      _myStock = mine;
      _loading = false;
    });
  }

  List<InventoryItem> get _filtered {
    final q = _searchController.text.trim().toLowerCase();
    return _items.where((item) {
      if (_category != 'ALL' && item.category != _category) return false;
      if (q.isEmpty) return true;
      return item.name.toLowerCase().contains(q) || inventoryCategoryLabel(item.category).toLowerCase().contains(q);
    }).toList();
  }

  int _inCart(String itemId) => _cart[itemId] ?? 0;

  void _setQty(InventoryItem item, int qty) {
    setState(() => applyCartQty(_cart, item, qty));
  }

  List<(InventoryItem, int)> get _cartLines {
    final byId = {for (final i in _items) i.id: i};
    return _cart.entries
        .where((e) => e.value > 0 && byId.containsKey(e.key))
        .map((e) => (byId[e.key]!, e.value))
        .toList();
  }

  int get _cartCount => _cartLines.fold(0, (sum, l) => sum + l.$2);

  Future<void> _openCart() async {
    await _CartSheet.show(
      context,
      cart: _cart,
      items: _items,
      vehicleLabel: _myVehicle?.registrationNumber ?? 'ambulance',
      onConfirm: () async {
        final lines = _cartLines;
        await NmsApi.checkoutInventory(lines.map((l) => {'itemId': l.$1.id, 'quantity': l.$2}).toList());
        final count = lines.fold<int>(0, (sum, l) => sum + l.$2);
        _cart.clear();
        if (mounted) {
          API.showSnack(
            context,
            '$count unit${count == 1 ? '' : 's'} moved onto ${_myVehicle?.registrationNumber ?? 'your ambulance'}.',
          );
        }
      },
    );
    if (mounted) await _load();
  }

  Future<void> _openReturn(InventoryCheckout checkout) async {
    await _ReturnStockSheet.show(
      context,
      checkout: checkout,
      onConfirm: (qty) async {
        await NmsApi.returnInventory(checkout.id, qty);
        if (mounted) API.showSnack(context, 'Stock returned to central inventory.');
      },
    );
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(backgroundColor: kOpPrimary, title: const Text('Inventory', style: TextStyle(color: Colors.white))),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: kOpPrimary))
          : Column(
              children: [
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _load,
                    color: AppColors.green,
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                      children: [
                        const Text(
                          'Browse central stock and add it to your ambulance',
                          style: TextStyle(fontSize: 13, color: AppColors.muted),
                        ),
                        const SizedBox(height: 16),

                        if (_myVehicle == null) ...[
                          Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: AppColors.surface,
                              border: Border.all(color: AppColors.gold),
                              borderRadius: BorderRadius.circular(AppRadius.base),
                            ),
                            child: const Row(
                              children: [
                                Icon(Icons.local_shipping_outlined, size: 20, color: AppColors.muted),
                                SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    'Check in to a vehicle on the Crew tab before taking or returning stock.',
                                    style: TextStyle(fontSize: 13, color: AppColors.ink2, height: 1.4),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                        ] else if (_myStock.isNotEmpty) ...[
                          AppCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                AppLabel('ON ${_myVehicle!.registrationNumber}'),
                                const SizedBox(height: 6),
                                for (var i = 0; i < _myStock.length; i++) ...[
                                  if (i > 0) const Divider(height: 1, color: AppColors.border),
                                  _MyStockRow(checkout: _myStock[i], onReturn: () => _openReturn(_myStock[i])),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],

                        TextField(
                          controller: _searchController,
                          style: const TextStyle(fontSize: 14, color: AppColors.ink),
                          decoration: appInputDecoration(hintText: 'Search stock...', prefixIcon: Icons.search_rounded),
                        ),
                        const SizedBox(height: 10),
                        SizedBox(
                          height: 34,
                          child: ListView(
                            scrollDirection: Axis.horizontal,
                            children: [
                              for (final c in inventoryCategories)
                                Padding(
                                  padding: const EdgeInsets.only(right: 8),
                                  child: _CategoryChip(
                                    label: c.$2,
                                    active: _category == c.$1,
                                    onTap: () => setState(() => _category = c.$1),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),

                        if (_filtered.isEmpty)
                          const _EmptyStock()
                        else
                          for (final item in _filtered) ...[
                            _StockRow(item: item, qty: _inCart(item.id), onChanged: (q) => _setQty(item, q)),
                            const SizedBox(height: 10),
                          ],
                      ],
                    ),
                  ),
                ),
                if (_cartCount > 0)
                  Container(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
                    decoration: const BoxDecoration(
                      color: AppColors.bg,
                      border: Border(top: BorderSide(color: AppColors.border)),
                    ),
                    child: AppButton(
                      label: 'Review cart · $_cartCount item${_cartCount == 1 ? '' : 's'}',
                      icon: Icons.shopping_cart_outlined,
                      size: AppButtonSize.lg,
                      block: true,
                      onPressed: _openCart,
                    ),
                  ),
              ],
            ),
    );
  }
}

/// Shared clamp-and-drop-if-zero logic for adjusting a cart quantity, used by
/// both the stock list and the cart sheet (which each hold their own
/// reference to the same [cart] map).
void applyCartQty(Map<String, int> cart, InventoryItem item, int qty) {
  final clamped = qty.clamp(0, item.quantityStock);
  if (clamped <= 0) {
    cart.remove(item.id);
  } else {
    cart[item.id] = clamped;
  }
}

class _CategoryChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _CategoryChip({required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          color: active ? AppColors.green : AppColors.surface2,
          border: Border.all(color: active ? AppColors.green : AppColors.border),
          borderRadius: BorderRadius.circular(99),
        ),
        child: Text(
          label,
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: active ? Colors.white : AppColors.ink2),
        ),
      ),
    );
  }
}

class _MyStockRow extends StatelessWidget {
  final InventoryCheckout checkout;
  final VoidCallback onReturn;
  const _MyStockRow({required this.checkout, required this.onReturn});

  @override
  Widget build(BuildContext context) {
    final outstanding = checkout.outstanding;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(checkout.item.name, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AppColors.ink)),
                const SizedBox(height: 2),
                Text(
                  '$outstanding ${checkout.item.unit}${outstanding == 1 ? '' : 's'} onboard',
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
          ),
          TextButton.icon(
            onPressed: onReturn,
            icon: const Icon(Icons.undo_rounded, size: 15),
            label: const Text('Return', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            style: TextButton.styleFrom(foregroundColor: AppColors.ink2),
          ),
        ],
      ),
    );
  }
}

class _StockRow extends StatelessWidget {
  final InventoryItem item;
  final int qty;
  final ValueChanged<int> onChanged;
  const _StockRow({required this.item, required this.qty, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final outOfStock = item.quantityStock <= 0;
    return AppCard(
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    Text(item.name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.surface2,
                        border: Border.all(color: AppColors.border),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        inventoryCategoryLabel(item.category),
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.muted, letterSpacing: 0.4),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  outOfStock ? 'Out of stock' : '${item.quantityStock} ${item.unit}${item.quantityStock == 1 ? '' : 's'} available',
                  style: TextStyle(fontSize: 12, color: outOfStock ? AppColors.red : AppColors.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          qty > 0
              ? _QtyStepper(qty: qty, max: item.quantityStock, onChanged: onChanged)
              : AppButton(label: 'Add', size: AppButtonSize.sm, onPressed: outOfStock ? null : () => onChanged(1)),
        ],
      ),
    );
  }
}

class _EmptyStock extends StatelessWidget {
  const _EmptyStock();

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(36),
      child: const Column(
        children: [
          Icon(Icons.inventory_2_outlined, size: 36, color: AppColors.muted2),
          SizedBox(height: 12),
          Text('No stock found', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink)),
          SizedBox(height: 6),
          Text('Try a different search or category.', style: TextStyle(fontSize: 13, color: AppColors.muted)),
        ],
      ),
    );
  }
}

/// Minus/count/plus control shared by the stock list, the cart sheet, and the
/// return sheet.
class _QtyStepper extends StatelessWidget {
  final int qty;
  final int max;
  final ValueChanged<int> onChanged;
  const _QtyStepper({required this.qty, required this.max, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _step(Icons.remove_rounded, () => onChanged(qty - 1)),
        SizedBox(
          width: 26,
          child: Text('$qty', textAlign: TextAlign.center, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.ink)),
        ),
        _step(Icons.add_rounded, qty >= max ? null : () => onChanged(qty + 1)),
      ],
    );
  }

  Widget _step(IconData icon, VoidCallback? onTap) {
    return SizedBox(
      width: 30,
      height: 30,
      child: IconButton(
        padding: EdgeInsets.zero,
        onPressed: onTap,
        icon: Icon(icon, size: 16, color: onTap == null ? AppColors.muted2 : AppColors.ink2),
      ),
    );
  }
}

/// Review-and-confirm sheet for the crew's cart, mirroring the web's cart
/// drawer. Mutates [cart] in place (shared with the caller) so the sticky
/// button's count is already correct once this sheet closes.
class _CartSheet extends StatefulWidget {
  final Map<String, int> cart;
  final List<InventoryItem> items;
  final String vehicleLabel;
  final Future<void> Function() onConfirm;

  const _CartSheet({required this.cart, required this.items, required this.vehicleLabel, required this.onConfirm});

  static Future<void> show(
    BuildContext context, {
    required Map<String, int> cart,
    required List<InventoryItem> items,
    required String vehicleLabel,
    required Future<void> Function() onConfirm,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _CartSheet(cart: cart, items: items, vehicleLabel: vehicleLabel, onConfirm: onConfirm),
    );
  }

  @override
  State<_CartSheet> createState() => _CartSheetState();
}

class _CartSheetState extends State<_CartSheet> {
  bool _submitting = false;

  List<(InventoryItem, int)> get _lines {
    final byId = {for (final i in widget.items) i.id: i};
    return widget.cart.entries
        .where((e) => e.value > 0 && byId.containsKey(e.key))
        .map((e) => (byId[e.key]!, e.value))
        .toList();
  }

  void _setQty(InventoryItem item, int qty) {
    setState(() => applyCartQty(widget.cart, item, qty));
  }

  Future<void> _confirm() async {
    if (_lines.isEmpty || _submitting) return;
    setState(() => _submitting = true);
    try {
      await widget.onConfirm();
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final lines = _lines;
    return ModalSheetScaffold(
      headerColor: kOpPrimary,
      eyebrow: 'CART',
      title: 'Add to ${widget.vehicleLabel}',
      busy: _submitting,
      body: lines.isEmpty
          ? const Text('Your cart is empty.', style: TextStyle(fontSize: 14, color: AppColors.muted))
          : Column(
              children: [
                for (final line in lines) ...[
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(line.$1.name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink)),
                            const SizedBox(height: 2),
                            Text(line.$1.unit, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                          ],
                        ),
                      ),
                      _QtyStepper(qty: line.$2, max: line.$1.quantityStock, onChanged: (q) => _setQty(line.$1, q)),
                    ],
                  ),
                  const SizedBox(height: 14),
                ],
              ],
            ),
      footer: AppButton(
        label: _submitting ? 'Checking out…' : 'Confirm checkout',
        icon: Icons.check_rounded,
        size: AppButtonSize.lg,
        block: true,
        busy: _submitting,
        onPressed: lines.isEmpty ? null : _confirm,
      ),
    );
  }
}

/// Return some/all of an outstanding checkout, mirroring the web's return
/// modal. Same shape as EndCaseModal: [onConfirm] should throw to keep the
/// sheet open on failure.
class _ReturnStockSheet extends StatefulWidget {
  final InventoryCheckout checkout;
  final Future<void> Function(int quantity) onConfirm;

  const _ReturnStockSheet({required this.checkout, required this.onConfirm});

  static Future<void> show(
    BuildContext context, {
    required InventoryCheckout checkout,
    required Future<void> Function(int quantity) onConfirm,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ReturnStockSheet(checkout: checkout, onConfirm: onConfirm),
    );
  }

  @override
  State<_ReturnStockSheet> createState() => _ReturnStockSheetState();
}

class _ReturnStockSheetState extends State<_ReturnStockSheet> {
  late int _qty = widget.checkout.outstanding.clamp(1, widget.checkout.outstanding == 0 ? 1 : widget.checkout.outstanding);
  bool _submitting = false;

  Future<void> _confirm() async {
    setState(() => _submitting = true);
    try {
      await widget.onConfirm(_qty);
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final max = widget.checkout.outstanding;
    return ModalSheetScaffold(
      headerColor: kOpPrimary,
      eyebrow: 'RETURN STOCK',
      title: widget.checkout.item.name,
      busy: _submitting,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Adds the quantity back to central inventory.', style: TextStyle(fontSize: 13, color: AppColors.muted)),
          const SizedBox(height: 16),
          const AppLabel('QUANTITY TO RETURN'),
          const SizedBox(height: 8),
          Row(
            children: [
              _QtyStepper(qty: _qty, max: max, onChanged: (q) => setState(() => _qty = q < 1 ? 1 : q)),
              const SizedBox(width: 10),
              Text('of $max onboard', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
            ],
          ),
        ],
      ),
      footer: Row(
        children: [
          Expanded(
            child: AppButton(
              label: 'Cancel',
              variant: AppButtonVariant.ghost,
              block: true,
              onPressed: _submitting ? null : () => Navigator.pop(context),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: AppButton(
              label: _submitting ? 'Returning…' : 'Return',
              icon: Icons.undo_rounded,
              block: true,
              busy: _submitting,
              onPressed: _confirm,
            ),
          ),
        ],
      ),
    );
  }
}
