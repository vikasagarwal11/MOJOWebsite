# Logo Replacement Guide

## Current Logo Files

The MOMS FITNESS MOJO logo is currently implemented using SVG files located in the `public/` directory:

- **`/public/logo.svg`** - Main logo (200x120px) used in Header and Footer components
- **`/public/logo-small.svg`** - Small logo (32x32px) used as favicon

## Logo Design

The current logo features:
- **Background**: Warm orange gradient (#FF8C42 to #FF6B35)
- **Figures**: Three stylized female fitness figures in creamy beige
- **Text**: "MOMS FITNESS MOJO" in white
- **Tagline**: "FIT, FIERCE, AND FABULOUS - TOGETHER" in beige

## Where Logo is Used

### 1. Header Component (`src/components/layout/Header.tsx`)
- Main navigation branding
- Size: `h-12 w-auto` (48px height)

### 2. Footer Component (`src/components/layout/Footer.tsx`)
- Footer branding
- Size: `h-10 w-auto` (40px height)

### 3. Favicon (`index.html`)
- Browser tab icon
- Uses `logo-small.svg`

## How to Replace the Logo

### Option 1: Replace Existing SVG Files
1. **Keep the same filenames**: `logo.svg` and `logo-small.svg`
2. **Maintain similar dimensions**: 
   - Main logo: around 200x120px (or similar aspect ratio)
   - Small logo: 32x32px
3. **Update the files** in the `public/` directory
4. **Restart the development server** if running

### Option 2: Use New Image Files
1. **Add new image files** to the `public/` directory
2. **Update the components** to reference new filenames:
   - Header: Update `src="/logo.svg"` to your new filename
   - Footer: Update `src="/logo.svg"` to your new filename
   - Favicon: Update `href="/logo-small.svg"` in `index.html`

### Option 3: Use External URLs
1. **Host your logo** on a CDN or image hosting service
2. **Update the components** to use the full URL:
   - Example: `src="https://your-domain.com/logo.png"`

## Logo Requirements

### Technical Requirements
- **Format**: SVG preferred for scalability, PNG/JPG acceptable
- **Size**: Main logo should be at least 200x120px for quality
- **Transparency**: SVG with transparent background works best
- **Optimization**: Compress images for web use

### Design Requirements
- **Brand consistency**: Should match the "MOMS FITNESS MOJO" brand
- **Readability**: Text should be clear at small sizes
- **Colors**: Should work well with the existing purple/pink theme
- **Accessibility**: Good contrast for visibility

## Testing Your Logo

After replacing the logo:
1. **Check the header** - Logo should display correctly in navigation
2. **Check the footer** - Logo should display correctly at bottom
3. **Check the favicon** - Browser tab should show new icon
4. **Test responsiveness** - Logo should scale properly on mobile
5. **Verify accessibility** - Alt text should describe the logo

## Troubleshooting

### Logo Not Displaying
- Check file path in `public/` directory
- Verify filename matches component references
- Clear browser cache
- Check browser console for 404 errors

### Logo Too Large/Small
- Adjust CSS classes in components:
  - Header: `className="h-12 w-auto"` (adjust h-12 as needed)
  - Footer: `className="h-10 w-auto"` (adjust h-10 as needed)

### Favicon Not Updating
- Clear browser cache
- Check if `index.html` favicon link is correct
- Verify `logo-small.svg` exists in `public/` directory

## Best Practices

1. **Use SVG when possible** for crisp, scalable logos
2. **Optimize file sizes** for faster loading
3. **Test on multiple devices** to ensure proper scaling
4. **Maintain aspect ratio** when resizing
5. **Keep backup copies** of original logo files
6. **Document changes** for future reference

## Contact

For questions about logo implementation or design, refer to the project documentation or contact the development team.
