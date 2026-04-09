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
    this.payThere = false,
    this.paymentMethod = 'stripe',
    this.currency = 'USD',
    this.ageGroupPricingCents = const <String, int>{},
    this.attendingCount = 0,
    this.maxAttendees = 0,
    this.waitlistEnabled = false,
    this.waitlistLimit,
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

  /// `pricing.payThere` means payment is handled offline/by organizer.
  final bool payThere;

  /// `pricing.paymentMethod` from web: `stripe` or `zelle`.
  final String paymentMethod;
  final String currency;

  /// Maps age group (e.g. `adult`, `0-2`, `3-5`, `6-10`, `11+`) to NET cents.
  final Map<String, int> ageGroupPricingCents;

  /// Denormalized headcount (web `attendingCount`).
  final int attendingCount;

  /// Maximum number of attendees allowed (0 = unlimited).
  final int maxAttendees;

  /// Whether the waitlist is enabled when event is full.
  final bool waitlistEnabled;

  /// Optional cap on waitlist size (null = unlimited waitlist).
  final int? waitlistLimit;

  bool get hasAnyPayableAmount =>
      (adultPriceCents > 0) || (eventSupportAmountCents > 0);

  /// Mirrors web: pay-there is offline/manual and should not open Stripe/Zelle flow.
  bool get isPayThere => payThere;

  bool get isZellePayment =>
      !isPayThere && paymentMethod.toLowerCase() == 'zelle';

  /// Web behavior: if payment exists and paymentMethod is not zelle => Stripe.
  bool get requiresStripeCheckout =>
      !isPayThere &&
      hasAnyPayableAmount &&
      (pricingRequiresPayment || eventSupportAmountCents > 0) &&
      !isZellePayment;

  bool get isPaidEvent =>
      !isPayThere &&
      (pricingRequiresPayment || eventSupportAmountCents > 0) &&
      hasAnyPayableAmount;

  bool get isEffectivelyFree => !isPaidEvent && !isPayThere;

  int priceForAgeGroupCents(String ageGroup) {
    final key = ageGroup.trim().toLowerCase();
    if (ageGroupPricingCents.containsKey(key)) {
      return ageGroupPricingCents[key] ?? adultPriceCents;
    }
    return adultPriceCents;
  }

  int estimateNetTotalCentsForAdults(int attendeeCount) {
    if (attendeeCount <= 0) return 0;
    final unitNet = adultPriceCents + eventSupportAmountCents;
    return unitNet * attendeeCount;
  }

  // Same formula as web `calculateChargeAmount` in `src/utils/stripePricing.ts`.
  int estimateStripeChargeCentsForAdults(int attendeeCount) {
    final netTotal = estimateNetTotalCentsForAdults(attendeeCount);
    if (netTotal <= 0) return 0;
    final charge = (netTotal + 30) / 0.971;
    return charge.round();
  }

  static DateTime _ts(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    return DateTime.fromMillisecondsSinceEpoch(0);
  }

  static Map<String, int> _parseAgeGroupPricing(dynamic raw) {
    if (raw is! List) return const <String, int>{};

    final map = <String, int>{};
    for (final item in raw) {
      if (item is! Map) continue;
      final source = Map<String, dynamic>.from(item);
      final ageGroup = (source['ageGroup'] as String?)?.trim().toLowerCase();
      if (ageGroup == null || ageGroup.isEmpty) continue;
      final priceRaw = source['price'];
      final cents =
          priceRaw is int ? priceRaw : (priceRaw is num ? priceRaw.toInt() : 0);
      map[ageGroup] = cents;
    }
    return map;
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
    final supportCents =
        support is int ? support : (support is num ? support.toInt() : 0);
    final methodRaw =
        (pricing['paymentMethod'] as String?)?.trim().toLowerCase();
    final method = (methodRaw == 'zelle') ? 'zelle' : 'stripe';

    return MojoEvent(
      id: doc.id,
      title: (d['title'] as String?)?.trim().isNotEmpty == true
          ? d['title'] as String
          : 'Event',
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
      payThere: pricing['payThere'] == true,
      paymentMethod: method,
      currency: (pricing['currency'] as String?)?.trim().isNotEmpty == true
          ? (pricing['currency'] as String).trim().toUpperCase()
          : 'USD',
      ageGroupPricingCents: _parseAgeGroupPricing(pricing['ageGroupPricing']),
      attendingCount: d['attendingCount'] is int
          ? d['attendingCount'] as int
          : ((d['attendingCount'] as num?)?.toInt() ?? 0),
      maxAttendees: d['maxAttendees'] is int
          ? d['maxAttendees'] as int
          : ((d['maxAttendees'] as num?)?.toInt() ?? 0),
      waitlistEnabled: d['waitlistEnabled'] == true,
      waitlistLimit: d['waitlistLimit'] is int
          ? d['waitlistLimit'] as int
          : (d['waitlistLimit'] is num
              ? (d['waitlistLimit'] as num).toInt()
              : null),
    );
  }

  String get subtitleLine {
    final parts = <String>[];
    if (venueName?.isNotEmpty == true) {
      parts.add(venueName!);
    } else if (location?.isNotEmpty == true) {
      parts.add(location!);
    }
    return parts.join(' � ');
  }
}
