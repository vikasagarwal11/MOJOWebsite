import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:lottie/lottie.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/theme/mojo_colors.dart';
import 'onboarding_gate_screen.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  final List<OnboardingData> _pages = [
    OnboardingData(
      title: "Welcome to MOJO",
      subtitle: "The ultimate community for fit moms. Better than WhatsApp, designed for your journey.",
      // Remote Lottie URLs often 403 from CDNs; local assets preferred — see [_OnboardingHero].
      lottieUrl: "https://assets10.lottiefiles.com/packages/lf20_5njpXv.json",
      fallbackIcon: FontAwesomeIcons.heartPulse,
    ),
    OnboardingData(
      title: "AI Smart Catch-Up",
      subtitle: "Never miss a beat. Our AI summarizes community chats so you stay informed in seconds.",
      lottieUrl: "https://assets3.lottiefiles.com/packages/lf20_m9ubp99u.json",
      fallbackIcon: FontAwesomeIcons.wandMagicSparkles,
    ),
    OnboardingData(
      title: 'Events & community',
      subtitle:
          'RSVP to workouts, share photos and stories, and celebrate together — with moderation and privacy built for moms.',
      lottieUrl: 'https://assets9.lottiefiles.com/packages/lf20_qpwb7iio.json',
      fallbackIcon: FontAwesomeIcons.calendarCheck,
    ),
  ];

  Future<void> _finishOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(kOnboardingDoneKey, true);
    if (!mounted) return;
    context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            PageView.builder(
              controller: _pageController,
              onPageChanged: (index) => setState(() => _currentPage = index),
              itemCount: _pages.length,
              itemBuilder: (context, index) => _OnboardingPage(data: _pages[index]),
            ),
            Positioned(
              left: 20,
              right: 20,
              bottom: 12,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(
                      _pages.length,
                      (index) => Container(
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        width: _currentPage == index ? 24 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: _currentPage == index ? MojoColors.primaryOrange : Colors.grey.shade300,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: () async {
                      if (_currentPage < _pages.length - 1) {
                        _pageController.nextPage(duration: 400.ms, curve: Curves.easeOut);
                      } else {
                        await _finishOnboarding();
                      }
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: MojoColors.primaryOrange,
                      foregroundColor: Colors.white,
                      minimumSize: const Size(double.infinity, 56),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: Text(_currentPage == _pages.length - 1 ? "Get Started" : "Continue"),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: _finishOnboarding,
                    style: TextButton.styleFrom(
                      minimumSize: const Size(double.infinity, 48),
                      foregroundColor: MojoColors.primaryOrange,
                    ),
                    child: const Text(
                      'Skip for now',
                      style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Tries network Lottie; on 403/offline shows a branded icon (remote LottieFiles URLs are unreliable).
class _OnboardingHero extends StatelessWidget {
  const _OnboardingHero({required this.data});

  final OnboardingData data;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 300,
      child: Lottie.network(
        data.lottieUrl,
        fit: BoxFit.contain,
        errorBuilder: (context, error, stackTrace) {
          return _FallbackHero(icon: data.fallbackIcon);
        },
      ),
    );
  }
}

class _FallbackHero extends StatelessWidget {
  const _FallbackHero({required this.icon});

  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        padding: const EdgeInsets.all(36),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: LinearGradient(
            colors: [
              MojoColors.primaryOrange.withValues(alpha: 0.25),
              MojoColors.primaryPurple.withValues(alpha: 0.2),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: FaIcon(icon, size: 88, color: MojoColors.primaryOrange),
      ),
    );
  }
}

class OnboardingData {
  final String title;
  final String subtitle;
  final String lottieUrl;
  final IconData fallbackIcon;
  OnboardingData({
    required this.title,
    required this.subtitle,
    required this.lottieUrl,
    required this.fallbackIcon,
  });
}

class _OnboardingPage extends StatelessWidget {
  final OnboardingData data;
  const _OnboardingPage({required this.data});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(40.0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          _OnboardingHero(data: data),
          const SizedBox(height: 40),
          Text(
            data.title,
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
            textAlign: TextAlign.center,
          ).animate().fadeIn().slideY(begin: 0.2, end: 0),
          const SizedBox(height: 16),
          Text(
            data.subtitle,
            style: const TextStyle(fontSize: 16, color: Colors.grey),
            textAlign: TextAlign.center,
          ).animate().fadeIn(delay: 200.ms),
        ],
      ),
    );
  }
}
