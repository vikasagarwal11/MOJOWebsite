import 'package:logger/logger.dart';

/// App-wide logger. Prefer this over [print].
final appLogger = Logger(
  printer: PrettyPrinter(methodCount: 0, errorMethodCount: 5, lineLength: 80),
  level: Level.debug,
);
