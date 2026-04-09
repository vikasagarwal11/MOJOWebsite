import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../domain/entities/event_entity.dart';
import '../bloc/event_detail_bloc.dart';

class RsvpTabBar extends StatelessWidget {
  const RsvpTabBar({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<EventDetailBloc, EventDetailState>(
      buildWhen: (previous, current) => current is EventDetailLoaded,
      builder: (context, state) {
        if (state is! EventDetailLoaded) return const SizedBox.shrink();

        Widget tabItem(String label, RsvpTabType tab) {
          final active = state.activeTab == tab;
          return Expanded(
            child: InkWell(
              onTap: () => context.read<EventDetailBloc>().add(SwitchTab(tab)),
              borderRadius: BorderRadius.circular(14),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOutCubic,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: active ? const Color(0xFFE86A35) : Colors.transparent,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    color: active ? Colors.white : const Color(0xFF5E4B42),
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    height: 1.2,
                  ),
                ),
              ),
            ),
          );
        }

        return Container(
          margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: const Color(0xFFFFFCF8),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFEADBCB)),
            boxShadow: const <BoxShadow>[
              BoxShadow(
                color: Color(0x14000000),
                blurRadius: 16,
                offset: Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            children: <Widget>[
              tabItem('Your RSVP', RsvpTabType.rsvp),
              const SizedBox(width: 6),
              tabItem('QR Code', RsvpTabType.qrCode),
              const SizedBox(width: 6),
              tabItem('Guests', RsvpTabType.guests),
            ],
          ),
        );
      },
    );
  }
}

