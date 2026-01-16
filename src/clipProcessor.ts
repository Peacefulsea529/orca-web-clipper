/**
 * Orca Web Clipper Plugin - Clip Processor
 * 
 * Processes incoming clip data and inserts it into Orca.
 */

import type { ClipPayload, ClipResponse } from './types'
import { applyTemplate, getTemplate } from './templates'

// Orca API
declare const orca: {
  commands: {
    invokeEditorCommand: (id: string, cursor: any, ...args: any[]) => Promise<any>
    invokeGroup: (callback: () => Promise<void>, options?: { undoable?: boolean }) => Promise<void>
  }
  invokeBackend: (method: string, ...args: any[]) => Promise<any>
  state: {
    blocks: Record<number, any>
  }
}

/**
 * Process a clip payload and insert it into Orca
 */
export async function processClip(
  payload: ClipPayload,
  cursor?: any
): Promise<ClipResponse> {
  try {
    // Get template and apply it
    const template = getTemplate(payload.template || 'default')
    const content = applyTemplate(template, payload)
    
    // Debug: log the content to see if images are correct
    console.log('[Orca Web Clipper] Content to insert (first 500 chars):', content.substring(0, 500))
    
    // Insert content using Orca's editor commands
    await orca.commands.invokeGroup(async () => {
      // Get target block - either journal or cursor position
      let refBlock: any = null
      let position: 'lastChild' | 'after' = 'lastChild'
      
      if (payload.target?.type === 'journal' || !cursor) {
        // Get today's journal block
        refBlock = await orca.invokeBackend('get-journal-block', new Date())
        position = 'lastChild'
      } else {
        // Insert at cursor position
        refBlock = cursor?.anchor?.blockId 
          ? orca.state.blocks[cursor.anchor.blockId]
          : null
        position = 'after'
      }
      
      if (refBlock) {
        // Use batchInsertText to properly parse Markdown content
        // This will parse markdown syntax including images, links, formatting
        await orca.commands.invokeEditorCommand(
          'core.editor.batchInsertText',
          null,
          refBlock,
          position,
          content,
          false, // skipMarkdown = false, so Markdown will be parsed
          false  // skipTags = false
        )
      }
      
      // Handle screenshot if present
      if (payload.screenshot) {
        await handleScreenshot(payload.screenshot, refBlock)
      }
    })
    
    return {
      success: true,
      pageId: undefined,
    }
  } catch (error) {
    console.error('[Orca Web Clipper] Process error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Processing failed',
    }
  }
}

/**
 * Handle screenshot upload and insert as image block
 */
async function handleScreenshot(dataUrl: string, refBlock?: any): Promise<void> {
  try {
    // Convert data URL to binary
    const response = await fetch(dataUrl)
    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()
    
    // Upload using Orca's backend API
    const assetPath = await orca.invokeBackend(
      'upload-asset-binary',
      blob.type,
      arrayBuffer
    )
    
    if (assetPath && refBlock) {
      // Insert image reference as a new block
      await orca.commands.invokeEditorCommand(
        'core.editor.batchInsertText',
        null,
        refBlock,
        'lastChild',
        `![Screenshot](${assetPath})`,
        false,
        false
      )
    }
  } catch (error) {
    console.error('[Orca Web Clipper] Screenshot upload failed:', error)
  }
}
