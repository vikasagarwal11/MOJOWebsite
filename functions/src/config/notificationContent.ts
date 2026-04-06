/**
 * Central notification content catalog.
 * Edit text here to change SMS / in-app / push copy without touching business logic.
 */
export const NOTIFICATION_CONTENT = {
  waitlistPromotion: {
    inAppTitle: '🎉 Waitlist Promotion Confirmed!',
    inAppMessage: (eventTitle: string) => `You've been promoted from waitlist for "${eventTitle}"`,
    pushTitle: '🎉 Waitlist Promotion Confirmed!',
    pushBody: (eventTitle: string) => `You've been promoted from waitlist for "${eventTitle}"`,
    popupTitle: '🎉 Waitlist Promotion Confirmed!',
    popupMessage: (eventTitle: string) => `Congratulations! You've been promoted from waitlist for "${eventTitle}"`,
    sms: (eventTitle: string) =>
      `🎉 MOMS FITNESS MOJO: You've been promoted from waitlist! Confirm attendance at "${eventTitle}" within 24h.`,
  },

  accountApprovalRequest: {
    inAppTitle: 'New Account Approval Request',
    inAppMessage: (userName: string) => `${userName} has submitted an account approval request.`,
    pushTitle: 'New Account Approval Request',
    pushBody: (userName: string) => `${userName} has submitted an account approval request.`,
    adminFallbackSms: (userName: string) =>
      `MOMS FITNESS MOJO: New account approval request from ${userName}. Check admin console.`,
  },

  accountApproved: {
    inAppTitle: '🎉 Account Approved!',
    inAppMessage: 'Your account has been approved! Welcome to Moms Fitness Mojo!',
    pushTitle: '🎉 Account Approved!',
    pushBody: 'Your account has been approved! Welcome to Moms Fitness Mojo!',
    sms: (userName: string) =>
      `🎉 MOMS FITNESS MOJO: Your account has been approved! Welcome ${userName}! You can now access all features.`,
  },

  accountRejected: {
    inAppTitle: 'Account Request Not Approved',
    inAppMessage: (rejectionReason: string) =>
      `Your account request was not approved. Reason: ${rejectionReason}`,
    pushTitle: 'Account Request Not Approved',
    pushBody: (rejectionReason: string) =>
      `Your account request was not approved. Reason: ${rejectionReason}`,
    sms: (rejectionReason: string) =>
      `MOMS FITNESS MOJO: Your account request was not approved. Reason: ${rejectionReason}. You can view details and reapply after 30 days.`,
  },

  approvalQuestion: {
    inAppTitle: 'Admin Question',
    inAppMessage: 'An admin has a question about your account request. Please check your pending approval page.',
    sms: () =>
      'MOMS FITNESS MOJO: An admin has a question about your account request. Please check your pending approval page to respond.',
  },

  approvalResponse: {
    inAppTitle: 'User Response',
    inAppMessage: (senderName: string) =>
      `${senderName} has responded to your question about their account request.`,
    pushTitle: 'User Response',
    pushBody: (senderName: string) =>
      `${senderName} has responded to your question about their account request.`,
    adminFallbackSms: (senderName: string) =>
      `MOMS FITNESS MOJO: ${senderName} has responded to your question. Check admin console.`,
  },

  mediaPendingApproval: {
    inAppTitle: 'Media Pending Approval',
    inAppMessage: (uploadedByName: string, mediaType: string) =>
      `${uploadedByName} has uploaded ${mediaType === 'video' ? 'a video' : 'an image'} that requires your approval.`,
    pushTitle: 'Media Pending Approval',
    pushBody: (uploadedByName: string, mediaType: string) =>
      `${uploadedByName} has uploaded ${mediaType === 'video' ? 'a video' : 'an image'} that requires your approval.`,
    adminFallbackSms: (uploadedByName: string, mediaType: string) =>
      `MOMS FITNESS MOJO: New ${mediaType} pending approval from ${uploadedByName}. Check Content Moderation.`,
  },

  eventCreated: {
    sms: (eventTitle: string, eventDate: string, eventLink: string) =>
      `🎉 NEW EVENT: "${eventTitle}" on ${eventDate}! Check it out: ${eventLink}`,
  },
} as const;

