import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/logging/app_logger.dart';
import '../../../core/providers/core_providers.dart';
import '../models/guest_contact_info.dart';
import '../models/rsvp_enums.dart';

// ---------------------------------------------------------------------------
// Supporting data classes
// ---------------------------------------------------------------------------

/// Input for an additional attendee in the guest RSVP flow.
class GuestAttendeeInput {
  const GuestAttendeeInput({
    required this.name,
    required this.relationship,
    required this.ageGroup,
  });

  final String name;
  final Relationship relationship;
  final AgeGroup ageGroup;

  Map<String, dynamic> toMap() => {
        'name': name,
        'relationship': relationship.firestoreValue,
        'ageGroup': ageGroup.firestoreValue,
      };
}

/// Result of [GuestRsvpService.submitGuestRsvp].
class GuestRsvpResult {
  const GuestRsvpResult._({
    required this.success,
    this.memberExists = false,
    this.attendeeIds = const [],
    this.guestUserId,
    this.errorMessage,
  });

  /// Successful submission.
  factory GuestRsvpResult.ok({
    required List<String> attendeeIds,
    required String guestUserId,
  }) =>
      GuestRsvpResult._(
        success: true,
        attendeeIds: attendeeIds,
        guestUserId: guestUserId,
      );

  /// The phone number belongs to an existing member.
  factory GuestRsvpResult.memberExists() => const GuestRsvpResult._(
        success: false,
        memberExists: true,
      );

  /// Generic failure.
  factory GuestRsvpResult.error(String message) => GuestRsvpResult._(
        success: false,
        errorMessage: message,
      );

  final bool success;
  final bool memberExists;
  final List<String> attendeeIds;
  final String? guestUserId;
  final String? errorMessage;
}

// ---------------------------------------------------------------------------
// Riverpod provider (Task 5.2)
// ---------------------------------------------------------------------------

final guestRsvpServiceProvider = Provider<GuestRsvpService>((ref) {
  return GuestRsvpService(ref.watch(firebaseFunctionsProvider));
});

// ---------------------------------------------------------------------------
// Service (Task 5.1)
// ---------------------------------------------------------------------------

/// Wraps guest-specific Cloud Function calls for the truly-public RSVP flow.
class GuestRsvpService {
  GuestRsvpService(this._functions);

  final FirebaseFunctions _functions;

  /// Checks whether a phone number already belongs to an existing member flow.
  ///
  /// Returns `true` when the backend reports an existing account for this phone.
  Future<bool> isPhoneRegistered(String phoneNumber) async {
    try {
      final callable = _functions.httpsCallable('checkPhoneNumberExists');
      final response = await callable.call<dynamic>({
        'phoneNumber': phoneNumber,
      });
      final data = response.data;
      if (data is Map) {
        return data['exists'] == true;
      }
      return false;
    } catch (e, stack) {
      appLogger.e('checkPhoneNumberExists failed', error: e, stackTrace: stack);
      return false;
    }
  }

  /// Sends an OTP code to [phoneNumber] for the given [eventId].
  ///
  /// Returns a request ID / confirmation string from the Cloud Function.
  Future<String> sendOtp({
    required String phoneNumber,
    required String firstName,
    required String eventId,
  }) async {
    try {
      final callable = _functions.httpsCallable('sendGuestOTP');
      final response = await callable.call<dynamic>({
        'phone': phoneNumber,
        'firstName': firstName,
        'eventId': eventId,
      });

      final data = response.data;
      if (data is Map) {
        if (data['success'] == false) {
          final msg = (data['error'] ?? data['message'] ?? 'Failed to send OTP')
              .toString();
          throw Exception(msg);
        }
        return (data['requestId'] ?? data['message'] ?? '').toString();
      }
      return data?.toString() ?? '';
    } catch (e, stack) {
      appLogger.e('sendGuestOTP failed', error: e, stackTrace: stack);
      rethrow;
    }
  }

