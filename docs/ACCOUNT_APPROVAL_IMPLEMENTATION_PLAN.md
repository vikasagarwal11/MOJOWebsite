# Account Approval Workflow - Implementation Plan

## Overview
This document outlines the plan to implement an admin approval workflow for new user registrations. New users will provide additional information during signup, submit their request for approval, and only gain full access after admin approval.

### Key Feature: Q&A Messaging System
**NEW:** Admins can ask clarifying questions to pending users before making an approval decision. This two-way messaging system allows for:
- Admin-initiated questions about the user's application
- User responses to clarify any concerns
- Multiple rounds of back-and-forth communication
- Real-time notifications for both parties
- Thread history visible to both admin and user

This feature significantly improves the approval process by allowing admins to gather more information instead of rejecting unclear applications outright.

## Current State Analysis

### Current Registration Flow
1. User enters: First Name, Last Name, Phone Number
2. SMS verification code sent
3. User enters verification code
4. Account created immediately in Firestore with `role: 'member'`
5. User has immediate access to all features

### Current User Model
```typescript
{
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phoneNumber?: string;
  photoURL?: string;
  role: 'admin' | 'trainer' | 'member';
  blockedFromRsvp: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

## Proposed Changes

### 1. Database Schema Changes

#### Update User Type (src/types/index.ts)
Add new fields to User interface:
```typescript
export interface User {
  // ... existing fields ...
  
  // Approval workflow fields
  status: 'pending' | 'approved' | 'rejected'; // New field
  approvalRequestedAt?: Date;
  approvedAt?: Date;
  approvedBy?: string; // Admin user ID
  rejectedAt?: Date;
  rejectedBy?: string; // Admin user ID
  rejectionReason?: string;
  
