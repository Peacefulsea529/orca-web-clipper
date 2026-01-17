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
      console.error('[MCP] getTodayJournal: No repoId configured')
      return { blockId: 0, success: false, error: 'No repoId configured' }
    }

    try {
      console.log('[MCP] getTodayJournal: Calling with repoId:', this.repoId)
      const result = await this.callTool('get_today_journal', { repoId: this.repoId })
      console.log('[MCP] getTodayJournal: Raw result:', JSON.stringify(result))
      
      const textContent = result.content.find(c => c.type === 'text')
      
      if (textContent?.text) {
        console.log('[MCP] getTodayJournal: Text content:', textContent.text)
        try {
          const parsed = JSON.parse(textContent.text)
          console.log('[MCP] getTodayJournal: Parsed JSON:', parsed)
          const blockId = parsed.blockId || parsed.block_id || parsed.id
          console.log('[MCP] getTodayJournal: Extracted blockId:', blockId)
          return {
            success: true,
            blockId,
          }
        } catch {
          // Try to extract blockId from text
          console.log('[MCP] getTodayJournal: JSON parse failed, trying regex')
          const match = textContent.text.match(/\d+/)
          if (match) {
            const blockId = parseInt(match[0], 10)
            console.log('[MCP] getTodayJournal: Extracted blockId via regex:', blockId)
            return { success: true, blockId }
          }
          console.error('[MCP] getTodayJournal: Could not parse blockId from:', textContent.text)
          return { success: false, blockId: 0, error: 'Could not parse journal blockId' }
        }
      }

      console.error('[MCP] getTodayJournal: No text content in result')
      return { success: false, blockId: 0, error: 'No journal data returned' }
    } catch (error) {
      console.error('[MCP] getTodayJournal: Exception:', error)
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
      console.error('[MCP] insertMarkdown: No repoId configured')
      return { success: false, error: 'No repoId configured' }
    }

    try {
      console.log('[MCP] insertMarkdown: Calling with params:', {
        repoId: this.repoId,
        refBlockId: params.refBlockId,
        textLength: params.text.length,
        textPreview: params.text.substring(0, 200) + (params.text.length > 200 ? '...' : ''),
      })
      
      const result = await this.callTool('insert_markdown', {
        repoId: this.repoId,
        refBlockId: params.refBlockId,
        text: params.text,
      })

      console.log('[MCP] insertMarkdown: Raw result:', JSON.stringify(result))
      console.log('[MCP] insertMarkdown: isError =', result.isError)

      // Try to parse blockId from result
      const textContent = result.content.find(c => c.type === 'text')
      console.log('[MCP] insertMarkdown: textContent:', textContent?.text)
      
      if (textContent?.text) {
        try {
          const parsed = JSON.parse(textContent.text)
          console.log('[MCP] insertMarkdown: Parsed JSON:', parsed)
          // Handle various response formats
          const blockId = parsed.blockId || parsed.block_id || parsed.id ||
            (Array.isArray(parsed.blockIds) ? parsed.blockIds[0] : undefined) ||
            (Array.isArray(parsed.block_ids) ? parsed.block_ids[0] : undefined)
          console.log('[MCP] insertMarkdown: Extracted blockId:', blockId)
          const finalResult = { success: !result.isError, blockId }
          console.log('[MCP] insertMarkdown: Returning:', finalResult)
          return finalResult
        } catch (parseError) {
          // JSON parse failed, continue without blockId
          console.log('[MCP] insertMarkdown: JSON parse failed, text is not JSON:', parseError)
          // Check if text contains success indicators
          const text = textContent.text.toLowerCase()
          if (text.includes('success') || text.includes('inserted') || text.includes('created')) {
            console.log('[MCP] insertMarkdown: Text indicates success')
            return { success: true }
          }
        }
      }

      const finalResult = { success: !result.isError }
      console.log('[MCP] insertMarkdown: Returning (no blockId):', finalResult)
      return finalResult
    } catch (error) {
      console.error('[MCP] insertMarkdown: Exception:', error)
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
   * Query blocks by text content
   * Used to find recently inserted blocks
   */
  async queryBlocksByText(text: string): Promise<{ blocks: Array<{ id: number; text: string }>; success: boolean; error?: string }> {
    if (!this.repoId) {
      return { blocks: [], success: false, error: 'No repoId configured' }
    }

    try {
      // Build query: search for blocks containing the text
      const query: Record<string, unknown> = {
        _: true,
        q: {
          kind: 100, // SELF_AND
          conditions: [
            { kind: 8, text: text.substring(0, 50) } // Text query, use first 50 chars
          ]
        },
        sort: [['_modified', 'DESC']],
        pageSize: 10
      }

      const result = await this.callTool('query_blocks', {
        repoId: this.repoId,
        description: query,
      })

      const textContent = result.content.find(c => c.type === 'text')
      if (textContent?.text) {
        console.log('[MCP] queryBlocksByText: Raw response text:', textContent.text)
        
        // Try JSON parse first
        try {
          const parsed = JSON.parse(textContent.text)
          // Extract block info from query result
          const blocks = Array.isArray(parsed) 
            ? parsed.map((b: { id: number; text?: string }) => ({ id: b.id, text: b.text || '' }))
            : []
          return { success: true, blocks }
        } catch {
          // JSON parse failed, try to extract Block IDs from text format
          // Format: "Block IDs:\n4358" or "Block IDs:\n4358\n4359"
          const blockIdsMatch = textContent.text.match(/Block IDs:\s*([\d\s\n]+)/i)
          if (blockIdsMatch) {
            const idsText = blockIdsMatch[1].trim()
            const ids = idsText.split(/[\s\n]+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
            console.log('[MCP] queryBlocksByText: Extracted block IDs from text:', ids)
            const blocks = ids.map(id => ({ id, text: '' }))
            return { success: true, blocks }
          }
          console.log('[MCP] queryBlocksByText: Could not parse response')
          return { success: true, blocks: [] }
        }
      }

      return { success: !result.isError, blocks: [] }
    } catch (error) {
      return {
        blocks: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Insert content into Orca (for web clipping)
   * This is the main entry point for clipping
   * Two-step insertion: titleLine as parent, content as children
   * Tag properties (source, clipped) are inserted as property blocks (propName:: value)
   */
  async insertContent(params: {
    titleLine: string
    content: string
    title?: string
    url?: string
    target?: 'journal' | 'page'
    pageName?: string
    tagProperties?: Record<string, string>
  }): Promise<{ blockId?: number; success: boolean; error?: string }> {
    console.log('[MCP] insertContent: Called with params:', {
      titleLineLength: params.titleLine.length,
      contentLength: params.content.length,
      title: params.title,
      url: params.url,
      target: params.target,
      pageName: params.pageName,
      tagProperties: params.tagProperties,
    })

    try {
      let targetBlockId: number

      if (params.target === 'page' && params.pageName) {
        console.log('[MCP] insertContent: Target is page, searching for:', params.pageName)
        // First, search if the page already exists
        const searchResult = await this.searchPages([params.pageName])
        console.log('[MCP] insertContent: Search result:', searchResult)
        
        if (searchResult.success && searchResult.pages.length > 0) {
          // Find exact match (case-insensitive)
          const exactMatch = searchResult.pages.find(
            p => p.name.toLowerCase() === params.pageName!.toLowerCase()
          )
          
          if (exactMatch) {
            // Page exists, use it
            console.log('[MCP] insertContent: Found existing page:', exactMatch)
            targetBlockId = exactMatch.id
          } else {
            // No exact match, create new page
            console.log('[MCP] insertContent: No exact match, creating new page')
            const pageResult = await this.createPage(params.pageName)
            console.log('[MCP] insertContent: Create page result:', pageResult)
            if (!pageResult.success || !pageResult.blockId) {
              return { success: false, error: pageResult.error || 'Failed to create page' }
            }
            targetBlockId = pageResult.blockId
          }
        } else {
          // Search failed or no results, create new page
          console.log('[MCP] insertContent: Search failed or empty, creating new page')
          const pageResult = await this.createPage(params.pageName)
          console.log('[MCP] insertContent: Create page result:', pageResult)
          if (!pageResult.success || !pageResult.blockId) {
            return { success: false, error: pageResult.error || 'Failed to create page' }
          }
          targetBlockId = pageResult.blockId
        }
      } else {
        // Default: insert into today's journal
        console.log('[MCP] insertContent: Target is journal, getting today journal')
        const journalResult = await this.getTodayJournal()
        console.log('[MCP] insertContent: Journal result:', journalResult)
        if (!journalResult.success || !journalResult.blockId) {
          console.error('[MCP] insertContent: Failed to get journal:', journalResult.error)
          return { success: false, error: journalResult.error || 'Failed to get today\'s journal' }
        }
        targetBlockId = journalResult.blockId
      }

      console.log('[MCP] insertContent: Target blockId:', targetBlockId)
      
      // Step 1: Insert title line
      console.log('[MCP] insertContent: Step 1 - Inserting title line:', params.titleLine)
      const titleResult = await this.insertMarkdown({
        refBlockId: targetBlockId,
        text: params.titleLine,
      })

      if (!titleResult.success) {
        console.error('[MCP] insertContent: Failed to insert title:', titleResult.error)
        return { success: false, error: titleResult.error || 'Failed to insert title' }
      }
      console.log('[MCP] insertContent: Title inserted successfully')

      // Step 2: Query to find the just-inserted title block
      console.log('[MCP] insertContent: Step 2 - Querying for title block...')
      
      // Small delay to ensure the block is indexed
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const queryResult = await this.queryBlocksByText(params.titleLine)
      console.log('[MCP] insertContent: Query result:', queryResult)

      let titleBlockId: number | undefined
      if (queryResult.success && queryResult.blocks.length > 0) {
        // Find the block that matches our title (should be the most recent)
        const matchingBlock = queryResult.blocks.find(b => 
          b.text && b.text.includes(params.titleLine.substring(0, 30))
        )
        titleBlockId = matchingBlock?.id || queryResult.blocks[0].id
        console.log('[MCP] insertContent: Found title block ID:', titleBlockId)
      }

      // Step 3: Insert content as children of the title block
      if (titleBlockId) {
        console.log('[MCP] insertContent: Step 3 - Inserting content as children of block:', titleBlockId)
        
        const contentResult = await this.insertMarkdown({
          refBlockId: titleBlockId,
          text: params.content,
        })
        console.log('[MCP] insertContent: Content insert result:', contentResult)
        
        return {
          success: contentResult.success,
          blockId: titleBlockId,
          error: contentResult.error,
        }
      } else {
        // Fallback: insert content at same level as title
        console.warn('[MCP] insertContent: Could not find title block, inserting content at same level')
        
        const contentResult = await this.insertMarkdown({
          refBlockId: targetBlockId,
          text: params.content,
        })
        
        return {
          success: contentResult.success,
          blockId: targetBlockId,
          error: contentResult.error,
        }
      }
    } catch (error) {
      console.error('[MCP] insertContent: Exception:', error)
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

    console.log('[MCP] sendRequest: method =', method, ', params =', JSON.stringify(params).substring(0, 200))
    console.log('[MCP] sendRequest: endpoint =', this.endpointUrl)
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.MCP_TIMEOUT)

    try {
      const startTime = Date.now()
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
      const elapsed = Date.now() - startTime
      console.log('[MCP] sendRequest: Response received in', elapsed, 'ms, status =', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[MCP] sendRequest: HTTP error response:', errorText.substring(0, 500))
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // Handle SSE response format from streamable-http
      const responseText = await response.text()
      console.log('[MCP] sendRequest: Response text:', responseText.substring(0, 500))
      return this.parseSSEResponse(responseText)
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[MCP] sendRequest: Request timed out after', CONFIG.MCP_TIMEOUT, 'ms')
        throw new Error('MCP request timeout')
      }
      console.error('[MCP] sendRequest: Request failed:', error)
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