  /// Verifies the OTP [code] for [phoneNumber] / [eventId].
  ///
  /// Returns the session token used for subsequent guest API calls.
  Future<String> verifyOtp({
    required String phoneNumber,
    required String code,
    required String eventId,
    required String firstName,
    required String lastName,
    required String email,
  }) async {
    try {
      final callable = _functions.httpsCallable('verifyGuestOTP');
      final response = await callable.call<dynamic>({
        'phone': phoneNumber,
        'code': code,
        'contactInfo': {
          'firstName': firstName,
          'lastName': lastName,
          'email': email,
          'phone': phoneNumber,
        },
      });

      final data = response.data;
      if (data is Map) {
        if (data['verified'] == false) {
          final msg = (data['error'] ?? 'Invalid verification code').toString();
          throw Exception(msg);
        }
        final token = data['sessionToken'] ?? data['token'];
        if (token != null) return token.toString();
      }
      throw Exception('No session token returned from verifyGuestOTP');
    } catch (e, stack) {
      appLogger.e('verifyGuestOTP failed', error: e, stackTrace: stack);
      rethrow;
    }
  }

  /// Submits a guest RSVP via the `submitTrulyPublicGuestRsvp` Cloud Function.
  ///
  /// Returns a [GuestRsvpResult] indicating success, member-exists, or error.
  Future<GuestRsvpResult> submitGuestRsvp({
    required String eventId,
    required GuestContactInfo contact,
    required List<GuestAttendeeInput> additionalAttendees,
  }) async {
    try {
      final callable = _functions.httpsCallable('submitTrulyPublicGuestRsvp');
      final response = await callable.call<dynamic>({
        'eventId': eventId,
        'guest': {
          'firstName': contact.firstName,
          'lastName': contact.lastName,
          'email': contact.email,
          'phoneNumber': contact.phoneNumber,
        },
        'additionalAttendees':
            additionalAttendees.map((a) => a.toMap()).toList(),
      });

      final data = response.data;
      if (data is Map) {
        // Handle memberExists flag from the Cloud Function.
        if (data['memberExists'] == true) {
          return GuestRsvpResult.memberExists();
        }

        final attendeeIds = (data['attendeeIds'] as List<dynamic>?)
                ?.map((e) => e.toString())
                .toList() ??
            const [];
        final guestUserId = (data['guestUserId'] ?? '').toString();

        return GuestRsvpResult.ok(
          attendeeIds: attendeeIds,
          guestUserId: guestUserId,
        );
      }

      return GuestRsvpResult.error('Unexpected response from server');
    } on FirebaseFunctionsException catch (e) {
      appLogger.e('submitTrulyPublicGuestRsvp failed',
          error: e, stackTrace: StackTrace.current);
      if (e.message?.contains('memberExists') == true ||
          e.details?.toString().contains('memberExists') == true) {
        return GuestRsvpResult.memberExists();
      }
      return GuestRsvpResult.error(e.message ?? 'Failed to submit guest RSVP');
    } catch (e, stack) {
      appLogger.e('submitTrulyPublicGuestRsvp failed',
          error: e, stackTrace: stack);
      return GuestRsvpResult.error(e.toString());
    }
  }

  /// Creates a payment intent for a guest user (Stripe or Zelle).
  Future<Map<String, dynamic>> createGuestPaymentIntent({
    required String sessionToken,
    required String eventId,
    required String paymentMethod,
    required List<String> attendeeIds,
  }) async {
    try {
      final callable = _functions.httpsCallable('createGuestPaymentIntent');
      final response = await callable.call<dynamic>({
        'sessionToken': sessionToken,
        'eventId': eventId,
        'paymentMethod': paymentMethod,
        'attendeeIds': attendeeIds,
      });

      final data = response.data;
      if (data is Map) {
        return Map<String, dynamic>.from(data);
      }
      return <String, dynamic>{};
    } catch (e, stack) {
      appLogger.e('createGuestPaymentIntent failed',
          error: e, stackTrace: stack);
      rethrow;
    }
  }

  /// Deletes a guest attendee before payment using the guest session token.
  Future<void> deleteGuestAttendee({
    required String sessionToken,
    required String eventId,
    required String attendeeId,
  }) async {
    try {
      final callable = _functions.httpsCallable('deleteGuestAttendee');
      await callable.call<dynamic>({
        'sessionToken': sessionToken,
        'eventId': eventId,
        'attendeeId': attendeeId,
      });
    } catch (e, stack) {
      appLogger.e('deleteGuestAttendee failed', error: e, stackTrace: stack);
      rethrow;
    }
  }
}



