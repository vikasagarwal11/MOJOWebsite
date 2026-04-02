import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_stripe/flutter_stripe.dart';

import '../../../core/logging/app_logger.dart';
import '../../../core/providers/core_providers.dart';

final stripePaymentServiceProvider = Provider<StripePaymentService>((ref) {
  return StripePaymentService(ref.watch(firebaseFunctionsProvider));
});

class StripePaymentService {
  StripePaymentService(this._functions);

  final FirebaseFunctions _functions;

  /// Same callable as web: `createPaymentIntent` in `us-east1` ([functions/src/stripe.ts]).
  Future<Map<String, dynamic>?> _createPaymentIntent({
    required String eventId,
    required String userId,
    required List<String> attendeeIds,
  }) async {
    try {
      final callable = _functions.httpsCallable('createPaymentIntent');
      final response = await callable.call(<String, dynamic>{
        'eventId': eventId,
        'userId': userId,
        'attendeeIds': attendeeIds,
      });

      final data = response.data;
      if (data is! Map) return null;
      final map = Map<String, dynamic>.from(data);
      return {
        'clientSecret': map['clientSecret'],
        'transactionId': map['transactionId'],
        'amount': map['amount'],
        'currency': map['currency'],
      };
    } catch (e, stack) {
      appLogger.e('Stripe Cloud Function Failed', error: e, stackTrace: stack);
      return null;
    }
  }

  Future<bool> processEventRSVPPayment({
    required BuildContext context,
    required String eventId,
    required String userId,
    required List<String> attendeeIds,
    required String merchantDisplayName,
  }) async {
    try {
      final intentData = await _createPaymentIntent(
        eventId: eventId,
        userId: userId,
        attendeeIds: attendeeIds,
      );

      if (intentData == null || intentData['clientSecret'] == null) {
        throw Exception('Failed to retrieve payment session from Firebase.');
      }

      final clientSecret = intentData['clientSecret'] as String;

      await Stripe.instance.initPaymentSheet(
        paymentSheetParameters: SetupPaymentSheetParameters(
          paymentIntentClientSecret: clientSecret,
          merchantDisplayName: merchantDisplayName,
          style: ThemeMode.system,
          applePay: const PaymentSheetApplePay(merchantCountryCode: 'US'),
          googlePay: PaymentSheetGooglePay(
            merchantCountryCode: 'US',
            testEnv: kDebugMode,
          ),
        ),
      );

      await Stripe.instance.presentPaymentSheet();
      return true;
    } on StripeException catch (e) {
      appLogger.w('Stripe Payment Cancelled/Declined: ${e.error.localizedMessage}');
      return false;
    } catch (e, stack) {
      appLogger.e('Payment processing error', error: e, stackTrace: stack);
      return false;
    }
  }
}
