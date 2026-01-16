/**
 * Orca Web Clipper - Configuration
 */

import type { AIModelConfig, AICleaningOptions, AIProvider, AICleaningMode } from './types'
import { DEFAULT_AI_MODELS } from './types'

export const CONFIG = {
  // Orca plugin server settings (legacy, for fallback)
  ORCA_SERVER_HOST: '127.0.0.1',
  ORCA_SERVER_PORT: 27183, // "ORCA" on phone keypad (default)
  
  // Orca MCP Server settings (primary)
  // Based on actual Orca MCP config: streamable-http at localhost:18672/mcp
  MCP_SERVER: {
    HOST: 'localhost',
    PORT: 18672,
    MCP_PATH: '/mcp',
  },
  
  // Endpoints (legacy)
  ENDPOINTS: {
    HEALTH: '/health',
    CLIP: '/clip',
    UPLOAD_ASSET: '/asset',
  },
  
  // Storage keys
  STORAGE_KEYS: {
    AUTH_TOKEN: 'orca_auth_token',
    DEFAULT_TARGET: 'default_target',
    DEFAULT_MODE: 'default_mode',
    SERVER_PORT: 'serverPort',
    MCP_TOKEN: 'orca_mcp_token',
    MCP_REPO_ID: 'orca_mcp_repo_id',
    USE_MCP: 'use_mcp',
    // AI settings
    AI_ENABLED: 'ai_enabled',
    AI_PROVIDER: 'ai_provider',
    AI_MODEL: 'ai_model',
    AI_API_KEY: 'ai_api_key',
    AI_BASE_URL: 'ai_base_url',
    AI_CLEANING_MODE: 'ai_cleaning_mode',
    AI_PRESERVE_IMAGES: 'ai_preserve_images',
    AI_PRESERVE_LINKS: 'ai_preserve_links',
    AI_PRESERVE_CODE: 'ai_preserve_code',
  },
  
  // Timeouts
  REQUEST_TIMEOUT: 10000, // 10 seconds
  HEALTH_CHECK_TIMEOUT: 3000, // 3 seconds
  MCP_TIMEOUT: 15000, // 15 seconds for MCP operations
  AI_TIMEOUT: 60000, // 60 seconds for AI operations
}

/**
 * Get the base URL for Orca server, using stored port if available
 */
export async function getOrcaBaseUrl(): Promise<string> {
  try {
    const storage = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.SERVER_PORT)
    const port = storage[CONFIG.STORAGE_KEYS.SERVER_PORT] || CONFIG.ORCA_SERVER_PORT
    return `http://${CONFIG.ORCA_SERVER_HOST}:${port}`
  } catch {
    // Fallback to default if storage access fails
    return `http://${CONFIG.ORCA_SERVER_HOST}:${CONFIG.ORCA_SERVER_PORT}`
  }
}

/**
 * Get the MCP Server URL
 */
export function getMcpServerUrl(): string {
  const { HOST, PORT } = CONFIG.MCP_SERVER
  return `http://${HOST}:${PORT}`
}

/**
 * Get MCP endpoint URL (streamable-http)
 */
export function getMcpEndpointUrl(): string {
  return `${getMcpServerUrl()}${CONFIG.MCP_SERVER.MCP_PATH}`
}

/**
 * Get stored MCP token
 */
export async function getMcpToken(): Promise<string | null> {
  try {
    const storage = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.MCP_TOKEN)
    return storage[CONFIG.STORAGE_KEYS.MCP_TOKEN] || null
  } catch {
    return null
  }
}

/**
 * Save MCP token
 */
export async function saveMcpToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.MCP_TOKEN]: token })
}

/**
 * Check if MCP mode is enabled
 */
export async function isMcpEnabled(): Promise<boolean> {
  try {
    const storage = await chrome.storage.local.get([
      CONFIG.STORAGE_KEYS.USE_MCP,
      CONFIG.STORAGE_KEYS.MCP_TOKEN,
    ])
    // MCP is enabled if user opted in AND has a token configured
    return storage[CONFIG.STORAGE_KEYS.USE_MCP] === true && !!storage[CONFIG.STORAGE_KEYS.MCP_TOKEN]
  } catch {
    return false
  }
}

/**
 * Get stored MCP repoId
 */
