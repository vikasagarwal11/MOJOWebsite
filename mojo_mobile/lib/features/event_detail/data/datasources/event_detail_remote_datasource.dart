import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../models/attendee_model.dart';
import '../models/event_model.dart';
import '../models/payment_model.dart';

abstract class EventDetailRemoteDataSource {
  Future<EventModel> getEventDetail(String eventId);
  Future<List<AttendeeModel>> getAttendees(String eventId);
  Future<PaymentModel> processPayment({
    required String eventId,
    required List<String> attendeeIds,
    required double amount,
  });
  Future<void> addAttendee({
    required String eventId,
    required String name,
    required String relationship,
    required String ageGroup,
  });
  Future<void> removeAttendee({
    required String eventId,
    required String attendeeId,
  });
  Future<bool> pollPaymentStatus(
    String eventId,
    List<String> attendeeIds, {
    int maxAttempts,
    Duration delay,
  });
}

class EventDetailRemoteDataSourceImpl implements EventDetailRemoteDataSource {
  EventDetailRemoteDataSourceImpl({
    required FirebaseFirestore firestore,
    required FirebaseFunctions functions,
  })  : _firestore = firestore,
        _functions = functions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  @override
  Future<EventModel> getEventDetail(String eventId) async {
    final snapshot = await _firestore.collection('events').doc(eventId).get();
    if (!snapshot.exists || snapshot.data() == null) {
      throw Exception('Event not found');
    }
    return EventModel.fromMap(snapshot.id, snapshot.data()!);
  }

  @override
  Future<List<AttendeeModel>> getAttendees(String eventId) async {
    final event = await getEventDetail(eventId);
    final uid = FirebaseAuth.instance.currentUser?.uid;

    final query = await _firestore
        .collection('events')
        .doc(eventId)
        .collection('attendees')
        .orderBy('createdAt', descending: true)
        .get();

    final docs = (uid == null || uid.isEmpty)
        ? query.docs
        : query.docs.where((doc) => (doc.data()['userId'] as String?) == uid);

    return docs
        .map((doc) => AttendeeModel.fromMap(
              doc.id,
              doc.data(),
              defaultAmount: event.totalAmount,
              eventAdultPriceCents: event.adultPriceCents,
              eventSupportAmountCents: event.eventSupportAmountCents,
              eventAgeGroupPricingCents: event.ageGroupPricingCents,
            ))
        .toList(growable: false);
  }

  @override
  Future<void> addAttendee({
    required String eventId,
    required String name,
    required String relationship,
    required String ageGroup,
  }) async {
    final userId = FirebaseAuth.instance.currentUser?.uid;
    if (userId == null || userId.isEmpty) {
      throw Exception('You must be signed in to add an attendee.');
    }

    // Determine attendeeType from relationship
    String attendeeType;
    if (relationship == 'self') {
      attendeeType = 'primary';
    } else if (relationship == 'spouse' || relationship == 'child') {
      attendeeType = 'family_member';
    } else {
      attendeeType = 'guest';
    }

    await _firestore
        .collection('events')
        .doc(eventId)
        .collection('attendees')
        .add(<String, dynamic>{
      'eventId': eventId,
      'userId': userId,
      'name': name.trim(),
      'relationship': relationship,
      'ageGroup': ageGroup,
      'attendeeType': attendeeType,
      'rsvpStatus': 'going',
      'paymentStatus': 'unpaid',
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  @override
  Future<void> removeAttendee({
    required String eventId,
    required String attendeeId,
  }) async {
    await _firestore
        .collection('events')
        .doc(eventId)
        .collection('attendees')
        .doc(attendeeId)
        .delete();
  }

  @override
  Future<PaymentModel> processPayment({
    required String eventId,
    required List<String> attendeeIds,
    required double amount,
  }) async {
    final event = await getEventDetail(eventId);

    // Web parity: pay-there and free events do not run online checkout.
    if (event.isPayThere || event.isEffectivelyFree) {
      return PaymentModel(
        transactionId: 'offline_or_free',
        amount: 0,
        currency: event.currency,
        success: true,
        processedAt: DateTime.now(),
        attendeeIds: attendeeIds,
      );
    }

    // Web parity: authenticated Zelle marks attendees as waiting_for_approval.
    if (event.isZellePayment) {
      final batch = _firestore.batch();
      final eventRef = _firestore.collection('events').doc(eventId);
      for (final attendeeId in attendeeIds) {
        final attendeeRef = eventRef.collection('attendees').doc(attendeeId);
        batch.update(attendeeRef, <String, dynamic>{
          'paymentStatus': 'waiting_for_approval',
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();

      return PaymentModel(
        transactionId: 'zelle_pending',
        amount: amount,
        currency: event.currency,
        success: true,
        processedAt: DateTime.now(),
        attendeeIds: attendeeIds,
      );
    }

    final userId = FirebaseAuth.instance.currentUser?.uid;
    if (userId == null || userId.isEmpty) {
      throw Exception('You must be signed in to process Stripe payment.');
    }

    // Step 1: Create payment intent via Cloud Function (same as web)
    final callable = _functions.httpsCallable('createPaymentIntent');
    final response = await callable.call(<String, dynamic>{
      'eventId': eventId,
      'userId': userId,
      'attendeeIds': attendeeIds,
    });

    final data = response.data;
    if (data is! Map) {
      throw Exception('Invalid payment response');
    }
    final map = Map<String, dynamic>.from(data);

    // Return the payment model with clientSecret — the BLoC will present
    // the Stripe Payment Sheet and handle the user interaction.
    return PaymentModel.fromMap(map, attendeeIds: attendeeIds);
  }

  /// Polls Firestore to check if the webhook has updated attendee payment
  /// status to 'paid'. Matches the web's `pollPaymentStatus` function.
  @override
  Future<bool> pollPaymentStatus(
    String eventId,
    List<String> attendeeIds, {
    int maxAttempts = 15,
    Duration delay = const Duration(milliseconds: 500),
  }) async {
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      final allPaid = await _checkAllPaid(eventId, attendeeIds);
      if (allPaid) return true;
      await Future.delayed(delay);
    }
    return false;
  }

  Future<bool> _checkAllPaid(String eventId, List<String> attendeeIds) async {
    for (final id in attendeeIds) {
      final doc = await _firestore
          .collection('events')
          .doc(eventId)
          .collection('attendees')
          .doc(id)
          .get();
      if (!doc.exists) return false;
      if (doc.data()?['paymentStatus'] != 'paid') return false;
    }
    return true;
  }
}


