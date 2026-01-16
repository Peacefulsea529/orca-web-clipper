/**
 * Orca Web Clipper - MCP Client
 * 
 * MCP (Model Context Protocol) client for communicating with Orca's MCP Server.
 * Uses streamable-http transport at localhost:18672/mcp with Bearer token auth.
 * 
 * Available Orca MCP tools:
 * - get_today_journal: Get today's journal block ID
 * - insert_markdown: Insert markdown content as child of a block
 * - create_page: Create a new page
 * - get_pages: List all pages
 * - search_aliases: Search for tags/pages
 * - batch_insert_tags: Add tags to blocks
 */

import { CONFIG, getMcpEndpointUrl, getMcpToken } from './config'

// MCP Protocol Types
interface McpRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface McpResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

interface McpToolCallParams {
  name: string
  arguments: Record<string, unknown>
}

interface McpToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource'
    text?: string
    data?: string
    mimeType?: string
  }>
  isError?: boolean
}

/**
 * MCP Client for Orca
 */
export class OrcaMcpClient {
  private endpointUrl: string
  private token: string | null = null
  private requestId = 0
  private repoId: string | null = null

  constructor() {
    this.endpointUrl = getMcpEndpointUrl()
  }

  /**
   * Initialize client with token
   */
  async init(): Promise<boolean> {
    this.token = await getMcpToken()
    if (!this.token) {
      console.warn('[MCP] No token configured')
      return false
    }
    return true
  }

  /**
   * Set token directly
   */
  setToken(token: string): void {
    this.token = token
  }

  /**
   * Set repoId directly
   */
  setRepoId(repoId: string): void {
    this.repoId = repoId
  }

  /**
   * Get current repoId
   */
  getRepoId(): string | null {
    return this.repoId
  }

  /**
   * Check if MCP server is available and discover repoId
   */
  async checkConnection(): Promise<boolean> {
    try {
      // Try to list tools as a health check
      const response = await this.sendRequest('tools/list', {})
      if (!response.result) {
        return false
      }

      // Try to discover repoId by getting pages
      if (!this.repoId) {
        await this.discoverRepoId()
      }

      return true
    } catch (error) {
      console.error('[MCP] Connection check failed:', error)
      return false
    }
  }

  /**
   * Discover repoId by trying to get pages
   * Orca typically has one main repo
   */
  async discoverRepoId(): Promise<string | null> {
    // Try common repo IDs or get from first available page
    // Orca repo IDs are typically random strings like 'r70433xguevfg'
    // We can't auto-discover without user input, so just try 'default'
    const commonRepoIds = ['default']
    
    for (const repoId of commonRepoIds) {
      try {
        const result = await this.callTool('get_pages', { repoId, pageSize: 1 })
        // If we get a result without error, this is a valid repoId
        if (!result.isError) {
          this.repoId = repoId
          console.log('[MCP] Discovered repoId:', repoId)
          return repoId
        }
      } catch {
        // Try next repoId
      }
    }

    console.warn('[MCP] Could not auto-discover repoId')
    return null
  }

