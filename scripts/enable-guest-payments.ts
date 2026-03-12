/**
 * Script to enable guest payments for an event
 * 
 * Usage:
 * 1. Update the EVENT_ID constant below with your event ID
 * 2. Run: npx ts-node scripts/enable-guest-payments.ts
 */

import { initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, updateDoc } from 'firebase/firestore';

// Your Firebase config (copy from src/config/firebase.ts or .env)
const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
};

// ⚠️ UPDATE THIS WITH YOUR EVENT ID
const EVENT_ID = 'FfRqXe5MNL4OJak1HFbU'; // From your console logs

async function enableGuestPayments() {
    console.log('🚀 Enabling guest payments for event:', EVENT_ID);

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    try {
        // Get event document
        const eventRef = doc(db, 'events', EVENT_ID);
        const eventDoc = await getDoc(eventRef);

        if (!eventDoc.exists()) {
            console.error('❌ Event not found:', EVENT_ID);
            return;
        }

        const eventData = eventDoc.data();
        console.log('📄 Current event pricing:', eventData.pricing);

        // Update event with guest payment configuration
        await updateDoc(eventRef, {
            'pricing.allowGuestPayments': true,
            'pricing.guestPaymentMethods': ['stripe', 'zelle'],
            'pricing.zelleConfig': {
                recipientEmail: 'payments@momsfitnessmojo.com',
                recipientPhone: '+1234567890', // Update with your actual phone
                enabled: true
            }
        });

        console.log('✅ Guest payments enabled successfully!');
        console.log('');
        console.log('Configuration applied:');
        console.log('  - allowGuestPayments: true');
        console.log('  - guestPaymentMethods: [stripe, zelle]');
        console.log('  - zelleConfig: { recipientEmail, recipientPhone, enabled: true }');
        console.log('');
        console.log('🎉 Non-authenticated users can now make payments!');

    } catch (error) {
        console.error('❌ Error enabling guest payments:', error);
    }
}

enableGuestPayments();
