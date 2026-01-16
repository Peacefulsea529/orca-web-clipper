/**
 * Orca Web Clipper Plugin - Main Entry Point
 * 
 * This plugin receives web clips from the browser extension via clipboard.
 * The extension copies clip data to clipboard, user pastes in Orca.
 */

import { processClip } from './clipProcessor'
import type { ClipPayload, ClipResponse } from './types'

// Orca API types
declare const orca: {
  commands: {
    registerCommand: (id: string, handler: (...args: any[]) => any, label?: string) => void
    unregisterCommand: (id: string) => void
    registerEditorCommand: (
      id: string,
      doFn: (args: [string, number, any]) => any,
      undoFn: () => void,
      opts: { label: string; hasArgs?: boolean; noFocusNeeded?: boolean }
    ) => void
    unregisterEditorCommand: (id: string) => void
    invokeEditorCommand: (id: string, cursor: any, ...args: any[]) => Promise<any>
  }
  invokeBackend: (method: string, ...args: any[]) => Promise<any>
  headbar: {
    registerHeadbarButton: (id: string, render: () => any) => void
    unregisterHeadbarButton: (id: string) => void
  }
  slashCommands: {
    registerSlashCommand: (id: string, config: {
      icon: string
      group: string
      title: string
      command: string
    }) => void
    unregisterSlashCommand: (id: string) => void
  }
  components: {
    Button: any
    Tooltip: any
  }
  notify: (type: 'info' | 'success' | 'warn' | 'error', message: string, options?: { title?: string; action?: () => void }) => void
  state: {
    blocks: Record<number, any>
  }
}

// Clipboard data prefix to identify our data
const CLIP_DATA_PREFIX = 'ORCA_WEB_CLIP:'

/**
 * Plugin load function - called when plugin is activated
 */
export async function load(pluginName: string): Promise<void> {
  console.log('[Orca Web Clipper] Loading plugin...')
  
  // Register commands
  registerCommands(pluginName)
  
  // Register headbar button
  registerHeadbarButton()
  
  orca.notify('success', 'Web Clipper plugin loaded')
}

/**
 * Plugin unload function - called when plugin is deactivated
 */
export async function unload(): Promise<void> {
  console.log('[Orca Web Clipper] Unloading plugin...')
  
  // Unregister commands
  orca.commands.unregisterCommand('webClipper.pasteClip')
  orca.commands.unregisterEditorCommand('webClipper.pasteClipEditor')
  orca.slashCommands.unregisterSlashCommand('webClipper.pasteClip')
  
  // Unregister headbar button
  orca.headbar.unregisterHeadbarButton('webClipper.status')
}

/**
 * Register plugin commands
 */
function registerCommands(pluginName: string): void {
  // Simple command to paste clip (no focus needed)
  orca.commands.registerCommand(
    'webClipper.pasteClip',
    async () => {
      await handlePasteClip()
    },
    'Paste Web Clip'
  )
  
  // Editor command to paste clip at cursor position
  orca.commands.registerEditorCommand(
    'webClipper.pasteClipEditor',
    async ([panelId, rootBlockId, cursor]) => {
      const result = await handlePasteClip(cursor)
      return result
    },
    () => {},
    { label: 'Paste Web Clip', noFocusNeeded: true }
  )
  
  // Register slash command
  orca.slashCommands.registerSlashCommand('webClipper.pasteClip', {
    icon: 'ti ti-clipboard-text',
    group: 'Insert',
    title: 'Paste Web Clip',
    command: 'webClipper.pasteClipEditor',
  })
}

/**
 * Handle paste clip from clipboard
 */
async function handlePasteClip(cursor?: any): Promise<ClipResponse> {
  try {
    // Read from clipboard
    const clipboardText = await navigator.clipboard.readText()
    
    console.log('[Orca Web Clipper] Clipboard text (first 200 chars):', clipboardText.substring(0, 200))
    
    if (!clipboardText.startsWith(CLIP_DATA_PREFIX)) {
      orca.notify('warn', 'No web clip data found in clipboard. Use the browser extension to clip content first.')
      return { success: false, error: 'No clip data in clipboard' }
    }
    
    // Parse clip data
    const jsonStr = clipboardText.slice(CLIP_DATA_PREFIX.length)
    let payload: ClipPayload
    
    try {
      payload = JSON.parse(jsonStr)
    } catch (e) {
      orca.notify('error', 'Invalid clip data format')
      return { success: false, error: 'Invalid JSON' }
    }
    
    console.log('[Orca Web Clipper] Processing clip:', payload.metadata.title)
    
    // Process the clip
    const result = await processClip(payload, cursor)
    
    if (result.success) {
      orca.notify('success', `Clipped: ${payload.metadata.title}`)
      
      // Clear clipboard after successful paste
      await navigator.clipboard.writeText('')
    } else {
      orca.notify('error', result.error || 'Failed to process clip')
    }
    
    return result
  } catch (error) {
    console.error('[Orca Web Clipper] Paste error:', error)
    orca.notify('error', 'Failed to read clipboard')
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Register headbar button
 */
function registerHeadbarButton(): void {
  orca.headbar.registerHeadbarButton('webClipper.status', () => {
    const Button = orca.components.Button
    const Tooltip = orca.components.Tooltip
    
    return (
      <Tooltip 
        text="Paste Web Clip (Ctrl+Shift+V)"
        placement="vertical"
        defaultPlacement="bottom"
      >
        <Button
          variant="plain"
          onClick={async () => {
            await handlePasteClip()
          }}
          style={{
            color: '#3b82f6',
          }}
        >
          <i className="ti ti-clipboard-text" />
        </Button>
      </Tooltip>
    )
  })
}
