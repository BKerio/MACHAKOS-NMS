/// Mirrors the InventoryCategory union in frontend/src/types/api.ts. Kept as
/// plain strings (matching the API's wire format) rather than a Dart enum, so
/// an unrecognised category from the server still round-trips instead of
/// throwing.
const List<(String value, String label)> inventoryCategories = [
  ('ALL', 'All'),
  ('VITALS', 'Vitals'),
  ('CONSUMABLES', 'Consumables'),
  ('MEDICATION', 'Medication'),
  ('AIRWAY', 'Airway'),
  ('WOUND_CARE', 'Wound Care'),
  ('OTHER', 'Other'),
];

String inventoryCategoryLabel(String value) {
  for (final c in inventoryCategories) {
    if (c.$1 == value) return c.$2;
  }
  return value;
}

/// Mirrors InventoryItem in frontend/src/types/api.ts.
class InventoryItem {
  final String id;
  final String name;
  final String category;
  final String unit;
  final int quantityStock;

  InventoryItem({
    required this.id,
    required this.name,
    required this.category,
    required this.unit,
    required this.quantityStock,
  });

  factory InventoryItem.fromJson(Map<String, dynamic> json) => InventoryItem(
    id: json['id'] as String,
    name: json['name'] as String? ?? '',
    category: json['category'] as String? ?? 'OTHER',
    unit: json['unit'] as String? ?? 'unit',
    quantityStock: (json['quantityStock'] as num?)?.toInt() ?? 0,
  );
}

/// Mirrors InventoryCheckout in frontend/src/types/api.ts - a crew member's
/// outstanding (or fully returned) draw against one InventoryItem.
class InventoryCheckout {
  final String id;
  final int quantity;
  final int returnedQuantity;
  final String status;
  final InventoryItem item;

  InventoryCheckout({
    required this.id,
    required this.quantity,
    required this.returnedQuantity,
    required this.status,
    required this.item,
  });

  int get outstanding => quantity - returnedQuantity;

  factory InventoryCheckout.fromJson(Map<String, dynamic> json) => InventoryCheckout(
    id: json['id'] as String,
    quantity: (json['quantity'] as num?)?.toInt() ?? 0,
    returnedQuantity: (json['returnedQuantity'] as num?)?.toInt() ?? 0,
    status: json['status'] as String? ?? 'CHECKED_OUT',
    item: InventoryItem.fromJson(json['item'] as Map<String, dynamic>),
  );
}
