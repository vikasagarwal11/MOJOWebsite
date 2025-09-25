#!/usr/bin/env node

/**
 * Logo Generation Script
 * Creates multiple sizes and formats of the logo for cross-platform compatibility
 */

const fs = require('fs');
const path = require('path');

// Logo size configurations
const LOGO_SIZES = {
  // Favicons
  favicon: [
    { size: 16, name: 'favicon-16x16' },
    { size: 32, name: 'favicon-32x32' },
    { size: 48, name: 'favicon-48x48' },
    { size: 180, name: 'apple-touch-icon' },
  ],
  
  // PWA Icons
  pwa: [
    { size: 192, name: 'android-chrome-192x192' },
    { size: 512, name: 'android-chrome-512x512' },
  ],
  
  // Social Media
  social: [
    { size: 1200, ratio: '1.91:1', name: 'facebook-1200x630', width: 1200, height: 630 },
    { size: 1200, ratio: '16:9', name: 'twitter-1200x675', width: 1200, height: 675 },
    { size: 1080, ratio: '1:1', name: 'instagram-1080x1080', width: 1080, height: 1080 },
    { size: 1200, ratio: '1.91:1', name: 'linkedin-1200x627', width: 1200, height: 627 },
  ],
  
  // Web formats
  web: [
    { size: 64, name: 'logo-64x64' },
    { size: 128, name: 'logo-128x128' },
    { size: 256, name: 'logo-256x256' },
    { size: 512, name: 'logo-512x512' },
  ]
};

// Generate SVG content for different sizes
function generateSVG(size, width = null, height = null) {
  const actualWidth = width || size;
  const actualHeight = height || size;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${actualWidth}" height="${actualHeight}" viewBox="0 0 1050 1050">
  <!-- Your logo content here - this would be the simplified version of your main logo -->
  <rect width="${actualWidth}" height="${actualHeight}" fill="#F25129"/>
  <text x="${actualWidth/2}" y="${actualHeight/2}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${size/8}" font-weight="bold" fill="white">MFM</text>
</svg>`;
}

// Create directory structure
function createDirectories() {
  const dirs = [
    'public/assets/logo/favicons',
    'public/assets/logo/social',
    'public/assets/logo/pwa',
    'public/assets/logo/web'
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Generate all logo variants
function generateLogos() {
  console.log('🎨 Generating logo variants...');
  
  createDirectories();
  
  // Generate favicons
  LOGO_SIZES.favicon.forEach(config => {
    const svg = generateSVG(config.size);
    const filename = `public/assets/logo/favicons/${config.name}.svg`;
    fs.writeFileSync(filename, svg);
    console.log(`✅ Generated ${filename}`);
  });
  
  // Generate PWA icons
  LOGO_SIZES.pwa.forEach(config => {
    const svg = generateSVG(config.size);
    const filename = `public/assets/logo/pwa/${config.name}.svg`;
    fs.writeFileSync(filename, svg);
    console.log(`✅ Generated ${filename}`);
  });
  
  // Generate social media logos
  LOGO_SIZES.social.forEach(config => {
    const svg = generateSVG(config.size, config.width, config.height);
    const filename = `public/assets/logo/social/${config.name}.svg`;
    fs.writeFileSync(filename, svg);
    console.log(`✅ Generated ${filename}`);
  });
  
  // Generate web formats
  LOGO_SIZES.web.forEach(config => {
    const svg = generateSVG(config.size);
    const filename = `public/assets/logo/web/${config.name}.svg`;
    fs.writeFileSync(filename, svg);
    console.log(`✅ Generated ${filename}`);
  });
  
  console.log('🎉 Logo generation complete!');
}

// Run the script
if (require.main === module) {
  generateLogos();
}

module.exports = { generateLogos, LOGO_SIZES };
