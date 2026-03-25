// Firebase Cloud Messaging Service Worker
// This file is required by Firebase Cloud Messaging SDK
// It handles background push notifications when the app is not in focus

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const PROD_CONFIG = {
  apiKey: 'AIzaSyB-hFBi7q39EfAuBqTw5H8tYZ1Z_JNPRm8',
  authDomain: 'momsfitnessmojo-65d00.firebaseapp.com',
  projectId: 'momsfitnessmojo-65d00',
  storageBucket: 'momsfitnessmojo-65d00.firebasestorage.app',
  messagingSenderId: '313384637691',
  appId: '1:313384637691:web:79b852490e709a58634c5e'
};

const DEV_CONFIG = {
  apiKey: 'AIzaSyCUCw31tvQAdhODTqSddJVqKZXqzaDB6gQ',
  authDomain: 'momsfitnessmojo-dev.firebaseapp.com',
  projectId: 'momsfitnessmojo-dev',
  storageBucket: 'momsfitnessmojo-dev.firebasestorage.app',
  messagingSenderId: '459380776372',
  appId: '1:459380776372:web:803e2580a1c127cc9ba6e1'
};

const hostname = self.location.hostname || '';
const isProdHost =
  hostname === 'momsfitnessmojo.com' ||
  hostname === 'www.momsfitnessmojo.com' ||
  hostname === 'momsfitnessmojo-65d00.web.app' ||
  hostname === 'momsfitnessmojo-65d00.firebaseapp.com';

const firebaseConfig = isProdHost ? PROD_CONFIG : DEV_CONFIG;

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background messages
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'Moms Fitness Mojo';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification',
    icon: payload.notification?.icon || '/logo-small.png',
    badge: '/logo-small.png',
    data: payload.data || {},
    ...payload.notification
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});
