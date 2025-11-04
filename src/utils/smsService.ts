import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { getFunctions } from 'firebase/functions';

/**
 * FREE SMS SERVICE using Firebase Auth SMS
 * This leverages existing Firebase Auth SMS infrastructure for notifications
 */

/**
 * Send SMS notification using Firebase Auth SMS (FREE!)
 * 
 * How it works:
 * 1. Triggers a "verification" SMS to user's phone
 * 2. User receives SMS with custom message
 * 3. No verification required - just sends the SMS
 * 4. Uses existing Firebase SMS quota/credits
 */
export async function sendNotificationViaAuthSMS(
  userId: string, 


  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('📱 Attempting to send SMS notification to user:', userId);
    
    // Get user's phone number from Firestore
    const userDoc = await getDoc(doc(db, 'users', userId));
    
    if (!userDoc.exists()) {
      console.error('❌ User document not found:', userId);
      return { success: false, error: 'User not found' };
    }
    
    const userData = userDoc.data();
    const phoneNumber = userData?.phoneNumber;
    
    if (!phoneNumber) {
      console.error('❌ No phone number found for user:', userId);
      return { success: false, error: 'No phone number found' };
    }
    
    console.log('📱 Sending SMS to phone number:', phoneNumber);
    
    // Use Firebase Functions to trigger SMS - explicitly use us-east1 to match function deployment region
    const functions = getFunctions(undefined, 'us-east1');
    
    // Create a Cloud Function call to send SMS
    const sendNotificationSMS = httpsCallable(functions, 'sendNotificationSMS');
    
    const result = await sendNotificationSMS({
      phoneNumber: phoneNumber,
      message: message,
      userId: userId,
      type: 'notification'
    });
    
    console.log('✅ SMS notification sent successfully:', result.data);
    return { success: true };
    
  } catch (error) {
    console.error('❌ Error sending SMS notification:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Send promotion notification SMS via Firebase Auth SMS
 */
export async function sendPromotionNotificationSMS(
  userId: string,
  promotionData: {
    userName: string;
    eventTitle: string;
    eventDate: string;
    originalPosition?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  
  const smsMessage = `🎉 MOMS FITNESS MOJO: Great news ${promotionData.userName}! You've been promoted from waitlist to "${promotionData.eventTitle}". You're now confirmed to attend! Celebrate! 💪`;
  
  return await sendNotificationViaAuthSMS(userId, smsMessage);
}

/**
 * Send VIP priority notification SMS
 */
export async function sendVIPPriorityNotificationSMS(
  userId: string,
  eventTitle: string,
  position: number
): Promise<{ success: boolean; error?: string }> {
  
  const smsMessage = `⭐ VIP PRIVILEGE: You're position #${position} for "${eventTitle}"! Premium advantage in action! 💎`;
  
  return await sendNotificationViaAuthSMS(userId, smsMessage);
}

/**
 * Send family member promotion notification SMS
 */
export async function sendFamilyPromotionNotificationSMS(
  userId: string,
  primaryUserName: string,
  eventTitle: string,
  familyCount: number
): Promise<{ success: boolean; error?: string }> {
  
  const smsMessage = `🎉 FAMILY CELEBRATION: ${primaryUserName} got confirmed for "${eventTitle}"! You and ${familyCount} family members are now CONFIRMED! Family fun awaits! 👨‍👩‍👧‍👦`;
  
  return await sendNotificationViaAuthSMS(userId, smsMessage);
}