  /**
   * Call an MCP tool
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const params: McpToolCallParams = {
      name,
      arguments: args,
    }

    const response = await this.sendRequest('tools/call', params)

    if (response.error) {
      throw new Error(response.error.message || 'MCP tool call failed')
    }

    return response.result as McpToolResult
  }

  /**
   * Get today's journal block ID
   */
  async getTodayJournal(): Promise<{ blockId: number; success: boolean; error?: string }> {
    if (!this.repoId) {
      return { blockId: 0, success: false, error: 'No repoId configured' }
    }

    try {
      const result = await this.callTool('get_today_journal', { repoId: this.repoId })
      const textContent = result.content.find(c => c.type === 'text')
      
      if (textContent?.text) {
        try {
          const parsed = JSON.parse(textContent.text)
          return {
            success: true,
            blockId: parsed.blockId || parsed.block_id || parsed.id,
          }
        } catch {
          // Try to extract blockId from text
          const match = textContent.text.match(/\d+/)
          if (match) {
            return { success: true, blockId: parseInt(match[0], 10) }
          }
          return { success: false, blockId: 0, error: 'Could not parse journal blockId' }
        }
      }

      return { success: false, blockId: 0, error: 'No journal data returned' }
    } catch (error) {
      return {
        success: false,
        blockId: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Insert markdown content into a block
   * Returns the first inserted blockId if available
   */
  async insertMarkdown(params: {
    refBlockId: number
    text: string
  }): Promise<{ success: boolean; blockId?: number; error?: string }> {
    if (!this.repoId) {
      return { success: false, error: 'No repoId configured' }
    }

    try {
      const result = await this.callTool('insert_markdown', {
        repoId: this.repoId,
        refBlockId: params.refBlockId,
        text: params.text,
      })

      // Try to parse blockId from result
      const textContent = result.content.find(c => c.type === 'text')
      if (textContent?.text) {
        try {
          const parsed = JSON.parse(textContent.text)
          // Handle various response formats
          const blockId = parsed.blockId || parsed.block_id || parsed.id ||
            (Array.isArray(parsed.blockIds) ? parsed.blockIds[0] : undefined) ||
            (Array.isArray(parsed.block_ids) ? parsed.block_ids[0] : undefined)
          return { success: !result.isError, blockId }
        } catch {
          // JSON parse failed, continue without blockId
        }
      }

      return { success: !result.isError }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Create a new page
   */
  async createPage(name: string): Promise<{ blockId?: number; success: boolean; error?: string }> {
    if (!this.repoId) {
      return { success: false, error: 'No repoId configured' }
    }

    try {
      const result = await this.callTool('create_page', {
        repoId: this.repoId,
        name,
      })

      const textContent = result.content.find(c => c.type === 'text')
      if (textContent?.text) {
        // First try to parse as JSON
        try {
          const parsed = JSON.parse(textContent.text)
          return {
            success: true,
            blockId: parsed.blockId || parsed.block_id || parsed.id,
          }
        } catch {
          // Not JSON, try to extract blockId from text like:
          // "Created page 'PageName' (block 4337) in repository xxx."
          const blockIdMatch = textContent.text.match(/\(block\s+(\d+)\)/)
          if (blockIdMatch) {
            const blockId = parseInt(blockIdMatch[1], 10)
            return { success: true, blockId }
          }
          return { success: !result.isError }
        }
      }

      return { success: !result.isError }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Search for pages by name
   */
  async searchPages(names: string[]): Promise<{ pages: Array<{ id: number; name: string }>; success: boolean; error?: string }> {
    if (!this.repoId) {
      return { pages: [], success: false, error: 'No repoId configured' }
    }

    try {
      const result = await this.callTool('search_aliases', {
        repoId: this.repoId,
        names,
      })

      const textContent = result.content.find(c => c.type === 'text')
      if (textContent?.text) {
        try {
          const parsed = JSON.parse(textContent.text)
          return {
            success: true,
            pages: Array.isArray(parsed) ? parsed : [],
          }
        } catch {
          return { success: true, pages: [] }
        }
      }

      return { success: !result.isError, pages: [] }
    } catch (error) {
      return {
        pages: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Add tags to blocks
   */
  async batchInsertTags(params: {
    blockIds: number[]
    tagNames: string[]
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.repoId) {
      return { success: false, error: 'No repoId configured' }
    }

    try {
      const result = await this.callTool('batch_insert_tags', {
        repoId: this.repoId,
        blockIds: params.blockIds,
        tagNames: params.tagNames,
      })

      return { success: !result.isError }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Insert content into Orca (for web clipping)
   * This is the main entry point for clipping
   * Note: content should already be formatted with template (including title, url, etc.)
   */
  async insertContent(params: {
    content: string
    title?: string
    url?: string
    target?: 'journal' | 'page'
    pageName?: string
  }): Promise<{ blockId?: number; success: boolean; error?: string }> {
    // Content is already formatted by template, use directly
    const markdown = params.content

    try {
      let targetBlockId: number

      if (params.target === 'page' && params.pageName) {
        // First, search if the page already exists
        const searchResult = await this.searchPages([params.pageName])
        
        if (searchResult.success && searchResult.pages.length > 0) {
          // Find exact match (case-insensitive)
          const exactMatch = searchResult.pages.find(
            p => p.name.toLowerCase() === params.pageName!.toLowerCase()
          )
          
          if (exactMatch) {
            // Page exists, use it
            targetBlockId = exactMatch.id
          } else {
            // No exact match, create new page
            const pageResult = await this.createPage(params.pageName)
            if (!pageResult.success || !pageResult.blockId) {
              return { success: false, error: pageResult.error || 'Failed to create page' }
            }
            targetBlockId = pageResult.blockId
          }
        } else {
          // Search failed or no results, create new page
          const pageResult = await this.createPage(params.pageName)
          if (!pageResult.success || !pageResult.blockId) {
            return { success: false, error: pageResult.error || 'Failed to create page' }
          }
          targetBlockId = pageResult.blockId
        }
      } else {
        // Default: insert into today's journal
        const journalResult = await this.getTodayJournal()
        if (!journalResult.success || !journalResult.blockId) {
          return { success: false, error: journalResult.error || 'Failed to get today\'s journal' }
        }
        targetBlockId = journalResult.blockId
      }

      // Insert the markdown content
      const insertResult = await this.insertMarkdown({
        refBlockId: targetBlockId,
        text: markdown,
      })

      return {
        success: insertResult.success,
        blockId: targetBlockId,
        error: insertResult.error,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Send a JSON-RPC request to MCP server (streamable-http)
   */
  private async sendRequest(method: string, params: Record<string, unknown>): Promise<McpResponse> {
    if (!this.token) {
      throw new Error('MCP token not configured')
    }

    const request: McpRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params,
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.MCP_TIMEOUT)

    try {
      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // Handle SSE response format from streamable-http
      const responseText = await response.text()
      return this.parseSSEResponse(responseText)
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('MCP request timeout')
      }
      throw error
    }
  }

  /**
   * Parse SSE (Server-Sent Events) response from streamable-http
   * Format: "event: message\ndata: {...json...}\n\n"
   */
  private parseSSEResponse(responseText: string): McpResponse {
    // Try to parse as direct JSON first
    try {
      return JSON.parse(responseText)
    } catch {
      // Not direct JSON, parse as SSE
    }

    // Parse SSE format
    const lines = responseText.split('\n')
    let jsonData = ''
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        jsonData = line.substring(6)
        break
      }
    }

    if (!jsonData) {
      throw new Error('Invalid SSE response: no data field found')
    }

    try {
      return JSON.parse(jsonData)
    } catch {
      throw new Error('Invalid JSON in SSE data field')
    }
  }
}

// Singleton instance
let mcpClientInstance: OrcaMcpClient | null = null

/**
 * Get MCP client instance
 */
export function getMcpClient(): OrcaMcpClient {
  if (!mcpClientInstance) {
    mcpClientInstance = new OrcaMcpClient()
  }
  return mcpClientInstance
}

/**
 * Reset MCP client instance (for testing or reconfiguration)
 */
export function resetMcpClient(): void {
  mcpClientInstance = null
}
