/**
 * Orca Web Clipper - API Client
 * Supports both MCP (direct) and Clipboard (fallback) communication
 */

import { CONFIG, isMcpEnabled, getMcpRepoId } from './config'
import { getMcpClient } from './mcpClient'
import { applyTemplate, getTemplate } from './templates'
import type { ClipPayload, ClipResponse, OrcaConnectionStatus } from './types'

// Clipboard data prefix to identify our data (must match plugin)
const CLIP_DATA_PREFIX = 'ORCA_WEB_CLIP:'

/**
 * Check if Orca is running and accessible
 */
export async function checkOrcaConnection(): Promise<OrcaConnectionStatus> {
  // Check if MCP is enabled
  const mcpEnabled = await isMcpEnabled()
  console.log('[API] checkOrcaConnection: MCP enabled:', mcpEnabled)
  
  if (mcpEnabled) {
    try {
      const client = getMcpClient()
      const initResult = await client.init()
      console.log('[API] checkOrcaConnection: Client init result:', initResult)
      
      // Load repoId from storage
      const repoId = await getMcpRepoId()
      console.log('[API] checkOrcaConnection: Loaded repoId from storage:', repoId)
      
      if (repoId) {
        client.setRepoId(repoId)
        console.log('[API] checkOrcaConnection: Set repoId on client')
      } else {
        console.warn('[API] checkOrcaConnection: No repoId configured! User must set it in settings.')
      }
      
      const connected = await client.checkConnection()
      console.log('[API] checkOrcaConnection: Connection check result:', connected)
      
      if (connected) {
        const discoveredRepoId = client.getRepoId()
        console.log('[API] checkOrcaConnection: Final repoId:', discoveredRepoId)
        
        if (!discoveredRepoId) {
          return {
            connected: true,
            version: 'MCP 已连接 (未配置仓库ID)',
          }
        }
        
        return {
          connected: true,
          version: `MCP Mode (${discoveredRepoId})`,
        }
      }
    } catch (error) {
      console.warn('[API] MCP connection check failed:', error)
    }
  }
  
  // Fallback to clipboard mode
  return {
    connected: true,
    version: 'Clipboard Mode',
  }
}

/**
 * Send clip payload to Orca
 * Tries MCP first, falls back to clipboard
 */
export async function sendClipToOrca(payload: ClipPayload): Promise<ClipResponse> {
  // Check if MCP is enabled
  const mcpEnabled = await isMcpEnabled()
  
  if (mcpEnabled) {
    try {
      const result = await sendClipViaMcp(payload)
      if (result.success) {
        return result
      }
      console.warn('[API] MCP failed, falling back to clipboard:', result.error)
    } catch (error) {
      console.warn('[API] MCP error, falling back to clipboard:', error)
    }
  }
  
  // Fallback to clipboard
  return await sendClipViaClipboard(payload)
}

/**
 * Send clip via MCP (direct communication)
 */
async function sendClipViaMcp(payload: ClipPayload): Promise<ClipResponse> {
  console.log('[MCP API] sendClipViaMcp: Starting with payload:', {
    contentLength: payload.content?.length,
    template: payload.template,
    target: payload.target,
    metadata: payload.metadata,
  })
  
  const client = getMcpClient()
  const initialized = await client.init()
  
  console.log('[MCP API] sendClipViaMcp: Client initialized:', initialized)
  
  if (!initialized) {
    return {
      success: false,
      error: 'MCP not configured',
    }
  }
  
  // Load repoId from storage if not already set
  if (!client.getRepoId()) {
    console.log('[MCP API] sendClipViaMcp: No repoId set, loading from storage')
    const repoId = await getMcpRepoId()
    console.log('[MCP API] sendClipViaMcp: Loaded repoId from storage:', repoId)
    if (repoId) {
      client.setRepoId(repoId)
    } else {
      // Try to discover repoId
      console.log('[MCP API] sendClipViaMcp: Attempting to discover repoId')
      await client.discoverRepoId()
    }
  }
  
  const finalRepoId = client.getRepoId()
  console.log('[MCP API] sendClipViaMcp: Final repoId:', finalRepoId)
  
  if (!finalRepoId) {
    return {
      success: false,
      error: 'No repoId configured or discovered',
    }
  }
  
  // Build content with template
  const templateData: Record<string, string> = {
    title: payload.metadata.title || '',
    url: payload.metadata.url || '',
    siteName: payload.metadata.siteName || '',
    author: payload.metadata.author || '',
    publishedAt: payload.metadata.publishedAt || '',
    capturedAt: payload.metadata.capturedAt || '',
    abstract: payload.metadata.abstract || '',
    content: payload.content || '',
    note: payload.note || '',
    summary: payload.summary || '',
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().slice(0, 5),
  }
  
  const template = getTemplate(payload.template || 'default')
  console.log('[MCP API] sendClipViaMcp: Using template:', payload.template || 'default')
  
  if (!template) {
    return {
      success: false,
      error: 'Template not found',
    }
  }
  
  const { titleLine, content, tagProperties } = applyTemplate(template, templateData)
  console.log('[MCP API] sendClipViaMcp: TitleLine:', titleLine)
  console.log('[MCP API] sendClipViaMcp: Content preview:', content.substring(0, 300) + (content.length > 300 ? '...' : ''))
  console.log('[MCP API] sendClipViaMcp: Tag properties:', tagProperties)
  
  // Screenshot feature removed - MCP payload size limit makes it impractical
  
  // Determine target
  const target = payload.target.type === 'journal' ? 'journal' : 'page'
  const pageName = payload.target.type === 'page' 
    ? payload.target.pageName || payload.metadata.title 
    : undefined
  
  console.log('[MCP API] sendClipViaMcp: Calling insertContent with:', {
    titleLineLength: titleLine.length,
    contentLength: content.length,
    title: payload.metadata.title,
    url: payload.metadata.url,
    target,
    pageName,
    tagProperties,
  })
  
  const result = await client.insertContent({
    titleLine,
    content,
    title: payload.metadata.title,
    url: payload.metadata.url,
    target,
    pageName,
    tagProperties,
  })
  
  console.log('[MCP API] sendClipViaMcp: insertContent result:', result)
  
  if (result.success) {
    // Tags are already added in the template content (e.g., "# {{title}} #WebClip #Article")
    // No need to call batchInsertTags separately
    console.log('[MCP API] sendClipViaMcp: Success! blockId:', result.blockId)
    return {
      success: true,
      blockId: result.blockId,
    }
  }
  
  console.error('[MCP API] sendClipViaMcp: Failed:', result.error)
  return {
    success: false,
    error: result.error || 'MCP insert failed',
  }
}

