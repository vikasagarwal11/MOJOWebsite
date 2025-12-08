# Account Approval Q&A Workflow - Where Users See Admin Messages

## 🔄 Complete Workflow

### Step 1: User Submits Registration
- User registers → Gets `status: 'pending'`
- Account approval request created in Firestore
- User can access `/pending-approval` page

### Step 2: Admin Sends Clarification Message
- Admin goes to `/admin` → Account Approvals tab
- Admin clicks "Ask Question" button
- Admin types clarification message
- Message is saved to `approvalMessages` collection
- Approval status changes to `'needs_clarification'`
- `awaitingResponseFrom` set to `'user'`

### Step 3: User Sees Admin Message ✅

**Location:** `src/pages/PendingApproval.tsx`

The user sees the admin's clarification message on the **`/pending-approval` page**.

---

## 📍 Where Users See Admin Messages

### Page: `/pending-approval`

**File:** `src/pages/PendingApproval.tsx`

### Features:

1. **Real-Time Message Thread** (Lines 174-204)
   - Shows all messages in chronological order
   - Admin messages displayed in **purple box** (left-aligned with margin)
   - User messages displayed in **gray box** (right-aligned with margin)
   - Each message shows:
     - Sender name ("Admin" or "You")
     - Timestamp (formatted date/time)
     - Message content

2. **Status Banner** (Lines 149-163)
   - Shows current status: "Awaiting your response" or "Under review"
   - Displays last admin reply timestamp
   - Blue highlighted box for visibility

3. **Alert Banner** (Lines 165-171)
   - **Orange alert box** appears when `awaitingResponseFrom === 'user'`
   - Message: "An admin has a question about your application. Please respond below."

4. **Message Composer** (Lines 208-229)
   - Only shown when:
     - Admin has sent messages, OR
     - Admin is awaiting user response
   - Text area for user to type response
   - "Send Message" button
   - Tip message: "Please reply within 24 hours..."

5. **Real-Time Updates** (Lines 39-53)
   - Uses Firestore `onSnapshot` listener
   - Automatically updates when new messages arrive
   - No page refresh needed
   - Shows new admin messages immediately

---

## 🔍 Technical Details

### Message Display Logic

```typescript
// Lines 39-53: Real-time listener
const unsubscribe = onSnapshot(q, (snapshot) => {
  const msgs = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
      readAt: (data.readAt as Timestamp)?.toDate(),
    } as ApprovalMessage;
  });
  setMessages(msgs); // Updates UI automatically
  
  // Track last admin reply
  const lastAdmin = msgs.filter(m => m.senderRole === 'admin').slice(-1)[0];
  setLastAdminReply(lastAdmin ? lastAdmin.createdAt : null);
});
```

### Message Styling

```typescript
// Lines 184-188: Different styling for admin vs user messages
className={`p-4 rounded-lg ${
  msg.senderRole === 'admin'
    ? 'bg-purple-50 border border-purple-200 ml-8'  // Admin: purple, left
    : 'bg-gray-50 border border-gray-200 mr-8'      // User: gray, right
}`}
```

### Status Detection

```typescript
// Line 127: Check if admin is waiting for user response
const awaitingUserResponse = approval.awaitingResponseFrom === 'user';

// Lines 130-133: Show message composer conditionally
const hasAdminMessages = messages.some(msg => msg.senderRole === 'admin');
const shouldShowMessageComposer = hasAdminMessages || awaitingUserResponse;
```

---

## 📱 User Experience Flow

### When Admin Sends First Message:

1. **User visits `/pending-approval` page**
   - Sees orange alert: "An admin has a question..."
   - Sees purple box with admin's message
   - Message composer appears below

2. **User Types Response**
   - Types in textarea
   - Clicks "Send Message"
   - Message appears in gray box (right side)
   - Status updates automatically

3. **Real-Time Updates**
   - If admin replies again, new message appears automatically
   - No refresh needed
   - Thread grows chronologically

---

## 🎯 Key UI Elements

### 1. Status Banner (Lines 149-163)
```
┌─────────────────────────────────────┐
│ Status: Awaiting your response      │
│ Last admin reply: Dec 15, 2024 2:30│
└─────────────────────────────────────┘
```

### 2. Alert Banner (Lines 165-171)
```
┌─────────────────────────────────────┐
│ ⚠️ An admin has a question about    │
│    your application. Please respond │
│    below.                           │
└─────────────────────────────────────┘
```

### 3. Message Thread (Lines 181-202)
```
        ┌─────────────────────┐
        │ Admin               │
        │ Dec 15, 2:30 PM     │
        │ Message text here   │
        └─────────────────────┘

┌─────────────────────┐
│ You                 │
│ Dec 15, 3:15 PM     │
│ My response...      │
└─────────────────────┘
```

### 4. Message Composer (Lines 211-224)
```
┌─────────────────────────────────────┐
│ Reply to Admin                      │
│ ┌─────────────────────────────────┐ │
│ │ Type your message here...       │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│ [Send Message]                      │
│ Tip: Please reply within 24 hours...│
└─────────────────────────────────────┘
```

---

## 🔔 Notifications

When admin sends a clarification message:

1. **Firestore Trigger** (Cloud Function)
   - Detects new message in `approvalMessages` collection
   - Sends SMS notification to user's phone number
   - Creates in-app notification (if user has app open)

2. **User Notification Options:**
   - SMS: "You have a new message from MOJO admin regarding your account approval."
   - In-app: Notification badge appears
   - Email: Optional (if configured)

---

## 📊 Data Flow

```
Admin Sends Message
    ↓
Firestore: approvalMessages/{messageId} (created)
    ↓
Firestore: accountApprovals/{id} (updated)
    - status: 'needs_clarification'
    - awaitingResponseFrom: 'user'
    - unreadCount.user: +1
    - lastMessageAt: timestamp
    ↓
Cloud Function Triggered
    ↓
SMS Sent to User
    ↓
User Visits /pending-approval
    ↓
Firestore onSnapshot Listener (real-time)
    ↓
Messages Displayed in UI
    ↓
Orange Alert Banner Shows
    ↓
Message Composer Appears
```

---

## ✅ Summary

**Where do users see admin clarification messages?**

➡️ **`/pending-approval` page** (`src/pages/PendingApproval.tsx`)

**How it works:**
1. ✅ Real-time message thread (updates automatically)
2. ✅ Admin messages in purple boxes (left side)
3. ✅ Orange alert banner when admin asks question
4. ✅ Message composer appears for user to respond
5. ✅ Status shows "Awaiting your response"
6. ✅ Last admin reply timestamp displayed
7. ✅ SMS notification sent when admin messages

**User Actions:**
- View all messages in chronological order
- See when admin last replied
- Type and send response
- Real-time updates without refresh

---

## 🔍 Related Files

- **User View:** `src/pages/PendingApproval.tsx`
- **Admin View:** `src/components/admin/AccountApprovalsAdmin.tsx`
- **Service:** `src/services/accountApprovalService.ts`
- **Types:** `src/types/index.ts` (ApprovalMessage, AccountApproval)

