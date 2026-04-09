import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:lottie/lottie.dart';

import '../../../core/providers/core_providers.dart';
import '../../../core/theme/mojo_colors.dart';
import 'package:mojo_mobile/data/models/mojo_event.dart';
import '../services/event_payment_calculator.dart';
import '../services/stripe_payment_service.dart';
import '../widgets/manage_rsvp_bottom_sheet.dart';
import '../widgets/rsvp_bottom_sheet.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

class EventsScreen extends ConsumerStatefulWidget {
  const EventsScreen({super.key});

  @override
  ConsumerState<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends ConsumerState<EventsScreen> {
  bool _showConfetti = false;
  _EventScopeFilter _scopeFilter = _EventScopeFilter.all;
  _EventTypeFilter _typeFilter = _EventTypeFilter.all;
  int _currentEventPage = 0;
  static const int _eventsPerPage = 4;

  Future<void> _handleRSVP(MojoEvent event) async {
    HapticFeedback.lightImpact();
    final bool? success = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (BuildContext context) => RsvpBottomSheet(event: event),
    );

    if (success == true && mounted) {
      setState(() => _showConfetti = true);
      await Future<void>.delayed(const Duration(seconds: 4));
      if (mounted) setState(() => _showConfetti = false);
    }
  }

  bool _matchesType(MojoEvent event) {
    switch (_typeFilter) {
      case _EventTypeFilter.all:
        return true;
      case _EventTypeFilter.free:
        return event.isEffectivelyFree;
      case _EventTypeFilter.paid:
        return event.isPaidEvent;
      case _EventTypeFilter.zelle:
        return event.isZellePayment;
      case _EventTypeFilter.payThere:
        return event.isPayThere;
    }
  }

  String _scopeLabel(_EventScopeFilter scope) {
    switch (scope) {
      case _EventScopeFilter.all:
        return 'All';
      case _EventScopeFilter.upcoming:
        return 'Upcoming';
      case _EventScopeFilter.past:
        return 'Past';
      case _EventScopeFilter.myRsvp:
        return 'My RSVP';
    }
  }

  String _typeLabel(_EventTypeFilter type) {
    switch (type) {
      case _EventTypeFilter.all:
        return 'All Types';
      case _EventTypeFilter.free:
        return 'Free';
      case _EventTypeFilter.paid:
        return 'Paid';
      case _EventTypeFilter.zelle:
        return 'Zelle';
      case _EventTypeFilter.payThere:
        return 'Pay There';
    }
  }

