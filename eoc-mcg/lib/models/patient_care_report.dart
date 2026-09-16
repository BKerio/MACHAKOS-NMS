import 'dart:typed_data';

/// Mirrors the subset of frontend/src/types/api.ts's PatientCareReport
/// rendered on the operator app's History detail screen.
class PatientCareReport {
  final String id;
  final String taskId;
  final String note;
  final String mimeType;
  final int fileSize;
  final String createdAt;

  PatientCareReport({
    required this.id,
    required this.taskId,
    required this.note,
    required this.mimeType,
    required this.fileSize,
    required this.createdAt,
  });

  factory PatientCareReport.fromJson(Map<String, dynamic> json) => PatientCareReport(
    id: json['id'] as String,
    taskId: json['taskId'] as String? ?? '',
    note: json['note'] as String? ?? '',
    mimeType: json['mimeType'] as String? ?? '',
    fileSize: (json['fileSize'] as num?)?.toInt() ?? 0,
    createdAt: json['createdAt'] as String? ?? '',
  );

  bool get isImage => mimeType.startsWith('image/');
  bool get isPdf => mimeType == 'application/pdf';

  /// Mirrors fileTypeLabel() in frontend/src/pages/operator/HistoryPage.tsx.
  String get typeLabel {
    if (isImage) return 'Image';
    if (isPdf) return 'PDF';
    if (mimeType == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'DOCX';
    return 'File';
  }

  /// e.g. "45.5 KB" - mirrors Math.round((r.fileSize / 1024) * 10) / 10 in HistoryPage.tsx.
  String get sizeLabel => '${(fileSize / 1024 * 10).round() / 10} KB';
}

/// A downloaded PCR file's bytes + the content type the server sent them
/// with, returned by GET /tasks/:taskId/patient-care-reports/:reportId/file.
class PcrFile {
  final Uint8List bytes;
  final String mimeType;
  PcrFile({required this.bytes, required this.mimeType});
}
