import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { SMS_TEMPLATES, SMS_TYPES } from './smsTemplates';

const db = getFirestore();

function isDevProject(): boolean {
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
  return project === 'momsfitnessmojo-dev' || project.endsWith('-dev');
}

/**
 * Send SMS using Twilio (helper function)
 */
async function sendSMSViaTwilio(phoneNumber: string, message: string): Promise<{ success: boolean; error?: string; sid?: string }> {
  try {
    // For Firebase Functions v2, use environment variables directly
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

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

/**
 * Send Waitlist Promotion SMS (Immediate - Time-Sensitive)
 * User needs to confirm attendance within 24 hours
 */
export async function sendWaitlistPromotionSMS(
  userId: string,
  phoneNumber: string,
  eventTitle: string,
  smsEnabled: boolean = true
): Promise<{ success: boolean; error?: string; sid?: string }> {
  if (!smsEnabled) {
    console.log(`ℹ️ SMS notifications disabled for user ${userId}, skipping waitlist promotion SMS`);
    return { success: false, error: 'SMS disabled by user' };
  }

  if (!phoneNumber) {
    console.warn(`⚠️ No phone number found for user ${userId} - cannot send waitlist promotion SMS`);
    return { success: false, error: 'No phone number' };
  }

  try {
    const message = SMS_TEMPLATES.WAITLIST_PROMOTION(eventTitle);
    const result = await sendSMSViaTwilio(phoneNumber, message);
    
    if (result.success) {
      console.log(`✅ Waitlist promotion SMS sent immediately to ${userId}`);
      return { success: true, sid: result.sid };
    } else {
      console.error(`❌ Waitlist promotion SMS failed for ${userId}:`, result.error);
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error(`❌ Error sending waitlist promotion SMS to ${userId}:`, error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

/**
 * Queue Account Approval SMS (5-minute delay for cost-saving)
 * Only sends if user hasn't read the in-app notification
 */
export async function queueAccountApprovalSMS(
  userId: string,
  userName: string,
  phoneNumber: string,
  notificationId: string,
  smsEnabled: boolean = true
): Promise<{ success: boolean; error?: string }> {
  if (!smsEnabled) {
    console.log(`ℹ️ SMS notifications disabled for user ${userId}, skipping account approval SMS`);
    return { success: false, error: 'SMS disabled by user' };
  }

  if (!phoneNumber) {
    console.warn(`⚠️ No phone number found for user ${userId} - cannot queue account approval SMS`);
    return { success: false, error: 'No phone number' };
  }

  try {
    const message = SMS_TEMPLATES.ACCOUNT_APPROVED(userName);

    // Default behavior:
    // - Production: delay to reduce cost + allow in-app read suppression.
    // - Dev: shorter (or zero) delay so testing isn't confusing.
    const defaultDelayMinutes = isDevProject() ? 0 : 5;
    const delayMinutesRaw = process.env.ACCOUNT_APPROVAL_SMS_DELAY_MINUTES;
    const delayMinutes = Number.isFinite(Number(delayMinutesRaw))
      ? Math.max(0, Number(delayMinutesRaw))
      : defaultDelayMinutes;
    const dispatchAt = new Date(Date.now() + delayMinutes * 60 * 1000);
    
    await db.collection('sms_dispatch_queue').add({
      userId,
      phoneNumber,
      message,
      notificationId,
      type: SMS_TYPES.ACCOUNT_APPROVED,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      dispatchAt: Timestamp.fromDate(dispatchAt),
      meta: {
        delayMinutes,
        project: process.env.GCLOUD_PROJECT || null,
      }
    });

    console.log(`✅ Account approval SMS queued for user ${userId}`, { delayMinutes });
    return { success: true };
  } catch (error: any) {
    console.error(`❌ Failed to queue account approval SMS for user ${userId}:`, error);
    return { success: false, error: error?.message || 'Failed to queue SMS' };
  }
}

/**
 * Send Account Approval SMS immediately.
 * Useful for dev/testing when the scheduled queue delay is undesirable.
 */
export async function sendAccountApprovalSMSNow(
  userId: string,
  userName: string,
  phoneNumber: string,
  smsEnabled: boolean = true
): Promise<{ success: boolean; error?: string; sid?: string }> {
  if (!smsEnabled) {
    console.log(`ℹ️ SMS notifications disabled for user ${userId}, skipping account approval SMS`);
    return { success: false, error: 'SMS disabled by user' };
  }

  if (!phoneNumber) {
    console.warn(`⚠️ No phone number found for user ${userId} - cannot send account approval SMS`);
    return { success: false, error: 'No phone number' };
  }

  try {
    const message = SMS_TEMPLATES.ACCOUNT_APPROVED(userName);
    const result = await sendSMSViaTwilio(phoneNumber, message);
    if (result.success) {
      console.log(`✅ Account approval SMS sent immediately to user ${userId}`);
      return { success: true, sid: result.sid };
    }
    console.error(`❌ Account approval SMS failed for ${userId}:`, result.error);
    return { success: false, error: result.error };
  } catch (error: any) {
    console.error(`❌ Error sending account approval SMS to ${userId}:`, error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

/**
 * Send Account Rejection SMS (Immediate - Critical)
 * User needs to know immediately about rejection
 */
export async function sendAccountRejectionSMS(
  userId: string,
  phoneNumber: string,
  rejectionReason: string,
  smsEnabled: boolean = true
): Promise<{ success: boolean; error?: string; sid?: string }> {
  if (!smsEnabled) {
    console.log(`ℹ️ SMS notifications disabled for user ${userId}, skipping account rejection SMS`);
    return { success: false, error: 'SMS disabled by user' };
  }

  if (!phoneNumber) {
    console.warn(`⚠️ No phone number found for user ${userId} - cannot send account rejection SMS`);
    return { success: false, error: 'No phone number' };
  }

  try {
    const message = SMS_TEMPLATES.ACCOUNT_REJECTED(rejectionReason);
    const result = await sendSMSViaTwilio(phoneNumber, message);
    
    if (result.success) {
      console.log(`✅ Account rejection SMS sent immediately to user ${userId}`);
      return { success: true, sid: result.sid };
    } else {
      console.error(`❌ Failed to send account rejection SMS to user ${userId}:`, result.error);
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error(`❌ Error sending account rejection SMS to user ${userId}:`, error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

/**
 * Queue Admin Question SMS (no delay by default)
 * Used in production so the scheduler can apply read-suppression / retries.
 */
export async function queueAdminQuestionSMS(
  userId: string,
  phoneNumber: string,
  notificationId: string,
  smsEnabled: boolean = true
): Promise<{ success: boolean; error?: string }> {
  if (!smsEnabled) {
    console.log(`ℹ️ SMS notifications disabled for user ${userId}, skipping admin question SMS`);
    return { success: false, error: 'SMS disabled by user' };
  }

  if (!phoneNumber) {
    console.warn(`⚠️ No phone number found for user ${userId} - cannot queue admin question SMS`);
    return { success: false, error: 'No phone number' };
  }

  try {
    const message = SMS_TEMPLATES.ADMIN_QUESTION();
    const dispatchAt = new Date();

    await db.collection('sms_dispatch_queue').add({
      userId,
      phoneNumber,
      message,
      notificationId,
      type: SMS_TYPES.ADMIN_QUESTION,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      dispatchAt: Timestamp.fromDate(dispatchAt),
      meta: {
        project: process.env.GCLOUD_PROJECT || null,
      },
    });

    console.log(`✅ Admin question SMS queued for user ${userId}`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ Failed to queue admin question SMS for user ${userId}:`, error);
    return { success: false, error: error?.message || 'Failed to queue SMS' };
  }
}

/**
 * Send Admin Question SMS immediately.
 * Used for dev/testing to avoid waiting for the scheduler.
 */
export async function sendAdminQuestionSMSNow(
  userId: string,
  phoneNumber: string,
  smsEnabled: boolean = true
): Promise<{ success: boolean; error?: string; sid?: string }> {
  if (!smsEnabled) {
    console.log(`ℹ️ SMS notifications disabled for user ${userId}, skipping admin question SMS`);
    return { success: false, error: 'SMS disabled by user' };
  }

  if (!phoneNumber) {
    console.warn(`⚠️ No phone number found for user ${userId} - cannot send admin question SMS`);
    return { success: false, error: 'No phone number' };
  }

  try {
    const message = SMS_TEMPLATES.ADMIN_QUESTION();
    const result = await sendSMSViaTwilio(phoneNumber, message);
    if (result.success) {
      console.log(`✅ Admin question SMS sent immediately to user ${userId}`);
      return { success: true, sid: result.sid };
    }
    console.error(`❌ Admin question SMS failed for ${userId}:`, result.error);
    return { success: false, error: result.error };
  } catch (error: any) {
    console.error(`❌ Error sending admin question SMS to ${userId}:`, error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

/**
 * Send Event Created SMS to all users (immediate notification)
 * Notifies community members about new events
 */
export async function sendEventCreatedSMS(
  eventId: string,
  eventTitle: string,
  eventDate: string,
  eventLink: string
): Promise<{ success: boolean; sentCount: number; failedCount: number; errors: string[] }> {
  try {
    console.log(`📱 Starting event creation SMS broadcast for event: ${eventId}`);
    
    // Get all users and keep approved + legacy users with missing status.
    // Legacy handling matches app behavior where missing status is treated as approved.
    const usersSnapshot = await db.collection('users').get();
    const eligibleUsers = usersSnapshot.docs.filter((userDoc) => {
      const status = String(userDoc.data()?.status || '').trim().toLowerCase();
      return !status || status === 'approved';
    });
    
    if (eligibleUsers.length === 0) {
      console.log('ℹ️ No eligible users found for event SMS broadcast');
      return { success: true, sentCount: 0, failedCount: 0, errors: [] };
    }
    
    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    
    // Send SMS to each user (with rate limiting consideration)
    const sendPromises = eligibleUsers.map(async (userDoc) => {
      const userData = userDoc.data();
      const userId = userDoc.id;
      const phoneNumber = userData?.phoneNumber;
      const smsEnabled = userData?.notificationPreferences?.smsEnabled !== false; // Default to true
      
      // Skip if no phone number or SMS disabled
      if (!phoneNumber) {
        console.log(`⏭️ Skipping user ${userId} - no phone number`);
        return;
      }
      
      if (!smsEnabled) {
        console.log(`⏭️ Skipping user ${userId} - SMS notifications disabled`);
        return;
      }
      
      try {
        const message = SMS_TEMPLATES.EVENT_CREATED(eventTitle, eventDate, eventLink);
        const result = await sendSMSViaTwilio(phoneNumber, message);
        
        if (result.success) {
          sentCount++;
          console.log(`✅ Event SMS sent to user ${userId}`);
        } else {
          failedCount++;
          errors.push(`User ${userId}: ${result.error}`);
          console.error(`❌ Event SMS failed for user ${userId}:`, result.error);
        }
      } catch (error: any) {
        failedCount++;
        errors.push(`User ${userId}: ${error?.message || 'Unknown error'}`);
        console.error(`❌ Error sending event SMS to user ${userId}:`, error);
      }
    });
    
    // Wait for all SMS sends to complete
    await Promise.all(sendPromises);
    
    console.log(`✅ Event SMS broadcast completed: ${sentCount} sent, ${failedCount} failed`);
    
    return {
      success: true,
      sentCount,
      failedCount,
      errors
    };
  } catch (error: any) {
    console.error('❌ Error in event SMS broadcast:', error);
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
      errors: [error?.message || 'Unknown error']
    };
  }
}

