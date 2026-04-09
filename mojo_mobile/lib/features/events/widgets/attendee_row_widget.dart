import 'package:flutter/material.dart';

import '../models/attendee_row_data.dart';
import '../models/rsvp_enums.dart';

/// A single attendee row with editable name, relationship dropdown,
/// age-group dropdown, delete button, and payment status badge.
///
/// **Validates: Requirements 1.2, 1.3, 8.1**
class AttendeeRowWidget extends StatelessWidget {
  const AttendeeRowWidget({
    super.key,
    required this.data,
    required this.canDelete,
    required this.onChanged,
    this.onDelete,
  });

  /// Current attendee data for this row.
  final AttendeeRowData data;

  /// Whether the delete button should be visible.
  final bool canDelete;

  /// Called whenever any field in this row changes.
  final ValueChanged<AttendeeRowData> onChanged;

  /// Called when the user taps the delete icon.
  final VoidCallback? onDelete;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  static const _relationshipLabels = {
    Relationship.self: 'Self',
    Relationship.spouse: 'Spouse',
    Relationship.child: 'Child',
    Relationship.guest: 'Guest',
  };

  static const _ageGroupLabels = {
    AgeGroup.adult: 'Adult',
    AgeGroup.age0to2: '0-2',
    AgeGroup.age3to5: '3-5',
    AgeGroup.age6to10: '6-10',
    AgeGroup.age11plus: '11+',
  };

  Widget _paymentBadge() {
    final Color bgColor;
    final Color textColor;
    final String label;

    switch (data.paymentStatus) {
      case 'paid':
        bgColor = Colors.green.shade50;
        textColor = Colors.green.shade700;
        label = 'Paid';
      case 'waiting_for_approval':
        bgColor = Colors.amber.shade50;
        textColor = Colors.amber.shade800;
        label = 'Waiting';
      default: // 'unpaid' or anything else
        bgColor = Colors.red.shade50;
        textColor = Colors.red.shade700;
        label = 'Unpaid';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: textColor,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top row: name field + payment badge + delete
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    initialValue: data.name,
                    decoration: const InputDecoration(
                      hintText: 'Attendee name',
                      isDense: true,
                      border: OutlineInputBorder(),
                      contentPadding:
                          EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                    onChanged: (value) => onChanged(data.copyWith(name: value)),
                  ),
                ),
                const SizedBox(width: 8),
                _paymentBadge(),
                if (canDelete) ...[
                  const SizedBox(width: 4),
                  IconButton(
                    icon: Icon(Icons.delete_outline,
                        color: Colors.red.shade400, size: 20),
                    onPressed: onDelete,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    tooltip: 'Remove attendee',
                  ),
                ],
              ],
            ),

            const SizedBox(height: 8),

            // Bottom row: relationship + age group dropdowns
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<Relationship>(
                    value: data.relationship,
                    isDense: true,
                    decoration: const InputDecoration(
                      labelText: 'Relationship',
                      isDense: true,
                      border: OutlineInputBorder(),
                      contentPadding:
                          EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                    items: Relationship.values
                        .map((r) => DropdownMenuItem(
                              value: r,
                              child: Text(
                                _relationshipLabels[r]!,
                                style: const TextStyle(fontSize: 13),
                              ),
                            ))
                        .toList(),
                    onChanged: (value) {
                      if (value != null) {
                        onChanged(data.copyWith(relationship: value));
                      }
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DropdownButtonFormField<AgeGroup>(
                    value: data.ageGroup,
                    isDense: true,
                    decoration: const InputDecoration(
                      labelText: 'Age Group',
                      isDense: true,
                      border: OutlineInputBorder(),
                      contentPadding:
                          EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                    items: AgeGroup.values
                        .map((a) => DropdownMenuItem(
                              value: a,
                              child: Text(
                                _ageGroupLabels[a]!,
                                style: const TextStyle(fontSize: 13),
                              ),
                            ))
                        .toList(),
                    onChanged: (value) {
                      if (value != null) {
                        onChanged(data.copyWith(ageGroup: value));
                      }
                    },
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
