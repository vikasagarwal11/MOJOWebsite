import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers/core_providers.dart';
import '../../../core/theme/mojo_colors.dart';
import '../../../firebase_options.dart';
import '../../../utils/phone_utils.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();

  bool _loading = false;
  _LoginStep _step = _LoginStep.phone;
  String? _verificationId;

  @override
  void dispose() {
    _phoneController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _sendVerificationCode() async {
    if (!_formKey.currentState!.validate()) return;
    if (!firebaseOptionsConfigured) {
      _showError('Firebase is not configured. Run flutterfire configure in mojo_mobile.');
      return;
    }

    final e164 = normalizeUSPhoneToE164OrNull(_phoneController.text);
    if (e164 == null) {
      _showError('Please enter a valid US number (e.g., 212 555 0123).');
      return;
    }

    setState(() => _loading = true);
    final auth = ref.read(authServiceProvider);
    try {
      final registered = await auth.checkPhoneNumberRegistered(e164);
      if (!registered) {
        _showError('This phone number is not registered. Tap Create Account to join MOJO.');
        return;
      }

      await auth.startPhoneVerification(
        e164Phone: e164,
        verificationCompleted: (credential) async {
          if (!mounted) return;
          setState(() => _loading = true);
          try {
            await auth.signInWithPhoneCredential(credential, requireUserDocument: true);
            if (!mounted) return;
            await _routeAfterSuccessfulLogin(context, ref);
          } on FirebaseAuthException catch (e) {
            _showError(e.message ?? e.code);
          } catch (e) {
            _showError(e.toString());
          } finally {
            if (mounted) setState(() => _loading = false);
          }
        },
        verificationFailed: (e) {
          if (!mounted) return;
          setState(() => _loading = false);
          _showError(_messageForPhoneAuthFailure(e));
        },
        codeSent: (verificationId, _) {
          if (!mounted) return;
          setState(() {
            _loading = false;
            _verificationId = verificationId;
            _step = _LoginStep.code;
          });
        },
      );
    } on FirebaseAuthException catch (e) {
      _showError(_messageForPhoneAuthFailure(e));
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted && _verificationId == null) {
        setState(() => _loading = false);
      }
    }
  }

  String _messageForPhoneAuthFailure(FirebaseAuthException e) {
    switch (e.code) {
      case 'invalid-phone-number':
        return 'Invalid phone number. Please check and try again.';
      case 'operation-not-allowed':
        return 'Phone sign-in is disabled. Enable it in Firebase Console → Authentication.';
      case 'too-many-requests':
        return 'Too many attempts. Please wait a minute and try again.';
      case 'network-request-failed':
        return 'Network error. Check your connection and try again.';
      default:
        return e.message ?? e.code;
    }
  }

  Future<void> _submitCode() async {
    final code = _codeController.text.trim();
    if (code.length < 6) {
      _showError('Enter the 6-digit code from your SMS.');
      return;
    }
    final vid = _verificationId;
    if (vid == null) {
      _showError('Request a new code from the previous step.');
      return;
    }
    if (!firebaseOptionsConfigured) return;

    setState(() => _loading = true);
    try {
      await ref.read(authServiceProvider).signInWithSmsCode(
            verificationId: vid,
            smsCode: code,
            requireUserDocument: true,
          );
      if (mounted) await _routeAfterSuccessfulLogin(context, ref);
    } on FirebaseAuthException catch (e) {
      if (e.code == 'user-doc-missing' || (e.message?.contains('No account found') ?? false)) {
        _showError('No account found. Tap Create Account to register.');
        setState(() {
          _step = _LoginStep.phone;
          _verificationId = null;
          _codeController.clear();
        });
      } else {
        _showError(e.message ?? e.code);
      }
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  /// Matches web: pending / needs_clarification users see `/pending-approval` instead of the shell.
  Future<void> _routeAfterSuccessfulLogin(BuildContext context, WidgetRef ref) async {
    final uid = ref.read(authStateProvider).valueOrNull?.uid;
    if (uid == null || !context.mounted) return;
    final status = await ref.read(authServiceProvider).getUserProfileStatus(uid);
    if (!context.mounted) return;
    if (status == 'pending' || status == 'needs_clarification') {
      context.go('/pending-approval');
    } else {
      context.go('/');
    }
  }

  void _backToPhone() {
    setState(() {
      _step = _LoginStep.phone;
      _verificationId = null;
      _codeController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final branding = ref.watch(platformBrandingProvider).valueOrNull;
    final displayName = branding?.appDisplayName ?? 'Mom Fitness Mojo';
    const heroTitle = 'MOJO';

    return Scaffold(
      body: Container(
        width: double.infinity,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [scheme.primary, scheme.secondary],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Column(
          children: [
            const SizedBox(height: 80),
            const Icon(Icons.fitness_center, color: Colors.white, size: 80)
                .animate()
                .scale(duration: 600.ms, curve: Curves.easeOutBack),
            const SizedBox(height: 16),
            Text(
              heroTitle,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 32,
                fontWeight: FontWeight.bold,
                letterSpacing: 4,
              ),
            ).animate().fadeIn(delay: 300.ms),
            Text(
              displayName,
              style: const TextStyle(color: Colors.white70, fontSize: 16),
            ).animate().fadeIn(delay: 500.ms),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(40)),
              ),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      _step == _LoginStep.phone ? 'Welcome Back' : 'Enter code',
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: MojoColors.textPrimary,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _step == _LoginStep.phone
                          ? 'Sign in with the same phone number you used on the website.'
                          : 'We sent a verification code to your phone.',
                      style: TextStyle(fontSize: 14, color: scheme.onSurfaceVariant),
                      textAlign: TextAlign.center,
                    ),
                    if (!firebaseOptionsConfigured) ...[
                      const SizedBox(height: 12),
                      Text(
                        'Configure Firebase (flutterfire configure) to enable sign-in.',
                        style: TextStyle(fontSize: 12, color: scheme.error),
                        textAlign: TextAlign.center,
                      ),
                    ],
                    const SizedBox(height: 24),
                    if (_step == _LoginStep.phone) ...[
                      TextFormField(
                        controller: _phoneController,
                        keyboardType: TextInputType.phone,
                        autocorrect: false,
                        decoration: InputDecoration(
                          hintText: 'US mobile number',
                          prefixIcon: const Icon(Icons.phone_outlined),
                          filled: true,
                          fillColor: Colors.grey.shade50,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide.none,
                          ),
                        ),
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) return 'Enter your phone number';
                          if (normalizeUSPhoneToE164OrNull(v) == null) {
                            return 'Use a valid US number (e.g., 212 555 0123)';
                          }
                          return null;
                        },
                      ),
                    ] else ...[
                      TextFormField(
                        controller: _codeController,
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        autocorrect: false,
                        decoration: InputDecoration(
                          hintText: '6-digit code',
                          counterText: '',
                          prefixIcon: const Icon(Icons.sms_outlined),
                          filled: true,
                          fillColor: Colors.grey.shade50,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide.none,
                          ),
                        ),
                      ),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          onPressed: _loading ? null : _backToPhone,
                          child: Text('Change number', style: TextStyle(color: scheme.primary)),
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    if (_step == _LoginStep.phone)
                      Text(
                        'By signing in, I consent to receive SMS and call notifications for verification, login, and account updates at this phone number.',
                        style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                        textAlign: TextAlign.center,
                      ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _loading
                          ? null
                          : () {
                              if (_step == _LoginStep.phone) {
                                _sendVerificationCode();
                              } else {
                                _submitCode();
                              }
                            },
                      style: FilledButton.styleFrom(
                        backgroundColor: scheme.primary,
                        foregroundColor: scheme.onPrimary,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      child: _loading
                          ? const SizedBox(
                              height: 22,
                              width: 22,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : Text(
                              _step == _LoginStep.phone ? 'Send code' : 'Verify & sign in',
                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text('Don\'t have an account? ', style: TextStyle(color: scheme.onSurfaceVariant)),
                        TextButton(
                          onPressed: _loading ? null : () => context.push('/register'),
                          style: TextButton.styleFrom(
                            padding: EdgeInsets.zero,
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          child: const Text('Create Account', style: TextStyle(fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _loading ? null : () => context.go('/'),
                      child: const Text('Continue without signing in'),
                    ),
                  ],
                ),
              ),
            ).animate().slideY(begin: 1.0, end: 0, duration: 800.ms, curve: Curves.easeOutCubic),
          ],
        ),
      ),
    );
  }
}

enum _LoginStep { phone, code }
