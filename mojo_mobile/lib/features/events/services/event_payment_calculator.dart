import 'package:mojo_mobile/data/models/mojo_event.dart';

enum UserPaymentMode { free, payThere, zelle, stripe }

class EventAttendeePaymentInput {
  const EventAttendeePaymentInput({
    required this.id,
    required this.name,
    required this.ageGroup,
    required this.rsvpStatus,
    required this.paymentStatus,
  });

  final String id;
  final String name;
  final String ageGroup;
  final String rsvpStatus;
  final String paymentStatus;
}

class EventPaymentLine {
  const EventPaymentLine({
    required this.attendeeId,
    required this.attendeeName,
    required this.ageGroup,
    required this.ticketNetCents,
    required this.supportNetCents,
    required this.netSubtotalCents,
    required this.ticketChargeCents,
    required this.supportChargeCents,
    required this.chargeSubtotalCents,
  });

  final String attendeeId;
  final String attendeeName;
  final String ageGroup;
  final int ticketNetCents;
  final int supportNetCents;
  final int netSubtotalCents;
  final int ticketChargeCents;
  final int supportChargeCents;
  final int chargeSubtotalCents;
}

class EventPaymentSummary {
  const EventPaymentSummary({
    required this.mode,
    required this.currency,
    required this.payableAttendeeCount,
    required this.netTotalCents,
    required this.totalDueCents,
    required this.lines,
  });

  final UserPaymentMode mode;
  final String currency;
  final int payableAttendeeCount;
  final int netTotalCents;
  final int totalDueCents;
  final List<EventPaymentLine> lines;
}

class EventPaymentCalculator {
  static const double _stripeMultiplier = 0.971;
  static const int _stripeFixedFeeCents = 30;

  static UserPaymentMode modeForEvent(MojoEvent event) {
    if (event.isEffectivelyFree) return UserPaymentMode.free;
    if (event.isPayThere) return UserPaymentMode.payThere;
    if (event.isZellePayment) return UserPaymentMode.zelle;
    return UserPaymentMode.stripe;
  }

  static int calculateChargeAmount(int netTotalCents) {
    if (netTotalCents <= 0) return 0;
    return ((netTotalCents + _stripeFixedFeeCents) / _stripeMultiplier).round();
  }

  static int netTicketPriceForAgeGroup(MojoEvent event, String ageGroup) {
    if (!event.pricingRequiresPayment || event.isFree) return 0;
    return event.priceForAgeGroupCents(ageGroup);
  }

