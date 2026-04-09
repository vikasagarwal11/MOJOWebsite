import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../domain/entities/attendee_entity.dart';

class AttendeeListTile extends StatelessWidget {
  const AttendeeListTile({super.key, required this.attendee, this.onRemove});

  final AttendeeEntity attendee;
  final VoidCallback? onRemove;

  static const Color _titleColor = Color(0xFF2D231F);
  static const Color _subtitleColor = Color(0xFF7D665A);

  String _initials(String value) {
    final parts = value
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList(growable: false);
    if (parts.isEmpty) return 'G';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  String _capitalizeWords(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return '';
    return trimmed
        .split(RegExp(r'\s+'))
        .map((word) =>
            word.isEmpty ? word : '${word[0].toUpperCase()}${word.substring(1)}')
        .join(' ');
  }

  Color _colorFromName(String name) {
    final hash = name.codeUnits.fold<int>(0, (sum, c) => sum + c);
    final palette = <Color>[
      const Color(0xFFEF4444),
      const Color(0xFFF59E0B),
      const Color(0xFF22C55E),
      const Color(0xFF3B82F6),
      const Color(0xFFA855F7),
    ];
    return palette[hash % palette.length].withValues(alpha: 0.75);
  }

  Color _paymentColor() {
    switch (attendee.paymentStatus) {
      case PaymentStatus.pending:
      case PaymentStatus.waitingForApproval:
        return const Color(0xFFFBBF24);
      case PaymentStatus.paid:
        return const Color(0xFF22C55E);
      case PaymentStatus.unpaid:
        return const Color(0xFFEF4444);
    }
  }

  String _paymentLabel() {
    switch (attendee.paymentStatus) {
      case PaymentStatus.pending:
        return 'Pending';
      case PaymentStatus.waitingForApproval:
        return 'Waiting';
      case PaymentStatus.paid:
        return 'Paid';
      case PaymentStatus.unpaid:
        return 'Unpaid';
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = attendee.fullName;
    final relation = _capitalizeWords(attendee.relationship);

    final tile = ListTile(
      contentPadding: EdgeInsets.zero,
      dense: true,
      leading: CircleAvatar(
        backgroundColor: _colorFromName(name),
        child: Text(
          _initials(name),
          style:
              GoogleFonts.plusJakartaSans(color: Colors.white, fontWeight: FontWeight.w700),
        ),
      ),
      title: Text(
        name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: GoogleFonts.plusJakartaSans(
          color: _titleColor,
          fontWeight: FontWeight.w700,
        ),
      ),
      subtitle: Text(
        '$relation - ${attendee.ageGroupLabel}',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: GoogleFonts.plusJakartaSans(color: _subtitleColor, height: 1.25),
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: _paymentColor().withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              _paymentLabel(),
              style: GoogleFonts.plusJakartaSans(
                color: _paymentColor(),
                fontSize: 11,
                fontWeight: FontWeight.w600,
                height: 1.2,
              ),
            ),
          ),
          if (onRemove != null) ...[
            const SizedBox(width: 4),
            GestureDetector(
              onTap: onRemove,
              child: const Icon(
                Icons.delete_outline_rounded,
                color: _subtitleColor,
                size: 20,
              ),
            ),
          ],
        ],
      ),
    );

    if (onRemove == null) return tile;

    return Dismissible(
      key: ValueKey<String>(attendee.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 16),
        decoration: BoxDecoration(
          color: const Color(0xFF7F1D1D),
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Icon(Icons.delete_outline_rounded, color: Colors.white),
      ),
      confirmDismiss: (_) async {
        onRemove?.call();
        return false;
      },
      child: tile,
    );
  }
}

