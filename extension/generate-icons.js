/**
 * Generate extension icons from SVG
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Orca Web Clipper icon - a stylized clip/bookmark with ocean theme
const svgIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0ea5e9;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0284c7;stop-opacity:1" />
    </linearGradient>
  </defs>
  <!-- Background circle -->
  <circle cx="64" cy="64" r="60" fill="url(#grad)"/>
  <!-- Clip/bookmark shape -->
  <path d="M44 28 L84 28 L84 100 L64 85 L44 100 Z" 
        fill="white" 
        stroke="none"/>
  <!-- Wave decoration -->
  <path d="M30 70 Q45 60 60 70 T90 70" 
        fill="none" 
        stroke="rgba(255,255,255,0.5)" 
        stroke-width="4"
        stroke-linecap="round"/>
</svg>
`;

const sizes = [16, 32, 48, 128];
const outputDir = path.join(__dirname, 'public', 'icons');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcons() {
  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon${size}.png`);
    await sharp(Buffer.from(svgIcon))
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Generated: icon${size}.png`);
  }
  console.log('All icons generated!');
}

generateIcons().catch(console.error);
