import 'package:equatable/equatable.dart';

enum RsvpStatus { going, notGoing, waitlisted }

enum PaymentStatus { pending, paid, unpaid, waitingForApproval }

class AttendeeEntity extends Equatable {
  const AttendeeEntity({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.ageGroup,
    required this.relationship,
    required this.rsvpStatus,
    required this.paymentStatus,
    required this.amountCents,
    required this.isGuest,
    this.attendeeType = 'guest',
    this.ticketCents = 0,
    this.supportCents = 0,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String ageGroup;
  final String relationship;
  final RsvpStatus rsvpStatus;
  final PaymentStatus paymentStatus;

  /// NET amount in cents (ticket + support, before Stripe fees).
  final int amountCents;
  final bool isGuest;
  final String attendeeType;

  /// NET ticket price in cents (before Stripe fees).
  final int ticketCents;

  /// NET event support in cents (before Stripe fees).
  final int supportCents;

  String get fullName => '$firstName $lastName'.trim();

  /// Display-friendly age group label.
  String get ageGroupLabel {
    switch (ageGroup) {
      case 'adult':
        return 'Adult';
      case '0-2':
        return '0–2 yrs';
      case '3-5':
        return '3–5 yrs';
      case '6-10':
        return '6–10 yrs';
      case '11+':
        return '11+ yrs';
      default:
        return ageGroup;
    }
  }

  /// Amount in dollars for display.
  double get amountDollars => amountCents / 100;

  @override
  List<Object?> get props => <Object?>[
        id,
        firstName,
        lastName,
        ageGroup,
        relationship,
        rsvpStatus,
        paymentStatus,
        amountCents,
        isGuest,
        attendeeType,
        ticketCents,
        supportCents,
      ];
}
