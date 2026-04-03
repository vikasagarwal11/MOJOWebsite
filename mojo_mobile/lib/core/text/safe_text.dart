String sanitizeUtf16(String? value, {String fallback = ''}) {
  if (value == null || value.isEmpty) return fallback;

  final units = value.codeUnits;
  final buffer = StringBuffer();

  for (var i = 0; i < units.length; i++) {
    final current = units[i];
    final isHighSurrogate = current >= 0xD800 && current <= 0xDBFF;
    final isLowSurrogate = current >= 0xDC00 && current <= 0xDFFF;

    if (isHighSurrogate) {
      if (i + 1 < units.length) {
        final next = units[i + 1];
        final nextIsLowSurrogate = next >= 0xDC00 && next <= 0xDFFF;
        if (nextIsLowSurrogate) {
          buffer.writeCharCode(current);
          buffer.writeCharCode(next);
          i++;
        }
      }
      continue;
    }

    if (isLowSurrogate) {
      continue;
    }

    buffer.writeCharCode(current);
  }

  return buffer.toString();
}

List<String> sanitizeUtf16List(Iterable<dynamic>? values) {
  if (values == null) return const [];
  return values
      .map((value) => sanitizeUtf16(value?.toString()))
      .where((value) => value.isNotEmpty)
      .toList();
}
