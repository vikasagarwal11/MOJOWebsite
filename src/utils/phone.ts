// src/utils/phone.ts
// Accepts US-style inputs and normalizes to E.164 (+1XXXXXXXXXX).
// Examples accepted: "2125550123", "212 555 0123", "(212) 555-0123", "1 212 555 0123", "+12125550123"

/**
 * Normalize a US phone number to E.164 (+1XXXXXXXXXX).
 * Throws on invalid input.
 */
export function normalizeUSPhoneToE164(input: string): string {
  const raw = (input || '').trim();
  if (!raw) throw new Error('Please enter your phone number.');

  // If user already typed E.164, keep it (basic sanity check)
  if (raw.startsWith('+')) {
    const cleaned = raw.replace(/[^\d+]/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(cleaned)) {
      throw new Error('Please enter a valid phone number.');
    }
    return cleaned;
  }

  const digits = raw.replace(/\D/g, '');

  // 11 digits that start with 1 → +1 + 10-digit national
  if (digits.length === 11 && digits.startsWith('1')) {
    const national = digits.slice(1);
    if (!isValidUSNationalNumber(national)) {
      throw new Error('Please enter a valid US number (e.g., 212 555 0123).');
    }
    return `+${digits}`;
  }

  // 10 digits → assume US
  if (digits.length === 10) {
    if (!isValidUSNationalNumber(digits)) {
      throw new Error('Please enter a valid US number (e.g., 212 555 0123).');
    }
    return `+1${digits}`;
  }

  throw new Error('Include a 10-digit US number (e.g., 212 555 0123).');
}

/**
 * Normalize a US phone number to E.164, but return null instead of throwing.
 * Useful for form validation flows where you don’t want exceptions.
 */
export function normalizeUSPhoneToE164OrNull(input: string): string | null {
  try {
    return normalizeUSPhoneToE164(input);
  } catch {
    return null;
  }
}

// NANP quick check: area code [2-9]xx and central office [2-9]xx
export function isValidUSNationalNumber(national10: string): boolean {
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(national10);
}
