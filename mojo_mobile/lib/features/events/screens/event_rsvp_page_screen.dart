import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../core/providers/core_providers.dart';
import '../../../core/theme/mojo_colors.dart';
import '../../../data/models/mojo_event.dart';
import '../models/attendee_row_data.dart';
import '../models/guest_contact_info.dart';
import '../models/rsvp_enums.dart';
import '../services/event_payment_calculator.dart';
import '../services/guest_rsvp_service.dart';
import '../services/stripe_payment_service.dart';
import '../state/rsvp_form_notifier.dart';
import '../widgets/attendee_form_widget.dart';
import '../widgets/collapsible_section.dart';
import '../widgets/event_whos_going_section.dart';
import '../widgets/otp_verification_modal.dart';
import '../widgets/payment_status_animation.dart';
import '../widgets/payment_summary_widget.dart';
import '../widgets/zelle_qr_modal.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';
import 'package:mojo_mobile/core/widgets/app_notice.dart';

class EventRsvpPageScreen extends ConsumerStatefulWidget {
  const EventRsvpPageScreen({super.key, required this.eventId});

  final String eventId;

  @override
  ConsumerState<EventRsvpPageScreen> createState() =>
      _EventRsvpPageScreenState();
}

class _EventRsvpPageScreenState extends ConsumerState<EventRsvpPageScreen> {
  bool _busy = false;
  bool _isPaymentProcessing = false;
  bool _initialized = false;

  // Payment status animation overlay
  bool _showPaymentAnimation = false;
  bool _paymentAnimationSuccess = false;
  String _paymentAnimationMessage = '';
  int? _paymentAnimationAmount;

  // Guest flow state
  final _guestFirstNameController = TextEditingController();
  final _guestLastNameController = TextEditingController();
  final _guestEmailController = TextEditingController();
  final _guestPhoneController = TextEditingController();
  bool _otpVerified = false;
  bool _guestSubmitting = false;
  bool _memberExistsError = false;

