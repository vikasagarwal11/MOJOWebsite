# Homepage Hero Images Guide

## 📍 **Where the Images Are Located**

The hero carousel images on the homepage are stored in:
```
public/assets/hero-images/
```

**Full path:** `C:\Vikas\Projects\MOJOWebsite\MOJOWebsite\public\assets\hero-images\`

## 🖼️ **Current Images**

The carousel automatically looks for these image files (in order of priority):
1. `group-workout.jpg` (fallback if others don't exist)
2. `pexels-hhaa-17271761.jpg`
3. `john-arano-h4i9G-de7Po-unsplash.jpg`
4. `pexels-chanwalrus-941861.jpg`
5. `pexels-helenalop-es-696218.jpg`
6. `pexels-sabel-blanco-662810-1772974.jpg`
7. `pexels-helenalopes-1861785.jpg`
8. `pexels-life-of-pix-101533.jpg`
9. `pexels-lum3n-44775-305972.jpg`

**Currently in folder:**
- `gym.jpg`
- `john-arano-h4i9G-de7Po-unsplash.jpg`
- `pexels-chanwalrus-941861.jpg`
- `pexels-helenalopes-1861785.jpg`
- `pexels-helenalopes-696218.jpg`
- `pexels-hhaa-17271761.jpg`
- `pexels-lum3n-44775-305972.jpg`
- `pexels-sabel-blanco-662810-1772974.jpg`
- `yoga.jpg`
- `logo 500X500 no text.svg` (not used in carousel)

## 📐 **Image Format Requirements**

### **Recommended Format:**
- **JPG/JPEG** - Best for photographic images (recommended)
- **PNG** - Use only if you need transparency
- **WebP** - Modern format with better compression (optional)

### **Image Size Specifications:**

**Optimal Dimensions:**
- **Width:** 1200px - 1920px (recommended: 1600px)
- **Height:** 600px - 1080px (recommended: 900px)
- **Aspect Ratio:** 2:1.5 (or approximately 4:3) - This matches the carousel container

**File Size:**
- **Target:** Under 500KB per image (optimized)
- **Maximum:** 1MB per image (will slow down loading if larger)
- Use image compression tools to reduce file size while maintaining quality

**Resolution:**
- **Minimum:** 1200px width (for high-DPI displays)
- **Recommended:** 1600px width (good balance of quality and file size)
- **Maximum:** 1920px width (for 4K displays, but file size will be larger)

## 🔄 **How to Change/Add Images**

### **Option 1: Replace Existing Images**
1. Go to: `public/assets/hero-images/`
2. Replace any existing `.jpg` file with your new image
3. **Keep the same filename** (e.g., replace `pexels-hhaa-17271761.jpg` with your new image but keep the name `pexels-hhaa-17271761.jpg`)
4. The carousel will automatically pick up the new image

### **Option 2: Add New Images**
1. Add your new image file to: `public/assets/hero-images/`
2. **Update the code** in `src/components/hero/HeroCarousel.tsx`
3. Add your new filename to the `candidates` array (lines 21-31)

**Example:**
```typescript
const candidates = [
  'group-workout.jpg',
  'your-new-image.jpg',  // Add your new image here
  'pexels-hhaa-17271761.jpg',
  // ... rest of images
];
```

### **Option 3: Use Different Filename**
If you want to use a completely different filename:
1. Add your image to `public/assets/hero-images/` with your desired name
2. Update `HeroCarousel.tsx` to include your filename in the `candidates` array

## 📝 **Step-by-Step: Adding a New Image**

1. **Prepare your image:**
   - Resize to 1600px width (or 1200-1920px range)
   - Optimize file size (use tools like TinyPNG, Squoosh, or ImageOptim)
   - Save as JPG format
   - Name it descriptively (e.g., `boat-event-2025.jpg`)

2. **Copy image to folder:**
   ```
   Copy your image to: public/assets/hero-images/
   ```

3. **Update the code:**
   - Open: `src/components/hero/HeroCarousel.tsx`
   - Find the `candidates` array (around line 21)
   - Add your new filename to the list:
   ```typescript
   const candidates = [
     'group-workout.jpg',
     'boat-event-2025.jpg',  // Your new image
     'pexels-hhaa-17271761.jpg',
     // ... existing images
   ];
   ```

4. **Test locally:**
   - Run `npm run dev`
   - Check the homepage to see your new image in the carousel

5. **Deploy:**
   - After testing, deploy to production

## 🎨 **Image Optimization Tips**

1. **Use image compression tools:**
   - [TinyPNG](https://tinypng.com/) - Online JPG/PNG compressor
   - [Squoosh](https://squoosh.app/) - Google's image optimizer
   - [ImageOptim](https://imageoptim.com/) - Mac app

2. **Maintain aspect ratio:**
   - The carousel uses `aspect-[2/1.5]` which is approximately 4:3
   - Crop your images to match this ratio to avoid distortion

3. **Quality vs. Size:**
   - JPG quality: 80-85% is usually sufficient
   - Higher quality = larger file = slower loading
   - Balance quality with file size

## 🔍 **How the Carousel Works**

1. The `HeroCarousel` component checks for images in `/assets/hero-images/`
2. It looks for filenames listed in the `candidates` array
3. It automatically cycles through all found images every 4 seconds
4. If no images are found, it shows a fallback with the MOJO logo

## 📂 **File Structure**

```
MOJOWebsite/
└── public/
    └── assets/
        └── hero-images/          ← YOUR IMAGES GO HERE
            ├── gym.jpg
            ├── yoga.jpg
            ├── pexels-*.jpg
            └── [your-new-image].jpg
```

## ⚠️ **Important Notes**

- **File names are case-sensitive** - Make sure capitalization matches exactly
- **Only JPG/JPEG/PNG/WebP formats** are supported
- **Images must be in the `public` folder** to be accessible via URL
- **After adding images, you may need to rebuild** (`npm run build`) for production
- **The carousel rotates automatically** - no manual controls needed

## 🚀 **Quick Reference**

**Location:** `public/assets/hero-images/`  
**Format:** JPG (recommended) or PNG  
**Size:** 1600px width × 900px height (or 2:1.5 aspect ratio)  
**File Size:** Under 500KB (optimized)  
**Code File:** `src/components/hero/HeroCarousel.tsx` (to add new filenames)
