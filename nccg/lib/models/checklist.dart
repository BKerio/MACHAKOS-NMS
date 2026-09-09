/// Mirrors frontend/src/types/api.ts's VehicleChecklistItem/VehicleChecklist -
/// the pre-dispatch equipment checklist for one vehicle.
class VehicleChecklistItem {
  final String id;
  final String name;
  final String category;
  final String itemType; // MEDICAL | VEHICLE
  final String unit;
  final String? status; // OK | ISSUE | null (not yet confirmed this shift)
  final String? note;
  final String? checkedAt;
  final String? checkedByName;

  VehicleChecklistItem({
    required this.id,
    required this.name,
    required this.category,
    required this.itemType,
    required this.unit,
    this.status,
    this.note,
    this.checkedAt,
    this.checkedByName,
  });

  factory VehicleChecklistItem.fromJson(Map<String, dynamic> json) => VehicleChecklistItem(
    id: json['id'] as String,
    name: json['name'] as String? ?? '',
    category: json['category'] as String? ?? 'OTHER',
    itemType: json['itemType'] as String? ?? 'MEDICAL',
    unit: json['unit'] as String? ?? 'each',
    status: json['status'] as String?,
    note: json['note'] as String?,
    checkedAt: json['checkedAt'] as String?,
    checkedByName: json['checkedByName'] as String?,
  );
}

/// Ready for dispatch is a spot-check: at least one confirmed medical item
/// AND at least one confirmed vehicle item, not every item in the catalog -
/// see [medicalOk]/[vehicleOk]. [totalRequired]/[confirmed] are raw catalog
/// counts, kept for progress context only.
class VehicleChecklistSummary {
  final bool complete;
  final int totalRequired;
  final int confirmed;
  final bool medicalOk;
  final bool vehicleOk;

  VehicleChecklistSummary({
    required this.complete,
    required this.totalRequired,
    required this.confirmed,
    required this.medicalOk,
    required this.vehicleOk,
  });

  factory VehicleChecklistSummary.fromJson(Map<String, dynamic> json) => VehicleChecklistSummary(
    complete: json['complete'] as bool? ?? false,
    totalRequired: (json['totalRequired'] as num?)?.toInt() ?? 0,
    confirmed: (json['confirmed'] as num?)?.toInt() ?? 0,
    medicalOk: json['medicalOk'] as bool? ?? false,
    vehicleOk: json['vehicleOk'] as bool? ?? false,
  );
}

class VehicleChecklist {
  final String resetAt;
  final List<VehicleChecklistItem> items;
  final VehicleChecklistSummary summary;

  VehicleChecklist({required this.resetAt, required this.items, required this.summary});

  factory VehicleChecklist.fromJson(Map<String, dynamic> json) => VehicleChecklist(
    resetAt: json['resetAt'] as String? ?? '',
    items: (json['items'] as List<dynamic>? ?? [])
        .map((e) => VehicleChecklistItem.fromJson(e as Map<String, dynamic>))
        .toList(),
    summary: VehicleChecklistSummary.fromJson(json['summary'] as Map<String, dynamic>? ?? {}),
  );
}
