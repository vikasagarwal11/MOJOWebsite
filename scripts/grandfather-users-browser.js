/**
 * Grandfather Existing Users - Browser Console Helper
 * 
 * Run this in your browser console (F12) while logged in as an admin user
 * 
 * Usage:
 * 1. Open your app in browser
 * 2. Make sure you're logged in as an admin
 * 3. Open Developer Console (F12)
 * 4. Paste this entire script and press Enter
 * 
 * OR copy just the function call at the bottom
 */

async function grandfatherUsers() {
  try {
    console.log('🔄 Starting grandfather process...');
    
    // Import Firebase functions (adjust import based on your setup)
    // This assumes Firebase is already imported in your app
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const { getApp } = await import('firebase/app');
    
    const app = getApp();
    const functions = getFunctions(app);
    const grandfatherUsers = httpsCallable(functions, 'grandfatherExistingUsers');
    
    console.log('📞 Calling Cloud Function...');
    const result = await grandfatherUsers();
    
    if (result.data.success) {
      console.log('✅ Success!', result.data);
      alert(`✅ Successfully updated ${result.data.updatedCount} users to approved status!`);
      return result.data;
    } else {
      throw new Error(result.data.message || 'Unknown error');
    }
  } catch (error) {
    console.error('❌ Error:', error);
    alert('❌ Error: ' + error.message);
    throw error;
  }
}

// Alternative: If Firebase is already imported in your app context
// You can use this simpler version:

async function grandfatherUsersSimple() {
  const functions = window.firebase?.functions?.(); // Adjust based on your Firebase setup
  const grandfatherUsers = functions.httpsCallable('grandfatherExistingUsers');
  
  try {
    const result = await grandfatherUsers();
    console.log('✅ Result:', result.data);
    alert(`Successfully updated ${result.data.updatedCount} users!`);
    return result.data;
  } catch (error) {
    console.error('❌ Error:', error);
    alert('Error: ' + error.message);
    throw error;
  }
}

// Run it
grandfatherUsers().catch(console.error);

