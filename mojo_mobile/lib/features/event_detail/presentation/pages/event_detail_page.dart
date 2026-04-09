import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../domain/entities/attendee_entity.dart';
import '../../domain/entities/event_entity.dart';
import '../../event_detail_injection.dart';
import '../bloc/event_detail_bloc.dart';
import '../widgets/collapsible_description.dart';
import '../widgets/comment_section_widget.dart';
import '../widgets/guest_list_view.dart';
import '../widgets/guest_rsvp_widget.dart';
import '../widgets/hero_image_card.dart';
import '../widgets/info_chips_row.dart';
import '../widgets/payment_required_card.dart';
import '../widgets/qr_code_tab.dart';
import '../widgets/rsvp_tab_bar.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

class EventDetailPage extends StatelessWidget {
  const EventDetailPage({super.key, required this.eventId});

  final String eventId;

  @override
  Widget build(BuildContext context) {
    EventDetailInjection.ensureInitialized();

    return BlocProvider<EventDetailBloc>(
      create: (_) =>
          eventDetailSl<EventDetailBloc>()..add(LoadEventDetail(eventId)),
      child: const EventDetailView(),
    );
  }
}

class EventDetailView extends StatelessWidget {
  const EventDetailView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F3EE),
      body: Stack(
        children: <Widget>[
          const Positioned.fill(child: _SoftEventBackground()),
          BlocBuilder<EventDetailBloc, EventDetailState>(
            builder: (context, state) {
              if (state is EventDetailLoading || state is EventDetailInitial) {
                return const Center(
                  child: AppLoadingIndicator(color: Color(0xFFFF4D1C)),
                );
              }

              if (state is EventDetailError) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      state.message,
                      textAlign: TextAlign.center,
                      style: GoogleFonts.plusJakartaSans(
                        color: const Color(0xFF3D2F2A),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                );
              }

              if (state is! EventDetailLoaded) {
                return const SizedBox.shrink();
              }

              final guests = state.attendees
                  .where((a) => a.isGuest)
                  .toList(growable: false);
              final paymentPending = state.attendees.any(
                (a) =>
                    a.rsvpStatus == RsvpStatus.going &&
                    (a.paymentStatus == PaymentStatus.unpaid ||
                        a.paymentStatus == PaymentStatus.pending ||
                        a.paymentStatus == PaymentStatus.waitingForApproval),
              );

              return CustomScrollView(
                physics: const BouncingScrollPhysics(),
                slivers: <Widget>[
                  HeroImageCard(
                      event: state.event, paymentPending: paymentPending),
                  const SliverToBoxAdapter(child: SizedBox(height: 12)),
                  SliverToBoxAdapter(child: InfoChipsRow(event: state.event)),
                  const SliverToBoxAdapter(child: CollapsibleDescription()),
                  const SliverToBoxAdapter(child: RsvpTabBar()),
                  SliverToBoxAdapter(
                      child: _TabContent(state: state, guests: guests)),
                  SliverToBoxAdapter(
                    child: CommentSectionWidget(eventId: state.event.id),
                  ),
                  SliverToBoxAdapter(
                    child: SizedBox(
                      height: MediaQuery.of(context).padding.bottom + 84,
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _SoftEventBackground extends StatelessWidget {
  const _SoftEventBackground();

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: <Color>[
              Color(0xFFFDF8F1),
              Color(0xFFF8F0E4),
              Color(0xFFF5EEE2),
            ],
          ),
        ),
        child: Stack(
          children: <Widget>[
            Positioned(
              top: -90,
              left: -70,
              child: _GlowBlob(
                size: 240,
                color: Color(0xFFFFC9A8),
              ),
            ),
            Positioned(
              top: 160,
              right: -110,
              child: _GlowBlob(
                size: 260,
                color: Color(0xFFFFE0B8),
              ),
            ),
            Positioned(
              bottom: -120,
              left: -80,
              child: _GlowBlob(
                size: 280,
                color: Color(0xFFDCEFD9),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GlowBlob extends StatelessWidget {
  const _GlowBlob({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color.withValues(alpha: 0.45),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: color.withValues(alpha: 0.45),
            blurRadius: 90,
            spreadRadius: 22,
          ),
        ],
      ),
    );
  }
}

class _TabContent extends StatelessWidget {
  const _TabContent({required this.state, required this.guests});

  final EventDetailLoaded state;
  final List<AttendeeEntity> guests;

  @override
  Widget build(BuildContext context) {
    switch (state.activeTab) {
      case RsvpTabType.rsvp:
        // Show guest RSVP widget for truly_public events when not authenticated
        final isGuest = state.event.isTrulyPublic &&
            FirebaseAuth.instance.currentUser == null;
        if (isGuest) {
          return GuestRsvpWidget(event: state.event);
        }
        return PaymentRequiredCard(
          event: state.event,
          attendees: state.attendees,
          state: state,
          onPay: () =>
              context.read<EventDetailBloc>().add(const ProcessPayment()),
        );
      case RsvpTabType.qrCode:
        return QrCodeTab(
          data:
              'event:${state.event.id}|title:${state.event.title}|ts:${DateTime.now().millisecondsSinceEpoch}',
        );
      case RsvpTabType.guests:
        return GuestListView(guests: guests);
    }
  }
}

