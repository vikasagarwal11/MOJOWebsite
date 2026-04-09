import '../../domain/entities/attendee_entity.dart';

class AttendeeModel extends AttendeeEntity {
  const AttendeeModel({
    required super.id,
    required super.firstName,
    required super.lastName,
    required super.ageGroup,
    required super.relationship,
    required super.rsvpStatus,
    required super.paymentStatus,
    required super.amountCents,
    required super.isGuest,
    super.attendeeType,
    super.ticketCents,
    super.supportCents,
  });

  /// Creates an [AttendeeModel] from a Firestore document map.
  ///
  /// [eventAdultPriceCents] and [eventSupportAmountCents] are used to
  /// calculate per-attendee pricing when the doc doesn't have a stored price.
  /// [eventAgeGroupPricingCents] maps age group strings to cents.
  factory AttendeeModel.fromMap(
    String id,
    Map<String, dynamic> map, {
    required double defaultAmount,
    int eventAdultPriceCents = 0,
    int eventSupportAmountCents = 0,
    Map<String, int> eventAgeGroupPricingCents = const <String, int>{},
  }) {
    RsvpStatus parseRsvp(String? value) {
      switch (value) {
        case 'going':
          return RsvpStatus.going;
        case 'not-going':
          return RsvpStatus.notGoing;
        case 'waitlisted':
          return RsvpStatus.waitlisted;
        default:
          return RsvpStatus.waitlisted;
      }
    }

    PaymentStatus parsePayment(String? value) {
      switch (value) {
        case 'paid':
          return PaymentStatus.paid;
        case 'pending':
          return PaymentStatus.pending;
        case 'waiting_for_approval':
          return PaymentStatus.waitingForApproval;
        default:
          return PaymentStatus.unpaid;
      }
    }

    final fullName = (map['name'] as String?)?.trim() ?? 'Guest';
    final split = fullName.split(RegExp(r'\s+'));

    // Read ageGroup from Firestore (string like 'adult', '0-2', '3-5', '6-10', '11+')
    final ageGroup =
        (map['ageGroup'] as String?)?.trim().toLowerCase() ?? 'adult';

    // Read relationship from Firestore (string like 'self', 'spouse', 'child', 'guest')
    final relationship =
        (map['relationship'] as String?)?.trim().toLowerCase() ?? 'guest';

    // Read attendeeType from Firestore ('primary', 'family_member', 'guest')
    final attendeeType =
        (map['attendeeType'] as String?)?.trim().toLowerCase() ?? 'guest';

    // Calculate per-attendee NET amount in cents based on age group pricing.
    // If the doc already has a `price` field (set by webhook), use that.
    // Otherwise compute from event pricing.
    int amountCents;
    int ticketCents;
    int supportCents;
    final storedPrice = map['price'];
    if (storedPrice is int) {
      amountCents = storedPrice;
      // When stored price exists, we don't have the breakdown — use full amount as ticket
      ticketCents = amountCents;
      supportCents = 0;
    } else if (storedPrice is num) {
      amountCents = storedPrice.toInt();
      ticketCents = amountCents;
      supportCents = 0;
    } else {
      // Compute from event pricing data (NET amounts)
      if (eventAgeGroupPricingCents.containsKey(ageGroup)) {
        ticketCents =
            eventAgeGroupPricingCents[ageGroup] ?? eventAdultPriceCents;
      } else {
        ticketCents = eventAdultPriceCents;
      }
      supportCents = eventSupportAmountCents;
      amountCents = ticketCents + supportCents;
    }

    return AttendeeModel(
      id: id,
      firstName: split.isNotEmpty ? split.first : 'Guest',
      lastName: split.length > 1 ? split.sublist(1).join(' ') : '',
      ageGroup: ageGroup,
      relationship: relationship,
      rsvpStatus: parseRsvp(map['rsvpStatus'] as String?),
      paymentStatus: parsePayment(map['paymentStatus'] as String?),
      amountCents: amountCents,
      isGuest: attendeeType == 'guest',
      attendeeType: attendeeType,
      ticketCents: ticketCents,
      supportCents: supportCents,
    );
  }
}
