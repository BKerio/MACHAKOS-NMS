import 'package:nccg/models/vehicle.dart';
import 'package:nccg/theme/tokens.dart';

/// Mirrors the subset of backend/src TaskStatus + frontend/src/utils/taskStatus.ts
/// that the operator app needs to show and advance a crew's active task.
class TaskStatus {
  static const pending = 'PENDING';
  static const accepted = 'ACCEPTED';
  static const enRoute = 'EN_ROUTE';
  static const atScene = 'AT_SCENE';
  static const patientPicked = 'PATIENT_PICKED';
  static const atHospital = 'AT_HOSPITAL';
  static const completed = 'COMPLETED';
  static const cancelled = 'CANCELLED';
  static const handedOver = 'HANDED_OVER';

  static const Map<String, String> labels = {
    pending: 'Pending',
    accepted: 'Accepted',
    enRoute: 'En Route',
    atScene: 'At Scene',
    patientPicked: 'Patient Picked Up',
    atHospital: 'At Hospital',
    completed: 'Completed',
    cancelled: 'Cancelled',
    handedOver: 'Transferred',
  };

  /// Mirrors STATUS_PILL in frontend/src/utils/taskStatus.ts.
  static const Map<String, PillTone> pillTones = {
    pending: PillTone.amber,
    accepted: PillTone.blue,
    enRoute: PillTone.green,
    atScene: PillTone.gray,
    patientPicked: PillTone.amber,
    atHospital: PillTone.blue,
    completed: PillTone.green,
    cancelled: PillTone.red,
    handedOver: PillTone.gold,
  };

  static const Map<String, String> nextStatus = {
    pending: accepted,
    accepted: enRoute,
    enRoute: atScene,
    atScene: patientPicked,
    patientPicked: atHospital,
    atHospital: completed,
  };

  static const Map<String, String> actionLabels = {
    pending: 'Accept Assignment',
    accepted: 'Start En Route',
    enRoute: 'Arrived at Scene',
    atScene: 'Patient Picked Up',
    patientPicked: 'Arrived at the hospital',
    atHospital: 'Complete Task',
  };

  /// STATUS_ORDER - the happy-path progression used to place a task on the timeline.
  static const List<String> order = [
    pending,
    accepted,
    enRoute,
    atScene,
    patientPicked,
    atHospital,
    completed,
  ];

  static String label(String status) => labels[status] ?? status;
  static PillTone tone(String status) => pillTones[status] ?? PillTone.gray;
  static String? next(String status) => nextStatus[status];
  static String? actionLabel(String status) => actionLabels[status];
}

class Incident {
  final String id;
  final String caseNumber;
  final String chiefComplaint;
  final String locationName;
  final String? subCounty;
  final double? lat;
  final double? lng;
  final String? patientName;
  final String? patientAge;
  final String? patientGender;
  final bool massCasualty;

  Incident({
    required this.id,
    required this.caseNumber,
    required this.chiefComplaint,
    required this.locationName,
    this.subCounty,
    this.lat,
    this.lng,
    this.patientName,
    this.patientAge,
    this.patientGender,
    this.massCasualty = false,
  });

  factory Incident.fromJson(Map<String, dynamic> json) => Incident(
    id: json['id'] as String,
    caseNumber: json['caseNumber'] as String? ?? '',
    chiefComplaint: json['chiefComplaint'] as String? ?? '',
    locationName: json['locationName'] as String? ?? '',
    subCounty: json['subCounty'] as String?,
    lat: (json['lat'] as num?)?.toDouble(),
    lng: (json['lng'] as num?)?.toDouble(),
    patientName: json['patientName'] as String?,
    patientAge: json['patientAge'] as String?,
    patientGender: json['patientGender'] as String?,
    massCasualty: json['massCasualty'] as bool? ?? false,
  );
}

/// The per-stage timestamps shared by [CrewTask] and [TaskHistoryItem], which
/// the activity timeline reads to decide what is done vs still upcoming.
mixin TaskStageTimes {
  String? get receivedAt;
  String? get acceptedAt;
  String? get sceneArrivalAt;
  String? get patientPickAt;
  String? get facilityArrivalAt;
  String? get completedAt;
  String? get cancelledAt;
  String? get handedOverAt;
  String get status;
}

class CrewTask with TaskStageTimes {
  final String id;
  @override
  final String status;
  final String incidentId;
  final String vehicleId;
  final Incident incident;
  final Vehicle vehicle;

  @override
  final String? receivedAt;
  @override
  final String? acceptedAt;
  @override
  final String? sceneArrivalAt;
  @override
  final String? patientPickAt;
  @override
  final String? facilityArrivalAt;
  @override
  final String? completedAt;
  @override
  final String? cancelledAt;
  @override
  final String? handedOverAt;

