import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../domain/entities/event_entity.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

class HeroImageCard extends StatelessWidget {
  const HeroImageCard({
    super.key,
    required this.event,
    required this.paymentPending,
  });

  final EventEntity event;
  final bool paymentPending;

  @override
  Widget build(BuildContext context) {
    final (statusLabel, statusColor) = _statusMeta();

    return SliverAppBar(
      expandedHeight: 250,
      pinned: false,
      stretch: true,
      backgroundColor: const Color(0xFF2B221E),
      toolbarHeight: 0,
      collapsedHeight: 0,
      flexibleSpace: FlexibleSpaceBar(
        stretchModes: const <StretchMode>[
          StretchMode.zoomBackground,
          StretchMode.blurBackground,
        ],
        background: Stack(
          fit: StackFit.expand,
          children: <Widget>[
            CachedNetworkImage(
              imageUrl: event.imageUrl,
              fit: BoxFit.cover,
              fadeInDuration: const Duration(milliseconds: 350),
              placeholder: (_, __) => Container(
                color: const Color(0xFF3A2F29),
                alignment: Alignment.center,
                child: const SizedBox(
                  width: 28,
                  height: 28,
                  child: AppLoadingIndicator(
                    strokeWidth: 2.4,
                    color: Colors.white,
                  ),
                ),
              ),
              errorWidget: (_, __, ___) => Container(
                color: const Color(0xFF3A2F29),
                alignment: Alignment.center,
                child: const Icon(
                  Icons.image_not_supported_outlined,
                  color: Colors.white70,
                  size: 34,
                ),
              ),
            ),
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: <Color>[
                    Colors.black.withValues(alpha: 0.12),
                    Colors.black.withValues(alpha: 0.72),
                  ],
                ),
              ),
            ),
            Positioned(
              left: 16,
              right: 16,
              bottom: 18,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    event.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.manrope(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 24,
                      height: 1.12,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: <Widget>[
                      _StatusPill(label: statusLabel, color: statusColor),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'by ${event.organizerName}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.plusJakartaSans(
                            color: Colors.white.withValues(alpha: 0.92),
                            fontWeight: FontWeight.w500,
                            fontSize: 13,
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
    );
  }

  (String, Color) _statusMeta() {
    if (event.isPaidEvent && paymentPending) {
      return ('PAYMENT REQUIRED', const Color(0xFFEF4444));
    }
    if (event.isPayThere) {
      return ('PAY THERE', const Color(0xFFF59E0B));
    }
    if (event.isEffectivelyFree) {
      return ('FREE', const Color(0xFF22C55E));
    }
    return ('PAID', const Color(0xFF22C55E));
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.6)),
      ),
      child: Text(
        label,
        style: GoogleFonts.plusJakartaSans(
          color: color,
          fontWeight: FontWeight.w800,
          fontSize: 11,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}


