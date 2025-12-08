/**
 * Legacy User Migration Script
 * 
 * This script migrates existing users who don't have a 'status' field
 * to have status: 'approved'. This is necessary because the new security
 * fixes default missing status to 'pending', which would block legacy users.
 * 
 * Usage:
 *   node scripts/migrate-legacy-users.js [--dry-run] [--project-id=YOUR_PROJECT_ID]
 * 
 * Options:
 *   --dry-run: Show what would be updated without making changes
 *   --project-id: Firebase project ID (defaults to env or 'momfitnessmojo')
 * 
 * IMPORTANT: 
 *   - Backup your Firestore database before running
 *   - Test in a development environment first
 *   - Run during low-traffic period
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ID = process.argv.find(arg => arg.startsWith('--project-id='))?.split('=')[1] 
  || process.env.FIREBASE_PROJECT_ID 
  || 'momfitnessmojo';

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      projectId: PROJECT_ID,
    });
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin:', error);
    console.error('💡 Make sure you have Firebase Admin SDK credentials set up.');
    console.error('💡 Or use: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json');
    process.exit(1);
  }
}

const db = admin.firestore();

// Create readline interface for confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function migrateLegacyUsers() {
  console.log('🔍 Legacy User Migration Script');
  console.log('================================\n');
  console.log(`Project ID: ${PROJECT_ID}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}\n`);

  try {
    // Get all users
    console.log('📊 Fetching all users from Firestore...');
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
      console.log('✅ No users found in database.');
      rl.close();
      return;
    }

    console.log(`📊 Found ${usersSnapshot.size} total users.\n`);

    // Find users without status field
    const usersWithoutStatus = [];
    const usersWithStatus = [];

    usersSnapshot.forEach(doc => {
      const data = doc.data();
      if (!data.status) {
        usersWithoutStatus.push({
          id: doc.id,
          email: data.email || 'N/A',
          displayName: data.displayName || 'N/A',
          createdAt: data.createdAt?.toDate?.() || null,
        });
      } else {
        usersWithStatus.push({
          id: doc.id,
          status: data.status,
        });
      }
    });

    console.log(`📊 Users with status field: ${usersWithStatus.length}`);
    console.log(`📊 Users WITHOUT status field: ${usersWithoutStatus.length}\n`);

    if (usersWithoutStatus.length === 0) {
      console.log('✅ All users already have a status field. No migration needed!');
      rl.close();
      return;
    }

    // Show summary
    console.log('📋 Users that will be migrated:');
    console.log('--------------------------------');
    usersWithoutStatus.slice(0, 10).forEach((user, index) => {
      console.log(`${index + 1}. ${user.displayName} (${user.email}) - ID: ${user.id}`);
      if (user.createdAt) {
        console.log(`   Created: ${user.createdAt.toLocaleDateString()}`);
      }
    });
    if (usersWithoutStatus.length > 10) {
      console.log(`   ... and ${usersWithoutStatus.length - 10} more users`);
    }
    console.log('');

    // Confirmation
    if (!DRY_RUN) {
      const answer = await question(
        `⚠️  This will update ${usersWithoutStatus.length} users to have status: 'approved'.\n` +
        `⚠️  Are you sure you want to proceed? (yes/no): `
      );

      if (answer.toLowerCase() !== 'yes') {
        console.log('❌ Migration cancelled.');
        rl.close();
        return;
      }
    }

    // Perform migration
    console.log('\n🔄 Starting migration...\n');
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    const batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 500; // Firestore batch limit

    for (const user of usersWithoutStatus) {
      try {
        const userRef = db.collection('users').doc(user.id);
        
        if (DRY_RUN) {
          console.log(`[DRY RUN] Would update: ${user.displayName} (${user.id})`);
          successCount++;
        } else {
          batch.update(userRef, {
            status: 'approved',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            // Add a migration marker for tracking
            _migratedAt: admin.firestore.FieldValue.serverTimestamp(),
            _migrationNote: 'Migrated from legacy user (no status field) to approved status',
          });
          batchCount++;

          // Commit batch if it reaches the limit
          if (batchCount >= BATCH_SIZE) {
            await batch.commit();
            console.log(`✅ Committed batch of ${batchCount} users`);
            successCount += batchCount;
            batchCount = 0;
          }
        }
      } catch (error) {
        console.error(`❌ Error updating user ${user.id}:`, error.message);
        errorCount++;
        errors.push({ userId: user.id, error: error.message });
      }
    }

    // Commit remaining batch
    if (!DRY_RUN && batchCount > 0) {
      await batch.commit();
      console.log(`✅ Committed final batch of ${batchCount} users`);
      successCount += batchCount;
    }

    // Summary
    console.log('\n📊 Migration Summary');
    console.log('===================');
    console.log(`✅ Successfully ${DRY_RUN ? 'would update' : 'updated'}: ${successCount} users`);
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount} users`);
      console.log('\nErrors:');
      errors.forEach(err => {
        console.log(`  - ${err.userId}: ${err.error}`);
      });
    }

    if (DRY_RUN) {
      console.log('\n💡 This was a dry run. No changes were made.');
      console.log('💡 Run without --dry-run to apply changes.');
    } else {
      console.log('\n✅ Migration completed!');
      console.log('💡 Verify the changes in Firebase Console.');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run migration
migrateLegacyUsers()
  .then(() => {
    console.log('\n✅ Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

