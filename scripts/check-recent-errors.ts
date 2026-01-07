/**
 * Script to check Firestore for error logs in the last 5 hours
 * Run with: npx tsx scripts/check-recent-errors.ts
 * 
 * Note: This uses the client SDK and requires you to be authenticated
 * as an admin user in Firebase. Make sure you're logged in via Firebase CLI.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';

// Firebase config - using production project
const firebaseConfig = {
  projectId: 'momsfitnessmojo-65d00',
  // Add other config if needed, but projectId should be enough for Firestore
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkRecentErrors() {
  try {
    console.log('🔍 Checking for error logs in the last 5 hours...\n');
    
    // Calculate time range (last 5 hours)
    const now = new Date();
    const fiveHoursAgo = new Date(now.getTime() - (5 * 60 * 60 * 1000));
    
    console.log(`Time range: ${fiveHoursAgo.toISOString()} to ${now.toISOString()}\n`);
    
    // Query errorLogs collection
    const errorLogsRef = collection(db, 'errorLogs');
    const q = query(
      errorLogsRef,
      where('timestamp', '>=', Timestamp.fromDate(fiveHoursAgo)),
      where('timestamp', '<=', Timestamp.fromDate(now)),
      orderBy('timestamp', 'desc'),
      limit(100)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('✅ No errors found in the last 5 hours.\n');
      console.log('💡 This could mean:');
      console.log('   - No errors occurred (good!)');
      console.log('   - Errors are only logged in production');
      console.log('   - Error collection doesn\'t exist yet');
    } else {
      console.log(`⚠️  Found ${snapshot.size} error(s) in the last 5 hours:\n`);
      
      // Group by severity
      const bySeverity: { [key: string]: any[] } = {
        critical: [],
        high: [],
        medium: [],
        low: []
      };
      
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const severity = data.severity || 'unknown';
        if (bySeverity[severity]) {
          bySeverity[severity].push({ id: doc.id, ...data });
        }
      });
      
      // Display summary
      console.log('📊 Summary by Severity:');
      console.log(`   Critical: ${bySeverity.critical.length}`);
      console.log(`   High: ${bySeverity.high.length}`);
      console.log(`   Medium: ${bySeverity.medium.length}`);
      console.log(`   Low: ${bySeverity.low.length}\n`);
      
      // Show details for critical and high severity errors
      const importantErrors = [...bySeverity.critical, ...bySeverity.high];
      if (importantErrors.length > 0) {
        console.log('🚨 Critical/High Severity Errors:\n');
        importantErrors.slice(0, 10).forEach((error, index) => {
          const timestamp = error.timestamp?.toDate ? error.timestamp.toDate() : error.timestamp;
          console.log(`${index + 1}. [${error.severity?.toUpperCase()}] ${error.message}`);
          console.log(`   Component: ${error.component || 'N/A'}`);
          console.log(`   Category: ${error.category || 'N/A'}`);
          console.log(`   Time: ${timestamp?.toLocaleString() || 'N/A'}`);
          console.log(`   User: ${error.userId || 'N/A'}`);
          console.log(`   URL: ${error.url || 'N/A'}`);
          if (error.code) {
            console.log(`   Code: ${error.code}`);
          }
          console.log('');
        });
        
        if (importantErrors.length > 10) {
          console.log(`   ... and ${importantErrors.length - 10} more critical/high errors\n`);
        }
      }
      
      // Show recent errors (all severities)
      console.log('📋 Recent Errors (last 10, all severities):\n');
      snapshot.docs.slice(0, 10).forEach((doc, index) => {
        const data = doc.data();
        const timestamp = data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp;
        const severityEmoji = data.severity === 'critical' ? '🔴' : 
                             data.severity === 'high' ? '🟠' : 
                             data.severity === 'medium' ? '🟡' : '⚪';
        console.log(`${index + 1}. ${severityEmoji} [${data.severity?.toUpperCase() || 'UNKNOWN'}] ${data.message}`);
        console.log(`   Time: ${timestamp?.toLocaleString() || 'N/A'} | Component: ${data.component || 'N/A'} | Category: ${data.category || 'N/A'}`);
        console.log('');
      });
    }
    
    // Also check Firebase Functions logs (if we can)
    console.log('\n💡 To check Firebase Functions logs, use:');
    console.log('   firebase functions:log --only <function-name> --project=momsfitnessmojo-65d00');
    console.log('   OR visit: https://console.cloud.google.com/logs/query?project=momsfitnessmojo-65d00');
    
  } catch (error: any) {
    if (error.code === 'permission-denied') {
      console.error('❌ Permission denied. You need admin access to view error logs.');
      console.log('\n💡 Note: This script uses the client SDK.');
      console.log('   For admin access, you may need to:');
      console.log('   1. Use Firebase Console directly, OR');
      console.log('   2. Use the admin dashboard at /admin/error-logs in your app');
    } else if (error.code === 'not-found' || error.message?.includes('index')) {
      console.log('❌ errorLogs collection does not exist yet or index is missing.');
      console.log('💡 This is normal if:');
      console.log('   - No errors have been logged yet');
      console.log('   - Errors are only logged in production');
      console.log('   - The collection needs to be created on first error');
    } else {
      console.error('❌ Error checking logs:', error.message);
      console.error('   Full error:', error);
    }
  }
}

// Run the check
checkRecentErrors()
  .then(() => {
    console.log('\n✅ Check complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

