import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers/core_providers.dart';
import '../../../firebase_options.dart';
import '../../../utils/phone_utils.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';
import 'package:mojo_mobile/core/widgets/app_notice.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

enum _RegisterStep { phone, code, additional }

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _phoneFormKey = GlobalKey<FormState>();
  final _codeFormKey = GlobalKey<FormState>();
  final _additionalFormKey = GlobalKey<FormState>();

  // State
  _RegisterStep _step = _RegisterStep.phone;
  bool _loading = false;
  String? _verificationId;
  UserCredential? _verifiedCredential;

  // Controllers - Phase 1
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _phoneController = TextEditingController();
  bool _smsConsent = false;

  // Controllers - Phase 2
  final _codeController = TextEditingController();

  // Controllers - Phase 3
  final _emailController = TextEditingController();
  final _locationController = TextEditingController();
  final _howDidYouHearController = TextEditingController();
  String _howDidYouHear = 'facebook'; // Default dropdown

  static const _hearOptions = [
    'facebook',
    'instagram',
    'tiktok',
    'referred_by_member',
    'friend',
    'family',
    'google_search',
    'other'
  ];

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _phoneController.dispose();
    _codeController.dispose();
    _emailController.dispose();
    _locationController.dispose();
    _howDidYouHearController.dispose();
    super.dispose();
  }

  void _showError(String message) {
    AppNotice.error(context, message);
  }

  Future<void> _sendVerificationCode() async {
    if (!_phoneFormKey.currentState!.validate()) return;
    if (!_smsConsent) {
      _showError('You must consent to SMS notifications to register.');
      return;
    }
    if (!firebaseOptionsConfigured) {
      _showError('Firebase is not configured.');
      return;
    }

    final e164 = normalizeUSPhoneToE164OrNull(_phoneController.text);
    if (e164 == null) {
      _showError('Please enter a valid US number.');
      return;
    }

    setState(() => _loading = true);
    final auth = ref.read(authServiceProvider);

    try {
      // 1. Check if user already exists
      final registered = await auth.checkPhoneNumberRegistered(e164);
      if (registered) {
        _showError(
            'This phone number is already registered. Please sign in instead.');
        setState(() => _loading = false);
        return;
      }

      // 2. Start Phone Verification
      await auth.startPhoneVerification(
        e164Phone: e164,
        verificationCompleted: (credential) async {
          if (!mounted) return;
          setState(() {
            _loading = true;
            _verifiedCredential = null; // Auto-resolution
          });
          try {
            // Note: We bypass `requireUserDocument` because we are creating a new one soon.
            final result = await auth.signInWithPhoneCredential(credential,
                requireUserDocument: false);
            if (mounted) {
              setState(() {
                _verifiedCredential = result;
                _step = _RegisterStep.additional;
              });
            }
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
          _showError(e.message ?? e.code);
        },
        codeSent: (verificationId, _) {
          if (!mounted) return;
          setState(() {
            _loading = false;
            _verificationId = verificationId;
            _step = _RegisterStep.code;
          });
        },
      );
    } catch (e) {
      _showError(e.toString());
      setState(() => _loading = false);
    }
  }

  Future<void> _submitCode() async {
    if (!_codeFormKey.currentState!.validate()) return;
    final code = _codeController.text.trim();
    if (code.length < 6) return;

    final vid = _verificationId;
    if (vid == null) return;

    setState(() => _loading = true);
    try {
      final credential = await ref.read(authServiceProvider).signInWithSmsCode(
            verificationId: vid,
            smsCode: code,
            requireUserDocument: false, // Don't check for standard user yet
          );

      setState(() {
        _verifiedCredential = credential;
        _step = _RegisterStep.additional;
      });
    } on FirebaseAuthException catch (e) {
      _showError(e.message ?? e.code);
    } catch (e) {
      _showError(e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submitAdditionalInfo() async {
    if (!_additionalFormKey.currentState!.validate()) return;

    final cred = _verifiedCredential;
    if (cred == null || cred.user == null) {
      _showError('Session lost. Please try again.');
      setState(() => _step = _RegisterStep.phone);
      return;
    }

    setState(() => _loading = true);
    try {
      final e164 = normalizeUSPhoneToE164OrNull(_phoneController.text)!;

      // Hit the new Native `createPendingUser` in AuthService
      await ref.read(authServiceProvider).createPendingUser(
            userId: cred.user!.uid,
            firstName: _firstNameController.text.trim(),
            lastName: _lastNameController.text.trim(),
            email: _emailController.text.trim(),
            phoneNumber: e164,
            location: _locationController.text.trim(),
            howDidYouHear: _howDidYouHear,
            howDidYouHearOther: _howDidYouHear == 'other'
                ? _howDidYouHearController.text.trim()
                : null,
          );

      // Registration successful -> Navigate to Pending Approval explicitly
      if (mounted) context.go('/pending-approval');
    } catch (e) {
      _showError('Registration failed: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        title: const Text('Join Our Community',
            style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: scheme.surface,
        elevation: 0,
        foregroundColor: scheme.onSurface,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              _step == _RegisterStep.phone
                  ? 'Create your account to start your fitness journey'
                  : _step == _RegisterStep.code
                      ? 'Enter the verification code sent to your phone'
                      : 'Tell us a bit more about yourself',
              style: TextStyle(fontSize: 16, color: scheme.onSurfaceVariant),
              textAlign: TextAlign.center,
            ).animate().fadeIn(),
            const SizedBox(height: 32),

            // Step 1: Phone & Basic Info
            if (_step == _RegisterStep.phone)
              Form(
                key: _phoneFormKey,
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _firstNameController,
                            decoration: InputDecoration(
                              labelText: 'First Name',
                              prefixIcon: const Icon(Icons.person_outline),
                              border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(16)),
                            ),
                            validator: (v) =>
                                v?.trim().isEmpty == true ? 'Required' : null,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: TextFormField(
                            controller: _lastNameController,
                            decoration: InputDecoration(
                              labelText: 'Last Name',
                              prefixIcon: const Icon(Icons.person_outline),
                              border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(16)),
                            ),
                            validator: (v) =>
                                v?.trim().isEmpty == true ? 'Required' : null,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _phoneController,
                      keyboardType: TextInputType.phone,
                      decoration: InputDecoration(
                        labelText: 'Phone Number',
                        hintText: 'e.g., 5551234567',
                        prefixIcon: const Icon(Icons.phone_outlined),
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16)),
                      ),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty)
                          return 'Enter your phone number';
                        if (normalizeUSPhoneToE164OrNull(v) == null)
                          return 'Must be a valid US number';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    Card(
                      elevation: 0,
                      color: scheme.primary.withValues(alpha: 0.05),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                      child: CheckboxListTile(
                        title: Text(
                          'I consent to receive SMS and call notifications for verification, login, Event and account updates at this phone number.',
                          style: TextStyle(
                              fontSize: 12, color: scheme.onSurfaceVariant),
                        ),
                        value: _smsConsent,
                        onChanged: (val) =>
                            setState(() => _smsConsent = val ?? false),
                        controlAffinity: ListTileControlAffinity.leading,
                        activeColor: scheme.primary,
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                      ),
                    ),
                    const SizedBox(height: 32),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _loading ? null : _sendVerificationCode,
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16)),
                        ),
                        child: _loading
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: AppLoadingIndicator(
                                    color: Colors.white, strokeWidth: 2))
                            : const Text('Send Verification Code',
                                style: TextStyle(
                                    fontSize: 16, fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ],
                ),
              ).animate().slideX(begin: 1.0, end: 0, duration: 400.ms),

            // Step 2: Code
            if (_step == _RegisterStep.code)
              Form(
                key: _codeFormKey,
                child: Column(
                  children: [
                    TextFormField(
                      controller: _codeController,
                      keyboardType: TextInputType.number,
                      textAlign: TextAlign.center,
                      maxLength: 6,
                      style: const TextStyle(
                          fontSize: 24,
                          letterSpacing: 8,
                          fontWeight: FontWeight.bold),
                      decoration: InputDecoration(
                        counterText: '',
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16)),
                        contentPadding:
                            const EdgeInsets.symmetric(vertical: 24),
                      ),
                      validator: (v) => v?.length != 6 ? 'Required' : null,
                    ),
                    const SizedBox(height: 32),
                    Row(
                      children: [
                        Expanded(
                          flex: 1,
                          child: TextButton(
                            onPressed: _loading
                                ? null
                                : () =>
                                    setState(() => _step = _RegisterStep.phone),
                            child: const Text('Back'),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          flex: 2,
                          child: FilledButton(
                            onPressed: _loading ? null : _submitCode,
                            style: FilledButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16)),
                            ),
                            child: _loading
                                ? const SizedBox(
                                    height: 20,
                                    width: 20,
                                    child: AppLoadingIndicator(
                                        color: Colors.white, strokeWidth: 2))
                                : const Text('Verify',
                                    style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold)),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ).animate().slideX(begin: 1.0, end: 0, duration: 400.ms),

            // Step 3: Additional Info
            if (_step == _RegisterStep.additional)
              Form(
                key: _additionalFormKey,
                child: Column(
                  children: [
                    TextFormField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      decoration: InputDecoration(
                        labelText: 'Email Address *',
                        prefixIcon: const Icon(Icons.email_outlined),
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16)),
                      ),
                      validator: (v) => v == null || !v.contains('@')
                          ? 'Valid email required'
                          : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _locationController,
                      decoration: InputDecoration(
                        labelText: 'Location (City, State) *',
                        prefixIcon: const Icon(Icons.location_on_outlined),
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16)),
                      ),
                      validator: (v) =>
                          v?.trim().isEmpty == true ? 'Required' : null,
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      value: _howDidYouHear,
                      decoration: InputDecoration(
                        labelText: 'How did you hear about us? *',
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16)),
                      ),
                      items: _hearOptions
                          .map((e) => DropdownMenuItem(
                                value: e,
                                child:
                                    Text(e.replaceAll('_', ' ').toUpperCase()),
                              ))
                          .toList(),
                      onChanged: (val) =>
                          setState(() => _howDidYouHear = val ?? 'facebook'),
                    ),
                    if (_howDidYouHear == 'other') ...[
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _howDidYouHearController,
                        decoration: InputDecoration(
                          labelText: 'Please specify *',
                          border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16)),
                        ),
                        validator: (v) =>
                            v?.trim().isEmpty == true ? 'Required' : null,
                      ),
                    ],
                    const SizedBox(height: 32),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _loading ? null : _submitAdditionalInfo,
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16)),
                        ),
                        child: _loading
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: AppLoadingIndicator(
                                    color: Colors.white, strokeWidth: 2))
                            : const Text('Complete Registration',
                                style: TextStyle(
                                    fontSize: 16, fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ],
                ),
              ).animate().slideX(begin: 1.0, end: 0, duration: 400.ms),
          ],
        ),
      ),
    );
  }
}


