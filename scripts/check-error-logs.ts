/**
 * Script to check Firestore for error logs between 8:15 PM - 9:00 PM EST
 * Run with: npx tsx scripts/check-error-logs.ts
 */

import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../src/config/firebase';

async function checkErrorLogs() {
  try {
    console.log('🔍 Checking for error logs...\n');
    
    // Convert 8:15 PM - 9:00 PM EST to UTC (EST is UTC-5, EDT is UTC-4)
    // Assuming EST (UTC-5): 8:15 PM EST = 01:15 AM UTC next day, 9:00 PM EST = 02:00 AM UTC next day
    // You'll need to adjust based on the actual date
    const today = new Date();
    const estOffset = -5; // EST is UTC-5
    
    // Create date range for 8:15 PM - 9:00 PM EST today
    const startTime = new Date(today);
    startTime.setUTCHours(20 + estOffset, 15, 0, 0); // 8:15 PM EST
    
    const endTime = new Date(today);
    endTime.setUTCHours(21 + estOffset, 0, 0, 0); // 9:00 PM EST
    
    console.log(`Checking logs from ${startTime.toISOString()} to ${endTime.toISOString()}\n`);
    
    // Check if errorLogs collection exists
    const errorLogsRef = collection(db, 'errorLogs');
    const q = query(
      errorLogsRef,
      where('timestamp', '>=', Timestamp.fromDate(startTime)),
      where('timestamp', '<=', Timestamp.fromDate(endTime)),
      orderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('❌ No error logs found in Firestore for this time period.');
      console.log('💡 This means either:');
      console.log('   1. No errors occurred during this time');
      console.log('   2. Error logging to Firestore is not set up yet');
      console.log('   3. Errors are only logged to browser console');
    } else {
      console.log(`✅ Found ${snapshot.size} error log(s):\n`);
      
      snapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        console.log(`Error #${index + 1}:`);
        console.log(`  ID: ${doc.id}`);
        console.log(`  Message: ${data.message}`);
        console.log(`  Code: ${data.code || 'N/A'}`);
        console.log(`  Component: ${data.component || 'N/A'}`);
        console.log(`  Severity: ${data.severity || 'N/A'}`);
        console.log(`  Category: ${data.category || 'N/A'}`);
        console.log(`  User ID: ${data.userId || 'N/A'}`);
        console.log(`  Timestamp: ${data.timestamp?.toDate() || 'N/A'}`);
        console.log(`  URL: ${data.url || 'N/A'}`);
        if (data.stack) {
          console.log(`  Stack: ${data.stack.substring(0, 200)}...`);
        }
        console.log('');
      });
    }
    
    // Also check for any logs collection
    console.log('🔍 Checking for general logs collection...\n');
    try {
      const logsRef = collection(db, 'logs');
      const allLogsQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(50));
      const logsSnapshot = await getDocs(allLogsQuery);
      
      if (!logsSnapshot.empty) {
        console.log(`Found ${logsSnapshot.size} log entries (showing recent 50):\n`);
        logsSnapshot.docs.slice(0, 10).forEach((doc) => {
          const data = doc.data();
          console.log(`- ${data.timestamp?.toDate() || 'N/A'}: ${data.message || JSON.stringify(data)}`);
        });
      } else {
        console.log('❌ No logs collection found.');
      }
    } catch (err) {
      console.log('❌ Logs collection does not exist or is not accessible.');
    }
    
  } catch (error: any) {
    if (error.code === 'permission-denied') {
      console.log('❌ Permission denied. You may need admin access to view error logs.');
    } else if (error.code === 'not-found') {
      console.log('❌ errorLogs collection does not exist yet.');
      console.log('💡 This is normal - error logging to Firestore needs to be set up first.');
    } else {
      console.error('❌ Error checking logs:', error.message);
    }
  }
}

// Run the check
checkErrorLogs().then(() => {
  console.log('\n✅ Check complete.');
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

