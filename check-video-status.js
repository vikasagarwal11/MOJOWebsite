/**
 * Diagnostic script to check video processing status in Firestore
 * Run with: node check-video-status.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./functions/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'momsfitnessmojo-65d00'
});

const db = admin.firestore();

async function checkVideoStatus() {
  try {
    console.log('🔍 Checking video processing status...\n');
    
    // Get all video media
    const mediaSnapshot = await db.collection('media')
      .where('type', '==', 'video')
      .orderBy('createdAt', 'desc')
      .limit(150)
      .get();
    
    const videos = [];
    mediaSnapshot.forEach(doc => {
      videos.push({ id: doc.id, ...doc.data() });
    });
    
    console.log(`📊 Total videos found: ${videos.length}\n`);
    
    // Categorize videos
    const ready = videos.filter(v => v.transcodeStatus === 'ready' && v.sources?.hlsMaster);
    const processing = videos.filter(v => v.transcodeStatus === 'processing');
    const failed = videos.filter(v => v.transcodeStatus === 'failed');
    const readyButNoHls = videos.filter(v => v.transcodeStatus === 'ready' && !v.sources?.hlsMaster);
    
    console.log('📈 Status Summary:');
    console.log(`  ✅ Ready with HLS: ${ready.length}`);
    console.log(`  ⏳ Processing: ${processing.length}`);
    console.log(`  ❌ Failed: ${failed.length}`);
    console.log(`  ⚠️  Ready but no HLS: ${readyButNoHls.length}\n`);
    
    // Check quality levels
    const withQualityLevels = videos.filter(v => v.qualityLevels && Array.isArray(v.qualityLevels) && v.qualityLevels.length > 0);
    const withBackgroundProcessing = videos.filter(v => v.backgroundProcessingStatus);
    
    console.log('🎬 Quality Processing:');
    console.log(`  Videos with quality levels: ${withQualityLevels.length}`);
    console.log(`  Videos with background processing: ${withBackgroundProcessing.length}\n`);
    
    // Analyze quality completion
    const qualityStats = {
      '720p': 0,
      '1080p': 0,
      '2160p': 0,
      'incomplete': 0
    };
    
    withQualityLevels.forEach(v => {
      const qualityNames = v.qualityLevels.map(q => q.name);
      if (qualityNames.includes('720p')) qualityStats['720p']++;
      if (qualityNames.includes('1080p')) qualityStats['1080p']++;
      if (qualityNames.includes('2160p')) qualityStats['2160p']++;
      
      // Check if has all expected qualities
      const has720 = qualityNames.includes('720p');
      const has1080 = qualityNames.includes('1080p');
      const has4K = qualityNames.includes('2160p');
      
      // If video should have multiple qualities but only has 720p, it's incomplete
      if (has720 && !has1080 && !has4K && v.backgroundProcessingTargetQualities?.length > 0) {
        qualityStats['incomplete']++;
      }
    });
    
    console.log('📊 Quality Completion:');
    console.log(`  720p completed: ${qualityStats['720p']}`);
    console.log(`  1080p completed: ${qualityStats['1080p']}`);
    console.log(`  4K (2160p) completed: ${qualityStats['2160p']}`);
    console.log(`  Incomplete (stuck in background): ${qualityStats['incomplete']}\n`);
    
    // Show stuck videos
    if (processing.length > 0) {
      console.log('⚠️  Stuck in Processing:');
      processing.slice(0, 10).forEach(v => {
        console.log(`  - ${v.id}: ${v.transcodingMessage || 'No message'}`);
        if (v.backgroundProcessingStatus) {
          console.log(`    Background: ${v.backgroundProcessingStatus}`);
          console.log(`    Target qualities: ${v.backgroundProcessingTargetQualities?.join(', ') || 'none'}`);
          console.log(`    Completed: ${v.qualityLevels?.length || 0}`);
          if (v.failedQualities && v.failedQualities.length > 0) {
            console.log(`    Failed: ${v.failedQualities.map(f => f.name).join(', ')}`);
          }
        }
      });
      if (processing.length > 10) {
        console.log(`  ... and ${processing.length - 10} more`);
      }
      console.log('');
    }
    
    // Show videos with background processing issues
    const stuckBackground = videos.filter(v => 
      v.backgroundProcessingStatus === 'processing' && 
      v.backgroundProcessingTargetQualities?.length > 0 &&
      (!v.qualityLevels || v.qualityLevels.length < v.backgroundProcessingTargetQualities.length + 1)
    );
    
    if (stuckBackground.length > 0) {
      console.log('🔄 Stuck in Background Processing:');
      stuckBackground.slice(0, 10).forEach(v => {
        const completed = v.qualityLevels?.map(q => q.name) || [];
        const target = v.backgroundProcessingTargetQualities || [];
        const missing = target.filter(t => !completed.includes(t));
        console.log(`  - ${v.id}: Missing ${missing.join(', ')}`);
        console.log(`    Completed: ${completed.join(', ') || 'none'}`);
        console.log(`    Target: ${target.join(', ')}`);
        if (v.failedQualities && v.failedQualities.length > 0) {
          console.log(`    Failed: ${v.failedQualities.map(f => `${f.name} (${f.error})`).join(', ')}`);
        }
      });
      if (stuckBackground.length > 10) {
        console.log(`  ... and ${stuckBackground.length - 10} more`);
      }
      console.log('');
    }
    
    // Check for failed qualities
    const withFailedQualities = videos.filter(v => v.failedQualities && v.failedQualities.length > 0);
    if (withFailedQualities.length > 0) {
      console.log('❌ Videos with Failed Qualities:');
      withFailedQualities.slice(0, 10).forEach(v => {
        console.log(`  - ${v.id}:`);
        v.failedQualities.forEach(f => {
          console.log(`    ${f.name}: ${f.error}`);
        });
      });
      if (withFailedQualities.length > 10) {
        console.log(`  ... and ${withFailedQualities.length - 10} more`);
      }
      console.log('');
    }
    
    console.log('\n✅ Analysis complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkVideoStatus();

