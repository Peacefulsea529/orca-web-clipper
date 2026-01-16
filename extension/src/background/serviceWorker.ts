/**
 * Orca Web Clipper - Service Worker (Background Script)
 * Updated with all features
 */

import { checkOrcaConnection, sendClipToOrca } from '../shared/api'
import type { ExtensionMessage, ExtensionResponse, ClipPayload } from '../shared/types'

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Orca Web Clipper] Extension installed')
  
  // Create context menu items
  chrome.contextMenus.create({
    id: 'clip-selection',
    title: '剪藏选中内容到 Orca',
    contexts: ['selection'],
  })
  
  chrome.contextMenus.create({
    id: 'clip-page',
    title: '剪藏页面到 Orca',
    contexts: ['page'],
  })
  
  chrome.contextMenus.create({
    id: 'clip-link',
    title: '剪藏链接到 Orca',
    contexts: ['link'],
  })
  
  chrome.contextMenus.create({
    id: 'clip-image',
    title: '剪藏图片到 Orca',
    contexts: ['image'],
  })
})

// Handle messages from popup
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (response: ExtensionResponse) => void) => {
    handleMessage(message).then(sendResponse)
    return true
  }
)

async function handleMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  try {
    switch (message.type) {
      case 'CHECK_CONNECTION':
        const status = await checkOrcaConnection()
        return {
          success: status.connected,
          data: status,
          error: status.error,
        }
        
      case 'CLIP_TO_ORCA':
        const payload = message.payload as ClipPayload
        const result = await sendClipToOrca(payload)
        return {
          success: result.success,
          data: result,
          error: result.error,
        }
        
      case 'CAPTURE_SCREENSHOT':
        try {
          const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: 'png' })
          return {
            success: true,
            data: { dataUrl },
          }
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Screenshot failed',
          }
        }
        
      default:
        return {
          success: false,
          error: `Unknown message type: ${message.type}`,
        }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return
  
  try {
    // Check connection first
    const connectionStatus = await checkOrcaConnection()
    if (!connectionStatus.connected) {
      console.error('[Orca Web Clipper] Not connected to Orca')
      // Could show a notification here
      return
    }
    
    let payload: ClipPayload
    
    switch (info.menuItemId) {
      case 'clip-selection':
        const selectionResponse = await chrome.tabs.sendMessage(tab.id, {
          type: 'EXTRACT_CONTENT',
          payload: { mode: 'selection' },
        })
        
        if (!selectionResponse.success) {
          console.error('[Orca Web Clipper] No selection:', selectionResponse.error)
          return
        }
        
        payload = {
          metadata: {
            url: tab.url || '',
            title: tab.title || '',
            capturedAt: new Date().toISOString(),
            ...selectionResponse.data.metadata,
          },
          content: selectionResponse.data.text,
          mode: 'selection',
          target: { type: 'journal' },
        }
        break
        
      case 'clip-page':
        const pageResponse = await chrome.tabs.sendMessage(tab.id, {
          type: 'EXTRACT_CONTENT',
          payload: { mode: 'article' },
        })
        
        if (!pageResponse.success) {
          console.error('[Orca Web Clipper] Failed to extract:', pageResponse.error)
          return
        }
        
        payload = {
          metadata: {
            url: tab.url || '',
            title: tab.title || '',
            capturedAt: new Date().toISOString(),
            ...pageResponse.data.metadata,
          },
          content: pageResponse.data.text,
          mode: 'article',
          target: { type: 'journal' },
        }
        break
        
      case 'clip-link':
        if (!info.linkUrl) return
        
        payload = {
          metadata: {
            url: info.linkUrl,
            title: info.selectionText || info.linkUrl,
            capturedAt: new Date().toISOString(),
          },
          content: `[${info.selectionText || info.linkUrl}](${info.linkUrl})`,
          mode: 'selection',
          target: { type: 'journal' },
        }
        break
        
      case 'clip-image':
        if (!info.srcUrl) return
        
        payload = {
          metadata: {
            url: tab.url || '',
            title: tab.title || '',
            capturedAt: new Date().toISOString(),
          },
          content: `![Image](${info.srcUrl})`,
          mode: 'selection',
          target: { type: 'journal' },
        }
        break
        
      default:
        return
    }
    
    const result = await sendClipToOrca(payload)
    
    if (result.success) {
      console.log('[Orca Web Clipper] Clip saved successfully')
    } else {
      console.error('[Orca Web Clipper] Failed to save clip:', result.error)
    }
  } catch (error) {
    console.error('[Orca Web Clipper] Context menu error:', error)
  }
})

// Handle keyboard shortcut
chrome.commands?.onCommand?.addListener(async (command) => {
  if (command === 'quick-clip') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      // Open popup or perform quick clip
      chrome.action.openPopup()
    }
  }
})
