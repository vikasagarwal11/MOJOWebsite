#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Function to extract SVG dimensions from the first line
function analyzeSVG(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const firstLine = content.split('\n')[0];
    
    // Extract width, height, and viewBox
    const widthMatch = firstLine.match(/width="([^"]+)"/);
    const heightMatch = firstLine.match(/height="([^"]+)"/);
    const viewBoxMatch = firstLine.match(/viewBox="([^"]+)"/);
    
    const fileSize = fs.statSync(filePath).size;
    
    return {
      width: widthMatch ? widthMatch[1] : 'unknown',
      height: heightMatch ? heightMatch[1] : 'unknown',
      viewBox: viewBoxMatch ? viewBoxMatch[1] : 'unknown',
      size: fileSize,
      hasEmbeddedImage: content.includes('data:image/png;base64'),
      isCleanSVG: !content.includes('data:image/png;base64') && content.includes('<path') || content.includes('<circle') || content.includes('<rect')
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Analyze all SVG files
function analyzeAllLogos() {
  const logoDir = 'TempFileForLogs/MFM Logo file';
  const files = fs.readdirSync(logoDir).filter(f => f.endsWith('.svg'));
  
  console.log('🎨 Analyzing Canva Logo Files...\n');
  console.log('File\t\tWidth\tHeight\t\tViewBox\t\t\tSize\t\tType');
  console.log('─'.repeat(80));
  
  const results = [];
  
  files.forEach(file => {
    const filePath = path.join(logoDir, file);
    const analysis = analyzeSVG(filePath);
    
    if (analysis.error) {
      console.log(`${file}\t\tERROR: ${analysis.error}`);
      return;
    }
    
    const type = analysis.hasEmbeddedImage ? 'PNG-in-SVG' : (analysis.isCleanSVG ? 'Clean SVG' : 'Unknown');
    const sizeKB = Math.round(analysis.size / 1024);
    
    console.log(`${file}\t\t${analysis.width}\t${analysis.height}\t\t${analysis.viewBox}\t\t${sizeKB}KB\t\t${type}`);
    
    results.push({
      file,
      ...analysis,
      sizeKB
    });
  });
  
  // Find the best candidates
  console.log('\n🎯 RECOMMENDATIONS:\n');
  
  // Find clean SVGs (no embedded images)
  const cleanSVGs = results.filter(r => r.isCleanSVG && !r.hasEmbeddedImage);
  if (cleanSVGs.length > 0) {
    console.log('✅ CLEAN SVGs (Best Choice):');
    cleanSVGs.forEach(svg => {
      console.log(`   ${svg.file} - ${svg.width}x${svg.height} (${svg.sizeKB}KB)`);
    });
  }
  
  // Find smallest files
  const smallest = results.sort((a, b) => a.size - b.size).slice(0, 5);
  console.log('\n📦 SMALLEST FILES:');
  smallest.forEach(svg => {
    console.log(`   ${svg.file} - ${svg.sizeKB}KB`);
  });
  
  // Find square formats (good for favicons)
  const squareFormats = results.filter(r => {
    const width = parseInt(r.width);
    const height = parseInt(r.height);
    return width === height && width <= 512;
  });
  
  if (squareFormats.length > 0) {
    console.log('\n🔲 SQUARE FORMATS (Good for Favicons):');
    squareFormats.forEach(svg => {
      console.log(`   ${svg.file} - ${svg.width}x${svg.height}`);
    });
  }
  
  // Find landscape formats (good for social media)
  const landscapeFormats = results.filter(r => {
    const width = parseInt(r.width);
    const height = parseInt(r.height);
    return width > height && (width/height) >= 1.5;
  });
  
  if (landscapeFormats.length > 0) {
    console.log('\n📱 LANDSCAPE FORMATS (Good for Social Media):');
    landscapeFormats.forEach(svg => {
      console.log(`   ${svg.file} - ${svg.width}x${svg.height}`);
    });
  }
}

// Run the analysis
if (require.main === module) {
  analyzeAllLogos();
}

module.exports = { analyzeAllLogos };
