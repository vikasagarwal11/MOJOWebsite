# Live Media Upload Feature Guide

## 🎥 Overview

The Live Media Upload feature allows users to record videos during events and automatically share them to the website and social media platforms.

## ✨ Features

### 1. **Live Recording**
- Record videos directly in the browser using device camera
- Real-time preview while recording
- High-quality video recording (1280x720)
- Audio recording included

### 2. **Auto-Upload**
- Automatic upload to Firebase Storage
- Saves to website media gallery
- Links to specific events (optional)

### 3. **Social Media Integration**
- Auto-post to Facebook
- Auto-post to Instagram (Business accounts)
- Auto-post to Twitter
- Manual sharing options

## 🚀 How to Use

### For Event Organizers:
1. Go to the Events page
2. Click the green "Live Upload" button
3. Allow camera permissions when prompted
4. Click "Start Recording" to begin
5. Click "Stop Recording" when finished
6. Add a description
7. Select which platforms to share to
8. Click "Upload & Share"

### For Regular Users:
- Same process, but videos will be uploaded to the general media gallery

## 🔧 Technical Implementation

### Components:
- `LiveMediaUpload.tsx` - Main upload interface
- `socialMediaService.ts` - Handles social media posting
- `LoadingSpinner.tsx` - Loading states

### APIs Used:
- **MediaRecorder API** - For video recording
- **Firebase Storage** - For file uploads
- **Firestore** - For metadata storage
- **Social Media APIs** - For auto-posting

## 📱 Mobile Compatibility

- Works on mobile devices with camera access
- Responsive design for all screen sizes
- Touch-friendly interface
- Optimized for mobile recording

## 🔐 Privacy & Security

- Camera access is only used during recording
- Videos are stored securely in Firebase
- Social media posting requires user consent
- No data is stored locally after upload

## 🛠️ Setup Requirements

### 1. Environment Variables
Add these to your `.env` file:
```env
VITE_FACEBOOK_APP_ID=your_facebook_app_id
VITE_FACEBOOK_ACCESS_TOKEN=your_facebook_access_token
VITE_INSTAGRAM_ACCESS_TOKEN=your_instagram_access_token
VITE_INSTAGRAM_BUSINESS_ACCOUNT_ID=your_instagram_business_account_id
VITE_TWITTER_API_KEY=your_twitter_api_key
VITE_TWITTER_API_SECRET=your_twitter_api_secret
VITE_TWITTER_ACCESS_TOKEN=your_twitter_access_token
VITE_TWITTER_ACCESS_TOKEN_SECRET=your_twitter_access_token_secret
```

### 2. Social Media App Setup
- **Facebook**: Create app at https://developers.facebook.com/
- **Instagram**: Connect business account to Facebook app
- **Twitter**: Create project at https://developer.twitter.com/

### 3. Firebase Configuration
- Ensure Firebase Storage is enabled
- Set up proper security rules for media uploads
- Configure CORS for social media APIs

## 🎯 Use Cases

### Event Documentation:
- Record workout sessions
- Capture group activities
- Document special moments
- Create event highlights

### Social Media Marketing:
- Auto-post to multiple platforms
- Maintain consistent branding
- Engage with community
- Drive traffic to website

### Community Building:
- Share real-time content
- Encourage participation
- Create FOMO (Fear of Missing Out)
- Build excitement for future events

## 🔄 Workflow

1. **Recording Phase**:
   - User clicks "Live Upload"
   - Camera permission requested
   - Recording starts/stops on demand
   - Preview available before upload

2. **Upload Phase**:
   - Video uploaded to Firebase Storage
   - Metadata saved to Firestore
   - Thumbnail generated (future enhancement)

3. **Sharing Phase**:
   - Social media APIs called
   - Posts created on selected platforms
   - User notified of success/failure

## 🚨 Troubleshooting

### Common Issues:
- **Camera not working**: Check browser permissions
- **Upload fails**: Check Firebase configuration
- **Social media posting fails**: Verify API credentials
- **Video quality poor**: Check device camera settings

### Browser Support:
- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Limited support (iOS 14.3+)
- Mobile browsers: Full support

## 🔮 Future Enhancements

- Live streaming capabilities
- Real-time filters and effects
- Batch upload multiple videos
- Advanced video editing
- Analytics and insights
- Push notifications for new uploads
