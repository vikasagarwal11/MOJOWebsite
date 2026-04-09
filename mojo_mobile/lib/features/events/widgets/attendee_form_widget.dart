import 'package:flutter/material.dart';

import '../../../core/theme/mojo_colors.dart';
import '../models/attendee_row_data.dart';
import 'attendee_row_widget.dart';

/// Container widget that renders a list of [AttendeeRowWidget]s with an
/// "Add Attendee" button and capacity-aware banners.
///
/// **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 7.2, 7.3**
class AttendeeFormWidget extends StatelessWidget {
  const AttendeeFormWidget({
    super.key,
    required this.rows,
    required this.onRowChanged,
    required this.onDeleteRow,
    required this.onAddRow,
    this.canAddMore = true,
    this.canWaitlist = false,
  });

  /// Current list of attendee rows to render.
  final List<AttendeeRowData> rows;

  /// Called when a row's data changes.
  final void Function(String localId, AttendeeRowData updated) onRowChanged;

  /// Called when the user taps delete on a row (passes localId).
  final ValueChanged<String> onDeleteRow;

  /// Called when the user taps "Add Attendee".
  final VoidCallback onAddRow;

  /// Whether more attendees can be added (capacity not reached).
  final bool canAddMore;

  /// Whether the waitlist option is available when capacity is full.
  final bool canWaitlist;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Capacity banner
        if (!canAddMore) _buildCapacityBanner(context),

        // Attendee rows
        ...rows.map((row) => AttendeeRowWidget(
              key: ValueKey(row.localId),
              data: row,
              // Prevent deletion of the last remaining row (Req 1.4)
              canDelete: rows.length > 1,
              onChanged: (updated) => onRowChanged(row.localId, updated),
              onDelete: () => onDeleteRow(row.localId),
            )),

        const SizedBox(height: 8),

        // Add Attendee / Join Waitlist button
        if (canAddMore)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: OutlinedButton.icon(
              onPressed: onAddRow,
              icon: const Icon(Icons.person_add_alt_1, size: 18),
              label: const Text('Add Attendee'),
              style: OutlinedButton.styleFrom(
                foregroundColor: MojoColors.primaryOrange,
                side: const BorderSide(color: MojoColors.primaryOrange),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
          )
        else if (canWaitlist)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: OutlinedButton.icon(
              onPressed: onAddRow,
              icon: const Icon(Icons.hourglass_top, size: 18),
              label: const Text('Join Waitlist'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.amber.shade800,
                side: BorderSide(color: Colors.amber.shade800),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildCapacityBanner(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.red.shade200),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline, size: 18, color: Colors.red.shade700),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              canWaitlist
                  ? 'Event is full. You can join the waitlist.'
                  : 'Event is full. No more spots available.',
              style: TextStyle(
                fontSize: 13,
                color: Colors.red.shade700,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