  // Additional signup information
  email?: string; // Already exists but may not be collected
  location?: string; // City/State/Address
  howDidYouHear?: string; // How did you hear about us
  referredBy?: string; // User ID of referring member (optional)
  referralNotes?: string; // Additional notes from user
}
```

#### New Collection: `accountApprovals` (Recommended)
Store approval requests in a separate collection for cleaner separation and easier querying:
```typescript
export interface AccountApproval {
  id: string;
  userId: string; // References users/{userId}
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  location?: string;
  howDidYouHear?: string;
  referredBy?: string; // User ID
  referralNotes?: string;
  status: 'pending' | 'approved' | 'rejected' | 'needs_clarification';
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string; // Admin user ID
  rejectionReason?: string;
  adminNotes?: string; // Internal admin notes
  awaitingResponseFrom?: 'admin' | 'user' | null; // Track who needs to respond
  lastMessageAt?: Date; // Last message timestamp
  unreadCount?: {
    admin: number; // Unread messages for admin
    user: number; // Unread messages for user
  };
}
```

#### New Collection: `approvalMessages` (For Q&A Thread)
Store messages/questions between admins and pending users:
```typescript
export interface ApprovalMessage {
  id: string;
  approvalId: string; // References accountApprovals/{approvalId}
  userId: string; // User who sent the message
  senderRole: 'admin' | 'user';
  senderName: string; // Display name of sender
  message: string; // Message content
  createdAt: Date;
  read: boolean; // Whether recipient has read it
  readAt?: Date;
  attachments?: string[]; // Optional file attachments (e.g., screenshots, documents)
}
```

**Recommendation:** Use the separate collection approach for cleaner separation and easier querying of pending requests.

### 2. Registration Flow Changes

#### Updated Registration Steps (src/components/auth/Register.tsx)

**Step 1: Phone Verification** (Keep as-is)
- First Name
- Last Name
- Phone Number
- SMS verification

**Step 2: Additional Information** (NEW)
After phone verification, show a new form with:
- Email address (required)
- Location (required) - City/State or full address
- How did you hear about us? (required dropdown)
  - Options: Social Media, Friend/Referral, Google Search, Other (with text input)
- Referred by existing member? (optional)
  - Search/select from existing approved members
  - Or enter their name/phone number
- Any additional notes? (optional textarea)

**Step 3: Pending Approval Screen** (NEW)
- Show "Thank you for signing up!" message
- Display status: "Your account is pending admin approval"
- Estimated approval time
- Contact information for questions

### 3. User Status Management

#### Authentication Context Updates (src/contexts/AuthContext.tsx)
- Check user status before allowing access
- Redirect pending users to "pending approval" page
- Block rejected users from accessing the app (show rejection message)
- Only approved users get full access

#### Firestore Security Rules Updates (firestore.rules)
- Pending users can only:
  - Read their own profile
  - Update their own profile (limited fields)
  - Read/write their own approval messages (for Q&A)
  - Cannot create posts, RSVPs, etc.
- Only approved users can:
  - Access all features
  - Create content, RSVPs, etc.
- Approval messages:
  - Users can read/write messages for their own approval requests
  - Admins can read/write messages for any approval request
  - Messages are tied to approvalId for security

### 4. Admin Interface

#### New Admin Tab: Account Approvals (src/pages/AdminAccountApprovals.tsx)

**Features:**
- List of pending approval requests
- Filters: All, Pending, Approved, Rejected
- Search by name, email, phone
- Sort by submission date

**For each pending request, show:**
- User details (name, email, phone, location)
- How they heard about us
- Referral information (if provided)
- Submitted date/time
- **Q&A Thread** (NEW) - Show conversation history
  - Badge showing unread messages count
  - Expandable message thread
  - "Ask Question" button to send message to user
  - Real-time updates when user responds
- Actions: Approve, Reject (with reason), Ask Question, View Profile

**Approval Actions:**
- **Ask Question / Request Clarification:**
  - Open message composer modal
  - Type question/clarification request
  - Send message to user
  - Update approval status to 'needs_clarification'
  - Set awaitingResponseFrom: 'user'
  - Send notification to user (SMS + in-app)
  - User can respond from their pending approval page
  
- **Approve:** 
  - Update user status to 'approved'
  - Set approvedAt timestamp
  - Set approvedBy admin ID
  - Send notification to user
  - Optional: Send welcome email
  - Close any open Q&A threads
  
- **Reject:**
  - Prompt for rejection reason (required)
  - Update user status to 'rejected'
  - Set rejectedAt timestamp
  - Set rejectedBy admin ID
  - Send notification to user with reason
  - Block user from accessing app
  - Optionally: Allow user to appeal via message

**Bulk Actions:**
- Approve multiple users
- Export pending requests to CSV

### 5. Notifications

#### Admin Notifications
- Real-time notification when new approval request is submitted
- Email notification to admin email (momsfitnessmojo@gmail.com)
- In-app notification badge/count
- Cloud Function trigger on new approval request

#### User Notifications
- Approval notification: "Your account has been approved! Welcome to Moms Fitness Mojo!"
- Rejection notification: "Your account request was not approved. Reason: [reason]"
- **Admin Question notification:** "An admin has a question about your account request. Please check your pending approval page."
- SMS notification (using existing SMS service)
- In-app notification
- Email notification

#### Admin Notifications (Additional)
- **User Response notification:** "User [name] has responded to your question about their account request."
- Real-time badge count for pending approvals with unread messages

### 6. User Access Control

#### Route Protection (Update all protected routes)
- Check user status before rendering protected pages
- Redirect pending users to `/pending-approval`
- Redirect rejected users to `/account-rejected`

#### New Pages
- **Pending Approval Page** (`src/pages/PendingApproval.tsx`)
  - Status message
  - Contact information
  - Ability to update information if needed
  - **Q&A Thread Section** (NEW)
    - Show messages from admin
    - "Reply" button to respond to admin questions
    - Message composer for responding
    - Real-time updates when admin sends new questions
    - Notification badge for unread messages
    - Show "Awaiting your response" indicator if admin asked a question
  
- **Account Rejected Page** (`src/pages/AccountRejected.tsx`)
  - Rejection reason
  - Appeal process information
  - Contact admin option
  - Option to view Q&A thread history

### 7. Cloud Functions

#### New Functions (functions/src/index.ts)

1. **onAccountApprovalRequest** (Triggered on user document create with status='pending')
   - Send notification to all admins
   - Send email to admin
   - Log approval request

2. **onAccountApproved** (Triggered on user status change to 'approved')
   - Send welcome notification to user
   - Send welcome email (if email service configured)
   - Send SMS welcome message

3. **onAccountRejected** (Triggered on user status change to 'rejected')
   - Send rejection notification to user
   - Send rejection email with reason

4. **notifyAdminsOfPendingApproval** (Callable function)
   - Get count of pending approvals
   - Send notification if count > 0

5. **onApprovalMessageCreated** (Triggered on approvalMessages document create)
   - Send notification to recipient (admin or user)
   - Update unread count on approval document
   - Update awaitingResponseFrom field
   - Send SMS notification if urgent

6. **onApprovalMessageRead** (Triggered on message read status update)
   - Decrement unread count
   - Update readAt timestamp

## Implementation Complexity Assessment

### Complexity Level: **Medium to High**

#### Easy Components (1-2 days)
- ✅ Update User type interface
- ✅ Add status field to user documents
- ✅ Update registration form with additional fields
- ✅ Create pending approval page
- ✅ Create account rejected page

#### Medium Components (3-5 days)
- ✅ Update AuthContext to check user status
- ✅ Update Firestore security rules
- ✅ Create admin approval interface
- ✅ Implement approval/rejection logic
- ✅ Add notifications (in-app)

#### Complex Components (5-7 days)
- ✅ Cloud Functions for notifications
- ✅ Email notifications
- ✅ SMS notifications
- ✅ Real-time updates for admins
- ✅ Route protection updates
- ✅ Testing and edge cases

### Estimated Total Time: **14-16 days** (Updated with Q&A messaging feature)

## Implementation Steps (Recommended Order)

### Phase 1: Core Data Model (Day 1-2)
1. Update User type with new fields
2. Update registration flow to collect additional information
3. Create user document with `status: 'pending'` initially
4. Test registration flow end-to-end

### Phase 2: Access Control (Day 3-4)
1. Update AuthContext to check user status
2. Update Firestore security rules
3. Create pending approval and rejected pages
4. Update route protection
5. Test access blocking

### Phase 3: Admin Interface (Day 5-7)
1. Create AdminAccountApprovals component
2. Implement approval/rejection actions
3. Add filters, search, sorting
4. **Implement Q&A messaging system:**
   - Message thread UI component
   - "Ask Question" functionality
   - Real-time message updates
   - Unread message indicators
5. Test admin workflow

### Phase 4: Q&A Messaging System (Day 8-10)
1. Create ApprovalMessage type and collection structure
2. Build message thread UI component (reusable)
3. Implement message sending (admin → user)
4. Implement message sending (user → admin)
5. Add real-time listeners for message updates
6. Implement unread message tracking
7. Add message read status tracking
8. Test messaging flow end-to-end

### Phase 5: Notifications (Day 11-13)
1. Implement in-app notifications
2. Create Cloud Functions for admin notifications
3. Create Cloud Functions for user notifications
4. Add email notifications (if email service available)
5. Add SMS notifications for Q&A messages
6. Test notification flow

### Phase 6: Polish & Testing (Day 14-16)
1. Edge case handling
2. Error handling
3. Loading states
4. User experience improvements
5. Integration testing
6. Security review
7. Q&A messaging edge cases (empty threads, deleted users, etc.)

## Security Considerations

1. **Firestore Rules:**
   - Pending users cannot access sensitive data
   - Pending users cannot create content
   - Only admins can approve/reject
   - Admins cannot approve themselves

2. **Data Validation:**
   - Validate email format
   - Validate phone number format
   - Sanitize text inputs
   - Validate referral user exists and is approved

3. **Spam Prevention:**
   - Rate limiting on registration
   - Duplicate phone/email detection
   - Suspicious pattern detection

## Q&A Messaging Feature Details

### User Experience Flow

1. **Admin Asks Question:**
   - Admin clicks "Ask Question" on pending approval
   - Modal opens with message composer
   - Admin types question (e.g., "Can you tell us more about your fitness goals?")
   - Admin sends message
   - User receives notification (SMS + in-app)
   - Approval status changes to 'needs_clarification'

2. **User Responds:**
   - User visits pending approval page
   - Sees admin's question with "Reply" button
   - User types response
   - User sends message
   - Admin receives notification
   - Approval status remains 'needs_clarification' until admin approves/rejects

3. **Multiple Rounds:**
   - Support multiple back-and-forth exchanges
   - Each message tracked with timestamp
   - Unread indicators for both parties
   - Thread history visible to both admin and user

### UI Components Needed

1. **MessageThread Component** (`src/components/admin/ApprovalMessageThread.tsx`)
   - Display messages in chronological order
   - Show sender name and role
   - Timestamp for each message
   - Unread indicators
   - Auto-scroll to latest message

2. **MessageComposer Component** (`src/components/admin/MessageComposer.tsx`)
   - Text area for message
   - Character limit (e.g., 1000 chars)
   - Send button
   - Loading state
   - Validation

3. **Admin Q&A Panel** (in AdminAccountApprovals)
   - Expandable/collapsible message thread
   - "Ask Question" button
   - Unread badge count
   - Real-time updates via Firestore listeners

4. **User Q&A Panel** (in PendingApproval page)
   - Show all messages from admin
   - Reply composer
   - "Awaiting your response" indicator
   - Notification badge

### Technical Implementation

1. **Firestore Structure:**
   ```
   accountApprovals/{approvalId}
     - status: 'needs_clarification'
     - awaitingResponseFrom: 'user'
     - unreadCount: { admin: 0, user: 1 }
     - lastMessageAt: timestamp
   
   approvalMessages/{messageId}
     - approvalId: string
     - userId: string
     - senderRole: 'admin' | 'user'
     - message: string
     - createdAt: timestamp
     - read: boolean
   ```

2. **Real-time Updates:**
   - Use Firestore `onSnapshot` listeners
   - Listen to `approvalMessages` collection filtered by `approvalId`
   - Update UI when new messages arrive
   - Update unread counts

3. **Notifications:**
   - Cloud Function triggers on new message
   - Send SMS to user when admin asks question
   - Send in-app notification to admin when user responds
   - Email notifications (optional)

## Questions to Consider

1. **Should existing users be grandfathered in?**
   - Yes, set all existing users to `status: 'approved'`

2. **Can pending users update their information?**
   - Yes, allow limited profile updates before approval

3. **What happens to rejected users?**
   - Keep record but block access
   - Allow re-application after X days?

4. **Should referral bonuses be implemented?**
   - Track referrals for future gamification
   - For now, just collect data

5. **Approval time expectations?**
   - Set expectation: "Typically within 24-48 hours"
   - Auto-remind admins after X hours

6. **Q&A Message Limits:**
   - Should there be a limit on number of messages?
   - Should there be a timeout (e.g., if no response in 7 days, auto-reject)?
   - Should admins be able to close Q&A and make decision?

7. **Message Formatting:**
   - Support plain text only, or rich text?
   - Support file attachments (screenshots, documents)?
   - Character limits per message?

## Similar Patterns in Codebase

This implementation can follow similar patterns to:
- **AdminTestimonials.tsx** - Approval workflow pattern
- **ContactMessagesAdmin.tsx** - Admin review interface pattern (similar to Q&A messaging)
- **UserBlockingDashboard.tsx** - Admin action interface pattern
- **notificationService.ts** - Notification sending pattern
- **AssistantWidget.tsx** - Real-time messaging/chat UI pattern (for message thread component)

## Benefits

1. **Spam Prevention:** Additional information makes spam accounts easier to identify
2. **Quality Control:** Admin can verify legitimate users
3. **Community Building:** Referral tracking helps grow community
4. **Data Collection:** Better user data for personalization
5. **Security:** Reduced risk of fake accounts
6. **Better Vetting:** Q&A messaging allows admins to ask clarifying questions before making decisions
7. **Reduced Rejections:** Can clarify concerns instead of rejecting outright
8. **Transparency:** Users can see what questions admins have and respond directly

## Risks & Mitigation

1. **Risk:** Longer signup process may reduce conversions
   - **Mitigation:** Make it clear this is a curated community, emphasize quality

2. **Risk:** Admin bottleneck if too many requests
   - **Mitigation:** Set clear expectations, multiple admins, bulk actions

3. **Risk:** Users frustrated waiting for approval
   - **Mitigation:** Clear communication, quick approval turnaround, contact info, Q&A feature allows clarification

4. **Risk:** Q&A messaging could delay approvals
   - **Mitigation:** Set clear expectations, allow admins to make decision after reasonable time, auto-remind if no response

## Next Steps

1. Review and approve this plan
2. Decide on collection structure (separate collection vs. user document fields)
3. Prioritize features (minimum viable vs. full implementation)
4. Set approval time expectations
5. Design approval interface mockups
6. Begin Phase 1 implementation

