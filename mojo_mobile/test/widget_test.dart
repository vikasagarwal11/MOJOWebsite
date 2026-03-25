import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:network_image_mock/network_image_mock.dart';

import 'package:mojo_mobile/main.dart';

void main() {
  testWidgets('MojoApp shows home', (WidgetTester tester) async {
    mockNetworkImagesFor(() async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MojoApp(),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Mojo Dashboard'), findsOneWidget);
    });
  });
}
