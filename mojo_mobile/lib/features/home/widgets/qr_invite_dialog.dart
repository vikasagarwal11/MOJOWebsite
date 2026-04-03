import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../../core/theme/mojo_colors.dart';

/// Web URL must serve `/invite?ref=` (see `src/pages/InvitePage.tsx`). Override with `INVITE_WEB_BASE_URL` in `.env` for dev.
String _inviteWebBaseUrl() {
  try {
    final b = dotenv.env['INVITE_WEB_BASE_URL']?.trim();
    if (b != null && b.isNotEmpty) {
      return b.replaceAll(RegExp(r'/+$'), '');
    }
  } catch (_) {}
  return 'https://momsfitnessmojo.com';
}

class QrInviteDialog extends StatelessWidget {
  final String userId;
  final String userName;

  const QrInviteDialog({super.key, required this.userId, required this.userName});

  @override
  Widget build(BuildContext context) {
    final base = _inviteWebBaseUrl();
    final inviteUrl = '$base/invite?ref=${Uri.encodeComponent(userId)}';

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Mojo Invite QR',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'Let another mom scan this to join $userName on MOJO instantly!',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.grey, fontSize: 14),
            ),
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: MojoColors.primaryOrange.withOpacity(0.1),
                    blurRadius: 20,
                  ),
                ],
              ),
              child: QrImageView(
                data: inviteUrl,
                version: QrVersions.auto,
                size: 200.0,
                eyeStyle: const QrEyeStyle(
                  eyeShape: QrEyeShape.circle,
                  color: MojoColors.primaryOrange,
                ),
                dataModuleStyle: const QrDataModuleStyle(
                  dataModuleShape: QrDataModuleShape.circle,
                  color: MojoColors.primaryPurple,
                ),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              inviteUrl,
              style: const TextStyle(fontSize: 10, color: Colors.grey),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: inviteUrl));
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Invite link copied')),
                  );
                }
              },
              icon: const Icon(Icons.link),
              label: const Text('Copy invite link'),
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () => Navigator.pop(context),
              style: ElevatedButton.styleFrom(
                backgroundColor: MojoColors.primaryOrange,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
                minimumSize: const Size(double.infinity, 50),
              ),
              child: const Text('Close'),
            ),
          ],
        ),
      ),
    );
  }
}
