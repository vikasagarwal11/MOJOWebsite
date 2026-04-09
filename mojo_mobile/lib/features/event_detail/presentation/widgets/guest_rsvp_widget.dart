import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../utils/phone_utils.dart';
import '../../../events/models/guest_contact_info.dart';
import '../../../events/models/rsvp_enums.dart';
import '../../../events/services/guest_rsvp_service.dart';
import '../../../events/widgets/otp_verification_modal.dart';
import '../../domain/entities/event_entity.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';
import 'package:mojo_mobile/core/widgets/app_notice.dart';

// ---------------------------------------------------------------------------
// Theme constants (dark card style)
// ---------------------------------------------------------------------------
const Color _cardBg = Color(0xFFF8F7F4);
const Color _panelBg = Color(0xFFFFFFFF);
const Color _cardBorder = Color(0xFFE7E4DD);
const Color _accent = Color(0xFFFF4D1C);
const Color _textPrimary = Color(0xFF1F2937);
const Color _textSecondary = Color(0xFF6B7280);
const Color _successGreen = Color(0xFF22C55E);
const Color _warningAmber = Color(0xFFFBBF24);
const Color _dangerRed = Color(0xFFEF4444);

// ---------------------------------------------------------------------------
// Dollar formatting
// ---------------------------------------------------------------------------
String _fmt(int cents) => '\$${(cents / 100).toStringAsFixed(2)}';

// ---------------------------------------------------------------------------
// Simple data holder for fetched attendees from Firestore
// ---------------------------------------------------------------------------
class _ExistingAttendee {
  const _ExistingAttendee({
    required this.id,
    required this.name,
    required this.ageGroup,
    required this.paymentStatus,
    required this.amountCents,
  });

  final String id;
  final String name;
  final String ageGroup;
  final String paymentStatus;
  final int amountCents;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------
enum _Step {
  contactForm,
  otpVerified,
  existingAttendees,
  newRsvpForm,
  submitted,
  paymentComplete,
  memberExists,
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

/// Guest RSVP widget for truly-public events.
///
/// Shown when the event is `truly_public` and the user is not authenticated.
/// Flow: contact form → OTP → (existing attendees | new RSVP form) → payment.
class GuestRsvpWidget extends StatefulWidget {
  const GuestRsvpWidget({super.key, required this.event});

  final EventEntity event;

  @override
  State<GuestRsvpWidget> createState() => _GuestRsvpWidgetState();
}

class _GuestRsvpWidgetState extends State<GuestRsvpWidget> {
  late final GuestRsvpService _guestService;

  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();

  _Step _step = _Step.contactForm;
  String? _sessionToken;
  bool _isSubmitting = false;
  String? _errorMessage;
  int _paidAmountCents = 0;
  List<String> _submittedAttendeeIds = const <String>[];
  bool _showAddForm = false; // inline add form toggle
  int _rowIdCounter = 0;
  final Set<String> _removingRowIds = <String>{};
  final Set<String> _deletingSubmittedAttendeeIds = <String>{};

  /// Existing attendees fetched from Firestore after OTP verification.
  List<_ExistingAttendee> _existingAttendees = const [];

  /// Additional attendee rows for new RSVP form.
  final List<_AttendeeRow> _attendeeRows = [];

  @override
  void initState() {
    super.initState();
    _guestService = GuestRsvpService(
      FirebaseFunctions.instanceFor(region: 'us-east1'),
    );
  }

