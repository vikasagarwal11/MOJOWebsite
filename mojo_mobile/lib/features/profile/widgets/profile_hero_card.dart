import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/mojo_colors.dart';

/// Gradient hero card displaying avatar, name, email, role badge, and member-since date.
class ProfileHeroCard extends StatelessWidget {
  const ProfileHeroCard({
    super.key,
    required this.photoUrl,
    required this.displayName,
    required this.email,
    this.role,
    this.memberSince,
    required this.uploading,
    required this.onEditPhoto,
  });

  final String? photoUrl;
  final String displayName;
  final String email;
  final String? role;
  final DateTime? memberSince;
  final bool uploading;
  final VoidCallback onEditPhoto;

  @override
  Widget build(BuildContext context) {
    final hasPhoto = photoUrl != null && photoUrl!.isNotEmpty;
    final initial = displayName.isNotEmpty ? displayName[0].toUpperCase() : '?';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 28),
      decoration: BoxDecoration(
        gradient: MojoColors.mainGradient,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: MojoColors.primaryOrange.withValues(alpha: 0.3),
            blurRadius: 15,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        children: [
          // Avatar with camera edit overlay
          Stack(
            clipBehavior: Clip.none,
            children: [
              CircleAvatar(
                radius: 48,
                backgroundColor: Colors.white.withValues(alpha: 0.3),
                backgroundImage:
                    hasPhoto ? CachedNetworkImageProvider(photoUrl!) : null,
                child: hasPhoto
                    ? null
                    : Text(
                        initial,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 32,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
              ),
              Positioned(
                right: -4,
                bottom: -4,
                child: Material(
                  color: Colors.white,
                  shape: const CircleBorder(),
                  elevation: 2,
                  child: IconButton(
                    tooltip: 'Change photo',
                    iconSize: 20,
                    padding: const EdgeInsets.all(6),
                    constraints:
                        const BoxConstraints(minWidth: 36, minHeight: 36),
                    onPressed: uploading ? null : onEditPhoto,
                    icon: uploading
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(Icons.camera_alt,
                            color: MojoColors.primaryOrange),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Display name
          Text(
            displayName.isNotEmpty ? displayName : 'Mojo Member',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
            overflow: TextOverflow.ellipsis,
            maxLines: 1,
          ),

          // Email
          if (email.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              email,
              style: const TextStyle(color: Colors.white70, fontSize: 13),
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
            ),
          ],

          // Role badge
          if (role != null && role!.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                role![0].toUpperCase() + role!.substring(1),
                style: const TextStyle(color: Colors.white, fontSize: 12),
              ),
            ),
          ],

          // Member since
          if (memberSince != null) ...[
            const SizedBox(height: 8),
            Text(
              'Member since ${DateFormat('MMM yyyy').format(memberSince!)}',
              style: const TextStyle(color: Colors.white70, fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }
}
