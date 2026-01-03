import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

/**
 * Send SMS using Twilio (helper function)
 */
async function sendSMSViaTwilio(phoneNumber: string, message: string): Promise<{ success: boolean; error?: string; sid?: string }> {
  try {
    // For Firebase Functions v2, access config via runtime config
    // Try to get from functions.config() first (for v1 compatibility), then fallback to process.env
    let twilioAccountSid: string | undefined;
    let twilioAuthToken: string | undefined;
    let twilioPhoneNumber: string | undefined;
    
    try {
      // Try to access via functions.config() (works with firebase functions:config:set)
      const functions = require('firebase-functions');
      const config = functions.config();
      twilioAccountSid = config?.twilio?.account_sid;
      twilioAuthToken = config?.twilio?.auth_token;
      twilioPhoneNumber = config?.twilio?.phone_number;
    } catch (configError) {
      // functions.config() not available, will use process.env
    }
    
    // Fallback to environment variables (for v2 direct env vars)
    twilioAccountSid = twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
    twilioAuthToken = twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
    twilioPhoneNumber = twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      console.error('❌ Twilio credentials not configured');
      return { success: false, error: 'Twilio credentials not configured. Please set twilio.account_sid, twilio.auth_token, and twilio.phone_number' };
    }

    const twilio = await import('twilio');
    const client = twilio.default(twilioAccountSid, twilioAuthToken);

    const result = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: phoneNumber,
    });

    console.log(`✅ SMS sent via Twilio. SID: ${result.sid}`);
    return { success: true, sid: result.sid };
  } catch (error: any) {
    console.error('❌ Twilio SMS failed:', error?.message || error);
    return { success: false, error: error?.message || 'Failed to send SMS' };
  }
}

/**
 * Helper function: Send push notification with SMS fallback for admins
 * Strategy: Try push first, if fails or disabled, send SMS
 */
export async function sendAdminNotificationWithFallback(
  adminId: string,
  adminData: any,
  title: string,
  body: string,
  smsMessage: string,
  data?: Record<string, string>
): Promise<void> {
  const fcmToken = adminData?.fcmToken;
  const phoneNumber = adminData?.phoneNumber;
  const pushEnabled = adminData?.notificationPreferences?.pushEnabled !== false; // Default to true if not set
  
  // Try push notification first if enabled and token exists
  if (pushEnabled && fcmToken) {
    try {
      const { getMessaging } = await import('firebase-admin/messaging');
      const messaging = getMessaging();
      await messaging.send({
        token: fcmToken,
        notification: {
          title,
          body,
        },
        data: data || {},
      });
      console.log(`✅ Push notification sent to admin ${adminId}`);
      return; // Success - no need for SMS
    } catch (pushError: any) {
      console.warn(`⚠️ Push notification failed for admin ${adminId}:`, pushError?.message || pushError);
      // Continue to SMS fallback
    }
  }

  // SMS Fallback: Send SMS immediately if push failed or disabled (admins need immediate notification)
  if (phoneNumber) {
    try {
      const result = await sendSMSViaTwilio(phoneNumber, smsMessage);
      if (result.success) {
        console.log(`✅ SMS sent immediately to admin ${adminId} (push ${fcmToken && pushEnabled ? 'failed' : 'disabled'})`);
      } else {
        console.error(`❌ SMS failed for admin ${adminId}:`, result.error);
      }
    } catch (smsError) {
      console.error(`❌ Failed to send SMS for admin ${adminId}:`, smsError);
    }
  } else {
    console.warn(`⚠️ No phone number found for admin ${adminId} - cannot send SMS fallback`);
  }
}