  @override
  void dispose() {
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _emailCtrl.dispose();
    _phoneCtrl.dispose();
    for (final row in _attendeeRows) {
      row.nameCtrl.dispose();
    }
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  String? _validateContactForm() {
    if (_firstNameCtrl.text.trim().isEmpty) return 'First name is required';
    if (_lastNameCtrl.text.trim().isEmpty) return 'Last name is required';
    final email = _emailCtrl.text.trim();
    if (email.isEmpty ||
        !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) {
      return 'Please enter a valid email address';
    }
    if (_phoneCtrl.text.trim().isEmpty) return 'Phone number is required';
    return null;
  }

  String? _normalizedPhoneOrNull() {
    return normalizeUSPhoneToE164OrNull(_phoneCtrl.text.trim());
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  Future<void> _onVerifyPhone() async {
    final error = _validateContactForm();
    if (error != null) {
      setState(() => _errorMessage = error);
      return;
    }
    setState(() => _errorMessage = null);

    final phone = _normalizedPhoneOrNull();
    if (phone == null) {
      setState(() => _errorMessage = 'Please enter a valid US phone number');
      return;
    }

    final alreadyMember = await _guestService.isPhoneRegistered(phone);
    if (!mounted) return;
    if (alreadyMember) {
      setState(() => _step = _Step.memberExists);
      return;
    }

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => OtpVerificationModal(
        phoneNumber: phone,
        firstName: _firstNameCtrl.text.trim(),
        lastName: _lastNameCtrl.text.trim(),
        email: _emailCtrl.text.trim(),
        eventId: widget.event.id,
        onVerified: (token) {
          Navigator.of(context).pop();
          _onOtpVerified(token);
        },
        onCancel: () => Navigator.of(context).pop(),
        onMemberExists: () {
          Navigator.of(context).pop();
          setState(() => _step = _Step.memberExists);
        },
      ),
    );
  }

  /// Called after OTP is verified. Checks Firestore for existing attendees.
  Future<void> _onOtpVerified(String token) async {
    setState(() {
      _sessionToken = token;
      _step = _Step.otpVerified;
      _errorMessage = null;
    });

    try {
      final existing = await _fetchExistingAttendees();
      if (!mounted) return;

      if (existing.isNotEmpty) {
        setState(() {
          _existingAttendees = existing;
          _submittedAttendeeIds = existing.map((a) => a.id).toList();
          _step = _Step.existingAttendees;
        });
      } else {
        setState(() => _step = _Step.newRsvpForm);
      }
    } catch (e) {
      debugPrint('⚠️ [GuestRSVP] Failed to fetch existing attendees: $e');
      if (mounted) {
        setState(() => _step = _Step.newRsvpForm);
      }
    }
  }

  /// Queries Firestore for existing attendees matching this guest.
  Future<List<_ExistingAttendee>> _fetchExistingAttendees() async {
    final phone = _normalizedPhoneOrNull();
    if (phone == null) return [];

    final phoneDigits = phone.replaceAll(RegExp(r'[^\d]'), '');
    final guestUserId = 'guest_${widget.event.id}_$phoneDigits';
    final eventId = widget.event.id;

    debugPrint(
        '[GuestRSVP] Fetching attendees for guestUserId=$guestUserId');

    final attendeesRef = FirebaseFirestore.instance
        .collection('events')
        .doc(eventId)
        .collection('attendees');

    var snapshot = await attendeesRef
        .where('userId', isEqualTo: guestUserId)
        .where('rsvpStatus', isEqualTo: 'going')
        .get(const GetOptions(source: Source.server));

    if (snapshot.docs.isEmpty) {
      snapshot = await attendeesRef
          .where('guestPhone', isEqualTo: phone)
          .where('rsvpStatus', isEqualTo: 'going')
          .get(const GetOptions(source: Source.server));
    }

    if (snapshot.docs.isEmpty) return [];

    final estimatedChargedByAttendeeId =
        _estimateChargedAmountsFromLocalAttendees(snapshot.docs);

    return snapshot.docs.map((doc) {
      final data = doc.data();
      final ageGroup = (data['ageGroup'] as String?) ?? 'adult';
      final ticketCents = widget.event.priceForAgeGroupCents(ageGroup);
      final supportCents = widget.event.eventSupportAmountCents;
      final netCents = ticketCents + supportCents;
      final paymentStatus = (data['paymentStatus'] as String?) ?? 'unpaid';

      final storedPrice = data['price'];
      final storedPriceCents = storedPrice is num ? storedPrice.toInt() : 0;

      final chargedFromDoc = (data['chargedAmount'] as num?)?.toInt() ??
          (data['chargedPrice'] as num?)?.toInt() ??
          (data['actualPaidAmount'] as num?)?.toInt() ??
          (data['finalAmount'] as num?)?.toInt() ??
          0;
      final estimatedCharged = estimatedChargedByAttendeeId[doc.id] ?? 0;
      final resolvedCharged = chargedFromDoc > 0 ? chargedFromDoc : estimatedCharged;

      final displayCents = switch (paymentStatus) {
        'paid' || 'waived' => resolvedCharged > 0
            ? resolvedCharged
            : (storedPriceCents > 0 ? storedPriceCents : netCents),
        _ => netCents,
      };

      return _ExistingAttendee(
        id: doc.id,
        name: (data['name'] as String?) ?? 'Guest',
        ageGroup: ageGroup,
        paymentStatus: paymentStatus,
        amountCents: displayCents,
      );
    }).toList();
  }

  Map<String, int> _estimateChargedAmountsFromLocalAttendees(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> attendeeDocs,
  ) {
    final isStripeEvent = !widget.event.isZellePayment && !widget.event.isPayThere;
    if (!isStripeEvent) return const <String, int>{};

    final byTx = <String, List<({String attendeeId, int netCents})>>{};

    for (final doc in attendeeDocs) {
      final data = doc.data();
      final paymentStatus = (data['paymentStatus'] as String?) ?? '';
      if (paymentStatus != 'paid' && paymentStatus != 'waived') continue;

      final txId = (data['paymentTransactionId'] as String?)?.trim() ?? '';
      if (txId.isEmpty) continue;

      final ageGroup = (data['ageGroup'] as String?) ?? 'adult';
      final ticketCents = widget.event.priceForAgeGroupCents(ageGroup);
      final supportCents = widget.event.eventSupportAmountCents;
      final netCents = ticketCents + supportCents;

      byTx.putIfAbsent(txId, () => <({String attendeeId, int netCents})>[])
          .add((attendeeId: doc.id, netCents: netCents));
    }

    if (byTx.isEmpty) return const <String, int>{};

    final result = <String, int>{};
    for (final rows in byTx.values) {
      if (rows.isEmpty) continue;

      final netTotal = rows.fold<int>(0, (sum, row) => sum + row.netCents);
      if (netTotal <= 0) continue;

      final totalCharge = ((netTotal + 30) / 0.971).round();

      var distributed = 0;
      for (var i = 0; i < rows.length; i++) {
        final row = rows[i];
        final share = i == rows.length - 1
            ? (totalCharge - distributed)
            : ((row.netCents * totalCharge) / netTotal).round();
        distributed += share;
        result[row.attendeeId] = share;
      }
    }

    return result;
  }


  _AttendeeRow _createAttendeeRow() {
    return _AttendeeRow(
      id: 'row_${_rowIdCounter++}',
      nameCtrl: TextEditingController(),
      relationship: Relationship.guest,
      ageGroup: AgeGroup.adult,
    );
  }

  void _addAttendeeRow() {
    setState(() {
      _attendeeRows.add(_createAttendeeRow());
    });
  }

  Future<void> _removeAttendeeRow(_AttendeeRow row) async {
    if (_removingRowIds.contains(row.id)) return;

    setState(() => _removingRowIds.add(row.id));
    await Future<void>.delayed(const Duration(milliseconds: 220));
    if (!mounted) return;

    setState(() {
      _removingRowIds.remove(row.id);
      final index = _attendeeRows.indexOf(row);
      if (index >= 0) {
        _attendeeRows[index].nameCtrl.dispose();
        _attendeeRows.removeAt(index);
      }
    });
  }

  Future<void> _submitRsvp() async {
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final contact = GuestContactInfo(
        firstName: _firstNameCtrl.text.trim(),
        lastName: _lastNameCtrl.text.trim(),
        email: _emailCtrl.text.trim().toLowerCase(),
        phoneNumber: _normalizedPhoneOrNull() ?? _phoneCtrl.text.trim(),
      );

      final additionalAttendees = _attendeeRows
          .where((r) => r.nameCtrl.text.trim().isNotEmpty)
          .map((r) => GuestAttendeeInput(
                name: r.nameCtrl.text.trim(),
                relationship: Relationship.guest,
                ageGroup: r.ageGroup,
              ))
          .toList();

      final result = await _guestService.submitGuestRsvp(
        eventId: widget.event.id,
        contact: contact,
        additionalAttendees: additionalAttendees,
      );

      if (!mounted) return;

      if (result.memberExists) {
        setState(() {
          _step = _Step.memberExists;
          _isSubmitting = false;
        });
        return;
      }

      if (result.success) {
        // After submit, fetch ALL attendees from Firestore (old + new)
        // and go to existingAttendees view which shows everything properly
        try {
          final fetched = await _fetchExistingAttendees();
          if (!mounted) return;
          setState(() {
            _existingAttendees = fetched;
            _submittedAttendeeIds = fetched.map((a) => a.id).toList();
            // Clear the form rows since they're now in Firestore
            for (final row in _attendeeRows) {
              row.nameCtrl.dispose();
            }
            _attendeeRows.clear();
            _step = _Step.existingAttendees;
            _isSubmitting = false;
          });
        } catch (_) {
          if (!mounted) return;
          setState(() {
            _submittedAttendeeIds = result.attendeeIds;
            _step = _Step.existingAttendees;
            _isSubmitting = false;
          });
        }
      } else {
        setState(() {
          _errorMessage = result.errorMessage ?? 'Failed to submit RSVP';
          _isSubmitting = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Something went wrong. Please try again.';
          _isSubmitting = false;
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Delete submitted attendee from Firestore before payment
  // ---------------------------------------------------------------------------

  Future<void> _deleteSubmittedAttendee(String attendeeId) async {
    if (_sessionToken == null) {
      setState(() {
        _errorMessage = 'Session expired. Please verify your phone again.';
      });
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: _cardBg,
        title: Text(
          'Remove Attendee?',
          style: GoogleFonts.syne(color: _textPrimary),
        ),
        content: Text(
          'This attendee will be removed from your RSVP before payment.',
          style: GoogleFonts.dmSans(color: _textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(
              'Cancel',
              style: GoogleFonts.dmSans(color: _textSecondary),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(
              'Remove',
              style: GoogleFonts.dmSans(color: _dangerRed),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
      _deletingSubmittedAttendeeIds.add(attendeeId);
    });

    await Future<void>.delayed(const Duration(milliseconds: 220));

    try {
      await _guestService.deleteGuestAttendee(
        sessionToken: _sessionToken!,
        eventId: widget.event.id,
        attendeeId: attendeeId,
      );

      final fetched = await _fetchExistingAttendees();
      if (!mounted) return;

      setState(() {
        _existingAttendees = fetched;
        _submittedAttendeeIds = fetched.map((a) => a.id).toList();
        _isSubmitting = false;
        _deletingSubmittedAttendeeIds.remove(attendeeId);
        if (fetched.isEmpty) {
          _step = _Step.newRsvpForm;
        }
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Failed to remove attendee. Please try again.';
          _isSubmitting = false;
          _deletingSubmittedAttendeeIds.remove(attendeeId);
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Payment handlers
  // ---------------------------------------------------------------------------

  Future<void> _handleGuestStripePayment() async {
    if (_sessionToken == null) {
      setState(() =>
          _errorMessage = 'Session expired. Please verify your phone again.');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final result = await _guestService.createGuestPaymentIntent(
        sessionToken: _sessionToken!,
        eventId: widget.event.id,
        paymentMethod: 'stripe',
        attendeeIds: _submittedAttendeeIds,
      );

      if (!mounted) return;

      final clientSecret = result['clientSecret'] as String?;
      if (clientSecret == null || clientSecret.isEmpty) {
        setState(() {
          _errorMessage = 'Failed to create payment session.';
          _isSubmitting = false;
        });
        return;
      }

      await Stripe.instance.initPaymentSheet(
        paymentSheetParameters: SetupPaymentSheetParameters(
          paymentIntentClientSecret: clientSecret,
          merchantDisplayName: 'Moms Fitness MOJO',
          style: ThemeMode.system,
          applePay: const PaymentSheetApplePay(merchantCountryCode: 'US'),
          googlePay: PaymentSheetGooglePay(
            merchantCountryCode: 'US',
            testEnv: kDebugMode,
          ),
        ),
      );

      await Stripe.instance.presentPaymentSheet();

      if (!mounted) return;
      // Refresh attendees to show updated payment status
      try {
        final fetched = await _fetchExistingAttendees();
        if (mounted) {
          setState(() {
            _existingAttendees = fetched;
            _submittedAttendeeIds = fetched.map((a) => a.id).toList();
            _isSubmitting = false;
            _step = _Step.existingAttendees;
          });
          AppNotice.success(context, 'Payment successful!');
        }
      } catch (_) {
        if (mounted) {
          setState(() {
            _isSubmitting = false;
            _step = _Step.paymentComplete;
          });
        }
      }
    } on StripeException catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage =
              e.error.localizedMessage ?? 'Payment was not completed.';
          _isSubmitting = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Payment failed. Please try again.';
          _isSubmitting = false;
        });
      }
    }
  }

  Future<void> _handleGuestZellePayment() async {
    if (_sessionToken == null) {
      setState(() =>
          _errorMessage = 'Session expired. Please verify your phone again.');
      return;
    }

    setState(() => _isSubmitting = true);
    try {
      await _guestService.createGuestPaymentIntent(
        sessionToken: _sessionToken!,
        eventId: widget.event.id,
        paymentMethod: 'zelle',
        attendeeIds: _submittedAttendeeIds,
      );

      if (!mounted) return;
      // Refresh attendees to show updated payment status (waiting_for_approval)
      try {
        final fetched = await _fetchExistingAttendees();
        if (mounted) {
          setState(() {
            _existingAttendees = fetched;
            _submittedAttendeeIds = fetched.map((a) => a.id).toList();
            _isSubmitting = false;
            _step = _Step.existingAttendees;
          });
          AppNotice.info(context, 'Zelle payment submitted. Waiting for approval.');
        }
      } catch (_) {
        if (mounted) {
          setState(() {
            _isSubmitting = false;
            _step = _Step.paymentComplete;
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Payment failed: $e';
          _isSubmitting = false;
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final stepContent = switch (_step) {
      _Step.contactForm => _buildContactForm(),
      _Step.otpVerified => _buildOtpVerifiedLoading(),
      _Step.existingAttendees => _buildExistingAttendees(),
      _Step.newRsvpForm => _buildNewRsvpForm(),
      _Step.submitted => _buildSubmittedPayment(),
      _Step.paymentComplete => _buildPaymentComplete(),
      _Step.memberExists => _buildMemberExistsWarning(),
    };

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Container(
        decoration: BoxDecoration(
          color: _cardBg,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: _cardBorder),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [_cardBg, Color(0xFFF2EFE8)],
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x14000000),
              blurRadius: 14,
              offset: Offset(0, 6),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildTopHeader(),
                const SizedBox(height: 14),
                if (_errorMessage != null) ...[
                  _buildBanner(
                    icon: Icons.error_outline_rounded,
                    text: _errorMessage!,
                    color: _dangerRed,
                  ),
                  const SizedBox(height: 12),
                ],
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 250),
                  switchInCurve: Curves.easeOutCubic,
                  switchOutCurve: Curves.easeInCubic,
                  child: KeyedSubtree(
                    key: ValueKey<_Step>(_step),
                    child: stepContent,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTopHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Guest RSVP',
          style: GoogleFonts.syne(
            color: _textPrimary,
            fontWeight: FontWeight.w700,
            fontSize: 20,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          _stepTitleText(),
          style: GoogleFonts.dmSans(
            color: _accent,
            fontWeight: FontWeight.w700,
            fontSize: 12,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          _stepHelpText(),
          style: GoogleFonts.dmSans(color: _textSecondary, fontSize: 12),
        ),
        const SizedBox(height: 10),
        const Divider(height: 1, color: _cardBorder),
      ],
    );
  }

  String _stepTitleText() {
    return switch (_step) {
      _Step.contactForm => 'Step 1 of 4: Contact',
      _Step.otpVerified => 'Step 2 of 4: Verification',
      _Step.newRsvpForm || _Step.existingAttendees => 'Step 3 of 4: Guests',
      _Step.submitted || _Step.paymentComplete => 'Step 4 of 4: Payment',
      _Step.memberExists => 'Member Account Found',
    };
  }

    String _stepHelpText() {
    return switch (_step) {
      _Step.contactForm => 'Enter details and verify your phone to continue.',
      _Step.otpVerified => 'Verifying your prior RSVP records.',
      _Step.existingAttendees => 'Review guests, add attendees, and pay if needed.',
      _Step.newRsvpForm => 'Add who is attending, then submit your RSVP.',
      _Step.submitted => 'Review the summary and complete payment.',
      _Step.paymentComplete => 'All done. Your RSVP is confirmed.',
      _Step.memberExists => 'This number belongs to an existing member account.',
    };
  }

  // ---------------------------------------------------------------------------
  // Step: Contact Form
  // ---------------------------------------------------------------------------

  Widget _buildContactForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildBanner(
          icon: Icons.info_outline_rounded,
          text: 'Use your own phone number. We send a one-time code for security.',
          color: _accent,
        ),
        const SizedBox(height: 14),
        Text(
          'Contact Details',
          style: GoogleFonts.syne(
            color: _textPrimary,
            fontWeight: FontWeight.w700,
            fontSize: 16,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Enter your details to RSVP for this event.',
          style: GoogleFonts.dmSans(color: _textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: _buildTextField(
                _firstNameCtrl,
                'First Name',
                icon: Icons.person_outline_rounded,
                autofillHints: const [AutofillHints.givenName],
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _buildTextField(
                _lastNameCtrl,
                'Last Name',
                icon: Icons.person_outline_rounded,
                autofillHints: const [AutofillHints.familyName],
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        _buildTextField(
          _emailCtrl,
          'Email',
          keyboardType: TextInputType.emailAddress,
          icon: Icons.alternate_email_rounded,
          autofillHints: const [AutofillHints.email],
        ),
        const SizedBox(height: 10),
        _buildTextField(
          _phoneCtrl,
          'Phone Number',
          keyboardType: TextInputType.phone,
          icon: Icons.phone_outlined,
          autofillHints: const [AutofillHints.telephoneNumber],
        ),
        const SizedBox(height: 16),
        _buildPrimaryButton(
          label: 'Verify Phone',
          icon: Icons.phone_android_rounded,
          onPressed: _isSubmitting ? null : _onVerifyPhone,
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Step: OTP Verified — loading spinner while checking Firestore
  // ---------------------------------------------------------------------------

  Widget _buildOtpVerifiedLoading() {
    return Column(
      children: [
        _buildBanner(
          icon: Icons.verified_rounded,
          text: 'Phone verified',
          color: _successGreen,
        ),
        const SizedBox(height: 20),
        const SizedBox(
          width: 28,
          height: 28,
          child: AppLoadingIndicator(
            strokeWidth: 2.5,
            color: _accent,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Checking for existing RSVP...',
          style: GoogleFonts.dmSans(color: _textSecondary, fontSize: 13),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Step: Existing Attendees — returning guest sees RSVP + payment status
  // ---------------------------------------------------------------------------

  Widget _buildExistingAttendees() {
    final event = widget.event;
    final isFreePay = event.isEffectivelyFree || event.isPayThere;

    final paidAttendees = _existingAttendees
        .where((a) => a.paymentStatus == 'paid' || a.paymentStatus == 'waived')
        .toList();
    final unpaidAttendees =
        _existingAttendees.where((a) => a.paymentStatus == 'unpaid').toList();
    final waitingAttendees = _existingAttendees
        .where((a) =>
            a.paymentStatus == 'waiting_for_approval' ||
            a.paymentStatus == 'waiting')
        .toList();

    final allPaid = unpaidAttendees.isEmpty && waitingAttendees.isEmpty;

    // Compute charge for unpaid attendees (Stripe fees baked in)
    final unpaidNetCents =
        unpaidAttendees.fold<int>(0, (sum, a) => sum + a.amountCents);
    final unpaidChargeCents =
        (event.isZellePayment || isFreePay || unpaidNetCents <= 0)
            ? unpaidNetCents
            : ((unpaidNetCents + 30) / 0.971).round();
    final unpaidChargeByAttendeeId =
        _distributeAmountByAttendee(unpaidAttendees, unpaidChargeCents);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildBanner(
          icon: Icons.verified_rounded,
          text: 'Phone verified',
          color: _successGreen,
        ),
        const SizedBox(height: 14),
        _buildContactSummary(),
        const SizedBox(height: 14),

        // Section header with Add button
        Row(
          children: [
            Expanded(
              child: Text(
                'Your RSVP',
                style: GoogleFonts.syne(
                  color: _textPrimary,
                  fontWeight: FontWeight.w600,
                  fontSize: 15,
                ),
              ),
            ),
            _buildSmallButton(
              label: _showAddForm ? 'Close' : 'Add Attendees',
              icon:
                  _showAddForm ? Icons.close_rounded : Icons.person_add_rounded,
              onPressed: () {
                setState(() {
                  _showAddForm = !_showAddForm;
                  if (_showAddForm && _attendeeRows.isEmpty) {
                    _attendeeRows.add(_createAttendeeRow());
                  }
                });
              },
            ),
          ],
        ),
        const SizedBox(height: 8),

        // Inline add form (shown when _showAddForm is true)
        if (_showAddForm) ...[
          _buildAttendeeComposerPanel(
            title: 'Add attendees',
            subtitle: 'Enter name and age group. Add one row per attendee.',
            showSaveButton: true,
            saveLabel: _isSubmitting ? 'Saving...' : 'Save Attendees',
            onSave: _isSubmitting
                ? null
                : () async {
                    await _submitRsvp();
                    if (mounted) {
                      setState(() => _showAddForm = false);
                    }
                  },
          ),
          const SizedBox(height: 12),
        ],

        // Paid attendees
        if (paidAttendees.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text(
              'Paid',
              style: GoogleFonts.dmSans(
                color: _successGreen,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
          ...paidAttendees.map((a) => _buildExistingAttendeeCard(a)),
        ],

        // Waiting attendees
        if (waitingAttendees.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 6, top: 8),
            child: Text(
              'Waiting for Approval',
              style: GoogleFonts.dmSans(
                color: _warningAmber,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
          ...waitingAttendees.map((a) => _buildExistingAttendeeCard(a)),
        ],

        // Unpaid attendees
        if (unpaidAttendees.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 6, top: 8),
            child: Text(
              'Unpaid',
              style: GoogleFonts.dmSans(
                color: _dangerRed,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
          ...unpaidAttendees.map(
            (a) => _buildExistingAttendeeCard(
              a,
              displayAmountCents: unpaidChargeByAttendeeId[a.id],
            ),
          ),
        ],

        const SizedBox(height: 12),

        // All paid banner
        if (allPaid && paidAttendees.isNotEmpty)
          _buildBanner(
            icon: Icons.celebration_rounded,
            text: 'All Paid! You\'re confirmed for this event.',
            color: _successGreen,
          ),

        if (isFreePay)
          _buildBanner(
            icon: Icons.celebration_rounded,
            text: event.isEffectivelyFree
                ? 'This is a free event. No payment required.'
                : 'Pay There event. Payment is handled offline.',
            color: _successGreen,
          ),

        // Unpaid — show payment section
        if (!isFreePay &&
            unpaidAttendees.isNotEmpty &&
            unpaidChargeCents > 0) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: _accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _accent.withValues(alpha: 0.3)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Amount Due',
                  style: GoogleFonts.dmSans(
                    color: _textPrimary,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
                Text(
                  _fmt(unpaidChargeCents),
                  style: GoogleFonts.dmSans(
                    color: _accent,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          if (event.isZellePayment)
            _buildPrimaryButton(
              label: 'Pay via Zelle',
              icon: Icons.account_balance_rounded,
              onPressed: _isSubmitting ? null : _handleGuestZellePayment,
            )
          else
            _buildPrimaryButton(
              label: 'Pay Now \u2022 ${_fmt(unpaidChargeCents)}',
              icon: Icons.payment_rounded,
              onPressed: _isSubmitting ? null : _handleGuestStripePayment,
            ),
        ],
      ],
    );
  }

  Map<String, int> _distributeAmountByAttendee(
    List<_ExistingAttendee> attendees,
    int totalCents,
  ) {
    if (attendees.isEmpty) return const <String, int>{};

    final netTotal = attendees.fold<int>(0, (sum, a) => sum + a.amountCents);
    if (netTotal <= 0 || totalCents <= 0) {
      return {
        for (final attendee in attendees) attendee.id: attendee.amountCents,
      };
    }

    final result = <String, int>{};
    var distributed = 0;

    for (var i = 0; i < attendees.length; i++) {
      final attendee = attendees[i];
      final share = i == attendees.length - 1
          ? (totalCents - distributed)
          : ((attendee.amountCents * totalCents) / netTotal).round();
      distributed += share;
      result[attendee.id] = share;
    }

    return result;
  }


  Widget _buildExistingAttendeeCard(
    _ExistingAttendee attendee, {
    int? displayAmountCents,
  }) {
    const ageGroupLabels = <String, String>{
      'adult': 'Adult',
      '0-2': '0-2 yrs',
      '3-5': '3-5 yrs',
      '6-10': '6-10 yrs',
      '11+': '11+ yrs',
    };
    final ageLabel = ageGroupLabels[attendee.ageGroup] ?? attendee.ageGroup;
    final shownAmountCents = displayAmountCents ?? attendee.amountCents;
    final isDeleting = _deletingSubmittedAttendeeIds.contains(attendee.id);

    final (badgeColor, badgeText) = switch (attendee.paymentStatus) {
      'paid' || 'waived' => (_successGreen, 'Paid'),
      'waiting' || 'waiting_for_approval' => (_warningAmber, 'Pending'),
      _ => (_dangerRed, 'Unpaid'),
    };

    return AnimatedOpacity(
      duration: const Duration(milliseconds: 220),
      opacity: isDeleting ? 0 : 1,
      child: AnimatedSize(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeInOut,
        child: isDeleting
            ? const SizedBox.shrink()
            : Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _panelBg,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _cardBorder),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: badgeColor.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(Icons.person_rounded, color: badgeColor, size: 18),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            attendee.name,
                            style: GoogleFonts.dmSans(
                              color: _textPrimary,
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '$ageLabel - ${_fmt(shownAmountCents)}',
                            style: GoogleFonts.dmSans(
                              color: _textSecondary,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: badgeColor.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: badgeColor.withValues(alpha: 0.4)),
                      ),
                      child: Text(
                        badgeText,
                        style: GoogleFonts.dmSans(
                          color: badgeColor,
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                    ),
                    if (attendee.paymentStatus == 'unpaid') ...[
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: (_isSubmitting || isDeleting)
                            ? null
                            : () => _deleteSubmittedAttendee(attendee.id),
                        behavior: HitTestBehavior.opaque,
                        child: Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            color: _dangerRed.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Icon(
                            Icons.close_rounded,
                            color: _dangerRed,
                            size: 16,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Step: New RSVP Form — no existing attendees, add attendees + submit
  // ---------------------------------------------------------------------------

  Widget _buildNewRsvpForm() {
    final event = widget.event;
    final isFreePay = event.isEffectivelyFree || event.isPayThere;

    // Show existing paid/waiting attendees if any
    final paidExisting = _existingAttendees
        .where((a) => a.paymentStatus == 'paid' || a.paymentStatus == 'waived')
        .toList();
    final waitingExisting = _existingAttendees
        .where((a) =>
            a.paymentStatus == 'waiting_for_approval' ||
            a.paymentStatus == 'waiting')
        .toList();

    // Calculate price preview for new attendees being added
    final newRows =
        _attendeeRows.where((r) => r.nameCtrl.text.trim().isNotEmpty).toList();
    // Primary attendee (self) is always included as adult
    final newAgeGroups = <String>[
      'adult',
      ...newRows.map((r) => r.ageGroup.firestoreValue),
    ];
    final newCount = newAgeGroups.length;
    final newNetCents = newAgeGroups.fold<int>(
        0,
        (sum, ag) =>
            sum +
            event.priceForAgeGroupCents(ag) +
            event.eventSupportAmountCents);
    final newChargeCents =
        (event.isZellePayment || isFreePay || newNetCents <= 0)
            ? newNetCents
            : ((newNetCents + 30) / 0.971).round();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildBanner(
          icon: Icons.verified_rounded,
          text: 'Phone verified',
          color: _successGreen,
        ),
        const SizedBox(height: 14),
        _buildContactSummary(),

        // Show existing paid members if returning guest
        if (paidExisting.isNotEmpty) ...[
          const SizedBox(height: 14),
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text(
              'Already Paid',
              style: GoogleFonts.dmSans(
                color: _successGreen,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
          ...paidExisting.map(_buildExistingAttendeeCard),
        ],

        if (waitingExisting.isNotEmpty) ...[
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text(
              'Waiting for Approval',
              style: GoogleFonts.dmSans(
                color: _warningAmber,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
          ...waitingExisting.map(_buildExistingAttendeeCard),
        ],

        const SizedBox(height: 14),

        // New attendees section
        _buildAttendeeComposerPanel(
          title: 'Add attendees',
          subtitle: 'Add family members or guests joining this event.',
        ),

        // Price preview for new attendees
        if (!isFreePay && newChargeCents > 0) ...[
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: _panelBg,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: _cardBorder),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Estimated total ($newCount attendee${newCount > 1 ? 's' : ''})',
                  style:
                      GoogleFonts.dmSans(color: _textSecondary, fontSize: 13),
                ),
                Text(
                  _fmt(newChargeCents),
                  style: GoogleFonts.dmSans(
                    color: _accent,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
        ],

        const SizedBox(height: 16),
        _buildPrimaryButton(
          label: _isSubmitting ? 'Submitting...' : 'Submit RSVP',
          icon: Icons.check_circle_rounded,
          onPressed: _isSubmitting ? null : _submitRsvp,
        ),

        // Back button to return to existing attendees view
        if (_existingAttendees.isNotEmpty) ...[
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => setState(() => _step = _Step.existingAttendees),
            child: Text(
              'Back to my RSVP',
              style: GoogleFonts.dmSans(color: _accent, fontSize: 13),
            ),
          ),
        ],
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Step: Submitted — RSVP just submitted, show payment section
  // ---------------------------------------------------------------------------

  Widget _buildSubmittedPayment() {
    const ageGroupLabels = <String, String>{
      'adult': 'Adult',
      '0-2': '0-2 yrs',
      '3-5': '3-5 yrs',
      '6-10': '6-10 yrs',
      '11+': '11+ yrs',
    };
    String ageLabel(String ag) => ageGroupLabels[ag] ?? ag;

    final event = widget.event;
    final isFreePay = event.isEffectivelyFree || event.isPayThere;

    // Use Firestore data if available, otherwise fall back to local form data.
    final List<_AttendeeInfo> attendeeInfos;
    if (_existingAttendees.isNotEmpty) {
      attendeeInfos = _existingAttendees
          .where((a) => a.paymentStatus == 'unpaid')
          .map((a) => _AttendeeInfo(name: a.name, ageGroup: a.ageGroup))
          .toList();
    } else {
      final additionalRows = _attendeeRows
          .where((r) => r.nameCtrl.text.trim().isNotEmpty)
          .toList();
      attendeeInfos = <_AttendeeInfo>[
        _AttendeeInfo(
          name: '${_firstNameCtrl.text.trim()} ${_lastNameCtrl.text.trim()}',
          ageGroup: 'adult',
        ),
        ...additionalRows.map((r) => _AttendeeInfo(
              name: r.nameCtrl.text.trim(),
              ageGroup: r.ageGroup.firestoreValue,
            )),
      ];
    }
    final attendeeCount = attendeeInfos.length;

    // Per-attendee NET amounts.
    final perAttendeeNetCents = attendeeInfos
        .map((a) =>
            event.priceForAgeGroupCents(a.ageGroup) +
            event.eventSupportAmountCents)
        .toList();
    final totalNetCents = perAttendeeNetCents.fold<int>(0, (sum, c) => sum + c);

    // Total charge (Stripe absorbs fees into total; Zelle = net).
    final totalChargeCents =
        (event.isZellePayment || isFreePay || totalNetCents <= 0)
            ? totalNetCents
            : ((totalNetCents + 30) / 0.971).round();

    // Proportionally distribute total charge across attendees.
    final perAttendeeChargeCents = <int>[];
    if (totalNetCents > 0 && totalChargeCents > 0) {
      int distributed = 0;
      for (int i = 0; i < attendeeCount; i++) {
        if (i == attendeeCount - 1) {
          perAttendeeChargeCents.add(totalChargeCents - distributed);
        } else {
          final share =
              (perAttendeeNetCents[i] * totalChargeCents / totalNetCents)
                  .round();
          perAttendeeChargeCents.add(share);
          distributed += share;
        }
      }
    } else {
      perAttendeeChargeCents.addAll(List.filled(attendeeCount, 0));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildBanner(
          icon: Icons.check_circle_rounded,
          text: 'RSVP submitted successfully!',
          color: _successGreen,
        ),
        const SizedBox(height: 14),

        // Contact summary
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: _panelBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _cardBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${_firstNameCtrl.text.trim()} ${_lastNameCtrl.text.trim()}',
                style: GoogleFonts.dmSans(
                  color: _textPrimary,
                  fontWeight: FontWeight.w600,
                  fontSize: 15,
                ),
              ),
              Text(
                '$attendeeCount attendee${attendeeCount > 1 ? 's' : ''} registered',
                style: GoogleFonts.dmSans(color: _textSecondary, fontSize: 12),
              ),
            ],
          ),
        ),

        // Payment section — only for paid events
        if (!isFreePay && totalChargeCents > 0) ...[
          const SizedBox(height: 14),
          Text(
            'Payment',
            style: GoogleFonts.syne(
              color: _textPrimary,
              fontWeight: FontWeight.w600,
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 8),

          // Per-attendee cards
          ...List.generate(attendeeCount, (i) {
            final info = attendeeInfos[i];
            final ticketCents = event.priceForAgeGroupCents(info.ageGroup);
            final supportCents = event.eventSupportAmountCents;
            final chargeCents = perAttendeeChargeCents[i];
            final canDelete = !_isSubmitting;
            final attendeeId = i < _submittedAttendeeIds.length
                ? _submittedAttendeeIds[i]
                : null;

            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: _panelBg,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _cardBorder),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          info.name,
                          style: GoogleFonts.dmSans(
                            color: _textPrimary,
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Text(
                        _fmt(chargeCents),
                        style: GoogleFonts.dmSans(
                          color: _accent,
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                      ),
                      if (canDelete && attendeeId != null) ...[
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: () => _deleteSubmittedAttendee(attendeeId),
                          behavior: HitTestBehavior.opaque,
                          child: Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: _dangerRed
                                  .withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Icon(Icons.close_rounded,
                                color: _dangerRed, size: 16),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    ageLabel(info.ageGroup),
                    style:
                        GoogleFonts.dmSans(color: _textSecondary, fontSize: 12),
                  ),
                  const SizedBox(height: 6),
                  if (ticketCents > 0)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Ticket',
                              style: GoogleFonts.dmSans(
                                  color: _textSecondary, fontSize: 12)),
                          Text(_fmt(ticketCents),
                              style: GoogleFonts.dmSans(
                                  color: _textSecondary, fontSize: 12)),
                        ],
                      ),
                    ),
                  if (supportCents > 0)
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Support',
                            style: GoogleFonts.dmSans(
                                color: _textSecondary, fontSize: 12)),
                        Text(_fmt(supportCents),
                            style: GoogleFonts.dmSans(
                                color: _textSecondary, fontSize: 12)),
                      ],
                    ),
                ],
              ),
            );
          }),

          const SizedBox(height: 4),

          // Total amount due
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: _accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _accent.withValues(alpha: 0.3)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Amount Due',
                  style: GoogleFonts.dmSans(
                    color: _textPrimary,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
                Text(
                  _fmt(totalChargeCents),
                  style: GoogleFonts.dmSans(
                    color: _accent,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Pay button
          if (event.isZellePayment)
            _buildPrimaryButton(
              label: 'Pay via Zelle',
              icon: Icons.account_balance_rounded,
              onPressed: _isSubmitting ? null : _handleGuestZellePayment,
            )
          else
            _buildPrimaryButton(
              label: 'Pay Now \u2022 ${_fmt(totalChargeCents)}',
              icon: Icons.payment_rounded,
              onPressed: _isSubmitting ? null : _handleGuestStripePayment,
            ),
        ],

        if (isFreePay) ...[
          const SizedBox(height: 12),
          _buildBanner(
            icon: Icons.celebration_rounded,
            text: event.isEffectivelyFree
                ? 'This is a free event. No payment required.'
                : 'Pay There event. Payment is handled offline.',
            color: _successGreen,
          ),
        ],
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Step: Payment Complete
  // ---------------------------------------------------------------------------

  Widget _buildPaymentComplete() {
    final isZelle = widget.event.isZellePayment;
    final name =
        '${_firstNameCtrl.text.trim()} ${_lastNameCtrl.text.trim()}'.trim();

    return Column(
      children: [
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            color: _successGreen.withValues(alpha: 0.15),
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.check_circle_rounded,
              color: _successGreen, size: 40),
        ),
        const SizedBox(height: 16),
        Text(
          isZelle ? 'Payment Submitted' : 'Payment Successful!',
          textAlign: TextAlign.center,
          style: GoogleFonts.syne(
            color: _successGreen,
            fontWeight: FontWeight.w700,
            fontSize: 20,
          ),
        ),
        const SizedBox(height: 8),
        if (_paidAmountCents > 0)
          Text(
            _fmt(_paidAmountCents),
            textAlign: TextAlign.center,
            style: GoogleFonts.dmSans(
              color: _successGreen,
              fontWeight: FontWeight.w700,
              fontSize: 28,
            ),
          ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: _successGreen.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _successGreen.withValues(alpha: 0.3)),
          ),
          child: Column(
            children: [
              if (name.isNotEmpty)
                Text(
                  name,
                  style: GoogleFonts.dmSans(
                    color: _textPrimary,
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                  ),
                ),
              const SizedBox(height: 4),
              Text(
                isZelle
                    ? 'Your Zelle payment has been submitted. The organizer will verify and confirm your RSVP.'
                    : 'Your payment has been processed. You are confirmed for this event!',
                textAlign: TextAlign.center,
                style: GoogleFonts.dmSans(
                  color: _textSecondary,
                  fontSize: 13,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Step: Member Exists
  // ---------------------------------------------------------------------------

  Widget _buildMemberExistsWarning() {
    return Column(
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: _warningAmber.withValues(alpha: 0.15),
            shape: BoxShape.circle,
          ),
          child:
              const Icon(Icons.person_rounded, color: _warningAmber, size: 32),
        ),
        const SizedBox(height: 16),
        Text(
          'Already a Member',
          textAlign: TextAlign.center,
          style: GoogleFonts.syne(
            color: _textPrimary,
            fontWeight: FontWeight.w700,
            fontSize: 18,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'This phone number is already registered as a member. Please log in to RSVP and manage your events.',
          textAlign: TextAlign.center,
          style: GoogleFonts.dmSans(
              color: _textSecondary, fontSize: 13, height: 1.4),
        ),
        const SizedBox(height: 16),
        _buildPrimaryButton(
          label: 'Log In',
          icon: Icons.login_rounded,
          onPressed: () {
            try {
              Navigator.of(context)
                  .pushNamedAndRemoveUntil('/login', (_) => false);
            } catch (_) {
              Navigator.of(context).pushNamed('/login');
            }
          },
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: () => setState(() {
            _step = _Step.contactForm;
            _errorMessage = null;
          }),
          child: Text(
            'Use a different number',
            style: GoogleFonts.dmSans(color: _accent, fontSize: 13),
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Shared UI helpers
  // ---------------------------------------------------------------------------

  Widget _buildContactSummary() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _panelBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _cardBorder),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: _accent.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.person_rounded, size: 18, color: _accent),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${_firstNameCtrl.text.trim()} ${_lastNameCtrl.text.trim()}',
                  style: GoogleFonts.dmSans(
                    color: _textPrimary,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${_emailCtrl.text.trim()} - ${_phoneCtrl.text.trim()}',
                  style: GoogleFonts.dmSans(color: _textSecondary, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTextField(
    TextEditingController controller,
    String label, {
    TextInputType keyboardType = TextInputType.text,
    IconData? icon,
    Iterable<String>? autofillHints,
  }) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      autofillHints: autofillHints,
      textInputAction: TextInputAction.next,
      style: GoogleFonts.dmSans(color: _textPrimary, fontSize: 14),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: GoogleFonts.dmSans(color: _textSecondary, fontSize: 13),
        prefixIcon: icon == null
            ? null
            : Icon(icon, color: _textSecondary, size: 18),
        filled: true,
        fillColor: _panelBg,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: _cardBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: _accent, width: 1.5),
        ),
      ),
    );
  }

  Widget _buildPrimaryButton({
    required String label,
    required IconData icon,
    VoidCallback? onPressed,
  }) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon, size: 18),
        label: Text(label),
        style: ElevatedButton.styleFrom(
          elevation: onPressed == null ? 0 : 2,
          backgroundColor: _accent,
          foregroundColor: Colors.white,
          disabledBackgroundColor: _accent.withValues(alpha: 0.4),
          disabledForegroundColor: Colors.white54,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: GoogleFonts.dmSans(
            fontWeight: FontWeight.w700,
            fontSize: 14,
          ),
        ),
      ),
    );
  }

  Widget _buildSmallButton({
    required String label,
    required IconData icon,
    required VoidCallback onPressed,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: _accent.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: _accent.withValues(alpha: 0.3)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: _accent, size: 14),
              const SizedBox(width: 4),
              Text(
                label,
                style: GoogleFonts.dmSans(
                  color: _accent,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBanner({
    required IconData icon,
    required String text,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 1),
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Icon(icon, color: color, size: 14),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: GoogleFonts.dmSans(
                color: color,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }


  Widget _buildAttendeeComposerPanel({
    required String title,
    required String subtitle,
    bool showSaveButton = false,
    String saveLabel = 'Save Attendees',
    VoidCallback? onSave,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _panelBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: GoogleFonts.syne(
                        color: _textPrimary,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: GoogleFonts.dmSans(
                        color: _textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _buildSmallButton(
                label: 'Add',
                icon: Icons.add_rounded,
                onPressed: _addAttendeeRow,
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (_attendeeRows.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
              decoration: BoxDecoration(
                color: _cardBg,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: _cardBorder),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline_rounded, size: 16, color: _textSecondary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Tap Add to create the first attendee row.',
                      style: GoogleFonts.dmSans(
                        color: _textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            )
          else
            ..._attendeeRows.map((row) => _buildAttendeeRowCard(row)),
          if (showSaveButton) ...[
            const SizedBox(height: 10),
            _buildPrimaryButton(
              label: saveLabel,
              icon: Icons.check_circle_rounded,
              onPressed: onSave,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildAttendeeRowCard(_AttendeeRow row) {
    final isRemoving = _removingRowIds.contains(row.id);

    return AnimatedOpacity(
      key: ValueKey<String>('row_${row.id}'),
      duration: const Duration(milliseconds: 220),
      opacity: isRemoving ? 0 : 1,
      child: AnimatedSize(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeInOut,
        child: isRemoving
            ? const SizedBox.shrink()
            : Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: _panelBg,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _cardBorder),
                ),
                child: Row(
                  children: [
                    Expanded(
                      flex: 6,
                      child: TextField(
                        controller: row.nameCtrl,
                        style: GoogleFonts.dmSans(color: _textPrimary, fontSize: 13),
                        decoration: InputDecoration(
                          hintText: 'Name',
                          hintStyle: GoogleFonts.dmSans(
                            color: _textSecondary,
                            fontSize: 13,
                          ),
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 10,
                          ),
                          filled: true,
                          fillColor: _cardBg,
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(color: _cardBorder),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(color: _accent),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      flex: 4,
                      child: _buildDropdown<AgeGroup>(
                        value: row.ageGroup,
                        items: const {
                          AgeGroup.adult: 'Adult',
                          AgeGroup.age0to2: '0-2 yrs',
                          AgeGroup.age3to5: '3-5 yrs',
                          AgeGroup.age6to10: '6-10 yrs',
                          AgeGroup.age11plus: '11+ yrs',
                        },
                        onChanged: (v) {
                          if (v != null) setState(() => row.ageGroup = v);
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    GestureDetector(
                      onTap: isRemoving ? null : () => _removeAttendeeRow(row),
                      behavior: HitTestBehavior.opaque,
                      child: Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: _dangerRed.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(
                          Icons.close_rounded,
                          color: _dangerRed,
                          size: 16,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _buildDropdown<T>({
    required T value,
    required Map<T, String> items,
    required ValueChanged<T?> onChanged,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: _cardBg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: _cardBorder),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          isExpanded: true,
          dropdownColor: _cardBg,
          style: GoogleFonts.dmSans(color: _textPrimary, fontSize: 12),
          icon: const Icon(Icons.expand_more_rounded,
              color: _textSecondary, size: 18),
          items: items.entries
              .map((e) =>
                  DropdownMenuItem<T>(value: e.key, child: Text(e.value)))
              .toList(),
          onChanged: onChanged,
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Helper models
// ---------------------------------------------------------------------------

class _AttendeeRow {
  _AttendeeRow({
    required this.id,
    required this.nameCtrl,
    required this.relationship,
    required this.ageGroup,
  });

  final String id;
  final TextEditingController nameCtrl;
  Relationship relationship;
  AgeGroup ageGroup;
}

class _AttendeeInfo {
  const _AttendeeInfo({required this.name, required this.ageGroup});
  final String name;
  final String ageGroup;
}