  CrewTask({
    required this.id,
    required this.status,
    required this.incidentId,
    required this.vehicleId,
    required this.incident,
    required this.vehicle,
    this.receivedAt,
    this.acceptedAt,
    this.sceneArrivalAt,
    this.patientPickAt,
    this.facilityArrivalAt,
    this.completedAt,
    this.cancelledAt,
    this.handedOverAt,
  });

  factory CrewTask.fromJson(Map<String, dynamic> json) => CrewTask(
    id: json['id'] as String,
    status: json['status'] as String? ?? TaskStatus.pending,
    incidentId: json['incidentId'] as String,
    vehicleId: json['vehicleId'] as String,
    incident: Incident.fromJson(json['incident'] as Map<String, dynamic>),
    vehicle: Vehicle.fromJson(json['vehicle'] as Map<String, dynamic>),
    receivedAt: json['receivedAt'] as String?,
    acceptedAt: json['acceptedAt'] as String?,
    sceneArrivalAt: json['sceneArrivalAt'] as String?,
    patientPickAt: json['patientPickAt'] as String?,
    facilityArrivalAt: json['facilityArrivalAt'] as String?,
    completedAt: json['completedAt'] as String?,
    cancelledAt: json['cancelledAt'] as String?,
    handedOverAt: json['handedOverAt'] as String?,
  );
}

class TaskHistoryItem with TaskStageTimes {
  final String id;
  @override
  final String status;
  final String caseNumber;
  final String chiefComplaint;
  final String locationName;
  final String registrationNumber;

  @override
  final String? receivedAt;
  @override
  final String? acceptedAt;
  @override
  final String? sceneArrivalAt;
  @override
  final String? patientPickAt;
  @override
  final String? facilityArrivalAt;
  @override
  final String? completedAt;
  @override
  final String? cancelledAt;
  @override
  final String? handedOverAt;

  final String? cancelReason;
  final String? handoverReason;

  TaskHistoryItem({
    required this.id,
    required this.status,
    required this.caseNumber,
    required this.chiefComplaint,
    required this.locationName,
    required this.registrationNumber,
    this.receivedAt,
    this.acceptedAt,
    this.sceneArrivalAt,
    this.patientPickAt,
    this.facilityArrivalAt,
    this.completedAt,
    this.cancelledAt,
    this.handedOverAt,
    this.cancelReason,
    this.handoverReason,
  });

  factory TaskHistoryItem.fromJson(Map<String, dynamic> json) {
    final incident = json['incident'] as Map<String, dynamic>? ?? {};
    final vehicle = json['vehicle'] as Map<String, dynamic>? ?? {};
    return TaskHistoryItem(
      id: json['id'] as String,
      status: json['status'] as String? ?? '',
      caseNumber: incident['caseNumber'] as String? ?? '',
      chiefComplaint: incident['chiefComplaint'] as String? ?? '',
      locationName: incident['locationName'] as String? ?? '',
      registrationNumber: vehicle['registrationNumber'] as String? ?? '',
      receivedAt: json['receivedAt'] as String?,
      acceptedAt: json['acceptedAt'] as String?,
      sceneArrivalAt: json['sceneArrivalAt'] as String?,
      patientPickAt: json['patientPickAt'] as String?,
      facilityArrivalAt: json['facilityArrivalAt'] as String?,
      completedAt: json['completedAt'] as String?,
      cancelledAt: json['cancelledAt'] as String?,
      handedOverAt: json['handedOverAt'] as String?,
      cancelReason: json['cancelReason'] as String?,
      handoverReason: json['handoverReason'] as String?,
    );
  }
}

class AssignableCrewMember {
  final String id;
  final String name;
  final String? phone;
  final String role; // 'EMT' | 'NURSE'
  final String status; // 'AVAILABLE' | 'TAKEN'
  final String? assignedVehicleId;
  final String? assignedVehicleRegistration;

  AssignableCrewMember({
    required this.id,
    required this.name,
    this.phone,
    required this.role,
    required this.status,
    this.assignedVehicleId,
    this.assignedVehicleRegistration,
  });

  factory AssignableCrewMember.fromJson(Map<String, dynamic> json) => AssignableCrewMember(
    id: json['id'] as String,
    name: json['name'] as String? ?? '',
    phone: json['phone'] as String?,
    role: json['role'] as String? ?? '',
    status: json['status'] as String? ?? 'AVAILABLE',
    assignedVehicleId: json['assignedVehicleId'] as String?,
    assignedVehicleRegistration: json['assignedVehicleRegistration'] as String?,
  );
}
