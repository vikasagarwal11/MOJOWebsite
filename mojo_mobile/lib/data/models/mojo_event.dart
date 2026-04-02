import 'package:cloud_firestore/cloud_firestore.dart';

import '../../utils/event_image_url.dart';

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
    this.isFree = true,
    this.adultPriceCents = 0,
    this.pricingRequiresPayment = false,
    this.eventSupportAmountCents = 0,
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
  final bool isFree;
  final int adultPriceCents;
  /// From Firestore `pricing.requiresPayment` (Cloud Functions `createPaymentIntent` gate).
  final bool pricingRequiresPayment;
  /// Optional per-ticket support add-on in cents (`pricing.eventSupportAmount`).
  final int eventSupportAmountCents;

  /// Paid Stripe flow (matches `functions/src/stripe.ts` eligibility).
  bool get requiresStripeCheckout {
    if (isFree) return false;
    return pricingRequiresPayment || eventSupportAmountCents > 0 || adultPriceCents > 0;
  }

  static DateTime _ts(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    return DateTime.fromMillisecondsSinceEpoch(0);
  }

  factory MojoEvent.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data();
    if (d == null) {
      return MojoEvent(
        id: doc.id,
        title: 'Event',
        startAt: DateTime.fromMillisecondsSinceEpoch(0),
      );
    }
    final pricing = d['pricing'] as Map<String, dynamic>? ?? {};
    final support = pricing['eventSupportAmount'];
    final supportCents = support is int
        ? support
        : (support is num ? support.toInt() : 0);

    return MojoEvent(
      id: doc.id,
      title: (d['title'] as String?)?.trim().isNotEmpty == true ? d['title'] as String : 'Event',
      startAt: _ts(d['startAt'] ?? d['date']),
      endAt: d['endAt'] != null ? _ts(d['endAt']) : null,
      description: d['description'] as String?,
      imageUrl: pickEventImageUrl(d),
      venueName: d['venueName'] as String?,
      venueAddress: d['venueAddress'] as String?,
      location: d['location'] as String?,
      visibility: d['visibility'] as String?,
      status: d['status'] as String?,
      isFree: pricing['isFree'] as bool? ?? true,
      adultPriceCents: pricing['adultPrice'] is int
          ? pricing['adultPrice'] as int
          : ((pricing['adultPrice'] as num?)?.toInt() ?? 0),
      pricingRequiresPayment: pricing['requiresPayment'] == true,
      eventSupportAmountCents: supportCents,
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