/**
 * Send clip via Clipboard (fallback)
 */
async function sendClipViaClipboard(payload: ClipPayload): Promise<ClipResponse> {
  try {
    // Convert payload to JSON and add prefix
    const data = CLIP_DATA_PREFIX + JSON.stringify(payload)
    
    await copyToClipboard(data)
    
    return {
      success: true,
      message: 'Clip copied to clipboard. Paste in Orca (Ctrl+Shift+V) to save.',
    }
  } catch (error) {
    console.error('Clipboard write failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to copy clip',
    }
  }
}

/**
 * Try to copy text to clipboard using multiple methods
 */
async function copyToClipboard(text: string): Promise<void> {
  // Method 1: Modern API (if available and focused)
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (e) {
    console.warn('navigator.clipboard failed, trying fallback:', e);
  }

  // Method 2: Legacy execCommand (works in Popup with DOM)
  try {
    if (typeof document !== 'undefined' && document.createElement) {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      
      // Ensure element is visible but unobtrusive
      textArea.style.position = 'fixed';
      textArea.style.left = '0';
      textArea.style.top = '0';
      textArea.style.opacity = '0';
      textArea.style.pointerEvents = 'none';
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (success) {
        console.log('Copied using execCommand');
        return;
      }
      console.warn('execCommand returned false');
    }
  } catch (e) {
    console.warn('execCommand failed, trying offscreen:', e);
  }

  // Method 3: Offscreen Document (for Service Worker)
  await addToClipboardViaOffscreen(text);
}

/**
 * Use offscreen document to write to clipboard
 */
async function addToClipboardViaOffscreen(text: string): Promise<void> {
  // Create offscreen document if not exists
  const creating = chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: [chrome.offscreen.Reason.CLIPBOARD],
    justification: 'Write clip data to clipboard',
  });
  
  try {
    await creating;
  } catch (e: any) {
    // Ignore error if document already exists
    if (!e.message.startsWith('Only a single offscreen')) {
      throw e;
    }
  }
  
  // Wait a bit for the offscreen document to be ready
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Send message to offscreen document
  // We use chrome.runtime.sendMessage which broadcasts to all pages
  // The offscreen doc must return true in onMessage to keep channel open
  try {
    await chrome.runtime.sendMessage({
      type: 'copy-to-clipboard',
      target: 'offscreen-doc',
      data: text
    });
  } catch (e) {
    console.warn('First attempt to send to offscreen failed, retrying...', e);
    // Retry once with longer delay
    await new Promise(resolve => setTimeout(resolve, 500));
    await chrome.runtime.sendMessage({
      type: 'copy-to-clipboard',
      target: 'offscreen-doc',
      data: text
    });
  }
  
  // Close offscreen document after a short delay
  setTimeout(() => {
    chrome.offscreen.closeDocument().catch(() => {}); 
  }, 2000);
}

/**
 * Upload an asset (image) to Orca
 * In clipboard mode, we embed images as data URLs
 */
export async function uploadAsset(
  blob: Blob,
  filename: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    // Convert blob to base64 data URL
    const reader = new FileReader()
    return new Promise((resolve) => {
      reader.onloadend = () => {
        resolve({
          success: true,
          url: reader.result as string
        })
      }
      reader.onerror = () => {
        resolve({
          success: false,
          error: 'Failed to read file'
        })
      }
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    }
  }
}
