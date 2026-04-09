import 'package:equatable/equatable.dart';

enum RsvpTabType { rsvp, qrCode, guests }

class EventEntity extends Equatable {
  const EventEntity({
    required this.id,
    required this.title,
    required this.organizerName,
    required this.imageUrl,
    required this.location,
    required this.description,
    required this.startAt,
    required this.endAt,
    required this.isConfirmed,
    required this.isPaymentRequired,
    required this.currency,
    required this.ticketAmount,
    required this.eventSupportAmount,
    required this.paymentMethod,
    required this.payThere,
    required this.isFree,
    this.adultPriceCents = 0,
    this.eventSupportAmountCents = 0,
    this.ageGroupPricingCents = const <String, int>{},
    this.maxAttendees = 0,
    this.attendingCount = 0,
    this.waitlistEnabled = false,
    this.zelleRecipientEmail = '',
    this.zelleRecipientPhone = '',
    this.visibility = 'public',
  });

  final String id;
  final String title;
  final String organizerName;
  final String imageUrl;
  final String location;
  final String description;
  final DateTime startAt;
  final DateTime endAt;
  final bool isConfirmed;
  final bool isPaymentRequired;
  final String currency;

  /// Legacy field — ticket amount in dollars for backward compat.
  final double ticketAmount;

  /// Legacy field — event support in dollars for backward compat.
  final double eventSupportAmount;

  final String paymentMethod;
  final bool payThere;
  final bool isFree;

  /// Adult ticket price in cents.
  final int adultPriceCents;

  /// Event support amount in cents (per attendee).
  final int eventSupportAmountCents;

  /// Maps age group string to price in cents.
  final Map<String, int> ageGroupPricingCents;

  /// Maximum attendees (0 = unlimited).
  final int maxAttendees;

  /// Current attending count.
  final int attendingCount;

  /// Whether waitlist is enabled when full.
  final bool waitlistEnabled;

  /// Zelle recipient email for QR modal.
  final String zelleRecipientEmail;

  /// Zelle recipient phone for QR modal.
  final String zelleRecipientPhone;

  /// Event visibility: 'public', 'private', or 'truly_public'.
  final String visibility;

  /// Whether this event is truly public (guest RSVP without auth).
  bool get isTrulyPublic => visibility == 'truly_public';

  double get totalAmount => ticketAmount + eventSupportAmount;
  bool get isPayThere => payThere;
  bool get isZellePayment => !isPayThere && paymentMethod == 'zelle';
  bool get isPaidEvent =>
      !isPayThere &&
      isPaymentRequired &&
      (ticketAmount > 0 || eventSupportAmount > 0);
  bool get isEffectivelyFree => !isPaidEvent && !isPayThere;

  /// Whether the event is at capacity.
  bool get isFull => maxAttendees > 0 && attendingCount >= maxAttendees;

  /// Whether new RSVPs can be added.
  bool get canAddMore => maxAttendees == 0 || attendingCount < maxAttendees;

  /// Whether waitlist is available (full + waitlist enabled).
  bool get canWaitlist => isFull && waitlistEnabled;

  /// Returns the price in cents for a given age group, falling back to adult price.
  int priceForAgeGroupCents(String ageGroup) {
    final key = ageGroup.trim().toLowerCase();
    if (ageGroupPricingCents.containsKey(key)) {
      return ageGroupPricingCents[key] ?? adultPriceCents;
    }
    return adultPriceCents;
  }

  @override
  List<Object?> get props => <Object?>[
        id,
        title,
        organizerName,
        imageUrl,
        location,
        description,
        startAt,
        endAt,
        isConfirmed,
        isPaymentRequired,
        currency,
        ticketAmount,
        eventSupportAmount,
        paymentMethod,
        payThere,
        isFree,
        adultPriceCents,
        eventSupportAmountCents,
        ageGroupPricingCents,
        maxAttendees,
        attendingCount,
        waitlistEnabled,
        zelleRecipientEmail,
        zelleRecipientPhone,
        visibility,
      ];
}
