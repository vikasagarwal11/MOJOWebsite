/**
 * SMS Message Templates
 * Centralized location for all SMS message content
 * Easy to edit and maintain
 */
import { NOTIFICATION_CONTENT } from '../config/notificationContent';

export const SMS_TEMPLATES = {
  /**
   * Waitlist Promotion - Time-sensitive (24h RSVP deadline)
   */
  WAITLIST_PROMOTION: (eventTitle: string) =>
    NOTIFICATION_CONTENT.waitlistPromotion.sms(eventTitle),

  /**
   * Account Approval - Welcome message
   */
  ACCOUNT_APPROVED: (userName: string) =>
    NOTIFICATION_CONTENT.accountApproved.sms(userName),

  /**
   * Account Rejection - Critical notification
   */
  ACCOUNT_REJECTED: (rejectionReason: string) =>
    NOTIFICATION_CONTENT.accountRejected.sms(rejectionReason),

  /**
   * Admin Question - Time-sensitive response needed
   */
  ADMIN_QUESTION: () =>
    NOTIFICATION_CONTENT.approvalQuestion.sms(),

  /**
   * New Event Created - Notify all users about new event
   */
  EVENT_CREATED: (eventTitle: string, eventDate: string, eventLink: string) =>
    NOTIFICATION_CONTENT.eventCreated.sms(eventTitle, eventDate, eventLink),
} as const;

/**
 * SMS Types for tracking and logging
 */
export const SMS_TYPES = {
  WAITLIST_PROMOTION: 'waitlist_promotion',
  ACCOUNT_APPROVED: 'account_approved',
  ACCOUNT_REJECTED: 'account_rejected',
  ADMIN_QUESTION: 'approval_question',
  EVENT_CREATED: 'event_created',
} as const;
