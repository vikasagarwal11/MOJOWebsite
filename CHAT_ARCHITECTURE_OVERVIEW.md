# Chat & Messaging Architecture Overview

## Current Chat Features in MOJO Website

### 1. AI Assistant Chat 🎙️

```
┌─────────────────────────────────────────────────────────┐
│  AssistantWidget.tsx (Frontend)                        │
│  - Voice/Text input                                    │
│  - Conversation display                                │
│  - Session management                                  │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│  assistantService.ts (Service Layer)                   │
│  - askAssistant()                                      │
│  - transcribeAudio()                                   │
│  - synthesizeSpeech()                                  │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│  functions/src/assistant.ts (Backend)                  │
│  - chatAsk (Cloud Function)                            │
│  - Knowledge base queries                              │
│  - Conversation context (last 5 messages)              │
└─────────────────────────────────────────────────────────┘
```

**Data Flow:**
1. User types/speaks question
2. Frontend sends to `askAssistant()` with conversation history
3. Backend processes via `chatAsk` Cloud Function
4. Returns response with citations
5. Frontend displays and optionally speaks response

---

### 2. Contact Messages 📧

```
┌─────────────────────────────────────────────────────────┐
│  ContactFormModal.tsx (User)                           │
│  - User submits contact form                           │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│  contactService.ts                                     │
│  - submitMessage()                                     │
│  - Creates in Firestore: contactMessages/{id}          │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│  Firestore: contactMessages                            │
│  - Real-time listeners                                 │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│  ContactMessagesAdmin.tsx (Admin)                      │
│  - View/manage messages                                │
│  - Update status                                       │
│  - Real-time updates                                   │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- One-way communication (User → Admin)
- Status tracking: new → read → replied → closed
- Admin notes
- Email notifications

---

### 3. Approval Q&A Messages 💬

```
┌─────────────────────────────────────────────────────────┐
│  AccountApprovalsAdmin.tsx (Admin)                     │
│  - View pending approvals                              │
│  - Send questions                                      │
│  - View Q&A thread                                     │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│  accountApprovalService.ts                             │
│  - sendMessage()                                       │
│  - Updates approval status                             │
│  - Manages unread counts                               │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│  Firestore Collections:                                │
│  - accountApprovals/{id}                               │
│    • status, unreadCount, awaitingResponseFrom         │
│  - approvalMessages/{id}                               │
│    • approvalId, senderRole, message, read             │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│  onApprovalMessageCreated (Cloud Function)             │
│  - Sends SMS notification                              │
│  - Creates in-app notification                         │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│  PendingApproval.tsx (User)                            │
│  - View approval status                                │
│  - View Q&A thread                                     │
│  - Reply to admin questions                            │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- Two-way communication (Admin ↔ User)
- Real-time updates via Firestore listeners
- Unread message indicators
- Notification system (SMS + in-app)
- Thread-based conversation

---

## File Structure

```
src/
├── components/
│   ├── assistant/
│   │   └── AssistantWidget.tsx          # AI chat widget
│   ├── admin/
│   │   ├── ContactMessagesAdmin.tsx     # Admin contact mgmt
│   │   └── AccountApprovalsAdmin.tsx    # Approval Q&A admin UI
│   └── ContactFormModal.tsx             # User contact form
│
├── services/
│   ├── assistantService.ts              # AI assistant API
│   ├── contactService.ts                # Contact messages API
│   └── accountApprovalService.ts        # Approval messages API
│
├── types/
│   ├── contact.ts                       # Contact message types
│   └── index.ts                         # Approval message types
│
└── pages/
    └── PendingApproval.tsx              # User approval page

functions/
└── src/
    ├── assistant.ts                     # AI assistant backend
    └── index.ts                         # Approval message notifications

firestore/
├── firestore.rules                      # Security rules
└── firestore.indexes.json               # Query indexes
```

---

## Database Collections

### contactMessages
```typescript
{
  id: string
  name: string
  email: string
  phone?: string
  inquiryType: string
  message: string
  status: 'new' | 'read' | 'replied' | 'closed'
  createdAt: Timestamp
  updatedAt: Timestamp
  adminNotes?: string
  repliedAt?: Timestamp
  repliedBy?: string
}
```

