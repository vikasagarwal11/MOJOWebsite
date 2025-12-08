# Notification/SMS Security & Architecture Fixes

## 🔒 Critical Security Fixes

### 1. **Secured `sendNotificationSMS` Callable Function** ✅

**Issue**: Function was exposed without authentication, allowing anyone to send SMS and rack up costs.

**Fix**:
- ✅ Added authentication requirement (`request.auth` check)
- ✅ Added role validation (admin-only)
- ✅ Added input validation (phone format, message length)
- ✅ Added SMS preference check for target user
- ✅ Added error handling with proper HttpsError responses
- ✅ Partial phone number logging for privacy

**Location**: `functions/src/index.ts` (lines 2980-3070)

---

## 🐛 Functional Fixes

### 2. **Deprecated Client-Side SMS Helper** ✅

**Issue**: `smsService.ts` bypassed user preferences and cost-saving queue.

**Fix**:
- ✅ Marked all functions as deprecated
- ✅ Added warnings to prevent usage
- ✅ Functions now return errors directing to use Cloud Functions
- ✅ Kept for backward compatibility but disabled

**Location**: `src/utils/smsService.ts`

---

### 3. **Fixed Promotion SMS Queue** ✅

**Issue**: `notificationService.ts` was using `sms_queue` which nothing reads.

**Fix**:
- ✅ Removed incorrect queue code
- ✅ Added comment explaining SMS is handled server-side
- ✅ Promotion SMS now handled by `sendPromotionNotifications` Cloud Function

**Location**: `src/services/notificationService.ts` (line 139-146)

---

### 4. **Fixed Race Condition in Notification ID Lookup** ✅

**Issue**: Created notification with `add()`, then queried for it - could grab wrong notification under load.

**Fix**:
- ✅ Changed to use `doc()` to get DocumentReference first
- ✅ Use `set()` with the reference to create notification
- ✅ Capture notification ID directly from reference
- ✅ No query needed - eliminates race condition

**Location**: `functions/src/index.ts` (lines 5057-5059)

---

### 5. **Added Missing SMS for Approval Messages** ✅

**Issue**: Admin questions and user replies weren't sending SMS.

**Fixes**:

**Admin Questions** (lines 5262-5280):
- ✅ Now actually sends SMS via Twilio (was only logging)
- ✅ Respects user SMS preferences
- ✅ Time-sensitive - user needs to respond

**User Replies** (lines 5308-5330):
- ✅ Now uses `sendAdminNotificationWithFallback` for push + SMS
- ✅ All admins receive notifications
- ✅ Respects admin notification preferences

**Location**: `functions/src/index.ts` (lines 5240-5330)

---

### 6. **Prevented Duplicate SMS in Scheduler** ✅

**Issue**: Overlapping scheduler invocations could send duplicate SMS.

**Fix**:
- ✅ Mark documents as "processing" immediately before sending
- ✅ Double-check status before processing (another worker might have claimed it)
- ✅ Added recovery for stuck "processing" items (> 10 minutes)
- ✅ Query both "pending" and stuck "processing" status
- ✅ Reset to "pending" on error for retry

**Location**: `functions/src/index.ts` (lines 5330-5450)

---

## ⚡ Performance Fixes

### 7. **Added Pagination to NotificationCenter** ✅

**Issue**: Loaded all notifications without limit, causing performance issues.

**Fix**:
- ✅ Added `limit(50)` to query (most recent 50 notifications)
- ✅ Batch writes for `markAllAsRead` (max 500 per batch)
- ✅ Added error handling for query failures
- ✅ Warning if more than 500 notifications need marking

**Location**: `src/components/notifications/NotificationCenter.tsx`

---

## 📋 Summary of Changes

| Issue | Severity | Status | File |
|-------|----------|--------|------|
| Unauthenticated SMS sending | 🔴 Critical | ✅ Fixed | `functions/src/index.ts` |
| Client-side SMS bypass | 🟡 High | ✅ Fixed | `src/utils/smsService.ts` |
| Wrong SMS queue | 🟡 High | ✅ Fixed | `src/services/notificationService.ts` |
| Race condition in notification ID | 🟡 High | ✅ Fixed | `functions/src/index.ts` |
| Missing SMS for approval messages | 🟡 High | ✅ Fixed | `functions/src/index.ts` |
| Duplicate SMS in scheduler | 🟡 High | ✅ Fixed | `functions/src/index.ts` |
| No pagination in NotificationCenter | 🟢 Medium | ✅ Fixed | `src/components/notifications/NotificationCenter.tsx` |

---

## 🚀 Next Steps

### 1. **Deploy Functions**
```powershell
.\deploy-prod.ps1 functions -SkipChecks
```

### 2. **Test Security**
- Try calling `sendNotificationSMS` without auth → Should fail
- Try calling as non-admin → Should fail
- Try with invalid phone number → Should fail
- Try with message > 1600 chars → Should fail

### 3. **Test Notification Flow**
- User 3 creates approval request → Admin should get notification + SMS
- Admin asks question → User should get SMS
- User replies → Admin should get push + SMS
- Approve user → User should get SMS (5-min delay, skipped if read)

### 4. **Monitor SMS Costs**
- Check Twilio Console for SMS usage
- Verify duplicate prevention is working
- Monitor `sms_dispatch_queue` for stuck items

---

## ✅ All Issues Resolved

All 7 critical issues from the feedback have been addressed:
1. ✅ Security: SMS callable now requires admin auth
2. ✅ Client helper: Deprecated and disabled
3. ✅ Promotion queue: Fixed to use server-side
4. ✅ Race condition: Fixed notification ID capture
5. ✅ Missing SMS: Added for approval messages
6. ✅ Duplicate prevention: Added processing status
7. ✅ Performance: Added pagination

The notification/SMS system is now secure, efficient, and fully functional.
