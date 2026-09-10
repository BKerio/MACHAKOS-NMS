import 'dart:io';

import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:printing/printing.dart';
import 'package:nccg/method/api.dart';
import 'package:nccg/models/patient_care_report.dart';
import 'package:nccg/screen/operator/operator_shell.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/theme/tokens.dart';

/// Opens a previously uploaded PCR report. Mirrors what tapping "View" does
/// on frontend/src/pages/operator/HistoryPage.tsx (window.open on a blob
/// URL) - images and PDFs render in-app since there's no browser tab to hand
/// a blob to; anything else (DOCX, etc.) is saved to a temp file and handed
/// to the OS's default viewer for that file type.
class PcrViewerScreen extends StatefulWidget {
  final String taskId;
  final PatientCareReport report;
  const PcrViewerScreen({super.key, required this.taskId, required this.report});

  @override
  State<PcrViewerScreen> createState() => _PcrViewerScreenState();
}

class _PcrViewerScreenState extends State<PcrViewerScreen> {
  bool _loading = true;
  String? _error;
  PcrFile? _file;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final file = await NmsApi.getPatientCareReportFile(widget.taskId, widget.report.id);
      if (!mounted) return;
      if (widget.report.isImage || widget.report.isPdf) {
        setState(() => _file = file);
      } else {
        // No in-app viewer for this file type - save it and hand off to
        // whatever app the device has for it (Word, a file manager, etc.).
        await _openExternally(file);
        if (mounted) Navigator.of(context).pop();
        return;
      }
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openExternally(PcrFile file) async {
    final ext = _extensionFor(widget.report.mimeType);
    final dir = await Directory.systemTemp.createTemp('pcr-');
    final path = '${dir.path}/pcr-${widget.report.id}$ext';
    await File(path).writeAsBytes(file.bytes);
    final result = await OpenFilex.open(path);
    if (!mounted) return;
    if (result.type != ResultType.done) {
      API.showSnack(context, result.message.isNotEmpty ? result.message : 'No app found to open this file.', success: false);
    }
  }

  String _extensionFor(String mimeType) {
    switch (mimeType) {
      case 'application/pdf':
        return '.pdf';
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return '.docx';
      case 'image/png':
        return '.png';
      case 'image/jpeg':
        return '.jpg';
      default:
        return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: kOpPrimary,
        title: const Text('PCR Report', style: TextStyle(color: Colors.white)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Colors.white))
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white)),
                        const SizedBox(height: 16),
                        AppButton(label: 'Retry', onPressed: _load),
                      ],
                    ),
                  ),
                )
              : _file == null
                  ? const SizedBox.shrink()
                  : widget.report.isImage
                      ? InteractiveViewer(
                          minScale: 0.5,
                          maxScale: 4,
                          child: Center(child: Image.memory(_file!.bytes)),
                        )
                      : PdfPreview(
                          build: (format) => _file!.bytes,
                          canChangeOrientation: false,
                          canChangePageFormat: false,
                          allowSharing: true,
                          allowPrinting: true,
                        ),
    );
  }
}
