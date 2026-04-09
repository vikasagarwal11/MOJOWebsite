import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/logging/app_logger.dart' show appLogger;
import 'core/architecture/bloc/app_bloc_observer.dart';
import 'core/providers/core_providers.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/branding/platform_branding.dart';
import 'core/services/push_notification_service.dart';
import 'core/widgets/fcm_bootstrap.dart';
import 'firebase_options.dart';

import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

Future<void> _loadAppEnv() async {
  final appEnv = const String.fromEnvironment('APP_ENV', defaultValue: 'dev')
      .trim()
      .toLowerCase();
  final isProd = appEnv == 'prod' || appEnv == 'production';
  final envFile = isProd ? '.env.production' : '.env';

  try {
    await dotenv.load(fileName: envFile);
    appLogger.i('Loaded environment: $envFile');
  } catch (_) {
    await dotenv.load(fileName: '.env');
    appLogger.w('Could not load $envFile, fell back to .env');
  }
}

String _currentAppEnv() {
  return const String.fromEnvironment('APP_ENV', defaultValue: 'dev')
      .trim()
      .toLowerCase();
}

bool _isProdEnv(String appEnv) {
  return appEnv == 'prod' || appEnv == 'production';
}

String _resolveStripePublishableKey() {
  final appEnv = _currentAppEnv();
  final isProd = _isProdEnv(appEnv);

  final testKey = (dotenv.env['STRIPE_PUBLISHABLE_KEY_TEST'] ?? '').trim();
  final liveKey = (dotenv.env['STRIPE_PUBLISHABLE_KEY_LIVE'] ?? '').trim();
  final legacyKey = (dotenv.env['STRIPE_PUBLISHABLE_KEY'] ?? '').trim();

  var resolved = isProd
      ? (liveKey.isNotEmpty ? liveKey : legacyKey)
      : (testKey.isNotEmpty ? testKey : legacyKey);

  if (resolved.isEmpty) {
    resolved = legacyKey;
  }

  if (resolved.startsWith('pk_live_') && !isProd) {
    appLogger.w(
      'APP_ENV=$appEnv but Stripe key is LIVE. Use STRIPE_PUBLISHABLE_KEY_TEST for dev.',
    );
  }
  if (resolved.startsWith('pk_test_') && isProd) {
    appLogger.w(
      'APP_ENV=$appEnv but Stripe key is TEST. Use STRIPE_PUBLISHABLE_KEY_LIVE for prod.',
    );
  }

  return resolved;
}

void main() async {
  Bloc.observer = AppBlocObserver();
  WidgetsFlutterBinding.ensureInitialized();
  await _loadAppEnv();

  Stripe.publishableKey = _resolveStripePublishableKey();
  if (Stripe.publishableKey.isEmpty) {
    appLogger.w(
      'Stripe key is empty. Set STRIPE_PUBLISHABLE_KEY_TEST / STRIPE_PUBLISHABLE_KEY_LIVE in mobile env files.',
    );
  }
  Stripe.merchantIdentifier = 'com.mfm.mfmdev';
  // applySettings() must run after the Android Activity uses a MaterialComponents/AppCompat
  // theme (see meta-data NormalTheme). Initializing in main() runs too early - use
  // [_StripeBootstrap] after the first frame.

  if (firebaseOptionsConfigured) {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    final appEnv = const String.fromEnvironment('APP_ENV', defaultValue: 'dev')
        .trim()
        .toLowerCase();
    final useDebugAppCheck = appEnv != 'prod' && appEnv != 'production' && !kReleaseMode;

    try {
      await FirebaseAppCheck.instance.activate(
        androidProvider: useDebugAppCheck ? AndroidProvider.debug : AndroidProvider.playIntegrity,
        appleProvider: useDebugAppCheck ? AppleProvider.debug : AppleProvider.appAttest,
      );
      if (useDebugAppCheck) {
        try {
          await FirebaseAppCheck.instance.getToken();
          appLogger.d(
            'App Check: debug token obtained. If Firestore shows permission-denied, copy the '
            'debug secret from logcat (FirebaseAppCheck / LocalDebugAppCheckProvider) into '
            'Firebase Console -> App Check -> Android app -> Manage debug tokens, or set '
            'Firestore to Monitoring (not Enforce) for dev.',
          );
        } catch (e, st) {
          appLogger.w(
            'App Check getToken failed after activate - Firestore requests may be denied until '
            'the debug token is registered or enforcement is off.',
            error: e,
            stackTrace: st,
          );
        }
      }
    } catch (e, st) {
      appLogger.w(
        'Firebase App Check activate failed. If logs show 403 on firebaseappcheck.googleapis.com, enable '
        '"Firebase App Check API" for this project in Google Cloud Console -> APIs & Services. '
        'Add the debug secret from logcat to App Check debug tokens in Firebase Console.',
        error: e,
        stackTrace: st,
      );
    }
  } else {
    appLogger.w(
      'Firebase options still contain REPLACE_ME. Run `flutterfire configure` in mojo_mobile '
      'or paste keys into lib/firebase_options.dart - Firestore and Auth will not work until then.',
    );
  }

  runApp(
    const ProviderScope(
      child: _StripeBootstrap(
        child: FcmBootstrap(
          child: MojoApp(),
        ),
      ),
    ),
  );
}

/// Runs [Stripe.instance.applySettings] after first frame so Android's Activity theme
/// is Theme.MaterialComponents (fixes flutter_stripe "isn't set to use Theme.AppCompat").
class _StripeBootstrap extends StatefulWidget {
  const _StripeBootstrap({required this.child});

  final Widget child;

  @override
  State<_StripeBootstrap> createState() => _StripeBootstrapState();
}

class _StripeBootstrapState extends State<_StripeBootstrap> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        // Brief delay so Android Activity has applied NormalTheme (flutter_stripe theme check).
        await Future<void>.delayed(const Duration(milliseconds: 400));
        await Stripe.instance.applySettings();
      } catch (e, st) {
        appLogger.e(
          'Stripe initialization failed (payments may be unavailable; check publishable key and Android theme)',
          error: e,
          stackTrace: st,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class MojoApp extends ConsumerWidget {
  const MojoApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final branding = ref.watch(platformBrandingProvider);

    return branding.when(
      data: (PlatformBranding b) => MaterialApp.router(
        title: b.appDisplayName,
        debugShowCheckedModeBanner: false,
        theme: buildMojoTheme(b),
        routerConfig: router,
      ),
      loading: () => MaterialApp.router(
        title: 'MOJO',
        debugShowCheckedModeBanner: false,
        theme: buildMojoTheme(PlatformBranding.fallback),
        routerConfig: router,
      ),
      error: (Object e, StackTrace st) {
        appLogger.e('Branding stream failed', error: e, stackTrace: st);
        return MaterialApp.router(
          title: 'MOJO',
          debugShowCheckedModeBanner: false,
          theme: buildMojoTheme(PlatformBranding.fallback),
          routerConfig: router,
        );
      },
    );
  }
}
