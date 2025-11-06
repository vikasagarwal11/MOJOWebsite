/**
 * Script to check for stuck processing files and fix them
 * Run with: node functions/check-stuck-files.js
 */

const admin = require('firebase-admin');
const { getStorage } = require('firebase-admin/storage');

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    // Try to use service account if available
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: 'momsfitnessmojo-65d00.firebasestorage.app',
      projectId: 'momsfitnessmojo-65d00'
    });
  } catch (error) {
    // Fallback to application default credentials
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: 'momsfitnessmojo-65d00.firebasestorage.app',
      projectId: 'momsfitnessmojo-65d00'
    });
  }
}

const db = admin.firestore();
const bucket = getStorage().bucket();

async function checkStuckFiles() {
  try {
    console.log('🔍 Checking for stuck processing files...\n');
    
    // Get all media files stuck in processing
    const stuckQuery = await db.collection('media')
      .where('transcodeStatus', '==', 'processing')
      .orderBy('createdAt', 'desc')
      .get();
    
    console.log(`📊 Found ${stuckQuery.docs.length} files in processing status\n`);
    
    const stuckFiles = [];
    const now = new Date();
    
    for (const doc of stuckQuery.docs) {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
      const hoursStuck = createdAt ? (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60) : 0;
      
      // Check if file has HLS sources
      const hasHls = !!data.sources?.hls || !!data.sources?.hlsMaster;
      const hasHlsFiles = await checkHlsFilesExist(data.filePath);
      
      stuckFiles.push({
        id: doc.id,
        type: data.type,
        filePath: data.filePath,
        storageFolder: data.storageFolder,
        createdAt: createdAt,
        hoursStuck: hoursStuck.toFixed(2),
        hasHls: hasHls,
        hasHlsFiles: hasHlsFiles,
        sources: data.sources,
        backgroundProcessingStatus: data.backgroundProcessingStatus,
        qualityLevels: data.qualityLevels?.length || 0
      });
    }
    
    // Display results
    console.log('📋 Stuck Files Analysis:\n');
    stuckFiles.forEach((file, index) => {
      console.log(`${index + 1}. ${file.id}`);
      console.log(`   Type: ${file.type}`);
      console.log(`   Stuck for: ${file.hoursStuck} hours`);
      console.log(`   Has HLS in Firestore: ${file.hasHls ? '✅' : '❌'}`);
      console.log(`   Has HLS files in Storage: ${file.hasHlsFiles ? '✅' : '❌'}`);
      console.log(`   Quality levels: ${file.qualityLevels}`);
      console.log(`   Background processing: ${file.backgroundProcessingStatus || 'none'}`);
      console.log('');
    });
    
    // Identify files that should be fixed
    const filesToFix = stuckFiles.filter(file => {
      // Fix if:
      // 1. Has HLS files but status is still processing
      // 2. Stuck for more than 2 hours and no HLS files (mark as failed)
      return (file.hasHlsFiles && !file.hasHls) || 
             (parseFloat(file.hoursStuck) > 2 && !file.hasHlsFiles);
    });
    
    if (filesToFix.length > 0) {
      console.log(`\n🔧 Found ${filesToFix.length} files that need fixing:\n`);
      
      for (const file of filesToFix) {
        const newStatus = file.hasHlsFiles ? 'ready' : 'failed';
        const reason = file.hasHlsFiles 
          ? 'HLS files exist but status was stuck in processing'
          : 'Stuck in processing for more than 2 hours with no HLS files';
        
        console.log(`   Fixing ${file.id}: processing → ${newStatus}`);
        console.log(`   Reason: ${reason}`);
        
        await db.collection('media').doc(file.id).update({
          transcodeStatus: newStatus,
          lastManualFix: admin.firestore.FieldValue.serverTimestamp(),
          manualFixReason: reason,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      
      console.log(`\n✅ Fixed ${filesToFix.length} stuck files`);
    } else {
      console.log('\n✅ No files need fixing (all are legitimately processing)');
    }
    
    // Summary
    console.log('\n📊 Summary:');
    console.log(`   Total stuck: ${stuckFiles.length}`);
    console.log(`   Fixed: ${filesToFix.length}`);
    console.log(`   Still processing: ${stuckFiles.length - filesToFix.length}`);
    
  } catch (error) {
    console.error('❌ Error checking stuck files:', error);
    process.exit(1);
  }
}

async function checkHlsFilesExist(filePath) {
  if (!filePath) return false;
  
  try {
    // Check if HLS folder exists
    const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
    const hlsFolder = `${folderPath}/hls/`;
    
    const [files] = await bucket.getFiles({ prefix: hlsFolder, maxResults: 1 });
    return files.length > 0;
  } catch (error) {
    console.warn(`⚠️ Error checking HLS files for ${filePath}:`, error.message);
    return false;
  }
}

// Run the script
checkStuckFiles()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

