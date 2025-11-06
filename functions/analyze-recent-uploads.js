const admin = require('firebase-admin');
const { getStorage } = require('firebase-admin/storage');

if (!admin.apps.length) {
  try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: 'momsfitnessmojo-65d00.firebasestorage.app',
      projectId: 'momsfitnessmojo-65d00'
    });
  } catch (error) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: 'momsfitnessmojo-65d00.firebasestorage.app',
      projectId: 'momsfitnessmojo-65d00'
    });
  }
}

const db = admin.firestore();
const bucket = getStorage().bucket();

async function checkHlsFilesExist(filePath) {
  if (!filePath || !filePath.includes('/')) return false;
  
  try {
    const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
    const [files] = await bucket.getFiles({ prefix: `${folderPath}/hls/`, maxResults: 1 });
    return files.length > 0;
  } catch (error) {
    return false;
  }
}

async function analyzeRecentUploads() {
  try {
    console.log('🔍 Analyzing last 24 uploaded files...\n');
    
    // Get last 24 media documents
    const mediaSnapshot = await db.collection('media')
      .orderBy('createdAt', 'desc')
      .limit(24)
      .get();
    
    if (mediaSnapshot.empty) {
      console.log('❌ No media files found');
      return;
    }
    
    const files = [];
    const now = new Date();
    
    for (const doc of mediaSnapshot.docs) {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
      const ageMinutes = createdAt ? Math.round((now.getTime() - createdAt.getTime()) / (1000 * 60)) : 0;
      
      const qualityLevels = data.qualityLevels || [];
      const qualityNames = qualityLevels.map(q => q.name || q).filter(Boolean);
      const uniqueQualities = [...new Set(qualityNames)];
      
      // Check for duplicates in quality levels
      const hasDuplicates = qualityNames.length !== uniqueQualities.length;
      const duplicateQualities = qualityNames.filter((q, i) => qualityNames.indexOf(q) !== i);
      
      // Check expected qualities (720p, 1080p, 2160p/4K)
      const has720p = uniqueQualities.some(q => q.includes('720') || q === '720p');
      const has1080p = uniqueQualities.some(q => q.includes('1080') || q === '1080p');
      const has4K = uniqueQualities.some(q => q.includes('2160') || q.includes('4K') || q === '2160p' || q === '4K');
      
      const hasHls = !!data.sources?.hls || !!data.sources?.hlsMaster;
      const hasHlsFiles = data.type === 'video' ? await checkHlsFilesExist(data.filePath) : false;
      
      const bgStatus = data.backgroundProcessingStatus;
      const bgSummary = data.backgroundProcessingSummary || {};
      
      files.push({
        id: doc.id,
        type: data.type,
        fileName: data.filePath?.split('/').pop() || 'unknown',
        filePath: data.filePath,
        transcodeStatus: data.transcodeStatus || 'unknown',
        ageMinutes,
        qualityLevels: qualityLevels.length,
        uniqueQualities: uniqueQualities.length,
        qualityNames: uniqueQualities,
        hasDuplicates,
        duplicateQualities,
        has720p,
        has1080p,
        has4K,
        hasHls,
        hasHlsFiles,
        bgStatus,
        bgSummary,
        expectedQualities: data.type === 'video' ? 3 : 0,
        actualQualities: uniqueQualities.length
      });
    }
    
    // Separate videos and images
    const videos = files.filter(f => f.type === 'video');
    const images = files.filter(f => f.type === 'image');
    
    console.log('📊 Summary:');
    console.log(`  Total files: ${files.length}`);
    console.log(`  Videos: ${videos.length}`);
    console.log(`  Images: ${images.length}\n`);
    
    // Video Analysis
    if (videos.length > 0) {
      console.log('🎬 Video Analysis:\n');
      
      const ready = videos.filter(v => v.transcodeStatus === 'ready');
      const processing = videos.filter(v => v.transcodeStatus === 'processing');
      const failed = videos.filter(v => v.transcodeStatus === 'failed');
      
      console.log('📈 Status Breakdown:');
      console.log(`  ✅ Ready: ${ready.length}`);
      console.log(`  ⏳ Processing: ${processing.length}`);
      console.log(`  ❌ Failed: ${failed.length}\n`);
      
      // Quality Analysis
      const withAll3Qualities = videos.filter(v => v.has720p && v.has1080p && v.has4K);
      const withDuplicates = videos.filter(v => v.hasDuplicates);
      const incompleteQualities = videos.filter(v => v.actualQualities < v.expectedQualities && v.transcodeStatus === 'ready');
      const stuckProcessing = videos.filter(v => v.transcodeStatus === 'processing' && v.ageMinutes > 30);
      
      console.log('🎯 Quality Analysis:');
      console.log(`  ✅ All 3 qualities (720p, 1080p, 4K): ${withAll3Qualities.length}`);
      console.log(`  ⚠️  Has duplicate qualities: ${withDuplicates.length}`);
      console.log(`  ⚠️  Incomplete qualities (ready but <3): ${incompleteQualities.length}`);
      console.log(`  ⚠️  Stuck processing (>30 min): ${stuckProcessing.length}\n`);
      
      // Detailed file listing
      console.log('📋 Detailed File Analysis:\n');
      videos.forEach((file, index) => {
        const statusIcon = file.transcodeStatus === 'ready' ? '✅' : 
                          file.transcodeStatus === 'processing' ? '⏳' : '❌';
        const qualityIcon = file.has720p && file.has1080p && file.has4K ? '✅' : '⚠️';
        const duplicateIcon = file.hasDuplicates ? '⚠️' : '';
        
        console.log(`${index + 1}. ${statusIcon} ${file.fileName.substring(0, 40)}`);
        console.log(`   ID: ${file.id.substring(0, 12)}...`);
        console.log(`   Status: ${file.transcodeStatus} (${file.ageMinutes} min old)`);
        console.log(`   Qualities: ${file.actualQualities}/${file.expectedQualities} ${qualityIcon} ${duplicateIcon}`);
        if (file.qualityNames.length > 0) {
          console.log(`   Quality names: ${file.qualityNames.join(', ')}`);
        }
        if (file.hasDuplicates) {
          console.log(`   ⚠️  Duplicates: ${file.duplicateQualities.join(', ')}`);
        }
        if (file.transcodeStatus === 'ready' && !file.hasHls) {
          console.log(`   ⚠️  Ready but no HLS in Firestore`);
        }
        if (file.transcodeStatus === 'ready' && !file.hasHlsFiles) {
          console.log(`   ⚠️  Ready but no HLS files in Storage`);
        }
        if (file.bgStatus) {
          console.log(`   Background: ${file.bgStatus}`);
        }
        if (file.bgSummary && Object.keys(file.bgSummary).length > 0) {
          console.log(`   Summary: ${JSON.stringify(file.bgSummary)}`);
        }
        console.log('');
      });
      
      // Issues Summary
      const issues = [];
      if (withDuplicates.length > 0) {
        issues.push(`${withDuplicates.length} videos have duplicate quality entries`);
      }
      if (incompleteQualities.length > 0) {
        issues.push(`${incompleteQualities.length} videos are ready but missing qualities`);
      }
      if (stuckProcessing.length > 0) {
        issues.push(`${stuckProcessing.length} videos stuck in processing >30 min`);
      }
      const readyButNoHls = videos.filter(v => v.transcodeStatus === 'ready' && !v.hasHls && !v.hasHlsFiles);
      if (readyButNoHls.length > 0) {
        issues.push(`${readyButNoHls.length} videos marked ready but have no HLS`);
      }
      
      if (issues.length > 0) {
        console.log('\n⚠️  Issues Found:');
        issues.forEach(issue => console.log(`  - ${issue}`));
      } else {
        console.log('\n✅ No issues found!');
      }
    }
    
    // Image Analysis
    if (images.length > 0) {
      console.log('\n🖼️  Image Analysis:');
      console.log(`  Total images: ${images.length}`);
      const imagesWithThumbnails = images.filter(i => i.transcodeStatus === 'ready' || i.thumbnailPath);
      console.log(`  With thumbnails: ${imagesWithThumbnails.length}`);
    }
    
  } catch (error) {
    console.error('❌ Error analyzing uploads:', error);
    throw error;
  }
}

analyzeRecentUploads()
  .then(() => {
    console.log('\n✅ Analysis completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  });

