/**
 * Orca Web Clipper Plugin - Types
 */

export interface ClipMetadata {
  url: string
  title: string
  siteName?: string
  author?: string
  publishedAt?: string
  capturedAt: string
  favicon?: string
}

export interface ClipPayload {
  metadata: ClipMetadata
  content: string // Markdown content
  mode: 'selection' | 'article' | 'full-page' | 'highlights'
  target: ClipTarget
  highlights?: HighlightData[]
  note?: string
  screenshot?: string // Base64 data URL
  template?: string
}

export interface ClipTarget {
  type: 'journal' | 'new-page' | 'block'
  blockId?: number
  pageName?: string
}

export interface HighlightData {
  id: string
  text: string
  color: string
  note?: string
}

export interface ClipResponse {
  success: boolean
  blockId?: number
  error?: string
}

export interface ServerConfig {
  port: number
  host: string
  authToken: string
}