  static EventPaymentSummary calculateForAttendees({
    required MojoEvent event,
    required List<EventAttendeePaymentInput> attendees,
  }) {
    final mode = modeForEvent(event);

    final payables = attendees.where((a) {
      if (a.rsvpStatus != 'going') return false;
      final s = a.paymentStatus;
      if (s == 'paid') return false;
      if (s == 'waiting_for_approval') return false;
      if (s == 'not_required') return false;
      return true;
    }).toList(growable: false);

    if (payables.isEmpty || mode == UserPaymentMode.free) {
      return EventPaymentSummary(
        mode: mode,
        currency: event.currency,
        payableAttendeeCount: 0,
        netTotalCents: 0,
        totalDueCents: 0,
        lines: const <EventPaymentLine>[],
      );
    }

    final supportPerAttendee = event.eventSupportAmountCents > 0
        ? event.eventSupportAmountCents
        : 0;

    final netLines = payables.map((a) {
      final ticket = netTicketPriceForAgeGroup(event, a.ageGroup);
      final support = supportPerAttendee;
      final subtotal = ticket + support;
      return EventPaymentLine(
        attendeeId: a.id,
        attendeeName: a.name,
        ageGroup: a.ageGroup,
        ticketNetCents: ticket,
        supportNetCents: support,
        netSubtotalCents: subtotal,
        ticketChargeCents: ticket,
        supportChargeCents: support,
        chargeSubtotalCents: subtotal,
      );
    }).toList(growable: false);

    final netTotal =
        netLines.fold<int>(0, (sum, line) => sum + line.netSubtotalCents);

    if (mode == UserPaymentMode.zelle || mode == UserPaymentMode.payThere) {
      return EventPaymentSummary(
        mode: mode,
        currency: event.currency,
        payableAttendeeCount: payables.length,
        netTotalCents: netTotal,
        totalDueCents: netTotal,
        lines: netLines,
      );
    }

    // Stripe flow: calculate total charge once, distribute proportionally.
    final totalCharge = calculateChargeAmount(netTotal);

    final distributed = netLines.map((line) {
      final proportion = netTotal == 0 ? 0 : line.netSubtotalCents / netTotal;
      final attendeeCharge = (totalCharge * proportion).round();

      if (line.netSubtotalCents == 0) {
        return EventPaymentLine(
          attendeeId: line.attendeeId,
          attendeeName: line.attendeeName,
          ageGroup: line.ageGroup,
          ticketNetCents: line.ticketNetCents,
          supportNetCents: line.supportNetCents,
          netSubtotalCents: line.netSubtotalCents,
          ticketChargeCents: 0,
          supportChargeCents: 0,
          chargeSubtotalCents: 0,
        );
      }

      final ticketPart =
          (attendeeCharge * (line.ticketNetCents / line.netSubtotalCents))
              .round();
      final supportPart =
          (attendeeCharge * (line.supportNetCents / line.netSubtotalCents))
              .round();

      var ticketCharge = ticketPart;
      var supportCharge = supportPart;
      final splitDiff = attendeeCharge - (ticketCharge + supportCharge);
      if (splitDiff != 0) {
        if (ticketCharge >= supportCharge) {
          ticketCharge += splitDiff;
        } else {
          supportCharge += splitDiff;
        }
      }

      return EventPaymentLine(
        attendeeId: line.attendeeId,
        attendeeName: line.attendeeName,
        ageGroup: line.ageGroup,
        ticketNetCents: line.ticketNetCents,
        supportNetCents: line.supportNetCents,
        netSubtotalCents: line.netSubtotalCents,
        ticketChargeCents: ticketCharge,
        supportChargeCents: supportCharge,
        chargeSubtotalCents: attendeeCharge,
      );
    }).toList(growable: false);

    final distributedSum =
        distributed.fold<int>(0, (sum, line) => sum + line.chargeSubtotalCents);
    final finalDiff = totalCharge - distributedSum;

    List<EventPaymentLine> adjusted = distributed;
    if (finalDiff != 0 && distributed.isNotEmpty) {
      var largestIdx = 0;
      for (var i = 1; i < distributed.length; i++) {
        if (distributed[i].chargeSubtotalCents >
            distributed[largestIdx].chargeSubtotalCents) {
          largestIdx = i;
        }
      }

      final target = distributed[largestIdx];
      var ticket = target.ticketChargeCents;
      var support = target.supportChargeCents;
      if (ticket >= support) {
        ticket += finalDiff;
      } else {
        support += finalDiff;
      }

      final replacement = EventPaymentLine(
        attendeeId: target.attendeeId,
        attendeeName: target.attendeeName,
        ageGroup: target.ageGroup,
        ticketNetCents: target.ticketNetCents,
        supportNetCents: target.supportNetCents,
        netSubtotalCents: target.netSubtotalCents,
        ticketChargeCents: ticket,
        supportChargeCents: support,
        chargeSubtotalCents: target.chargeSubtotalCents + finalDiff,
      );

      adjusted = List<EventPaymentLine>.from(distributed);
      adjusted[largestIdx] = replacement;
    }

    final adjustedTotal =
        adjusted.fold<int>(0, (sum, line) => sum + line.chargeSubtotalCents);

    return EventPaymentSummary(
      mode: mode,
      currency: event.currency,
      payableAttendeeCount: payables.length,
      netTotalCents: netTotal,
      totalDueCents: adjustedTotal,
      lines: adjusted,
    );
  }

  static EventPaymentSummary previewForAdultCount({
    required MojoEvent event,
    required int attendeeCount,
    required String namePrefix,
  }) {
    final attendees = List<EventAttendeePaymentInput>.generate(
      attendeeCount,
      (i) => EventAttendeePaymentInput(
        id: 'preview_$i',
        name: i == 0 ? namePrefix : '$namePrefix (guest ${i + 1})',
        ageGroup: 'adult',
        rsvpStatus: 'going',
        paymentStatus: 'unpaid',
      ),
    );

    return calculateForAttendees(event: event, attendees: attendees);
  }
}

