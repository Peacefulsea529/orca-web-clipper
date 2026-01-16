/**
 * Orca Web Clipper - Screenshot Capture
 */

export interface ScreenshotOptions {
  type: 'visible' | 'full-page' | 'selection'
  format: 'png' | 'jpeg'
  quality?: number // 0-100 for jpeg
}

export interface ScreenshotResult {
  dataUrl: string
  width: number
  height: number
  format: string
}

/**
 * Capture visible area of the page
 */
export async function captureVisibleArea(): Promise<ScreenshotResult> {
  // This needs to be called from background script
  const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
    format: 'png',
  })
  
  // Get dimensions
  const img = await loadImage(dataUrl)
  
  return {
    dataUrl,
    width: img.width,
    height: img.height,
    format: 'png',
  }
}

/**
 * Capture a specific area (selection rectangle)
 */
export async function captureArea(rect: DOMRect): Promise<ScreenshotResult> {
  // First capture visible area
  const fullCapture = await captureVisibleArea()
  
  // Create canvas to crop
  const canvas = document.createElement('canvas')
  canvas.width = rect.width * window.devicePixelRatio
  canvas.height = rect.height * window.devicePixelRatio
  
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get canvas context')
  
  const img = await loadImage(fullCapture.dataUrl)
  
  // Draw cropped area
  ctx.drawImage(
    img,
    rect.x * window.devicePixelRatio,
    rect.y * window.devicePixelRatio,
    rect.width * window.devicePixelRatio,
    rect.height * window.devicePixelRatio,
    0,
    0,
    canvas.width,
    canvas.height
  )
  
  const dataUrl = canvas.toDataURL('image/png')
  
  return {
    dataUrl,
    width: rect.width,
    height: rect.height,
    format: 'png',
  }
}

/**
 * Convert data URL to Blob
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',')
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png'
  const base64 = parts[1]
  const binary = atob(base64)
  const array = new Uint8Array(binary.length)
  
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i)
  }
  
  return new Blob([array], { type: mime })
}

/**
 * Convert screenshot to Markdown image reference
 */
export function screenshotToMarkdown(
  filename: string,
  assetUrl: string,
  alt?: string
): string {
  return `![${alt || filename}](${assetUrl})`
}

// Helper: Load image from data URL
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}
