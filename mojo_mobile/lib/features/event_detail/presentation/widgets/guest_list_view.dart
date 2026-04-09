import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../domain/entities/attendee_entity.dart';
import 'attendee_list_tile.dart';

class GuestListView extends StatelessWidget {
  const GuestListView({super.key, required this.guests});

  final List<AttendeeEntity> guests;

  @override
  Widget build(BuildContext context) {
    if (guests.isEmpty) {
      return Container(
        margin: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        padding: const EdgeInsets.all(16),
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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.groups_rounded, color: Color(0xFFC7A892), size: 34),
            const SizedBox(height: 8),
            Text(
              'No Guest Attendees Yet',
              style: GoogleFonts.manrope(
                color: const Color(0xFF2D231F),
                fontWeight: FontWeight.w700,
                fontSize: 17,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Guests you add will appear here.',
              textAlign: TextAlign.center,
              style: GoogleFonts.plusJakartaSans(
                color: const Color(0xFF7D665A),
                fontSize: 12,
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      padding: const EdgeInsets.all(14),
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(2, 2, 2, 8),
            child: Text(
              'Guest List',
              style: GoogleFonts.manrope(
                color: const Color(0xFF2D231F),
                fontWeight: FontWeight.w700,
                fontSize: 17,
                height: 1.2,
              ),
            ),
          ),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: guests.length,
            separatorBuilder: (_, __) =>
                const Divider(color: Color(0xFFEADBCB), height: 14),
            itemBuilder: (_, i) => AttendeeListTile(attendee: guests[i]),
          ),
        ],
      ),
    );
  }
}

