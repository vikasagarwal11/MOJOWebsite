export type SmsSendResult = {
  success: boolean;
  sid?: string;
  provider?: 'telnyx' | 'twilio';
  error?: string;
};

function normalizePhoneToE164OrNull(input: string): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;

  if (raw.startsWith('+')) {
    const cleaned = raw.replace(/[^\d+]/g, '');
    return /^\+[1-9]\d{6,14}$/.test(cleaned) ? cleaned : null;
  }

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

async function sendViaTelnyx(phoneNumber: string, message: string): Promise<SmsSendResult> {
  const apiKey = process.env.TELNYX_API_KEY;
  const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
  const fromNumber = process.env.TELNYX_FROM_NUMBER;

  if (!apiKey) {
    return { success: false, provider: 'telnyx', error: 'TELNYX_API_KEY is not configured' };
  }

  if (!messagingProfileId && !fromNumber) {
    return {
      success: false,
      provider: 'telnyx',
      error: 'Set TELNYX_MESSAGING_PROFILE_ID or TELNYX_FROM_NUMBER'
    };
  }

  const to = normalizePhoneToE164OrNull(phoneNumber);
  if (!to) {
    return { success: false, provider: 'telnyx', error: `Invalid phone format: "${phoneNumber}"` };
  }

  const payload: Record<string, unknown> = {
    to,
    text: message,
  };
  if (messagingProfileId) payload.messaging_profile_id = messagingProfileId;
  if (fromNumber) payload.from = fromNumber;

  try {
    const response = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = Array.isArray((json as any)?.errors) && (json as any).errors.length
        ? (json as any).errors[0]?.detail || (json as any).errors[0]?.title
        : (json as any)?.message;
      return {
        success: false,
        provider: 'telnyx',
        error: detail || `Telnyx request failed with status ${response.status}`
      };
    }

    const sid = (json as any)?.data?.id || (json as any)?.id;
    return { success: true, provider: 'telnyx', sid };
  } catch (error: any) {
    return { success: false, provider: 'telnyx', error: error?.message || 'Telnyx request failed' };
  }
}

async function sendViaTwilio(phoneNumber: string, message: string): Promise<SmsSendResult> {
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
    return {
      success: false,
      provider: 'twilio',
      error: 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER are required'
    };
  }

  const to = normalizePhoneToE164OrNull(phoneNumber);
  if (!to) {
    return { success: false, provider: 'twilio', error: `Invalid phone format: "${phoneNumber}"` };
  }

  try {
    const twilio = await import('twilio');
    const client = twilio.default(twilioAccountSid, twilioAuthToken);
    const result = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to,
    });
    return { success: true, provider: 'twilio', sid: result.sid };
  } catch (error: any) {
    const code = error?.code ? ` code=${error.code}` : '';
    return {
      success: false,
      provider: 'twilio',
      error: `${error?.message || 'Twilio request failed'}${code}`.trim()
    };
  }
}

export async function sendSMS(phoneNumber: string, message: string): Promise<SmsSendResult> {
  const provider = (process.env.SMS_PROVIDER || 'telnyx').toLowerCase();

  if (provider === 'twilio') {
    return sendViaTwilio(phoneNumber, message);
  }

  const telnyx = await sendViaTelnyx(phoneNumber, message);
  if (telnyx.success) return telnyx;

  if (process.env.SMS_FALLBACK_PROVIDER?.toLowerCase() === 'twilio') {
    const twilio = await sendViaTwilio(phoneNumber, message);
    if (twilio.success) return twilio;
    return {
      success: false,
      provider: 'telnyx',
      error: `Telnyx failed (${telnyx.error}); fallback Twilio failed (${twilio.error})`
    };
  }

  return telnyx;
}

