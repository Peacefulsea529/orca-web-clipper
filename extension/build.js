/**
 * Build script for Orca Web Clipper extension
 */

const esbuild = require('esbuild')
const fs = require('fs')
const path = require('path')

const isWatch = process.argv.includes('--watch')

// Ensure dist directories exist
const dirs = [
  'dist',
  'dist/background',
  'dist/content',
  'dist/popup',
  'dist/offscreen',
  'dist/icons',
]

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
})

// Copy static files
function copyStaticFiles() {
  // Copy manifest
  fs.copyFileSync('manifest.json', 'dist/manifest.json')
  
  // Copy popup HTML and CSS
  fs.copyFileSync('src/popup/popup.html', 'dist/popup/popup.html')
  fs.copyFileSync('src/popup/popup.css', 'dist/popup/popup.css')
  
  // Copy offscreen HTML
  fs.copyFileSync('src/offscreen/offscreen.html', 'dist/offscreen/offscreen.html')
  
  // Copy icons (create placeholder if not exists)
  const iconSizes = [16, 32, 48, 128]
  iconSizes.forEach(size => {
    const iconPath = `public/icons/icon${size}.png`
    const destPath = `dist/icons/icon${size}.png`
    if (fs.existsSync(iconPath)) {
      fs.copyFileSync(iconPath, destPath)
    } else {
      // Create a simple placeholder SVG-based icon
      createPlaceholderIcon(destPath, size)
    }
  })
  
  console.log('Static files copied')
}

function createPlaceholderIcon(destPath, size) {
  // Create a simple 1x1 transparent PNG as placeholder
  // In production, use actual icon files
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, // IHDR length
    0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, // width = 1
    0x00, 0x00, 0x00, 0x01, // height = 1
    0x08, 0x06, // bit depth = 8, color type = 6 (RGBA)
    0x00, 0x00, 0x00, // compression, filter, interlace
    0x1F, 0x15, 0xC4, 0x89, // CRC
    0x00, 0x00, 0x00, 0x0A, // IDAT length
    0x49, 0x44, 0x41, 0x54, // IDAT
    0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, // compressed data
    0x0D, 0x0A, 0x2D, 0xB4, // CRC
    0x00, 0x00, 0x00, 0x00, // IEND length
    0x49, 0x45, 0x4E, 0x44, // IEND
    0xAE, 0x42, 0x60, 0x82, // CRC
  ])
  fs.writeFileSync(destPath, pngHeader)
}

// Build configuration
const buildOptions = {
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch,
  target: ['chrome100', 'firefox100', 'edge100'],
  format: 'esm',
}

// Build all entry points
async function build() {
  try {
    // Background service worker
    await esbuild.build({
      ...buildOptions,
      entryPoints: ['src/background/serviceWorker.ts'],
      outfile: 'dist/background/serviceWorker.js',
    })
    console.log('Built: background/serviceWorker.js')
    
    // Content script
    await esbuild.build({
      ...buildOptions,
      entryPoints: ['src/content/contentScript.ts'],
      outfile: 'dist/content/contentScript.js',
    })
    console.log('Built: content/contentScript.js')
    
    // Popup
    await esbuild.build({
      ...buildOptions,
      entryPoints: ['src/popup/popup.ts'],
      outfile: 'dist/popup/popup.js',
    })
    console.log('Built: popup/popup.js')
    
    // Offscreen
    await esbuild.build({
      ...buildOptions,
      entryPoints: ['src/offscreen/offscreen.ts'],
      outfile: 'dist/offscreen/offscreen.js',
    })
    console.log('Built: offscreen/offscreen.js')
    
    copyStaticFiles()
    
    console.log('Build complete!')
  } catch (error) {
    console.error('Build failed:', error)
    process.exit(1)
  }
}

// Watch mode
async function watch() {
  const contexts = await Promise.all([
    esbuild.context({
      ...buildOptions,
      entryPoints: ['src/background/serviceWorker.ts'],
      outfile: 'dist/background/serviceWorker.js',
    }),
    esbuild.context({
      ...buildOptions,
      entryPoints: ['src/content/contentScript.ts'],
      outfile: 'dist/content/contentScript.js',
    }),
    esbuild.context({
      ...buildOptions,
      entryPoints: ['src/popup/popup.ts'],
      outfile: 'dist/popup/popup.js',
    }),
    esbuild.context({
      ...buildOptions,
      entryPoints: ['src/offscreen/offscreen.ts'],
      outfile: 'dist/offscreen/offscreen.js',
    }),
  ])
  
  copyStaticFiles()
  
  await Promise.all(contexts.map(ctx => ctx.watch()))
  console.log('Watching for changes...')
}

if (isWatch) {
  watch()
} else {
  build()
}
