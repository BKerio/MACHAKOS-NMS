import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:nccg/method/api.dart';
import 'package:nccg/screen/operator/history_screen.dart';
import 'package:nccg/screen/operator/operator_shell.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/theme/tokens.dart';

enum _FileKind { image, pdf, docx, unknown }

_FileKind _kindOfPath(String path) {
  final lower = path.toLowerCase();
  if (lower.endsWith('.pdf')) return _FileKind.pdf;
  if (lower.endsWith('.docx')) return _FileKind.docx;
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.heic')) {
    return _FileKind.image;
  }
  return _FileKind.unknown;
}

/// Upload (or explicitly skip) the Patient Care Report for a just-finished
/// task, mirroring frontend/src/pages/operator/PatientCareReportPage.tsx.
class PatientCareReportScreen extends StatefulWidget {
  final String taskId;
  final String caseNumber;
  const PatientCareReportScreen({super.key, required this.taskId, required this.caseNumber});

  @override
  State<PatientCareReportScreen> createState() => _PatientCareReportScreenState();
}

class _PatientCareReportScreenState extends State<PatientCareReportScreen> {
  final _noteController = TextEditingController();
  String? _filePath;
  bool _uploading = false;

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto() async {
    final shot = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 85);
    if (shot != null) setState(() => _filePath = shot.path);
  }

  Future<void> _pickImageFromGallery() async {
    final shot = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (shot != null) setState(() => _filePath = shot.path);
  }

  Future<void> _pickDocument() async {
    final file = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: ['pdf', 'docx']);
    if (file?.path != null) setState(() => _filePath = file!.path);
  }

  void _goToHistory() {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const HistoryScreen()),
      (route) => route.isFirst,
    );
  }

  Future<void> _skip() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Skip PCR upload?'),
        content: const Text(
          'You can upload later from History, but dispatch may require a report to close the case.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Continue')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Skip', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (confirmed == true) _goToHistory();
  }

  Future<void> _upload() async {
    final path = _filePath;
    if (path == null) {
      API.showSnack(context, 'Take a photo, choose an image, or pick a PDF/DOCX file.', success: false);
      return;
    }
    setState(() => _uploading = true);
    try {
      final note = _noteController.text.trim();
      await NmsApi.uploadPatientCareReport(widget.taskId, note: note.isEmpty ? null : note, filePath: path);
      if (!mounted) return;
      API.showSnack(context, 'PCR uploaded. Case saved to History.');
      _goToHistory();
    } catch (e) {
      if (mounted) API.showSnack(context, errorMessage(e), success: false);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final kind = _filePath != null ? _kindOfPath(_filePath!) : null;
    final title = widget.caseNumber.isNotEmpty ? 'PCR · ${widget.caseNumber}' : 'Patient Care Report';

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(backgroundColor: kOpPrimary, title: Text(title, style: const TextStyle(color: Colors.white))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Upload image or document + note',
            style: TextStyle(fontSize: 13, color: AppColors.muted),
          ),
          const SizedBox(height: 16),

          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Report file', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink)),
                const SizedBox(height: 6),
                const Text(
                  'Upload a photo of the PCR, or attach a PDF or DOCX document.',
                  style: TextStyle(fontSize: 13, color: AppColors.muted),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: AppButton(
                        label: 'Take photo',
                        icon: Icons.camera_alt_outlined,
                        block: true,
                        onPressed: _uploading ? null : _pickPhoto,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: AppButton(
                        label: 'Image',
                        icon: Icons.image_outlined,
                        variant: AppButtonVariant.soft,
                        block: true,
                        onPressed: _uploading ? null : _pickImageFromGallery,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                AppButton(
                  label: 'Choose PDF or DOCX',
                  icon: Icons.upload_file_outlined,
                  variant: AppButtonVariant.soft,
                  block: true,
                  onPressed: _uploading ? null : _pickDocument,
                ),
                const SizedBox(height: 14),
                if (_filePath != null)
                  Stack(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(AppRadius.base),
                        child: kind == _FileKind.image
                            ? Image.file(File(_filePath!), height: 200, width: double.infinity, fit: BoxFit.cover)
                            : Container(
                                height: 150,
                                width: double.infinity,
                                color: AppColors.surface2,
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.description_outlined, size: 36, color: AppColors.green),
                                    const SizedBox(height: 8),
                                    Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 16),
                                      child: Text(
                                        _filePath!.split(Platform.pathSeparator).last,
                                        textAlign: TextAlign.center,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.ink),
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      kind == _FileKind.pdf ? 'PDF document' : kind == _FileKind.docx ? 'Word document' : 'Document',
                                      style: const TextStyle(fontSize: 11, color: AppColors.muted),
                                    ),
                                  ],
                                ),
                              ),
                      ),
                      Positioned(
                        top: 8,
                        right: 8,
                        child: GestureDetector(
                          onTap: _uploading ? null : () => setState(() => _filePath = null),
                          child: Container(
                            width: 30,
                            height: 30,
                            decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                            child: const Icon(Icons.close, size: 16, color: Colors.white),
                          ),
                        ),
                      ),
                    ],
                  )
                else
                  Container(
                    height: 130,
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: AppColors.surface2,
                      border: Border.all(color: AppColors.border, style: BorderStyle.solid),
                      borderRadius: BorderRadius.circular(AppRadius.base),
                    ),
                    child: const Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.upload_file_outlined, size: 28, color: AppColors.muted2),
                        SizedBox(height: 8),
                        Text('No file selected yet', style: TextStyle(fontSize: 13, color: AppColors.muted)),
                      ],
                    ),
                  ),
              ],
            ),
          ),

          const SizedBox(height: 14),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Note (optional)', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink)),
                const SizedBox(height: 6),
                const Text(
                  'Add any quick context for dispatch (handover details, complications, missing fields, etc.).',
                  style: TextStyle(fontSize: 13, color: AppColors.muted),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _noteController,
                  enabled: !_uploading,
                  minLines: 3,
                  maxLines: 5,
                  style: const TextStyle(fontSize: 14, color: AppColors.ink),
                  decoration: appInputDecoration(hintText: 'Write a short note…'),
                ),
              ],
            ),
          ),

          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: 'Skip for now',
                  variant: AppButtonVariant.ghost,
                  block: true,
                  onPressed: _uploading ? null : _skip,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: AppButton(
                  label: _uploading ? 'Uploading…' : 'Upload report',
                  icon: Icons.cloud_upload_outlined,
                  block: true,
                  busy: _uploading,
                  onPressed: _uploading ? null : _upload,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
