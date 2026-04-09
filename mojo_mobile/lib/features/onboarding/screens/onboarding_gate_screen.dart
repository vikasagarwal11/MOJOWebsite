import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/theme/mojo_colors.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

const String kOnboardingDoneKey = 'mojo_onboarding_done';

/// First route: sends new users to onboarding, everyone else to home tabs.
class OnboardingGateScreen extends StatefulWidget {
  const OnboardingGateScreen({super.key});

  @override
  State<OnboardingGateScreen> createState() => _OnboardingGateScreenState();
}

class _OnboardingGateScreenState extends State<OnboardingGateScreen> {
  /// User tapped Skip â€” skip onboarding carousel and go straight home.
  bool _skipped = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _decide());
  }

  /// Brief delay so Skip stays tappable before we route away.
  Future<void> _decide() async {
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!mounted || _skipped) return;
    final prefs = await SharedPreferences.getInstance();
    final done = prefs.getBool(kOnboardingDoneKey) ?? false;
    if (!mounted) return;
    if (done) {
      context.go('/');
    } else {
      context.go('/onboarding');
    }
  }

  Future<void> _onSkip() async {
    setState(() => _skipped = true);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(kOnboardingDoneKey, true);
    if (!mounted) return;
    context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(gradient: MojoColors.mainGradient),
        child: SafeArea(
          child: Stack(
            children: [
              Positioned(
                top: 8,
                right: 8,
                child: TextButton(
                  onPressed: _onSkip,
                  child: const Text(
                    'Skip',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              const Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    AppLoadingIndicator(color: Colors.white),
                    SizedBox(height: 24),
                    Text(
                      'MFM',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 6,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