  Future<void> _openFiltersSheet(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _FiltersBottomSheet(
        scope: _scopeFilter,
        type: _typeFilter,
        onScopeChanged: (v) => setState(() {
          _scopeFilter = v;
          _currentEventPage = 0;
        }),
        onTypeChanged: (v) => setState(() {
          _typeFilter = v;
          _currentEventPage = 0;
        }),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final user = ref.watch(authStateProvider).valueOrNull;
    final upcomingAsync = ref.watch(upcomingEventsProvider);
    final pastAsync = ref.watch(pastEventsProvider);
    final myAsync = ref.watch(myRsvpsProvider);

    Widget buildEventList(List<MojoEvent> events) {
      if (events.isEmpty) {
        return const _InfoState(
          icon: Icons.event_busy_outlined,
          title: 'No events found',
          subtitle: 'Try changing filters to see more events.',
        );
      }

      final totalPages = (events.length / _eventsPerPage).ceil();
      final currentPage =
          totalPages == 0 ? 0 : _currentEventPage.clamp(0, totalPages - 1);
      final start = currentPage * _eventsPerPage;
      final end = (start + _eventsPerPage).clamp(0, events.length);
      final pageEvents = events.sublist(start, end);

      return Column(
        children: <Widget>[
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: EdgeInsets.zero,
            itemCount: pageEvents.length,
            separatorBuilder: (_, __) => const SizedBox(height: 16),
            itemBuilder: (BuildContext context, int index) {
              final e = pageEvents[index];
              return _EventCard(
                event: e,
                isPast: e.startAt.isBefore(DateTime.now()),
                onRSVP:
                    e.startAt.isBefore(DateTime.now()) ? null : () => _handleRSVP(e),
              );
            },
          ),
          if (totalPages > 1) ...<Widget>[
            const SizedBox(height: 16),
            _EventPagination(
              currentPage: currentPage,
              totalPages: totalPages,
              onPrevious: currentPage > 0
                  ? () => setState(() => _currentEventPage = currentPage - 1)
                  : null,
              onNext: currentPage < totalPages - 1
                  ? () => setState(() => _currentEventPage = currentPage + 1)
                  : null,
            ),
          ],
        ],
      );
    }

    Widget buildMyRsvpList(List<MyRsvpRow> rows) {
      if (user == null) {
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: <Widget>[
                Icon(Icons.event_available,
                    size: 56, color: scheme.primary.withValues(alpha: 0.5)),
                const SizedBox(height: 16),
                Text(
                  'Sign in to see your RSVP dashboard.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 16),
                ),
                const SizedBox(height: 14),
                FilledButton(
                  onPressed: () => context.push('/login'),
                  child: const Text('Sign in'),
                ),
              ],
            ),
          ),
        );
      }

      final filtered = rows.where((row) {
        final ev = row.event;
        if (ev == null) return true;
        return _matchesType(ev);
      }).toList(growable: false);

      if (filtered.isEmpty) {
        return const _InfoState(
          icon: Icons.checklist_rtl,
          title: 'No RSVP items for this filter',
          subtitle: 'Try switching event type or scope.',
        );
      }

      return ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: EdgeInsets.zero,
        itemCount: filtered.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (BuildContext context, int i) =>
            _MyRsvpCard(row: filtered[i], scheme: scheme),
      );
    }


    Widget buildLoadingState() {
      final screenHeight = MediaQuery.sizeOf(context).height;
      final loaderHeight = (screenHeight * 0.56).clamp(280.0, 460.0);
      return SizedBox(
        height: loaderHeight,
        child: const Center(
          child: AppLoadingIndicator(size: 52),
        ),
      );
    }
    Widget buildFilteredContent() {
      switch (_scopeFilter) {
        case _EventScopeFilter.upcoming:
          return upcomingAsync.when(
            data: (events) =>
                buildEventList(events.where(_matchesType).toList(growable: false)),
            loading: buildLoadingState,
            error: (e, _) => _InfoState(
              icon: Icons.error_outline,
              title: 'Could not load upcoming events',
              subtitle: '$e',
            ),
          );
        case _EventScopeFilter.past:
          return pastAsync.when(
            data: (events) =>
                buildEventList(events.where(_matchesType).toList(growable: false)),
            loading: buildLoadingState,
            error: (e, _) => _InfoState(
              icon: Icons.error_outline,
              title: 'Could not load past events',
              subtitle: '$e',
            ),
          );
        case _EventScopeFilter.myRsvp:
          return myAsync.when(
            data: buildMyRsvpList,
            loading: buildLoadingState,
            error: (e, _) => _InfoState(
              icon: Icons.error_outline,
              title: 'Could not load RSVPs',
              subtitle: '$e',
            ),
          );
        case _EventScopeFilter.all:
          return upcomingAsync.when(
            data: (upcoming) => pastAsync.when(
              data: (past) {
                final merged = <MojoEvent>[...upcoming, ...past]
                  ..sort((a, b) => b.startAt.compareTo(a.startAt));
                final filtered = merged.where(_matchesType).toList(growable: false);
                return buildEventList(filtered);
              },
              loading: buildLoadingState,
              error: (e, _) => _InfoState(
                icon: Icons.error_outline,
                title: 'Could not load events',
                subtitle: '$e',
              ),
            ),
            loading: buildLoadingState,
            error: (e, _) => _InfoState(
              icon: Icons.error_outline,
              title: 'Could not load events',
              subtitle: '$e',
            ),
          );
      }
    }

    return Stack(
      children: <Widget>[
        Scaffold(
          backgroundColor: const Color(0xFFF6F3EE),
          body: Stack(
            children: <Widget>[
              const Positioned.fill(child: _SoftEventBackground()),
              SafeArea(
                child: CustomScrollView(
                  physics: const BouncingScrollPhysics(),
                  slivers: <Widget>[
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            const SizedBox(height: 6),
                            Text(
                              'MFM Events',
                              style: GoogleFonts.syne(
                                fontSize: 34,
                                height: 1.0,
                                fontWeight: FontWeight.w800,
                                color: const Color(0xFF2D231F),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Find, filter, and RSVP in one place.',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 13,
                                color: const Color(0xFF786A63),
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 14),
                            Row(
                              children: <Widget>[
                                Expanded(
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                                    decoration: BoxDecoration(
                                      color: Colors.white.withValues(alpha: 0.82),
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(color: const Color(0xFFE7DDD2)),
                                    ),
                                    child: Text(
                                      'View: ${_scopeLabel(_scopeFilter)} | Type: ${_typeLabel(_typeFilter)}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 12,
                                        color: const Color(0xFF6F6059),
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                GestureDetector(
                                  onTap: () => _openFiltersSheet(context),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                    decoration: BoxDecoration(
                                      gradient: const LinearGradient(
                                        colors: <Color>[Color(0xFFE86A35), Color(0xFFF29A61)],
                                        begin: Alignment.topLeft,
                                        end: Alignment.bottomRight,
                                      ),
                                      borderRadius: BorderRadius.circular(14),
                                      boxShadow: <BoxShadow>[
                                        BoxShadow(
                                          color: const Color(0xFFE86A35).withValues(alpha: 0.32),
                                          blurRadius: 10,
                                          offset: const Offset(0, 4),
                                        ),
                                      ],
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: const <Widget>[
                                        Icon(Icons.tune_rounded, size: 17, color: Colors.white),
                                        SizedBox(width: 6),
                                        Text(
                                          'Filters',
                                          style: TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w700,
                                            fontSize: 13,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                          ],
                        ),
                      ),
                    ),
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 94),
                        child: buildFilteredContent(),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (_showConfetti)
          IgnorePointer(
            child: Center(
              child: Lottie.network(
                'https://assets9.lottiefiles.com/packages/lf20_u4yrau.json',
                repeat: false,
              ),
            ),
          ),
      ],
    );
  }
}

enum _EventScopeFilter { all, upcoming, past, myRsvp }

enum _EventTypeFilter { all, free, paid, zelle, payThere }

class _FiltersBottomSheet extends StatefulWidget {
  const _FiltersBottomSheet({
    required this.scope,
    required this.type,
    required this.onScopeChanged,
    required this.onTypeChanged,
  });

  final _EventScopeFilter scope;
  final _EventTypeFilter type;
  final ValueChanged<_EventScopeFilter> onScopeChanged;
  final ValueChanged<_EventTypeFilter> onTypeChanged;

  @override
  State<_FiltersBottomSheet> createState() => _FiltersBottomSheetState();
}

class _FiltersBottomSheetState extends State<_FiltersBottomSheet> {
  late _EventScopeFilter _localScope;
  late _EventTypeFilter _localType;

  @override
  void initState() {
    super.initState();
    _localScope = widget.scope;
    _localType = widget.type;
  }

  @override
  Widget build(BuildContext context) {
    final scopeItems = <(_EventScopeFilter, String)>[
      (_EventScopeFilter.all, 'All'),
      (_EventScopeFilter.upcoming, 'Upcoming'),
      (_EventScopeFilter.past, 'Past'),
      (_EventScopeFilter.myRsvp, 'My RSVP'),
    ];
    final typeItems = <(_EventTypeFilter, String)>[
      (_EventTypeFilter.all, 'All Types'),
      (_EventTypeFilter.free, 'Free'),
      (_EventTypeFilter.paid, 'Paid'),
      (_EventTypeFilter.zelle, 'Zelle'),
      (_EventTypeFilter.payThere, 'Pay There'),
    ];

    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 16),
      decoration: BoxDecoration(
        color: const Color(0xFFF9F9FA),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFECECF0)),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.12),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Center(
              child: Container(
                width: 44,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFDDDDE3),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: <Widget>[
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close_rounded),
                  style: IconButton.styleFrom(
                    backgroundColor: Colors.white,
                    minimumSize: const Size(32, 32),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  'Explore Filters',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: const Color(0xFF2D231F),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              'View',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: const Color(0xFF8A7B73),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: scopeItems
                  .map((item) => _FilterPill(
                        label: item.$2,
                        selected: _localScope == item.$1,
                        onTap: () => setState(() => _localScope = item.$1),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 14),
            Text(
              'Type',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: const Color(0xFF8A7B73),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: typeItems
                  .map((item) => _FilterPill(
                        label: item.$2,
                        selected: _localType == item.$1,
                        onTap: () => setState(() => _localType = item.$1),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.center,
              child: SizedBox(
                width: 190,
                child: FilledButton(
                  onPressed: () {
                    widget.onScopeChanged(_localScope);
                    widget.onTypeChanged(_localType);
                    Navigator.pop(context);
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFE86A35),
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('Apply Filters'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterPill extends StatelessWidget {
  const _FilterPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
          decoration: BoxDecoration(
            color: selected ? const Color(0xFFE86A35) : Colors.white,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: selected ? const Color(0xFFE86A35) : const Color(0xFFE6E7EB),
            ),
            boxShadow: selected
                ? <BoxShadow>[
                    BoxShadow(
                      color: const Color(0xFFE86A35).withValues(alpha: 0.25),
                      blurRadius: 8,
                      offset: const Offset(0, 3),
                    ),
                  ]
                : null,
          ),
          child: Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              color: selected ? Colors.white : const Color(0xFF4A4E57),
              fontWeight: FontWeight.w600,
              fontSize: 12,
            ),
          ),
        ),
      ),
    );
  }
}

class _MyRsvpCard extends ConsumerWidget {
  const _MyRsvpCard({required this.row, required this.scheme});

  final MyRsvpRow row;
  final ColorScheme scheme;

  Color _statusColor(String status) {
    switch (status) {
      case 'going':
        return Colors.green;
      case 'waitlisted':
        return Colors.deepPurple;
      case 'not-going':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  Color _paymentColor(String status) {
    switch (status) {
      case 'paid':
        return Colors.green;
      case 'pending':
      case 'unpaid':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final Map<String, dynamic> d = row.attendeeDoc.data();
    final String name = (d['name'] as String?)?.trim().isNotEmpty == true
        ? (d['name'] as String).trim()
        : 'Guest';
    final String rsvpStatus = (d['rsvpStatus'] as String?) ?? 'unknown';
    final String paymentStatus = (d['paymentStatus'] as String?) ?? 'unknown';
    final MojoEvent? ev = row.event;

    final String title = ev?.title ?? 'Event (details unavailable)';
    final String when = ev != null
        ? DateFormat('EEE, MMM d - h:mm a').format(ev.startAt)
        : 'Date unavailable';

    final user = ref.watch(authStateProvider).valueOrNull;
    final bool needsPayment = paymentStatus != 'paid' && paymentStatus != 'waiting_for_approval' && paymentStatus != 'not_required';
    final MojoEvent? eventForPay = (needsPayment &&
            ev != null &&
            ev.isPaidEvent &&
            ev.startAt.isAfter(DateTime.now()))
        ? ev
        : null;

    final String? rawEventId = (d['eventId'] as String?)?.trim();
    final String? eventIdForNav = (rawEventId != null && rawEventId.isNotEmpty)
        ? rawEventId
        : row.attendeeDoc.reference.parent.parent?.id;

    final Color statusTone = _statusColor(rsvpStatus);
    final Color paymentTone = _paymentColor(paymentStatus);

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: LinearGradient(
          colors: <Color>[
            scheme.surface,
            scheme.surface.withValues(alpha: 0.96),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border:
            Border.all(color: scheme.outlineVariant.withValues(alpha: 0.35)),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 14,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                gradient: LinearGradient(
                  colors: <Color>[
                    statusTone.withValues(alpha: 0.22),
                    paymentTone.withValues(alpha: 0.18),
                  ],
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                ),
                border: Border.all(color: statusTone.withValues(alpha: 0.25)),
              ),
              child: Row(
                children: <Widget>[
                  Icon(Icons.verified_user_outlined,
                      size: 16, color: statusTone),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'RSVP $rsvpStatus - Payment $paymentStatus',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: statusTone,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            InkWell(
              onTap: eventIdForNav != null
                  ? () => context.push('/events/$eventIdForNav')
                  : null,
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(title,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 16)),
                    const SizedBox(height: 6),
                    Row(
                      children: <Widget>[
                        Icon(Icons.schedule_rounded,
                            size: 16, color: scheme.onSurfaceVariant),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            when,
                            style: TextStyle(
                                color: scheme.onSurfaceVariant, fontSize: 13),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(name,
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 14)),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: <Widget>[
                        _StatePill(
                          icon: Icons.how_to_reg_rounded,
                          label: 'RSVP: $rsvpStatus',
                          color: _statusColor(rsvpStatus),
                        ),
                        _StatePill(
                          icon: Icons.payments_outlined,
                          label: 'Payment: $paymentStatus',
                          color: _paymentColor(paymentStatus),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: <Widget>[
                if (eventForPay != null)
                  FilledButton(
                    onPressed: () => context.push('/events/${eventForPay!.id}/detail'),
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFFE86A35),
                      foregroundColor: Colors.white,
                      elevation: 2,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Text(eventForPay!.isZellePayment ? 'Pay with Zelle' : 'Pay now'),
                  ),
                if (eventIdForNav != null)
                  OutlinedButton(
                    onPressed: () => context.push('/events/$eventIdForNav'),
                    child: const Text('Open event'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event, this.isPast = false, this.onRSVP});

  final MojoEvent event;
  final bool isPast;
  final VoidCallback? onRSVP;

  String _priceText(MojoEvent e) {
    if (e.isPayThere) return 'Pay There';
    if (e.isEffectivelyFree) return 'Free';
    final summary = EventPaymentCalculator.previewForAdultCount(
      event: e,
      attendeeCount: 1,
      namePrefix: 'Member',
    );
    return 'From \$${(summary.totalDueCents / 100).toStringAsFixed(2)}';
  }

  String _timeText() {
    final start = DateFormat('h:mm a').format(event.startAt);
    if (event.endAt == null) return 'Starts $start';
    final end = DateFormat('h:mm a').format(event.endAt!);
    return '$start - $end';
  }

  String _capacityText() {
    if (event.maxAttendees <= 0) return '${event.attendingCount} attending';
    return '${event.attendingCount}/${event.maxAttendees} attending';
  }

  String _locationText() {
    if (event.venueName?.trim().isNotEmpty == true) return event.venueName!.trim();
    if (event.location?.trim().isNotEmpty == true) return event.location!.trim();
    if (event.venueAddress?.trim().isNotEmpty == true) return event.venueAddress!.trim();
    return 'Location to be announced';
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final String monthShort =
        DateFormat('MMM').format(event.startAt).toUpperCase();
    final String dayNum = '${event.startAt.day}';
    final String? imageUrl = event.imageUrl;
    final bool isPaidEvent = event.isPaidEvent;

    final String title = event.title.trim().isNotEmpty ? event.title.trim() : 'Event';
    final String description = (event.description ?? '').trim();

    return InkWell(
      onTap: () => context.push('/events/${event.id}/detail'),
      borderRadius: BorderRadius.circular(24),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: const Color(0xFFE9DFD5),
          ),
          boxShadow: <BoxShadow>[
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.07),
              blurRadius: 20,
              offset: const Offset(0, 10),
            ),
          ],
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: <Color>[
              const Color(0xFFFFFCF7),
              const Color(0xFFF8F0E4),
            ],
          ),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              SizedBox(
                height: 188,
                width: double.infinity,
                child: Stack(
                  fit: StackFit.expand,
                  children: <Widget>[
                    if (imageUrl != null && imageUrl.isNotEmpty)
                      CachedNetworkImage(
                        imageUrl: imageUrl,
                        fit: BoxFit.cover,
                        placeholder: (_, __) =>
                            Container(color: scheme.surfaceContainerHighest),
                        errorWidget: (_, __, ___) => Container(
                          color: scheme.surfaceContainerHighest,
                          alignment: Alignment.center,
                          child: Icon(Icons.event, color: scheme.primary, size: 52),
                        ),
                      )
                    else
                      Container(
                        color: scheme.surfaceContainerHighest,
                        alignment: Alignment.center,
                        child: Icon(Icons.event, color: scheme.primary, size: 52),
                      ),
                    DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: <Color>[
                            Colors.black.withValues(alpha: 0.08),
                            Colors.black.withValues(alpha: 0.46),
                          ],
                        ),
                      ),
                    ),
                    Positioned(
                      top: 12,
                      left: 12,
                      child: _DateBadge(monthShort: monthShort, dayNum: dayNum),
                    ),
                    Positioned(
                      right: 12,
                      top: 12,
                      child: _TopStatusPill(
                        isPast: isPast,
                        isPaid: isPaidEvent,
                        isFree: event.isEffectivelyFree,
                        isPayThere: event.isPayThere,
                        isZelle: event.isZellePayment,
                      ),
                    ),
                    Positioned(
                      left: 14,
                      right: 14,
                      bottom: 14,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 19,
                              fontWeight: FontWeight.w800,
                              height: 1.15,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: <Widget>[
                              const Icon(Icons.schedule_rounded,
                                  size: 16, color: Colors.white70),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  _timeText(),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.white70,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    if (description.isNotEmpty) ...<Widget>[
                      Text(
                        description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: scheme.onSurfaceVariant,
                          fontSize: 13,
                          height: 1.35,
                        ),
                      ),
                      const SizedBox(height: 10),
                    ],
                    _InfoRow(
                      icon: Icons.place_outlined,
                      text: _locationText(),
                    ),
                    const SizedBox(height: 8),
                    _InfoRow(
                      icon: Icons.people_alt_outlined,
                      text: _capacityText(),
                    ),
                    if (event.waitlistEnabled) ...<Widget>[
                      const SizedBox(height: 8),
                      _InfoRow(
                        icon: Icons.hourglass_bottom_rounded,
                        text: 'Waitlist enabled',
                      ),
                    ],
                    const SizedBox(height: 12),
                    Row(
                      children: <Widget>[
                        Flexible(
                          fit: FlexFit.loose,
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: ConstrainedBox(
                              constraints: BoxConstraints(
                                minWidth: 112,
                                maxWidth: MediaQuery.sizeOf(context).width * 0.42,
                              ),
                              child: _MiniMeta(
                                icon: isPaidEvent
                                    ? Icons.payments_rounded
                                    : Icons.volunteer_activism_outlined,
                                text: _priceText(event),
                                highlighted: isPaidEvent,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        if (!isPast && onRSVP != null)
                          FilledButton(
                            onPressed: onRSVP,
                            style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xFFE86A35),
                              foregroundColor: Colors.white,
                              elevation: 2,
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 16, vertical: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                            child: Text(event.isPaidEvent ? 'RSVP & Pay' : 'Quick RSVP'),
                          )
                        else
                          OutlinedButton(
                            onPressed: () => context.push('/events/${event.id}/detail'),
                            child: const Text('View'),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DateBadge extends StatelessWidget {
  const _DateBadge({required this.monthShort, required this.dayNum});

  final String monthShort;
  final String dayNum;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: <Widget>[
          Text(
            monthShort,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: scheme.primary,
            ),
          ),
          Text(
            dayNum,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: scheme.primary,
            ),
          ),
        ],
      ),
    );
  }
}

class _TopStatusPill extends StatelessWidget {
  const _TopStatusPill({
    required this.isPast,
    required this.isPaid,
    required this.isFree,
    required this.isPayThere,
    required this.isZelle,
  });

  final bool isPast;
  final bool isPaid;
  final bool isFree;
  final bool isPayThere;
  final bool isZelle;

  @override
  Widget build(BuildContext context) {
    final Color tone = isPast
        ? Colors.blueGrey
        : isFree
            ? Colors.green
            : isPayThere
                ? Colors.indigo
                : isZelle
                    ? Colors.orange
                    : (isPaid ? Colors.deepOrange : Colors.green);

    final String label = isPast
        ? 'Past'
        : isFree
            ? 'Free'
            : isPayThere
                ? 'Pay There'
                : isZelle
                    ? 'Zelle'
                    : 'Paid';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Row(
      children: <Widget>[
        Icon(icon, size: 16, color: scheme.onSurfaceVariant),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: scheme.onSurfaceVariant,
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}

class _InfoState extends StatelessWidget {
  const _InfoState({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Icon(icon, size: 58, color: scheme.primary.withValues(alpha: 0.50)),
            const SizedBox(height: 14),
            Text(title,
                style:
                    const TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
                textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: scheme.onSurfaceVariant, fontSize: 14, height: 1.4),
            ),
          ],
        ),
      ),
    );
  }
}

class _EventPagination extends StatelessWidget {
  const _EventPagination({
    required this.currentPage,
    required this.totalPages,
    required this.onPrevious,
    required this.onNext,
  });

  final int currentPage;
  final int totalPages;
  final VoidCallback? onPrevious;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.84),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE7DDD2)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          IconButton(
            onPressed: onPrevious,
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
            style: IconButton.styleFrom(
              minimumSize: const Size(36, 36),
              backgroundColor: onPrevious == null
                  ? const Color(0xFFF1ECE6)
                  : const Color(0xFFFFF4EA),
              foregroundColor: onPrevious == null
                  ? const Color(0xFFB8AEA4)
                  : const Color(0xFFE86A35),
            ),
          ),
          const SizedBox(width: 12),
          Text(
            'Page ${currentPage + 1} of $totalPages',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: const Color(0xFF5E4F47),
            ),
          ),
          const SizedBox(width: 12),
          IconButton(
            onPressed: onNext,
            icon: const Icon(Icons.arrow_forward_ios_rounded, size: 18),
            style: IconButton.styleFrom(
              minimumSize: const Size(36, 36),
              backgroundColor: onNext == null
                  ? const Color(0xFFF1ECE6)
                  : const Color(0xFFFFF4EA),
              foregroundColor: onNext == null
                  ? const Color(0xFFB8AEA4)
                  : const Color(0xFFE86A35),
            ),
          ),
        ],
      ),
    );
  }
}
class _StatePill extends StatelessWidget {
  const _StatePill({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.30)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w600, color: color),
          ),
        ],
      ),
    );
  }
}

class _MiniMeta extends StatefulWidget {
  const _MiniMeta({
    required this.icon,
    required this.text,
    this.highlighted = false,
  });

  final IconData icon;
  final String text;
  final bool highlighted;

  @override
  State<_MiniMeta> createState() => _MiniMetaState();
}

class _MiniMetaState extends State<_MiniMeta>
    with SingleTickerProviderStateMixin {
  late final AnimationController _shineController;

  @override
  void initState() {
    super.initState();
    _shineController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat();
  }

  @override
  void dispose() {
    _shineController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final Color tone =
        widget.highlighted ? const Color(0xFFE86A35) : scheme.onSurfaceVariant;

    return AnimatedBuilder(
      animation: _shineController,
      builder: (_, __) {
        final t = _shineController.value;
        final travel = (t * 220) - 60;

        return ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: Stack(
            children: <Widget>[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: widget.highlighted
                        ? <Color>[
                            const Color(0x33E86A35),
                            const Color(0x26FFFFFF),
                            const Color(0x33E86A35),
                          ]
                        : <Color>[
                            tone.withValues(alpha: 0.10),
                            tone.withValues(alpha: 0.06),
                            tone.withValues(alpha: 0.10),
                          ],
                  ),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: tone.withValues(alpha: 0.25)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Text(
                      widget.text,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: tone,
                      ),
                    ),
                  ],
                ),
              ),
              Positioned.fill(
                child: IgnorePointer(
                  child: Transform.translate(
                    offset: Offset(travel, 0),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Container(
                        width: 42,
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.centerLeft,
                            end: Alignment.centerRight,
                            colors: <Color>[
                              Colors.white.withValues(alpha: 0),
                              Colors.white.withValues(alpha: 0.34),
                              Colors.white.withValues(alpha: 0),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
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
              child: _GlowBlob(size: 240, color: Color(0xFFFFC9A8)),
            ),
            Positioned(
              top: 160,
              right: -110,
              child: _GlowBlob(size: 260, color: Color(0xFFFFE0B8)),
            ),
            Positioned(
              bottom: -120,
              left: -80,
              child: _GlowBlob(size: 280, color: Color(0xFFDCEFD9)),
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

















