# Chat & Messaging Feature Files - Complete Inventory

This document lists all files related to chat, messaging, and conversation functionality in the MOJO Website codebase.

## Table of Contents
1. [AI Assistant Chat (User-AI Conversations)](#1-ai-assistant-chat-user-ai-conversations)
2. [Contact Messages (User-Admin Communication)](#2-contact-messages-user-admin-communication)
3. [Approval Q&A Messages (Admin-User Approval Threads)](#3-approval-qa-messages-admin-user-approval-threads)
4. [Backend/Cloud Functions](#4-backendcloud-functions)
5. [Types & Interfaces](#5-types--interfaces)
6. [Documentation](#6-documentation)

---

## 1. AI Assistant Chat (User-AI Conversations)

### Frontend Components
- **`src/components/assistant/AssistantWidget.tsx`** (1,137 lines)
  - Main chat widget component for AI assistant
  - Features:
    - Voice recording with real-time transcription
    - Text input for questions
    - Conversation history display
    - Voice-to-speech responses (TTS)
    - Streaming transcription via WebSocket
    - Conversation mode (auto-continues dialogue)
    - Draggable and resizable widget
    - Citation support with clickable references
    - Copy/share message functionality
    - Session management

### Services
- **`src/services/assistantService.ts`** (128 lines)
  - Service layer for AI assistant communication
  - Functions:
    - `askAssistant()` - Send questions to AI with conversation history
    - `transcribeAudio()` - Transcribe audio to text
    - `transcribeLongAudio()` - Handle long audio files
    - `transcribeAudioAuto()` - Auto-select transcription method
    - `synthesizeSpeech()` - Convert text to speech
    - `openStreamingTranscriber()` - WebSocket streaming transcription
    - `openStreamingTranscriberAuthed()` - Authenticated WebSocket
  - Interfaces:
    - `AssistantMessage` - Chat message structure
    - `AssistantCitation` - Source citations
    - `AssistantResponse` - AI response with citations

### Backend Functions
- **`functions/src/assistant.ts`** (1,584+ lines)
  - Main backend logic for AI assistant
  - Cloud Functions:
    - `chatAsk` - Process user questions using KB-first strategy
    - `transcribeAudio` - Audio transcription endpoint
    - `transcribeLongAudio` - Long audio transcription
    - `synthesizeSpeech` - Text-to-speech synthesis
  - Features:
    - Knowledge base integration
    - Conversation history processing (last 5 messages)
    - Intent detection (events, posts, testimonials, messages)
    - Multi-source response generation

---

## 2. Contact Messages (User-Admin Communication)

### Frontend Components
- **`src/components/admin/ContactMessagesAdmin.tsx`** (368 lines)
  - Admin interface for managing contact messages
  - Features:
    - Message list with filtering (status, inquiry type)
    - Search functionality
    - Message detail view
    - Status management (new, read, replied, closed)
    - Admin notes
    - Real-time updates via Firestore listeners
    - Statistics dashboard

- **`src/components/ContactFormModal.tsx`**
  - User-facing contact form
  - Allows users to send messages to admins

### Services
- **`src/services/contactService.ts`** (176 lines)
  - Service for contact message management
  - Functions:
    - `submitMessage()` - Create new contact message
    - `getAllMessages()` - Fetch all messages (admin)
    - `getMessagesByStatus()` - Filter by status
    - `updateMessageStatus()` - Update message status
    - `subscribeToMessages()` - Real-time message subscription
    - `getMessageStats()` - Get message statistics

- **`src/services/emailService.ts`**
  - Email notification service (used by ContactService)
  - Sends email notifications to admins when new messages arrive

### Types
- **`src/types/contact.ts`** (23 lines)
  - `ContactMessage` interface
  - `ContactMessageFormData` interface

---

## 3. Approval Q&A Messages (Admin-User Approval Threads)

### Frontend Components
- **`src/components/admin/AccountApprovalsAdmin.tsx`** (680+ lines)
  - Admin interface for account approval management
  - Features:
    - Q&A messaging thread for approval requests
    - Real-time message updates
    - Send questions to pending users
    - Unread message indicators
    - Message thread display
    - Quick reply templates

- **`src/pages/PendingApproval.tsx`**
  - User-facing page for pending approval status
  - Features:
    - View approval request status
    - Q&A thread display
    - Reply to admin questions
    - Real-time message updates

### Services
- **`src/services/accountApprovalService.ts`** (302 lines)
  - Service for account approval and messaging
  - Functions:
    - `createApprovalRequest()` - Create new approval request
    - `sendMessage()` - Send message in approval thread
    - `getApprovalById()` - Fetch approval details
    - `approveAccount()` - Approve user account
    - `rejectAccount()` - Reject user account
  - Message handling:
    - Creates messages in `approvalMessages` collection
    - Updates unread counts
    - Manages `awaitingResponseFrom` status

### Backend Functions
- **`functions/src/index.ts`**
  - Cloud Function: `onApprovalMessageCreated`
    - Triggers when new approval message is created
    - Sends notifications (SMS, in-app) to recipients
    - Updates approval status

### Types
- **`src/types/index.ts`**
  - `AccountApproval` interface (includes messaging fields)
  - `ApprovalMessage` interface
    - Fields: id, approvalId, userId, senderRole, senderName, message, createdAt, read, readAt, attachments

### Firestore Collections
- **`approvalMessages/{messageId}`**
  - Stores Q&A messages for approval requests
  - Indexed by: approvalId + createdAt

---

## 4. Backend/Cloud Functions

### Assistant Functions
- **`functions/src/assistant.ts`**
  - Core AI assistant logic
  - Handles conversation context
  - Knowledge base queries
  - Intent detection

### Notification Functions
- **`functions/src/index.ts`**
  - `onApprovalMessageCreated` - Notification trigger for approval messages
  - Sends SMS and in-app notifications

### Firestore Security Rules
- **`firestore.rules`**
  - Rules for `contactMessages` collection
  - Rules for `approvalMessages` collection
  - User/admin access controls

### Firestore Indexes
- **`firestore.indexes.json`**
  - Indexes for `approvalMessages` (approvalId + createdAt)
  - Indexes for message queries

---

## 5. Types & Interfaces

### Message Types
- **`src/types/contact.ts`**
  - `ContactMessage`
  - `ContactMessageFormData`

- **`src/types/index.ts`**
  - `ApprovalMessage`
  - `AccountApproval` (includes messaging fields)

- **`src/services/assistantService.ts`**
  - `AssistantMessage`
  - `AssistantCitation`
  - `AssistantResponse`

### Notification Types
- **`src/services/notificationService.ts`**
  - `Notification` interface
  - Used for in-app message notifications

---

## 6. Documentation

### Implementation Guides
- **`ACCOUNT_APPROVAL_IMPLEMENTATION_PLAN.md`**
  - Q&A messaging system design
  - UI component requirements
  - Technical implementation details

- **`CONVERSATION_CONTEXT_ANALYSIS.md`**
  - Analysis of conversation context handling
  - Current implementation status
  - Best practices for context management

- **`ASSISTANT_IMPROVEMENTS_SUMMARY.md`**
  - Assistant feature improvements
  - Conversation mode enhancements

### Deployment Guides
- **`DEPLOYMENT_ACCOUNT_APPROVAL.md`**
  - Deployment steps for approval messaging

---

## Summary by Feature Type

### 🤖 AI Assistant Chat
- Real-time chat with AI assistant
- Voice input/output
- Conversation history
- Knowledge base integration
- **Files**: 3 core files (AssistantWidget, assistantService, assistant.ts function)

### 📧 Contact Messages
- User-to-admin contact form
- Admin message management
- Status tracking
- **Files**: 4 core files (ContactMessagesAdmin, ContactFormModal, contactService, contact types)

### 💬 Approval Q&A Messages
- Two-way messaging for account approvals
- Real-time updates
- Unread indicators
- **Files**: 5+ core files (AccountApprovalsAdmin, PendingApproval, accountApprovalService, types, Cloud Functions)

---

## Enhancement Opportunities

Based on the codebase analysis, here are areas for enhancement:

### 1. **Real-time Chat System** (Not Yet Implemented)
   - Direct user-to-user messaging
   - Group chats for events
   - Chat rooms for community
   - **Status**: Planned (mentioned in PROJECT_BACKLOG.md)

### 2. **Enhanced AI Assistant**
   - Better conversation context (currently uses last 5 messages)
   - Multi-turn conversation improvements
   - Context summarization for long conversations

### 3. **Message Features**
   - File attachments (partially supported in ApprovalMessage)
   - Message reactions
   - Message search
   - Message forwarding
   - Read receipts (partially implemented)

### 4. **UI/UX Improvements**
   - Sleek chat bubbles (as per requirements)
   - Swipe-to-reply
   - Animated reactions
   - Typing indicators
   - Message status indicators

### 5. **Performance**
   - Message pagination
   - Lazy loading for long threads
   - Optimistic UI updates

---

## Next Steps for Enhancement

1. **Review current implementations** - Understand existing patterns
2. **Identify gaps** - What's missing vs. requirements
3. **Plan enhancements** - Prioritize features
4. **Design new features** - Create architecture for real-time chat
5. **Implement incrementally** - Start with high-impact features

---

*Last updated: Based on current codebase analysis*

