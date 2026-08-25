import 'package:flutter/material.dart';
import 'package:nccg/models/task.dart';
import 'package:nccg/services/nms_api.dart';
import 'package:nccg/screen/operator/operator_shell.dart';

/// Full paginated task history, mirroring frontend/src/pages/operator/HistoryPage.tsx.
/// Loads a page at a time as the user scrolls to the bottom.
class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  final List<TaskHistoryItem> _items = [];
  int _page = 1;
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;

  @override
  void initState() {
    super.initState();
    _loadFirstPage();
  }

  Future<void> _loadFirstPage() async {
    setState(() => _loading = true);
    try {
      final items = await NmsApi.getTaskHistory(page: 1, limit: 20);
      if (!mounted) return;
      setState(() {
        _items
          ..clear()
          ..addAll(items);
        _page = 1;
        _hasMore = items.length == 20;
      });
    } catch (_) {
      // Leave the list empty; the retry button handles this.
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    try {
      final items = await NmsApi.getTaskHistory(page: _page + 1, limit: 20);
      if (!mounted) return;
      setState(() {
        _items.addAll(items);
        _page += 1;
        _hasMore = items.length == 20;
      });
    } catch (_) {
      // Silent - user can scroll again to retry.
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(backgroundColor: kOpPrimary, title: const Text('History', style: TextStyle(color: Colors.white))),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: kOpPrimary))
          : _items.isEmpty
              ? const Center(child: Text('No completed tasks yet.', style: TextStyle(color: Colors.black54)))
              : NotificationListener<ScrollNotification>(
                  onNotification: (n) {
                    if (n.metrics.pixels >= n.metrics.maxScrollExtent - 200) _loadMore();
                    return false;
                  },
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: _items.length + (_hasMore ? 1 : 0),
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, i) {
                      if (i >= _items.length) {
                        return const Padding(
                          padding: EdgeInsets.symmetric(vertical: 16),
                          child: Center(child: CircularProgressIndicator(color: kOpPrimary, strokeWidth: 2)),
                        );
                      }
                      final item = _items[i];
                      return Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: const Color(0xFFE3E8E5)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text('${item.caseNumber} · ${item.registrationNumber}',
                                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                                ),
                                Text(TaskStatus.label(item.status),
                                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.black54)),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(item.chiefComplaint.isEmpty ? item.locationName : item.chiefComplaint,
                                style: const TextStyle(fontSize: 12, color: Colors.black54)),
                          ],
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
