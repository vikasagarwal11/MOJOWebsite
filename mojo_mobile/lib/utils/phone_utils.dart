/// US phone normalization to E.164 (+1XXXXXXXXXX), aligned with web [normalizeUSPhoneToE164OrNull].
String? normalizeUSPhoneToE164OrNull(String input) {
  try {
    return normalizeUSPhoneToE164(input);
  } catch (_) {
    return null;
  }
}

String normalizeUSPhoneToE164(String input) {
  final raw = input.trim();
  if (raw.isEmpty) {
    throw ArgumentError('Please enter your phone number.');
  }

  if (raw.startsWith('+')) {
    final cleaned = raw.replaceAll(RegExp(r'[^\d+]'), '');
    if (!RegExp(r'^\+[1-9]\d{6,14}$').hasMatch(cleaned)) {
      throw ArgumentError('Please enter a valid phone number.');
    }
    return cleaned;
  }

  final digits = raw.replaceAll(RegExp(r'\D'), '');

  if (digits.length == 11 && digits.startsWith('1')) {
    final national = digits.substring(1);
    if (!_isValidUSNationalNumber(national)) {
      throw ArgumentError('Please enter a valid US number (e.g., 212 555 0123).');
    }
    return '+$digits';
  }

  if (digits.length == 10) {
    if (!_isValidUSNationalNumber(digits)) {
      throw ArgumentError('Please enter a valid US number (e.g., 212 555 0123).');
    }
    return '+1$digits';
  }

  throw ArgumentError('Include a 10-digit US number (e.g., 212 555 0123).');
}

bool _isValidUSNationalNumber(String national10) {
  return RegExp(r'^[2-9]\d{2}[2-9]\d{6}$').hasMatch(national10);
}
