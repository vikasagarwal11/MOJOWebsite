# User Notification Preferences: Enable/Disable Push Notifications

## 🎯 Your Question

> "For admins, push notification is good. But for other users, will they have the option to enable or disable push notifications?"

---

## 🔍 Current State Analysis

### What Exists:
- ✅ FCM tokens are stored in user documents (`fcmToken` field)
- ✅ Push notifications are partially implemented (used for RSVP notifications)
- ✅ NotificationService checks for FCM tokens before sending push

### What's Missing:
- ❌ No notification preferences/settings page
- ❌ No UI toggle to enable/disable push notifications
- ❌ No way for users to control their notification preferences
- ❌ Push notification permission request might be automatic (need to check)

---

## 💡 Recommended Approach

### **Option 1: User-Controlled Settings (Best UX)**

**Create Notification Settings Page:**
- Location: Profile page → "Notification Settings" tab
- Allows users to:
  - ✅ Enable/disable push notifications (toggle)
  - ✅ Enable/disable SMS notifications (toggle)
  - ✅ Choose notification types (RSVP, events, messages, etc.)
  - ✅ See current notification status

**How It Works:**
1. User goes to Profile → Notification Settings
2. Toggle "Browser Push Notifications" ON/OFF
3. If ON → Request browser permission → Store FCM token
4. If OFF → Remove FCM token → Stop sending push notifications

### **Option 2: Opt-In Only (Simpler)**

**Ask Permission on First Use:**
- When notification is needed → Ask user "Enable notifications?"
- User can accept/deny
- If denied → Only use in-app notifications
- User can change in browser settings later

**No dedicated settings page needed** - browser handles it

### **Option 3: Hybrid Approach (Recommended)**

**Best of Both:**
1. **Automatic Prompt** - Ask permission when user first needs notifications
2. **Settings Page** - Let users manage preferences later
3. **Respect User Choice** - Don't send push if disabled

---

## 📊 Notification Preference Structure

### User Document Fields:

```typescript
{
  // Existing
  fcmToken?: string; // Stored when user enables push
  
  // Add new fields for preferences
  notificationPreferences?: {
    pushEnabled: boolean;        // Browser push notifications
    smsEnabled: boolean;         // SMS notifications (optional)
    emailEnabled: boolean;       // Email notifications (future)
    
    // Granular preferences (optional)
    types?: {
      rsvp: boolean;
      events: boolean;
      messages: boolean;
      approval: boolean;
    };
  };
}
```

---

## 🎯 Implementation Recommendations

### **For Regular Users:**

1. **Add Notification Settings Tab to Profile**
   - New tab: "Notifications" or "Settings"
   - Toggle for "Browser Push Notifications"
   - Show current status (enabled/disabled)
   - Optional: Toggle for SMS notifications

2. **Notification Permission Flow:**
   ```
   User enables toggle
     ↓
   Request browser permission
     ↓
   If granted → Store FCM token → Enable push
   If denied → Show message → Keep disabled
   ```

3. **Respect User Preferences:**
   - Check `notificationPreferences.pushEnabled` before sending push
   - If disabled → Skip push, use in-app only
   - For critical notifications (approval, etc.) → Still send SMS if enabled

### **For Admins:**

1. **Default: Push Enabled** (can still disable if wanted)
2. **SMS Fallback** if push fails
3. **Always try push first** (as discussed)

---

## 📝 Proposed User Experience

### **Profile → Notifications Tab:**

```
┌─────────────────────────────────────────┐
│ Notification Preferences                │
├─────────────────────────────────────────┤
│                                         │
│ 🔔 Browser Push Notifications           │
│    [Toggle Switch]  Currently: Enabled  │
│    Get notified even when browser is    │
│    closed or tab is inactive            │
│                                         │
│ 📱 SMS Notifications                    │
│    [Toggle Switch]  Currently: Enabled  │
│    Receive SMS for important updates    │
│                                         │
│ 📧 Email Notifications                  │
│    [Toggle Switch]  Currently: Disabled │
│    Coming soon                          │
│                                         │
│ ─────────────────────────────────────── │
│                                         │
│ Notification Types:                     │
│ ☑️ Event RSVPs                          │
│ ☑️ Waitlist Promotions                  │
│ ☑️ Account Updates                      │
│ ☑️ Messages from Admins                 │
│                                         │
└─────────────────────────────────────────┘
```

---

## ✅ Answer to Your Question

### **For Regular Users:**

**YES, they should have the option!**

**Recommendation:**
1. ✅ Add "Notification Settings" tab in Profile page
2. ✅ Toggle to enable/disable push notifications
3. ✅ Show current status clearly
4. ✅ Respect user choice - don't send push if disabled

**Benefits:**
- Users have control over their notifications
- Better user experience (not forced)
- Reduces notification fatigue
- Complies with privacy best practices

---

## 🚀 Implementation Plan

### Phase 1: Add Notification Settings (Recommended)

1. **Create Notification Settings Component**
   - Add new tab to Profile page
   - Toggle for push notifications
   - Status indicator

2. **Handle Permission Request**
   - Request browser permission when enabled
   - Store FCM token in user document
   - Remove token when disabled

3. **Update Notification Service**
   - Check `notificationPreferences.pushEnabled` before sending
   - Respect user choice

### Phase 2: Granular Preferences (Optional)

1. **Add notification type preferences**
   - Users can choose which types to receive
   - RSVP, events, messages, etc.

2. **SMS/Email preferences**
   - Let users control all channels

---

## 📋 Summary

**Your Question:** Will regular users have option to enable/disable push notifications?

**Answer:** 
- ✅ **YES** - They should have this option (good UX practice)
- ❌ **Currently** - No settings page exists (needs to be created)
- ✅ **Recommendation** - Add Notification Settings tab in Profile page

**For Admins:**
- Push notifications enabled by default (can be disabled)
- SMS fallback if push fails

**For Regular Users:**
- User-controlled via Settings page
- Can enable/disable anytime
- Respect user choice when sending notifications

