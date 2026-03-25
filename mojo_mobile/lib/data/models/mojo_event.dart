import 'package:cloud_firestore/cloud_firestore.dart';

class MojoEvent {
  MojoEvent({
    required this.id,
    required this.title,
    required this.startAt,
    this.endAt,
    this.description,
    this.imageUrl,
    this.venueName,
    this.venueAddress,
    this.location,
    this.visibility,
    this.status,
  });

  final String id;
  final String title;
  final DateTime startAt;
  final DateTime? endAt;
  final String? description;
  final String? imageUrl;
  final String? venueName;
  final String? venueAddress;
  final String? location;
  final String? visibility;
  final String? status;

  static DateTime _ts(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    return DateTime.fromMillisecondsSinceEpoch(0);
  }

  factory MojoEvent.fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data();
    return MojoEvent(
      id: doc.id,
      title: (d['title'] as String?)?.trim().isNotEmpty == true ? d['title'] as String : 'Event',
      startAt: _ts(d['startAt'] ?? d['date']),
      endAt: d['endAt'] != null ? _ts(d['endAt']) : null,
      description: d['description'] as String?,
      imageUrl: d['imageUrl'] as String?,
      venueName: d['venueName'] as String?,
      venueAddress: d['venueAddress'] as String?,
      location: d['location'] as String?,
      visibility: d['visibility'] as String?,
      status: d['status'] as String?,
    );
  }

  String get subtitleLine {
    final parts = <String>[];
    if (venueName?.isNotEmpty == true) {
      parts.add(venueName!);
    } else if (location?.isNotEmpty == true) {
      parts.add(location!);
    }
    return parts.join(' · ');
  }
}