### approvalMessages
```typescript
{
  id: string
  approvalId: string                    // Links to accountApprovals
  userId: string
  senderRole: 'admin' | 'user'
  senderName: string
  message: string
  createdAt: Timestamp
  read: boolean
  readAt?: Timestamp
  attachments?: string[]
}
```

### accountApprovals
```typescript
{
  id: string
  userId: string
  status: 'pending' | 'needs_clarification' | 'approved' | 'rejected'
  unreadCount: {
    admin: number
    user: number
  }
  awaitingResponseFrom: 'admin' | 'user' | null
  lastMessageAt: Timestamp
  // ... other approval fields
}
```

---

## Enhancement Opportunities

### 🔴 Missing: Real-time User-to-User Chat

**Current State:** Not implemented
**Planned:** Mentioned in PROJECT_BACKLOG.md (35 hours estimated)

**What's Needed:**
```
┌─────────────────────────────────────────────────────────┐
│  Chat Components (New)                                  │
│  - ChatList.tsx (conversation list)                     │
│  - ChatWindow.tsx (message display)                     │
│  - MessageComposer.tsx (input area)                     │
│  - ChatBubble.tsx (message bubble)                      │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│  chatService.ts (New)                                   │
│  - sendMessage()                                        │
│  - getConversations()                                   │
│  - subscribeToMessages()                                │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│  Firestore Collections (New)                            │
│  - conversations/{id}                                   │
│    • participants, lastMessage, unreadCount            │
│  - messages/{id}                                        │
│    • conversationId, senderId, text, createdAt, read   │
└─────────────────────────────────────────────────────────┘
```

**Features to Implement:**
- ✅ Real-time messaging (use existing Firestore patterns)
- ✅ Group chats for events
- ✅ Typing indicators
- ✅ Read receipts (extend existing pattern)
- ✅ Message reactions
- ✅ File attachments
- ✅ Swipe-to-reply
- ✅ Sleek chat bubbles UI

---

### 🟡 Enhancement: AI Assistant

**Current State:** Basic conversation with last 5 messages
**Enhancement Ideas:**
- Conversation summarization for long threads
- Better context management
- Multi-modal support (images, files)
- Persistent conversation history

---

### 🟡 Enhancement: Message Features

**Can Add to All Message Types:**
- File attachments (already in ApprovalMessage interface)
- Message reactions
- Message editing/deletion
- Message search
- Message forwarding

---

## Implementation Patterns

### Real-time Updates Pattern
All chat features use Firestore `onSnapshot()` listeners:

```typescript
// Pattern used in ContactMessagesAdmin, AccountApprovalsAdmin, PendingApproval
const unsubscribe = onSnapshot(query, (snapshot) => {
  const messages = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate()
  }));
  setMessages(messages);
});
```

### Service Layer Pattern
Clean separation of concerns:

```typescript
// Pattern: Service → Firestore → Component
ContactService.submitMessage(data)
  → Firestore: contactMessages collection
  → ContactMessagesAdmin.tsx (real-time listener)
```

### Notification Pattern
Cloud Functions trigger on message creation:

```typescript
// Pattern: Firestore Trigger → Cloud Function → Notifications
onApprovalMessageCreated
  → Check sender/recipient
  → Send SMS notification
  → Create in-app notification
```

---

## Recommended Enhancement Roadmap

### Phase 1: User-to-User Chat (High Priority)
1. Create conversation and message collections
2. Build ChatService
3. Create ChatList component
4. Create ChatWindow component
5. Implement real-time messaging
6. Add typing indicators
7. Add read receipts

### Phase 2: Enhanced UI/UX
1. Sleek chat bubbles design
2. Swipe-to-reply functionality
3. Animated reactions
4. Message status indicators
5. File attachment support

### Phase 3: Advanced Features
1. Group chats for events
2. Message search
3. Message forwarding
4. Voice messages
5. Video chat integration (as mentioned in backlog)

---

*This architecture overview helps identify current implementations and opportunities for enhancement.*