export async function getMcpRepoId(): Promise<string | null> {
  try {
    const storage = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.MCP_REPO_ID)
    return storage[CONFIG.STORAGE_KEYS.MCP_REPO_ID] || null
  } catch {
    return null
  }
}

/**
 * Save MCP repoId
 */
export async function saveMcpRepoId(repoId: string): Promise<void> {
  await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.MCP_REPO_ID]: repoId })
}

// ==================== AI Configuration ====================

/**
 * Get AI configuration
 */
export async function getAIConfig(): Promise<AIModelConfig | null> {
  try {
    const storage = await chrome.storage.local.get([
      CONFIG.STORAGE_KEYS.AI_ENABLED,
      CONFIG.STORAGE_KEYS.AI_PROVIDER,
      CONFIG.STORAGE_KEYS.AI_MODEL,
      CONFIG.STORAGE_KEYS.AI_API_KEY,
      CONFIG.STORAGE_KEYS.AI_BASE_URL,
    ])

    if (!storage[CONFIG.STORAGE_KEYS.AI_ENABLED]) {
      return null
    }

    const provider = (storage[CONFIG.STORAGE_KEYS.AI_PROVIDER] || 'openai') as AIProvider
    const apiKey = storage[CONFIG.STORAGE_KEYS.AI_API_KEY]

    if (!apiKey) {
      return null
    }

    return {
      provider,
      model: storage[CONFIG.STORAGE_KEYS.AI_MODEL] || DEFAULT_AI_MODELS[provider],
      apiKey,
      baseUrl: storage[CONFIG.STORAGE_KEYS.AI_BASE_URL] || undefined,
    }
  } catch {
    return null
  }
}

/**
 * Save AI configuration
 */
export async function saveAIConfig(config: Partial<AIModelConfig> & { enabled: boolean }): Promise<void> {
  const settings: Record<string, unknown> = {
    [CONFIG.STORAGE_KEYS.AI_ENABLED]: config.enabled,
  }

  if (config.provider) {
    settings[CONFIG.STORAGE_KEYS.AI_PROVIDER] = config.provider
  }
  if (config.model) {
    settings[CONFIG.STORAGE_KEYS.AI_MODEL] = config.model
  }
  if (config.apiKey) {
    settings[CONFIG.STORAGE_KEYS.AI_API_KEY] = config.apiKey
  }
  if (config.baseUrl !== undefined) {
    settings[CONFIG.STORAGE_KEYS.AI_BASE_URL] = config.baseUrl
  }

  await chrome.storage.local.set(settings)
}

/**
 * Get AI cleaning options
 */
export async function getAICleaningOptions(): Promise<AICleaningOptions | null> {
  const config = await getAIConfig()
  if (!config) {
    return null
  }

  try {
    const storage = await chrome.storage.local.get([
      CONFIG.STORAGE_KEYS.AI_CLEANING_MODE,
      CONFIG.STORAGE_KEYS.AI_PRESERVE_IMAGES,
      CONFIG.STORAGE_KEYS.AI_PRESERVE_LINKS,
      CONFIG.STORAGE_KEYS.AI_PRESERVE_CODE,
    ])

    return {
      enabled: true,
      model: config,
      mode: (storage[CONFIG.STORAGE_KEYS.AI_CLEANING_MODE] || 'extract') as AICleaningMode,
      preserveImages: storage[CONFIG.STORAGE_KEYS.AI_PRESERVE_IMAGES] !== false,
      preserveLinks: storage[CONFIG.STORAGE_KEYS.AI_PRESERVE_LINKS] !== false,
      preserveCode: storage[CONFIG.STORAGE_KEYS.AI_PRESERVE_CODE] !== false,
    }
  } catch {
    return null
  }
}

/**
 * Check if AI cleaning is enabled
 */
export async function isAIEnabled(): Promise<boolean> {
  try {
    const storage = await chrome.storage.local.get([
      CONFIG.STORAGE_KEYS.AI_ENABLED,
      CONFIG.STORAGE_KEYS.AI_API_KEY,
    ])
    return storage[CONFIG.STORAGE_KEYS.AI_ENABLED] === true && !!storage[CONFIG.STORAGE_KEYS.AI_API_KEY]
  } catch {
    return false
  }
}