  @override
  void dispose() {
    _guestFirstNameController.dispose();
    _guestLastNameController.dispose();
    _guestEmailController.dispose();
    _guestPhoneController.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /// Build payment inputs from form rows for the calculator.
  List<EventAttendeePaymentInput> _paymentInputsFromRows(
    List<AttendeeRowData> rows,
  ) {
    return rows.map((r) {
      return EventAttendeePaymentInput(
        id: r.firestoreId ?? r.localId,
        name: r.name.isNotEmpty ? r.name : 'Attendee',
        ageGroup: r.ageGroup.firestoreValue,
        rsvpStatus: r.firestoreId != null ? 'going' : 'going',
        paymentStatus: r.paymentStatus,
      );
    }).toList(growable: false);
  }

  /// Categorize rows by payment status.
  List<AttendeeRowData> _unpaidRows(List<AttendeeRowData> rows) => rows
      .where((r) => r.paymentStatus == 'unpaid' && r.firestoreId != null)
      .toList();

  List<AttendeeRowData> _paidRows(List<AttendeeRowData> rows) =>
      rows.where((r) => r.paymentStatus == 'paid').toList();

  List<AttendeeRowData> _waitingRows(List<AttendeeRowData> rows) =>
      rows.where((r) => r.paymentStatus == 'waiting_for_approval').toList();

  void _showPaymentResult({
    required bool success,
    required String message,
    int? amountCents,
  }) {
    setState(() {
      _showPaymentAnimation = true;
      _paymentAnimationSuccess = success;
      _paymentAnimationMessage = message;
      _paymentAnimationAmount = amountCents;
    });
  }

  // ---------------------------------------------------------------------------
  // Payment flows (Task 8.2)
  // ---------------------------------------------------------------------------

  Future<void> _handlePayNow({
    required MojoEvent event,
    required EventPaymentSummary summary,
  }) async {
    final user = ref.read(authStateProvider).valueOrNull;
    if (user == null) return;

    final attendeeIds =
        summary.lines.map((l) => l.attendeeId).toList(growable: false);
    if (attendeeIds.isEmpty) {
      if (!mounted) return;
      AppNotice.info(context, 'No unpaid attendees to process.');
      return;
    }

    if (summary.mode == UserPaymentMode.zelle) {
      await _handleZellePayment(
          event: event, summary: summary, attendeeIds: attendeeIds);
      return;
    }

    setState(() => _isPaymentProcessing = true);

    try {
      final paymentService = ref.read(stripePaymentServiceProvider);
      final ok = await paymentService.processEventRSVPPayment(
        context: context,
        eventId: event.id,
        userId: user.uid,
        attendeeIds: attendeeIds,
        merchantDisplayName: 'Moms Fitness MOJO',
      );

      if (!mounted) return;
      if (ok) {
        _showPaymentResult(
          success: true,
          message: 'Payment successful!',
          amountCents: summary.totalDueCents,
        );
      } else {
        // Payment sheet dismissed or card declined
        AppNotice.warning(
          context,
          'Payment was not completed. Your RSVP is saved as unpaid. You can pay later.',
          duration: const Duration(seconds: 5),
        );
      }
    } on Exception catch (e) {
      if (!mounted) return;
      final msg = e.toString();
      if (msg.contains('failed-precondition') ||
          msg.contains('already been paid')) {
        _showPaymentResult(
          success: false,
          message: 'All attendees have already been paid for. Please refresh.',
        );
      } else {
        _showPaymentResult(
          success: false,
          message: 'Payment failed. Please try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _isPaymentProcessing = false);
    }
  }

  Future<void> _handleZellePayment({
    required MojoEvent event,
    required EventPaymentSummary summary,
    required List<String> attendeeIds,
  }) async {
    final recipientEmail = dotenv.env['ZELLE_RECIPIENT_EMAIL']?.trim() ?? '';
    final recipientPhone = dotenv.env['ZELLE_RECIPIENT_PHONE']?.trim() ?? '';

    if (!mounted) return;
    await showZelleQrModal(
      context,
      amountCents: summary.totalDueCents,
      currency: summary.currency,
      eventTitle: event.title,
      recipientEmail:
          recipientEmail.isNotEmpty ? recipientEmail : 'organizer@example.com',
      recipientPhone: recipientPhone.isNotEmpty ? recipientPhone : '',
      onPaymentDone: () async {
        try {
          final paymentService = ref.read(stripePaymentServiceProvider);
          await paymentService.markZelleWaitingForApproval(
            eventId: event.id,
            attendeeIds: attendeeIds,
          );
          if (!mounted) return;
          AppNotice.success(context, 'Payment marked as waiting for approval.');
        } catch (e) {
          if (!mounted) return;
          AppNotice.error(context, 'Failed to initiate Zelle payment. Please try again.');
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Attendee deletion with confirmation (Task 8.3)
  // ---------------------------------------------------------------------------

  Future<void> _handleDeleteAttendee({
    required MojoEvent event,
    required AttendeeRowData row,
  }) async {
    // Unsubmitted rows: just remove from local state
    if (row.firestoreId == null) {
      ref.read(rsvpFormProvider.notifier).removeRow(row.localId);
      return;
    }

    // Submitted rows: show confirmation dialog
    final isPaid = row.paymentStatus == 'paid';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove Attendee'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
                'Remove "${row.name.isNotEmpty ? row.name : 'Attendee'}" from your RSVP?'),
            if (isPaid) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.amber.shade200),
                ),
                child: Row(
                  children: [
                    Icon(Icons.warning_amber,
                        size: 18, color: Colors.amber.shade800),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'This attendee has already paid. Deletion may require a refund from the organizer.',
                        style: TextStyle(fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Remove'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _busy = true);
    try {
      await ref.read(rsvpFormProvider.notifier).deleteSubmittedAttendee(
            firestoreId: row.firestoreId!,
            eventId: event.id,
          );
      final formState = ref.read(rsvpFormProvider);
      if (formState.status == RsvpFormStatus.error &&
          formState.errorMessage != null) {
        if (!mounted) return;
        AppNotice.error(context, formState.errorMessage!);
      }
    } catch (e) {
      if (!mounted) return;
      AppNotice.error(context, 'Failed to remove attendee: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ---------------------------------------------------------------------------
  // Guest RSVP flow (Task 8.4)
  // ---------------------------------------------------------------------------

  Future<void> _handleGuestSubmit(MojoEvent event) async {
    final formNotifier = ref.read(rsvpFormProvider.notifier);
    final formState = ref.read(rsvpFormProvider);

    final contact = GuestContactInfo(
      firstName: _guestFirstNameController.text.trim(),
      lastName: _guestLastNameController.text.trim(),
      email: _guestEmailController.text.trim(),
      phoneNumber: _guestPhoneController.text.trim(),
    );

    if (contact.firstName.isEmpty ||
        contact.lastName.isEmpty ||
        contact.phoneNumber.isEmpty) {
      AppNotice.warning(context, 'Please fill in all required fields.');
      return;
    }

    setState(() => _guestSubmitting = true);

    try {
      final guestService = ref.read(guestRsvpServiceProvider);
      final additionalAttendees = formState.rows.map((r) {
        return GuestAttendeeInput(
          name: r.name,
          relationship: r.relationship,
          ageGroup: r.ageGroup,
        );
      }).toList();

      final result = await guestService.submitGuestRsvp(
        eventId: event.id,
        contact: contact,
        additionalAttendees: additionalAttendees,
      );

      if (!mounted) return;

      if (result.memberExists) {
        setState(() {
          _memberExistsError = true;
          _guestSubmitting = false;
        });
        return;
      }

      if (result.success) {
        formNotifier.setGuestContact(contact);
        AppNotice.success(context, 'RSVP submitted successfully!');
      } else {
        AppNotice.error(context, result.errorMessage ?? 'Failed to submit RSVP.');
      }
    } catch (e) {
      if (!mounted) return;
      AppNotice.error(context, 'Error submitting RSVP: $e');
    } finally {
      if (mounted) setState(() => _guestSubmitting = false);
    }
  }

  void _handleOtpVerified(String token) {
    ref.read(rsvpFormProvider.notifier).setGuestSessionToken(token);
    setState(() => _otpVerified = true);
  }

  // ---------------------------------------------------------------------------
  // RSVP submission for authenticated users
  // ---------------------------------------------------------------------------

  Future<void> _submitRsvp(MojoEvent event) async {
    final user = ref.read(authStateProvider).valueOrNull;
    if (user == null) return;

    final paymentStatus = event.isEffectivelyFree ? 'not_required' : 'unpaid';

    setState(() => _busy = true);
    try {
      await ref.read(rsvpFormProvider.notifier).submitRsvp(
            eventId: event.id,
            userId: user.uid,
            paymentStatus: paymentStatus,
          );
      final formState = ref.read(rsvpFormProvider);
      if (!mounted) return;
      if (formState.status == RsvpFormStatus.submitted) {
        AppNotice.success(context, 'RSVP submitted successfully!');
      } else if (formState.status == RsvpFormStatus.error) {
        AppNotice.error(context, formState.errorMessage ?? 'Failed to submit RSVP.');
      }
    } catch (e) {
      if (!mounted) return;
      AppNotice.error(context, 'Error: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final eventAsync = ref.watch(eventByIdProvider(widget.eventId));
    final myDocsAsync =
        ref.watch(userAttendeesForEventProvider(widget.eventId));
    final myDocs = myDocsAsync.valueOrNull ??
        const <QueryDocumentSnapshot<Map<String, dynamic>>>[];
    final user = ref.watch(authStateProvider).valueOrNull;
    final formState = ref.watch(rsvpFormProvider);
    final capacity = ref.watch(capacityStateProvider(widget.eventId));

    // Task 8.5: Initialize form from existing attendees when they load
    if (myDocs.isNotEmpty && !_initialized) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(rsvpFormProvider.notifier).initFromExistingAttendees(myDocs);
        setState(() => _initialized = true);
      });
    }

    // Detect guest flow
    final isGuestFlow = eventAsync.whenOrNull(
          data: (event) => user == null && event?.visibility == 'truly_public',
        ) ??
        false;

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('RSVP'),
          bottom: const TabBar(
            tabs: <Tab>[
              Tab(text: 'RSVP'),
              Tab(text: "Who's going"),
              Tab(text: 'QR'),
            ],
          ),
        ),
        body: Stack(
          children: [
            eventAsync.when(
              data: (MojoEvent? event) {
                if (event == null) {
                  return const Center(child: Text('Event not found.'));
                }

                // Compute payment summary from form rows
                final rows = formState.rows;
                final paymentInputs = _paymentInputsFromRows(rows);
                final summary = EventPaymentCalculator.calculateForAttendees(
                  event: event,
                  attendees: paymentInputs,
                );

                return TabBarView(
                  children: <Widget>[
                    // ---- Tab 1: RSVP ----
                    _buildRsvpTab(
                      event: event,
                      formState: formState,
                      summary: summary,
                      capacity: capacity,
                      user: user,
                      isGuestFlow: isGuestFlow,
                      scheme: scheme,
                    ),

                    // ---- Tab 2: Who's Going (unchanged) ----
                    ListView(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                      children: <Widget>[
                        EventWhosGoingSection(
                          eventId: event.id,
                          attendingCount: event.attendingCount,
                        ),
                      ],
                    ),

                    // ---- Tab 3: QR (unchanged) ----
                    _buildQrTab(event: event, user: user, scheme: scheme),
                  ],
                );
              },
              loading: () => const Center(child: AppLoadingIndicator()),
              error: (Object e, StackTrace _) =>
                  Center(child: Text('Could not load event: $e')),
            ),

            // Payment status animation overlay
            if (_showPaymentAnimation)
              Positioned.fill(
                child: GestureDetector(
                  onTap: () => setState(() => _showPaymentAnimation = false),
                  child: Container(
                    color: Colors.black26,
                    child: PaymentStatusAnimation(
                      isSuccess: _paymentAnimationSuccess,
                      message: _paymentAnimationMessage,
                      amountCents: _paymentAnimationAmount,
                      onDismissed: () {
                        if (mounted) {
                          setState(() => _showPaymentAnimation = false);
                        }
                      },
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // RSVP Tab builder
  // ---------------------------------------------------------------------------

  Widget _buildRsvpTab({
    required MojoEvent event,
    required RsvpFormState formState,
    required EventPaymentSummary summary,
    required ({
      int attendingCount,
      int? maxAttendees,
      bool canAddMore,
      bool canWaitlist
    }) capacity,
    required dynamic user,
    required bool isGuestFlow,
    required ColorScheme scheme,
  }) {
    final rows = formState.rows;
    final when = DateFormat('EEEE, MMM d \u2013 h:mm a').format(event.startAt);
    final hasSubmittedRows = rows.any((r) => r.firestoreId != null);
    final hasNewRows = rows.any((r) => r.firestoreId == null);

    return ListView(
      padding: const EdgeInsets.fromLTRB(0, 8, 0, 24),
      children: [
        // Capacity display
        if (capacity.maxAttendees != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Row(
              children: [
                Icon(Icons.people, size: 18, color: scheme.primary),
                const SizedBox(width: 6),
                Text(
                  '${capacity.attendingCount} / ${capacity.maxAttendees} attending',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: capacity.canAddMore
                        ? scheme.onSurfaceVariant
                        : Colors.red.shade700,
                  ),
                ),
              ],
            ),
          ),

        // Event details (collapsed by default) — Req 10.1
        CollapsibleSection(
          title: 'Event Details',
          initiallyExpanded: false,
          leadingIcon: Icons.event,
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: scheme.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: scheme.outlineVariant.withValues(alpha: 0.35),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event.title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(when, style: TextStyle(color: scheme.onSurfaceVariant)),
                if (event.subtitleLine.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    event.subtitleLine,
                    style: TextStyle(color: scheme.onSurfaceVariant),
                  ),
                ],
                if (event.description?.isNotEmpty == true) ...[
                  const SizedBox(height: 8),
                  Text(
                    event.description!,
                    style: TextStyle(
                      color: scheme.onSurfaceVariant,
                      fontSize: 13,
                      height: 1.4,
                    ),
                    maxLines: 5,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
        ),

        const SizedBox(height: 4),

        // Guest flow or authenticated flow
        if (isGuestFlow)
          _buildGuestRsvpSection(
              event: event, formState: formState, scheme: scheme)
        else ...[
          // Attendee form (expanded by default) — Req 10.2
          CollapsibleSection(
            title: 'Attendees',
            initiallyExpanded: true,
            leadingIcon: Icons.group_add,
            child: Column(
              children: [
                AttendeeFormWidget(
                  rows: rows,
                  canAddMore: capacity.canAddMore,
                  canWaitlist: capacity.canWaitlist,
                  onRowChanged: (localId, updated) {
                    ref
                        .read(rsvpFormProvider.notifier)
                        .updateRow(localId, updated);
                  },
                  onDeleteRow: (localId) {
                    final row = rows.firstWhere(
                      (r) => r.localId == localId,
                      orElse: () => AttendeeRowData.blank(),
                    );
                    _handleDeleteAttendee(event: event, row: row);
                  },
                  onAddRow: () {
                    ref.read(rsvpFormProvider.notifier).addRow();
                  },
                ),
                // Submit RSVP button for new rows
                if (hasNewRows && user != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: (_busy ||
                                formState.status == RsvpFormStatus.submitting)
                            ? null
                            : () => _submitRsvp(event),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: MojoColors.primaryOrange,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        child: formState.status == RsvpFormStatus.submitting
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: AppLoadingIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text('Submit RSVP'),
                      ),
                    ),
                  ),
                // Sign in prompt for non-authenticated users on non-public events
                if (user == null && !isGuestFlow)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade50,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.blue.shade200),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.login,
                              size: 20, color: Colors.blue.shade700),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Sign in to RSVP for this event.',
                              style: TextStyle(
                                fontSize: 13,
                                color: Colors.blue.shade800,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // Payment summary — only show for submitted attendees
          if (hasSubmittedRows)
            PaymentSummaryWidget(
              event: event,
              summary: summary,
              unpaidAttendees: _unpaidRows(rows),
              paidAttendees: _paidRows(rows),
              waitingAttendees: _waitingRows(rows),
              onPayNow: () => _handlePayNow(event: event, summary: summary),
              isProcessing: _isPaymentProcessing,
            ),
        ],

        const SizedBox(height: 10),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: OutlinedButton.icon(
            onPressed: () => context.push('/events/${event.id}/detail'),
            icon: const Icon(Icons.info_outline),
            label: const Text('Open event details'),
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Guest RSVP section (Task 8.4)
  // ---------------------------------------------------------------------------

  Widget _buildGuestRsvpSection({
    required MojoEvent event,
    required RsvpFormState formState,
    required ColorScheme scheme,
  }) {
    if (_memberExistsError) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.amber.shade50,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.amber.shade200),
          ),
          child: Column(
            children: [
              Icon(Icons.person, size: 36, color: Colors.amber.shade800),
              const SizedBox(height: 10),
              Text(
                'You are already a member. Please log in instead.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: Colors.amber.shade900,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 8),
          const Text(
            'Guest RSVP',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: MojoColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Verify your phone number to RSVP as a guest.',
            style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 16),

          // Contact fields
          TextFormField(
            controller: _guestFirstNameController,
            decoration: const InputDecoration(
              labelText: 'First Name *',
              border: OutlineInputBorder(),
              isDense: true,
            ),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _guestLastNameController,
            decoration: const InputDecoration(
              labelText: 'Last Name *',
              border: OutlineInputBorder(),
              isDense: true,
            ),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _guestEmailController,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              labelText: 'Email',
              border: OutlineInputBorder(),
              isDense: true,
            ),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _guestPhoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Phone Number *',
              hintText: '+1XXXXXXXXXX',
              border: OutlineInputBorder(),
              isDense: true,
            ),
          ),
          const SizedBox(height: 14),

          // Verify Phone / OTP flow
          if (!_otpVerified)
            ElevatedButton.icon(
              onPressed: _guestPhoneController.text.trim().isEmpty
                  ? null
                  : () {
                      showOtpVerificationModal(
                        context,
                        phoneNumber: _guestPhoneController.text.trim(),
                        eventId: event.id,
                        onVerified: _handleOtpVerified,
                        onMemberExists: () {
                          setState(() => _memberExistsError = true);
                        },
                      );
                    },
              icon: const Icon(Icons.verified_user, size: 18),
              label: const Text('Verify Phone'),
              style: ElevatedButton.styleFrom(
                backgroundColor: MojoColors.primaryOrange,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
            )
          else ...[
            // Verified badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.green.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.green.shade200),
              ),
              child: Row(
                children: [
                  Icon(Icons.check_circle,
                      size: 18, color: Colors.green.shade700),
                  const SizedBox(width: 8),
                  Text(
                    'Phone verified',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Colors.green.shade700,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Attendee form for guest
            AttendeeFormWidget(
              rows: formState.rows,
              canAddMore: true,
              onRowChanged: (localId, updated) {
                ref.read(rsvpFormProvider.notifier).updateRow(localId, updated);
              },
              onDeleteRow: (localId) {
                ref.read(rsvpFormProvider.notifier).removeRow(localId);
              },
              onAddRow: () {
                ref.read(rsvpFormProvider.notifier).addRow();
              },
            ),
            const SizedBox(height: 12),

            // Submit guest RSVP
            ElevatedButton(
              onPressed:
                  _guestSubmitting ? null : () => _handleGuestSubmit(event),
              style: ElevatedButton.styleFrom(
                backgroundColor: MojoColors.primaryOrange,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: _guestSubmitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: AppLoadingIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Submit RSVP'),
            ),
          ],
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // QR Tab (unchanged)
  // ---------------------------------------------------------------------------

  Widget _buildQrTab({
    required MojoEvent event,
    required dynamic user,
    required ColorScheme scheme,
  }) {
    final myDocsAsync =
        ref.watch(userAttendeesForEventProvider(widget.eventId));
    final myDocs = myDocsAsync.valueOrNull ??
        const <QueryDocumentSnapshot<Map<String, dynamic>>>[];

    QueryDocumentSnapshot<Map<String, dynamic>>? myPrimary;
    for (final d in myDocs) {
      if (d.data()['attendeeType'] == 'primary') {
        myPrimary = d;
        break;
      }
    }
    myPrimary ??= myDocs.isNotEmpty ? myDocs.first : null;

    final myStatus = (myPrimary?.data()['rsvpStatus'] as String?) ?? 'none';

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: <Widget>[
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: scheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: scheme.outlineVariant.withValues(alpha: 0.35),
            ),
          ),
          child: Column(
            children: <Widget>[
              const Text(
                'Your RSVP QR',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 12),
              if (user == null || myPrimary == null)
                Text(
                  'RSVP as Going to generate your QR.',
                  style: TextStyle(color: scheme.onSurfaceVariant),
                )
              else
                QrImageView(
                  data:
                      'event:${event.id}|user:${(user as dynamic).uid}|status:$myStatus',
                  size: 210,
                  backgroundColor: Colors.white,
                ),
            ],
          ),
        ),
      ],
    );
  }
}











