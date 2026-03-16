/**
 * SMS Message Templates
 * Centralized location for all SMS message content
 * Easy to edit and maintain
 */

export const SMS_TEMPLATES = {
  /**
   * Waitlist Promotion - Time-sensitive (24h RSVP deadline)
   */
  WAITLIST_PROMOTION: (eventTitle: string) => 
    `🎉 MOMS FITNESS MOJO: You've been promoted from waitlist! Confirm attendance at "${eventTitle}" within 24h.`,

  /**
   * Account Approval - Welcome message
   */
  ACCOUNT_APPROVED: (userName: string) => 
    `🎉 MOMS FITNESS MOJO: Your account has been approved! Welcome ${userName}! You can now access all features.`,

  /**
   * Account Rejection - Critical notification
   */
  ACCOUNT_REJECTED: (rejectionReason: string) => 
    `MOMS FITNESS MOJO: Your account request was not approved. Reason: ${rejectionReason}. You can view details and reapply after 30 days.`,

  /**
   * Admin Question - Time-sensitive response needed
   */
  ADMIN_QUESTION: () => 
    `MOMS FITNESS MOJO: An admin has a question about your account request. Please check your pending approval page to respond.`,

  /**
   * New Event Created - Notify all users about new event
   */
  EVENT_CREATED: (eventTitle: string, eventDate: string, eventLink: string) => 
    `🎉 NEW EVENT: "${eventTitle}" on ${eventDate}! Check it out: ${eventLink}`,
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
