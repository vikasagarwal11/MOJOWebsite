import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/mojo_colors.dart';
import '../services/guest_rsvp_service.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

/// Modal for guest phone OTP verification.
///
/// Displays the phone number (read-only), a "Send OTP" button, and after
/// sending, a 6-digit pin-style input for verification. On success the
/// [onVerified] callback receives the session token.
///
/// **Validates: Requirements 5.2, 5.3, 5.6**
class OtpVerificationModal extends StatefulWidget {
  const OtpVerificationModal({
    super.key,
    required this.phoneNumber,
    required this.eventId,
    required this.onVerified,
    required this.onCancel,
    this.onMemberExists,
    this.firstName = 'Guest',
    this.lastName = '',
    this.email = '',
  });

  final String phoneNumber;
  final String eventId;
  final ValueChanged<String> onVerified;
  final VoidCallback onCancel;
  final VoidCallback? onMemberExists;
  final String firstName;
  final String lastName;
  final String email;

  @override
  State<OtpVerificationModal> createState() => _OtpVerificationModalState();
}

class _OtpVerificationModalState extends State<OtpVerificationModal> {
  final List<TextEditingController> _controllers =
      List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _focusNodes = List.generate(6, (_) => FocusNode());

  late final GuestRsvpService _service;

  bool _otpSent = false;
  bool _isSending = false;
  bool _isVerifying = false;
  bool _autoSendTriggered = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _service = GuestRsvpService(
      FirebaseFunctions.instanceFor(region: 'us-east1'),
    );

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _autoSendTriggered) return;
      _autoSendTriggered = true;
      _sendOtp();
    });
  }

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  String get _otpCode => _controllers.map((c) => c.text).join();

  Future<void> _sendOtp() async {
    debugPrint('ðŸ“± [OTP] _sendOtp called');
    debugPrint('ðŸ“± [OTP] phone: ${widget.phoneNumber}');
    debugPrint('ðŸ“± [OTP] firstName: ${widget.firstName}');
    debugPrint('ðŸ“± [OTP] eventId: ${widget.eventId}');
    setState(() {
      _isSending = true;
      _error = null;
    });

    try {
      await _service.sendOtp(
        phoneNumber: widget.phoneNumber,
        firstName: widget.firstName,
        eventId: widget.eventId,
      );
      debugPrint('ðŸ“± [OTP] sendOtp SUCCESS â€” OTP sent');
      if (mounted) {
        setState(() {
          _otpSent = true;
          _isSending = false;
        });
        _focusNodes.first.requestFocus();
      }
    } catch (e) {
      debugPrint('ðŸ“± [OTP] sendOtp FAILED: $e');
      if (mounted) {
        setState(() {
          _isSending = false;
          _error = _friendlyError(e);
        });
      }
    }
  }

  Future<void> _verifyOtp() async {
    final code = _otpCode;
    if (code.length != 6) return;

    setState(() {
      _isVerifying = true;
      _error = null;
    });

    try {
      final token = await _service.verifyOtp(
        phoneNumber: widget.phoneNumber,
        code: code,
        eventId: widget.eventId,
        firstName: widget.firstName,
        lastName: widget.lastName,
        email: widget.email,
      );
      if (mounted) widget.onVerified(token);
    } catch (e) {
      if (mounted) {
        final msg = _friendlyError(e);
        if (msg.toLowerCase().contains('member') &&
            widget.onMemberExists != null) {
          widget.onMemberExists!();
          return;
        }
        setState(() {
          _isVerifying = false;
          _error = msg;
        });
      }
    }
  }

  String _friendlyError(Object e) {
    if (e is FirebaseFunctionsException) {
      final msg = e.message ?? '';
      if (msg.contains('expired'))
        return 'Session expired. Please resend the code.';
      if (msg.contains('invalid') || msg.contains('wrong')) {
        return 'Invalid code. Please try again.';
      }
      if (msg.contains('memberExists') || msg.contains('member')) {
        return 'You are already a member. Please log in instead.';
      }
      if (msg.contains('Twilio configuration not found')) {
        return 'OTP service is not configured yet. Please contact support.';
      }
      if (msg.contains('rate_limit_exceeded')) {
        return 'Too many attempts. Please wait and try again.';
      }
      if (msg.contains('invalid_phone')) {
        return 'Invalid phone number format. Use +1XXXXXXXXXX.';
      }
      return msg.isNotEmpty ? msg : 'Verification failed. Please try again.';
    }
    final raw = e.toString();
    if (raw.contains('Too many attempts') ||
        raw.contains('rate_limit_exceeded')) {
      return 'Too many attempts. Please wait a few minutes and try again.';
    }
    if (raw.contains('Twilio configuration not found')) {
      return 'OTP service is not configured yet. Please contact support.';
    }
    if (raw.contains('invalid_phone')) {
      return 'Invalid phone number format. Use +1XXXXXXXXXX.';
    }
    if (raw.contains('invalid_code')) {
      return 'Invalid code. Please try again.';
    }
    if (raw.contains('expired_code')) {
      return 'Code expired. Tap Resend Code.';
    }
    if (raw.contains('service_unavailable')) {
      return 'OTP service unavailable right now. Please try again in a moment.';
    }
    return 'Something went wrong. Please try again.';
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          24,
          16,
          24,
          24 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Drag handle
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),

              const Text(
                'Verify Phone Number',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: MojoColors.textPrimary,
                ),
              ),
              const SizedBox(height: 16),

              // Phone number display (read-only)
              Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.phone,
                        size: 18, color: MojoColors.textSecondary),
                    const SizedBox(width: 10),
                    Text(
                      widget.phoneNumber,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        color: MojoColors.textPrimary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Error message
              if (_error != null) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red.shade200),
                  ),
                  child: Text(
                    _error!,
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.red.shade700,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
              ],

              // Send OTP button (before code is sent)
              if (!_otpSent) ...[
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _isSending ? null : _sendOtp,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: MojoColors.primaryOrange,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    child: _isSending
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: AppLoadingIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Send OTP'),
                  ),
                ),
              ],

              // OTP input (after code is sent)
              if (_otpSent) ...[
                const Text(
                  'Enter the 6-digit code sent to your phone',
                  style: TextStyle(
                    fontSize: 13,
                    color: MojoColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 16),

                // Pin-style boxes
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(6, (i) => _buildPinBox(i)),
                ),
                const SizedBox(height: 8),

                // Resend link
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: _isSending ? null : _sendOtp,
                    child: Text(
                      'Resend Code',
                      style: TextStyle(
                        fontSize: 13,
                        color: MojoColors.primaryOrange,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // Verify button
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: (_isVerifying || _otpCode.length != 6)
                        ? null
                        : _verifyOtp,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: MojoColors.primaryOrange,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    child: _isVerifying
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: AppLoadingIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Verify'),
                  ),
                ),
              ],

              const SizedBox(height: 10),

              // Cancel button
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: widget.onCancel,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: MojoColors.textSecondary,
                    side: BorderSide(color: Colors.grey.shade300),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: const Text('Cancel'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPinBox(int index) {
    return Container(
      width: 44,
      height: 52,
      margin: const EdgeInsets.symmetric(horizontal: 4),
      child: TextField(
        controller: _controllers[index],
        focusNode: _focusNodes[index],
        textAlign: TextAlign.center,
        keyboardType: TextInputType.number,
        maxLength: 1,
        style: const TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.bold,
          color: MojoColors.textPrimary,
        ),
        decoration: InputDecoration(
          counterText: '',
          contentPadding: const EdgeInsets.symmetric(vertical: 12),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: BorderSide(color: Colors.grey.shade300),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(
              color: MojoColors.primaryOrange,
              width: 2,
            ),
          ),
        ),
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        onChanged: (value) {
          if (value.isNotEmpty && index < 5) {
            _focusNodes[index + 1].requestFocus();
          } else if (value.isEmpty && index > 0) {
            _focusNodes[index - 1].requestFocus();
          }
          // Trigger rebuild to update verify button state
          setState(() {});
        },
      ),
    );
  }
}

/// Convenience function to show the [OtpVerificationModal] as a modal bottom sheet.
Future<void> showOtpVerificationModal(
  BuildContext context, {
  required String phoneNumber,
  required String eventId,
  required ValueChanged<String> onVerified,
  String firstName = 'Guest',
  VoidCallback? onMemberExists,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => OtpVerificationModal(
      phoneNumber: phoneNumber,
      firstName: firstName,
      eventId: eventId,
      onVerified: (token) {
        Navigator.of(context).pop();
        onVerified(token);
      },
      onCancel: () => Navigator.of(context).pop(),
      onMemberExists: onMemberExists != null
          ? () {
              Navigator.of(context).pop();
              onMemberExists();
            }
          : null,
    ),
  );
}






