// Mirrors the Vehicle / PartnerAmbulance shapes in frontend/src/types/api.ts.

class CrewMemberRef {
  final String id;
  final String name;
  final String? phone;

  CrewMemberRef({required this.id, required this.name, this.phone});

  static CrewMemberRef? fromJson(Map<String, dynamic>? json) {
    if (json == null) return null;
    return CrewMemberRef(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      phone: json['phone'] as String?,
    );
  }
}

class Vehicle {
  final String id;
  final String registrationNumber;
  final String imei;
  final bool isActive;
  final String? status; // READY | BUSY | MAINTENANCE
  final double? lastLat;
  final double? lastLng;
  final String? lastLocationName;
  final String? checkInLocationName;
  final String? checkedInAt;

  /// Only present on nearby handover candidates (km from the releasing unit).
  final double? distanceKm;

  final CrewMemberRef? currentDriver;
  final CrewMemberRef? currentEmt;
  final CrewMemberRef? currentNurse;

  Vehicle({
    required this.id,
    required this.registrationNumber,
    required this.imei,
    required this.isActive,
    this.status,
    this.lastLat,
    this.lastLng,
    this.lastLocationName,
    this.checkInLocationName,
    this.checkedInAt,
    this.distanceKm,
    this.currentDriver,
    this.currentEmt,
    this.currentNurse,
  });

  factory Vehicle.fromJson(Map<String, dynamic> json) => Vehicle(
    id: json['id'] as String,
    registrationNumber: json['registrationNumber'] as String? ?? '',
    imei: json['imei'] as String? ?? '',
    isActive: json['isActive'] as bool? ?? true,
    status: json['status'] as String?,
    lastLat: (json['lastLat'] as num?)?.toDouble(),
    lastLng: (json['lastLng'] as num?)?.toDouble(),
    lastLocationName: json['lastLocationName'] as String?,
    checkInLocationName: json['checkInLocationName'] as String?,
    checkedInAt: json['checkedInAt'] as String?,
    distanceKm: (json['distanceKm'] as num?)?.toDouble(),
    currentDriver: CrewMemberRef.fromJson(json['currentDriver'] as Map<String, dynamic>?),
    currentEmt: CrewMemberRef.fromJson(json['currentEmt'] as Map<String, dynamic>?),
    currentNurse: CrewMemberRef.fromJson(json['currentNurse'] as Map<String, dynamic>?),
  );

  /// Returns the crew member occupying [role]'s slot on this vehicle.
  CrewMemberRef? occupantFor(String role) => switch (role) {
    'DRIVER' => currentDriver,
    'EMT' => currentEmt,
    'NURSE' => currentNurse,
    _ => null,
  };
}

class PartnerAmbulance {
  final String id;
  final String registrationNumber;
  final String? agencyName;
  final String? vehicleType;
  final String? contactName;
  final String? contactPhone;
  final String? baseLocation;
  final String? notes;
  final bool isActive;

  PartnerAmbulance({
    required this.id,
    required this.registrationNumber,
    this.agencyName,
    this.vehicleType,
    this.contactName,
    this.contactPhone,
    this.baseLocation,
    this.notes,
    required this.isActive,
  });

  factory PartnerAmbulance.fromJson(Map<String, dynamic> json) {
    final agency = json['agency'] as Map<String, dynamic>?;
    return PartnerAmbulance(
      id: json['id'] as String,
      registrationNumber: json['registrationNumber'] as String? ?? '',
      agencyName: agency?['name'] as String?,
      vehicleType: json['vehicleType'] as String?,
      contactName: json['contactName'] as String?,
      contactPhone: json['contactPhone'] as String?,
      baseLocation: json['baseLocation'] as String?,
      notes: json['notes'] as String?,
      isActive: json['isActive'] as bool? ?? true,
    );
  }
}
