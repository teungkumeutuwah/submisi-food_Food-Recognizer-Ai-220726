import 'dart:io';
import 'package:flutter/material.dart';
import '../models/scanned_food.dart';

/// Interactive list of previously scanned foods.
/// Displays food thumbnails, confidence badges, dates, and lets users tap or delete.
class HistoryList extends StatelessWidget {
  final List<ScannedFood> items;
  final Function(ScannedFood item) onTapItem;
  final Function(ScannedFood item) onDeleteItem;

  const HistoryList({
    Key? key,
    required this.items,
    required this.onTapItem,
    required this.onDeleteItem,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Column(
          children: [
            Icon(
              Icons.history,
              color: Colors.grey[400],
              size: 44,
            ),
            const SizedBox(height: 12),
            const Text(
              "Belum Ada Riwayat Pemindaian",
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: Color(0xFF64748B),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              "Semua foto makanan yang Anda scan akan tersimpan rapi secara lokal di sini.",
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[400],
                height: 1.4,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: items.length,
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final item = items[index];
        final File imgFile = File(item.imagePath);
        final DateTime date = DateTime.fromMillisecondsSinceEpoch(item.timestamp);
        final String formattedDate = "${date.day}/${date.month}/${date.year} pukul ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}";

        return Dismissible(
          key: Key(item.id.toString()),
          direction: DismissDirection.endToStart,
          background: Container(
            alignment: Alignment.centerRight,
            padding: const EdgeInsets.only(right: 20),
            decoration: BoxDecoration(
              color: Colors.red[100],
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(Icons.delete, color: Colors.red[700]),
          ),
          onDismissed: (_) => onDeleteItem(item),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFE2E8F0)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.015),
                  blurRadius: 8,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () => onTapItem(item),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        // Food Thumbnail
                        ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: SizedBox(
                            width: 64,
                            height: 64,
                            child: imgFile.existsSync()
                                ? Image.file(imgFile, fit: BoxCoverFit.cover)
                                : Image.network(
                                    item.recipeThumb.isNotEmpty 
                                        ? item.recipeThumb 
                                        : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80',
                                    fit: BoxCoverFit.cover,
                                  ),
                          ),
                        ),
                        const SizedBox(width: 14),
                        // Text info
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Name
                              Text(
                                item.name,
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF1E293B),
                                ),
                              ),
                              const SizedBox(height: 4),
                              // Date
                              Text(
                                formattedDate,
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Colors.grey[500],
                                ),
                              ),
                              const SizedBox(height: 6),
                              // Confidence Badge and Halal status
                              Row(
                                children: [
                                  // Confidence Badge
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF10B981).withValues(alpha: 0.08),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      "Akurasi ${(item.confidence * 100).toStringAsFixed(0)}%",
                                      style: const TextStyle(
                                        fontSize: 9,
                                        fontWeight: FontWeight.w600,
                                        color: Color(0xFF10B981),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  // Halal status
                                  if (item.halalStatus != null) ...[
                                    _buildHalalTag(item.halalStatus!),
                                  ],
                                ],
                              ),
                            ],
                          ),
                        ),
                        // Right Arrow Icon
                        Icon(
                          Icons.chevron_right,
                          color: Colors.grey[400],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildHalalTag(String status) {
    Color bg;
    Color fg;
    String text = status;

    if (status.toLowerCase().contains("non")) {
      bg = const Color(0xFFEF4444).withValues(alpha: 0.08);
      fg = const Color(0xFFEF4444);
    } else if (status.toLowerCase().contains("syubhah")) {
      bg = const Color(0xFFF59E0B).withValues(alpha: 0.08);
      fg = const Color(0xFFF59E0B);
    } else {
      bg = const Color(0xFF10B981).withValues(alpha: 0.08);
      fg = const Color(0xFF10B981);
      text = "Halal";
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.w600,
          color: fg,
        ),
      ),
    );
  }
}

/// Custom BoxCoverFit just in case BoxFit is a bit different
class BoxCoverFit {
  static const cover = BoxFit.cover;
}
