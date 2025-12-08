/**
 * KB Diagnostic Script
 * Checks if KB content is synced and embeddings are ready
 * 
 * Usage: node check-kb-status.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./functions/serviceAccountKey.json'); // You may need to adjust this path

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'momsfitnessmojo-65d00'
});

const db = admin.firestore();

async function checkKBStatus() {
  console.log('🔍 Checking Knowledge Base Status...\n');
  console.log('='.repeat(60));
  
  try {
    // 1. Check KB Sources (especially static_founder_story)
    console.log('\n📚 Step 1: Checking KB Sources...');
    console.log('-'.repeat(60));
    
    const sourcesSnapshot = await db.collection('kb_sources')
      .where('sourceType', '==', 'static')
      .get();
    
    console.log(`Found ${sourcesSnapshot.size} static sources`);
    
    const founderSource = sourcesSnapshot.docs.find(doc => doc.id === 'static_founder_story');
    
    if (founderSource) {
      const data = founderSource.data();
      console.log('\n✅ Found static_founder_story source:');
      console.log(`   Title: ${data.title || 'N/A'}`);
      console.log(`   Source ID: ${founderSource.id}`);
      console.log(`   Chunk IDs: ${Array.isArray(data.chunkIds) ? data.chunkIds.length : 0} chunks`);
      console.log(`   Visibility: ${data.visibility || 'N/A'}`);
      console.log(`   Updated: ${data.updatedAt?.toDate?.() || 'N/A'}`);
      
      const chunkIds = Array.isArray(data.chunkIds) ? data.chunkIds : [];
      
      if (chunkIds.length === 0) {
        console.log('\n⚠️  WARNING: No chunks found for static_founder_story!');
        console.log('   This means the content was synced but not chunked yet.');
        console.log('   Solution: Wait a few minutes or trigger chunking manually.');
      } else {
        console.log(`\n✅ Found ${chunkIds.length} chunks for founder story`);
        
        // 2. Check Chunks and Embedding Status
        console.log('\n📦 Step 2: Checking Chunks and Embedding Status...');
        console.log('-'.repeat(60));
        
        const chunksSnapshot = await db.collection('kb_chunks')
          .where('sourceKey', '==', 'static_founder_story')
          .get();
        
        console.log(`Found ${chunksSnapshot.size} chunks with sourceKey: static_founder_story`);
        
        const statusCounts = {
          ready: 0,
          pending: 0,
          processing: 0,
          error: 0,
          missing: 0
        };
        
        const chunksWithIssues = [];
        
        chunksSnapshot.forEach(doc => {
          const chunkData = doc.data();
          const status = chunkData.embeddingStatus || 'missing';
          
          if (status === 'ready') {
            statusCounts.ready++;
          } else if (status === 'pending') {
            statusCounts.pending++;
          } else if (status === 'processing') {
            statusCounts.processing++;
          } else if (status === 'error') {
            statusCounts.error++;
            chunksWithIssues.push({
              id: doc.id,
              error: chunkData.embeddingError || 'Unknown error',
              title: chunkData.title || 'N/A'
            });
          } else {
            statusCounts.missing++;
          }
        });
        
        console.log('\n📊 Embedding Status Summary:');
        console.log(`   ✅ Ready: ${statusCounts.ready}`);
        console.log(`   ⏳ Pending: ${statusCounts.pending}`);
        console.log(`   🔄 Processing: ${statusCounts.processing}`);
        console.log(`   ❌ Error: ${statusCounts.error}`);
        console.log(`   ⚠️  Missing Status: ${statusCounts.missing}`);
        
        if (statusCounts.error > 0) {
          console.log('\n⚠️  Chunks with Errors:');
          chunksWithIssues.forEach(chunk => {
            console.log(`   - ${chunk.id}: ${chunk.error}`);
          });
        }
        
        // Check if chunks have embeddings
        let chunksWithEmbeddings = 0;
        chunksSnapshot.forEach(doc => {
          const chunkData = doc.data();
          if (chunkData.embedding && Array.isArray(chunkData.embedding)) {
            chunksWithEmbeddings++;
          }
        });
        
        console.log(`\n🔢 Chunks with Embeddings: ${chunksWithEmbeddings}/${chunksSnapshot.size}`);
        
        if (chunksWithEmbeddings === 0) {
          console.log('\n⚠️  WARNING: No chunks have embeddings!');
          console.log('   This means vector search will not work.');
          console.log('   Solution: Run backfillKnowledgeBaseEmbeddings function.');
        } else if (chunksWithEmbeddings < chunksSnapshot.size) {
          console.log(`\n⚠️  WARNING: Only ${chunksWithEmbeddings} of ${chunksSnapshot.size} chunks have embeddings.`);
          console.log('   Some chunks are missing embeddings.');
        } else {
          console.log('\n✅ All chunks have embeddings!');
        }
        
        // Show sample chunk content
        if (chunksSnapshot.size > 0) {
          const firstChunk = chunksSnapshot.docs[0].data();
          console.log('\n📄 Sample Chunk Content (first 200 chars):');
          console.log(`   "${(firstChunk.text || '').substring(0, 200)}..."`);
          console.log(`   Title: ${firstChunk.title || 'N/A'}`);
        }
      }
    } else {
      console.log('\n❌ ERROR: static_founder_story source NOT FOUND!');
      console.log('   This means the static content has not been synced to KB yet.');
      console.log('   Solution: Run syncSiteCopyToKnowledgeBase function.');
      console.log('\n   Available static sources:');
      sourcesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log(`   - ${doc.id}: ${data.title || 'N/A'}`);
      });
    }
    
    // 3. Overall KB Status
    console.log('\n\n📊 Step 3: Overall KB Status...');
    console.log('-'.repeat(60));
    
    const allChunksSnapshot = await db.collection('kb_chunks').count().get();
    const allSourcesSnapshot = await db.collection('kb_sources').count().get();
    
    const readyChunksSnapshot = await db.collection('kb_chunks')
      .where('embeddingStatus', '==', 'ready')
      .count()
      .get();
    
    const pendingChunksSnapshot = await db.collection('kb_chunks')
      .where('embeddingStatus', '==', 'pending')
      .count()
      .get();
    
    console.log(`Total KB Sources: ${allSourcesSnapshot.data().count}`);
    console.log(`Total KB Chunks: ${allChunksSnapshot.data().count}`);
    console.log(`Ready Embeddings: ${readyChunksSnapshot.data().count}`);
    console.log(`Pending Embeddings: ${pendingChunksSnapshot.data().count}`);
    
    // 4. Recommendations
    console.log('\n\n💡 Recommendations:');
    console.log('='.repeat(60));
    
    if (!founderSource) {
      console.log('1. ❌ Sync static content: Run syncSiteCopyToKnowledgeBase()');
    } else {
      const data = founderSource.data();
      const chunkIds = Array.isArray(data.chunkIds) ? data.chunkIds : [];
      
      if (chunkIds.length === 0) {
        console.log('1. ⏳ Wait for chunks to be created (or trigger manually)');
      } else {
        const chunksSnapshot = await db.collection('kb_chunks')
          .where('sourceKey', '==', 'static_founder_story')
          .get();
        
        const readyCount = chunksSnapshot.docs.filter(d => d.data().embeddingStatus === 'ready').length;
        
        if (readyCount === 0) {
          console.log('1. ❌ Run backfillKnowledgeBaseEmbeddings() to generate embeddings');
        } else if (readyCount < chunksSnapshot.size) {
          console.log(`1. ⚠️  Some embeddings are pending. Wait or run backfillKnowledgeBaseEmbeddings()`);
        } else {
          console.log('1. ✅ KB is ready! The issue might be:');
          console.log('   - Brand detection not working (check function logs)');
          console.log('   - Similarity scores too high (check function logs)');
          console.log('   - Vector index not built (check Firebase Console)');
        }
      }
    }
    
    console.log('\n2. 📋 Check Function Logs:');
    console.log('   - Go to Firebase Console → Functions → Logs');
    console.log('   - Look for [assistant.isBrandQuestion] entries');
    console.log('   - Look for [assistant.chatAsk] entries with similarity scores');
    
    console.log('\n3. 🔍 Test Questions:');
    console.log('   - "who is aina rai?"');
    console.log('   - "who is the founder of this community?"');
    console.log('   - Check if they return KB results or general knowledge');
    
  } catch (error) {
    console.error('\n❌ Error checking KB status:', error);
    console.error('\nMake sure you have:');
    console.error('1. Firebase Admin SDK installed: npm install firebase-admin');
    console.error('2. Service account key file in functions/serviceAccountKey.json');
    console.error('3. Proper permissions to read Firestore');
  } finally {
    process.exit(0);
  }
}

// Run the check
checkKBStatus();

