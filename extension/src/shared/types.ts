/**
 * Orca Web Clipper - Updated Types with all features
 */

export interface ClipMetadata {
  url: string
  title: string
  siteName?: string
  author?: string
  publishedAt?: string
  capturedAt: string
  favicon?: string
  abstract?: string // AI-generated brief description (100 chars max)
}

export interface ClipPayload {
  metadata: ClipMetadata
  content: string // Markdown content
  mode: ClipMode
  target: ClipTarget
  template?: string
  note?: string
  summary?: string // AI-generated brief summary for research template
}

export type ClipMode = 'selection' | 'article' | 'full-page'

export interface ClipTarget {
  type: 'journal' | 'page'
  blockId?: number
  pageName?: string
}

export interface ClipResponse {
  success: boolean
  blockId?: number
  error?: string
  message?: string
}

export interface OrcaConnectionStatus {
  connected: boolean
  version?: string
  error?: string
}

export interface ExtractedContent {
  html: string
  text: string // Markdown content
  metadata: Partial<ClipMetadata>
}

// Message types for extension communication
export type MessageType = 
  | 'EXTRACT_CONTENT'
  | 'EXTRACT_SELECTION'
  | 'GET_PAGE_INFO'
  | 'CLIP_TO_ORCA'
  | 'CHECK_CONNECTION'
  | 'AI_CLEAN_CONTENT'

export interface ExtensionMessage {
  type: MessageType
  payload?: ExtensionMessagePayload
}

export interface ExtensionMessagePayload {
  mode?: ClipMode
  color?: string
  content?: string
  useAI?: boolean
}

export interface ExtensionResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// ==================== AI Configuration ====================

/**
 * Supported AI providers
 */
export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'custom'

/**
 * AI model configuration
 */
export interface AIModelConfig {
  provider: AIProvider
  model: string
  apiKey: string
  baseUrl?: string // For custom endpoints or OpenRouter
  maxTokens?: number
  temperature?: number
}

/**
 * AI cleaning options
 */
export interface AICleaningOptions {
  enabled: boolean
  model: AIModelConfig
  mode: AICleaningMode
  preserveImages: boolean
  preserveLinks: boolean
  preserveCode: boolean
}

/**
 * AI cleaning mode
 */
export type AICleaningMode = 
  | 'extract'     // Extract only main article content
  | 'summarize'   // Summarize the content
  | 'clean'       // Remove noise while keeping structure
  | 'enhance'     // Clean + improve formatting

/**
 * AI cleaning request
 */
export interface AICleaningRequest {
  html: string
  url: string
  title: string
  options: AICleaningOptions
}

/**
 * AI cleaning response
 */
export interface AICleaningResponse {
  success: boolean
  content?: string // Cleaned Markdown content
  error?: string
  tokensUsed?: number
}

/**
 * Default AI models by provider
 */
export const DEFAULT_AI_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku-20240307',
  gemini: 'gemini-1.5-flash',
  openrouter: 'anthropic/claude-3-haiku',
  custom: '',
}

/**
 * AI provider base URLs
 */
export const AI_PROVIDER_URLS: Record<AIProvider, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openrouter: 'https://openrouter.ai/api/v1',
  custom: '',
}
