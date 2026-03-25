import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/logging/app_logger.dart' show appLogger;
import 'core/providers/core_providers.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/branding/platform_branding.dart';
import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (firebaseOptionsConfigured) {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  } else {
    appLogger.w(
      'Firebase options still contain REPLACE_ME. Run `flutterfire configure` in mojo_mobile '
      'or paste keys into lib/firebase_options.dart — Firestore and Auth will not work until then.',
    );
  }

  runApp(
    const ProviderScope(
      child: MojoApp(),
    ),
  );
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
