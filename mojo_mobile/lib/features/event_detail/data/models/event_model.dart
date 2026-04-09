import '../../domain/entities/event_entity.dart';

class EventModel extends EventEntity {
  const EventModel({
    required super.id,
    required super.title,
    required super.organizerName,
    required super.imageUrl,
    required super.location,
    required super.description,
    required super.startAt,
    required super.endAt,
    required super.isConfirmed,
    required super.isPaymentRequired,
    required super.currency,
    required super.ticketAmount,
    required super.eventSupportAmount,
    required super.paymentMethod,
    required super.payThere,
    required super.isFree,
    super.adultPriceCents,
    super.eventSupportAmountCents,
    super.ageGroupPricingCents,
    super.maxAttendees,
    super.attendingCount,
    super.waitlistEnabled,
    super.zelleRecipientEmail,
    super.zelleRecipientPhone,
    super.visibility,
  });

  factory EventModel.fromMap(String id, Map<String, dynamic> map) {
    final pricing =
        (map['pricing'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
    final startAtRaw = map['startAt'] ?? map['date'];
    final endAtRaw = map['endAt'];

    DateTime parseDate(dynamic raw, DateTime fallback) {
      if (raw is DateTime) return raw;
      if (raw != null && raw.runtimeType.toString().contains('Timestamp')) {
        return (raw as dynamic).toDate() as DateTime;
      }
      return fallback;
    }

    final startAt = parseDate(startAtRaw, DateTime.now());
    final endAt = parseDate(endAtRaw, startAt.add(const Duration(hours: 2)));

    final ticketCents = pricing['adultPrice'] as num? ?? 0;
    final supportCents = pricing['eventSupportAmount'] as num? ?? 0;
    final payThere = pricing['payThere'] == true;
    final isFree = pricing['isFree'] == true;
    final methodRaw =
        (pricing['paymentMethod'] as String?)?.trim().toLowerCase();
    final method = methodRaw == 'zelle' ? 'zelle' : 'stripe';

    final hasPayable = ticketCents.toInt() > 0 || supportCents.toInt() > 0;
    final isPaymentRequired = !payThere && hasPayable;

    // Parse age group pricing from Firestore array of {ageGroup, price} objects
    final ageGroupPricingCents =
        _parseAgeGroupPricing(pricing['ageGroupPricing']);

    // Parse capacity fields from event doc
    final maxAttendees = (map['maxAttendees'] as num?)?.toInt() ?? 0;
    final attendingCount = (map['attendingCount'] as num?)?.toInt() ?? 0;
    final waitlistEnabled = map['waitlistEnabled'] == true;

    // Zelle recipient info
    final zelleRecipientEmail =
        (pricing['zelleRecipientEmail'] as String?) ?? '';
    final zelleRecipientPhone =
        (pricing['zelleRecipientPhone'] as String?) ?? '';

    // Event visibility
    final visibility = (map['visibility'] as String?) ?? 'public';

    return EventModel(
      id: id,
      title: (map['title'] as String?)?.trim().isNotEmpty == true
          ? (map['title'] as String).trim()
          : 'Untitled Event',
      organizerName:
          ((map['organizer'] as Map<String, dynamic>?)?['name'] as String?)
                  ?.trim() ??
              'MOJO Organizer',
      imageUrl: (map['featuredImageUrl'] as String?) ??
          (map['imageUrl'] as String?) ??
          '',
      location: _resolveLocation(map),
      description: (map['description'] as String?) ?? '',
      startAt: startAt,
      endAt: endAt,
      isConfirmed: (map['status'] as String?) != 'pending',
      isPaymentRequired: isPaymentRequired,
      currency: ((pricing['currency'] as String?) ?? 'USD').toUpperCase(),
      ticketAmount: ticketCents.toDouble() / 100,
      eventSupportAmount: supportCents.toDouble() / 100,
      paymentMethod: method,
      payThere: payThere,
      isFree: isFree,
      adultPriceCents: ticketCents.toInt(),
      eventSupportAmountCents: supportCents.toInt(),
      ageGroupPricingCents: ageGroupPricingCents,
      maxAttendees: maxAttendees,
      attendingCount: attendingCount,
      waitlistEnabled: waitlistEnabled,
      zelleRecipientEmail: zelleRecipientEmail,
      zelleRecipientPhone: zelleRecipientPhone,
      visibility: visibility,
    );
  }

  /// Resolves location from Firestore fields, matching web priority:
  /// venueName + venueAddress > location > subtitleLine > 'Location TBD'
  static String _resolveLocation(Map<String, dynamic> map) {
    final venueName = (map['venueName'] as String?)?.trim() ?? '';
    final venueAddress = (map['venueAddress'] as String?)?.trim() ?? '';
    final location = (map['location'] as String?)?.trim() ?? '';
    final subtitleLine = (map['subtitleLine'] as String?)?.trim() ?? '';

    if (venueName.isNotEmpty) {
      return venueAddress.isNotEmpty ? '$venueName, $venueAddress' : venueName;
    }
    if (location.isNotEmpty) return location;
    if (subtitleLine.isNotEmpty) return subtitleLine;
    return 'Location TBD';
  }

  /// Parses Firestore `ageGroupPricing` array of {ageGroup, price} objects.
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
}
