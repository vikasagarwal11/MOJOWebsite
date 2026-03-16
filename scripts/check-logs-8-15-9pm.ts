/**
 * Script to check error logs from 8:15 PM - 9:00 PM EST
 * Usage: npx tsx scripts/check-logs-8-15-9pm.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, orderBy, Timestamp, limit } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkLogs() {
  try {
    console.log('🔍 Checking error logs for 8:15 PM - 9:00 PM EST...\n');
    
    // Today's date
    const today = new Date();
    
    // Convert 8:15 PM - 9:00 PM EST to UTC
    // EST is UTC-5, EDT is UTC-4 (adjust if needed)
    const estOffset = -5; // Change to -4 for EDT
    
    const startTime = new Date(today);
    startTime.setUTCHours(20 - estOffset, 15, 0, 0); // 8:15 PM EST
    
    const endTime = new Date(today);
    endTime.setUTCHours(21 - estOffset, 0, 0, 0); // 9:00 PM EST
    
    console.log(`📅 Date: ${today.toLocaleDateString()}`);
    console.log(`⏰ Time range: 8:15 PM - 9:00 PM EST`);
    console.log(`   UTC: ${startTime.toISOString()} to ${endTime.toISOString()}\n`);
    
    // Query Firestore for error logs
    const errorLogsRef = collection(db, 'errorLogs');
    const q = query(
      errorLogsRef,
      where('timestamp', '>=', Timestamp.fromDate(startTime)),
      where('timestamp', '<=', Timestamp.fromDate(endTime)),
      orderBy('timestamp', 'desc'),
      limit(100)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('❌ No error logs found in Firestore for this time period.\n');
      console.log('💡 This could mean:');
      console.log('   1. No errors occurred during this time');
      console.log('   2. Error logging to Firestore is not set up yet');
      console.log('   3. Errors are only logged to browser console (not persisted)');
      console.log('\n📝 To view backend errors:');
      console.log('   - Firebase Console → Functions → View logs');
      console.log('   - Google Cloud Console → Logging');
    } else {
      console.log(`✅ Found ${snapshot.size} error log(s):\n`);
      console.log('=' .repeat(80));
      
      snapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        console.log(`\n📍 Error #${index + 1}:`);
        console.log(`   ID: ${doc.id}`);
        console.log(`   Message: ${data.message}`);
        console.log(`   Code: ${data.code || 'N/A'}`);
        console.log(`   Component: ${data.component || 'N/A'}`);
        console.log(`   Severity: ${data.severity || 'N/A'}`);
        console.log(`   Category: ${data.category || 'N/A'}`);
        console.log(`   User ID: ${data.userId || 'N/A'}`);
        console.log(`   Timestamp: ${data.timestamp?.toDate()?.toLocaleString() || 'N/A'}`);
        console.log(`   URL: ${data.url || 'N/A'}`);
        console.log(`   Browser: ${data.browser || 'N/A'}`);
        console.log(`   OS: ${data.os || 'N/A'}`);
        if (data.stack) {
          console.log(`   Stack Trace: ${data.stack.substring(0, 200)}...`);
        }
        console.log('-'.repeat(80));
      });
    }
    
    // Also check for any logs in the last 24 hours
    console.log('\n🔍 Checking for any errors in the last 24 hours...\n');
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);
    
    const recentQ = query(
      errorLogsRef,
      where('timestamp', '>=', Timestamp.fromDate(last24Hours)),
      orderBy('timestamp', 'desc'),
      limit(10)
    );
    
    const recentSnapshot = await getDocs(recentQ);
    
    if (!recentSnapshot.empty) {
      console.log(`📊 Found ${recentSnapshot.size} error(s) in the last 24 hours:\n`);
      recentSnapshot.docs.slice(0, 5).forEach((doc) => {
        const data = doc.data();
        console.log(`   - ${data.timestamp?.toDate()?.toLocaleString()}: ${data.message}`);
      });
      if (recentSnapshot.size > 5) {
        console.log(`   ... and ${recentSnapshot.size - 5} more`);
      }
    } else {
      console.log('✅ No errors found in the last 24 hours.');
    }
    
  } catch (error: any) {
    if (error.code === 'permission-denied') {
      console.error('❌ Permission denied. You may need admin access to view error logs.');
    } else if (error.code === 'not-found' || error.message?.includes('index')) {
      console.log('❌ errorLogs collection does not exist yet.');
      console.log('💡 Error logging to Firestore needs to be set up first.');
      console.log('   Errors will start appearing here once the app is deployed with error logging.');
    } else {
      console.error('❌ Error checking logs:', error.message);
      console.error('   Full error:', error);
    }
  }
}

// Run the check
checkLogs()
  .then(() => {
    console.log('\n✅ Check complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

