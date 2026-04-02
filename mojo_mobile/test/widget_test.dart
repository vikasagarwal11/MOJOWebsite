import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:network_image_mock/network_image_mock.dart';

import 'package:mojo_mobile/core/branding/platform_branding.dart';
import 'package:mojo_mobile/core/providers/core_providers.dart';
import 'package:mojo_mobile/data/models/mojo_event.dart';
import 'package:mojo_mobile/data/models/mojo_post.dart';
import 'package:mojo_mobile/main.dart';

void main() {
  testWidgets('MojoApp shows home', (WidgetTester tester) async {
    mockNetworkImagesFor(() async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            platformBrandingProvider.overrideWith((ref) => Stream.value(PlatformBranding.fallback)),
            upcomingEventsProvider.overrideWith((ref) => Stream.value(const <MojoEvent>[])),
            pastEventsProvider.overrideWith((ref) => Stream.value(const <MojoEvent>[])),
            postsFeedProvider.overrideWith((ref) => Stream.value(const <MojoPost>[])),
          ],
          child: const MojoApp(),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('MOJO'), findsOneWidget);
    });
  });
}
