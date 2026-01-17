/**
 * Orca Web Clipper - Popup Script
 */

import type { ClipPayload, ClipMode, ClipTarget, ExtensionMessage, ExtensionResponse, OrcaConnectionStatus, ExtractedContent, AIProvider } from '../shared/types'
import { CONFIG } from '../shared/config'
import { sendClipToOrca, checkOrcaConnection } from '../shared/api'
import { getMcpClient } from '../shared/mcpClient'
import { testAIConnection } from '../shared/aiCleaner'
import { DEFAULT_AI_MODELS } from '../shared/types'

// DOM Elements
const connectionStatus = document.getElementById('connection-status')!
const statusText = connectionStatus.querySelector('.status-text')!
const pageTitle = document.getElementById('page-title')!
const pageUrl = document.getElementById('page-url')!
const modeBtns = document.querySelectorAll('.mode-btn')
const targetBtns = document.querySelectorAll('.target-btn')
const clipBtn = document.getElementById('clip-btn') as HTMLButtonElement
const statusMessage = document.getElementById('status-message')!
const templateSelect = document.getElementById('template-select') as HTMLSelectElement
const noteInput = document.getElementById('note-input') as HTMLTextAreaElement
const pageNameSection = document.getElementById('page-name-section') as HTMLElement
const pageNameInput = document.getElementById('page-name-input') as HTMLInputElement

// Tabs
const tabs = document.querySelectorAll('.tab')
const tabContents = document.querySelectorAll('.tab-content')

// Settings elements
const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement
const testConnectionBtn = document.getElementById('test-connection-btn') as HTMLButtonElement
const useMcpCheckbox = document.getElementById('use-mcp') as HTMLInputElement
const mcpTokenInput = document.getElementById('mcp-token') as HTMLInputElement
const mcpRepoIdInput = document.getElementById('mcp-repo-id') as HTMLInputElement
const serverPortInput = document.getElementById('server-port') as HTMLInputElement
const authTokenInput = document.getElementById('auth-token') as HTMLInputElement

// AI Settings elements
const aiOptionSection = document.getElementById('ai-option-section') as HTMLElement
const useAICleaningCheckbox = document.getElementById('use-ai-cleaning') as HTMLInputElement
const aiEnabledCheckbox = document.getElementById('ai-enabled') as HTMLInputElement
const aiProviderSelect = document.getElementById('ai-provider') as HTMLSelectElement
const aiApiKeyInput = document.getElementById('ai-api-key') as HTMLInputElement
const aiModelInput = document.getElementById('ai-model') as HTMLInputElement
const aiBaseUrlInput = document.getElementById('ai-base-url') as HTMLInputElement
const aiCustomUrlRow = document.getElementById('ai-custom-url-row') as HTMLElement
const aiCleaningModeSelect = document.getElementById('ai-cleaning-mode') as HTMLSelectElement
const testAIBtn = document.getElementById('test-ai-btn') as HTMLButtonElement

// Default settings elements
const defaultModeSelect = document.getElementById('default-mode') as HTMLSelectElement
const defaultTargetSelect = document.getElementById('default-target') as HTMLSelectElement
const defaultTemplateSelect = document.getElementById('default-template') as HTMLSelectElement

// State
let currentMode: ClipMode = 'article'
let currentTarget: ClipTarget = { type: 'journal' }
let currentTemplate = 'default'
let isConnected = true // Always true for clipboard mode
let hasSelection = false
let useAICleaning = false

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings()
  await checkConnection()
  await loadPageInfo()
  setupEventListeners()
  updateAIOptionVisibility()
})

// ==================== Connection ====================

async function checkConnection(): Promise<void> {
  setConnectionStatus('checking', '检查中...')
  
  try {
    const status = await checkOrcaConnection()
    
    if (status.connected) {
      setConnectionStatus('connected', status.version || '已连接')
      clipBtn.disabled = false
    } else {
      setConnectionStatus('disconnected', status.error || '未连接')
      clipBtn.disabled = true
    }
  } catch (error) {
    // Fallback to clipboard mode on error
    setConnectionStatus('connected', 'Clipboard Mode')
    clipBtn.disabled = false
  }
}

// ==================== Page Info ====================

async function loadPageInfo(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    
    pageTitle.textContent = tab.title || '未知页面'
    pageUrl.textContent = tab.url || ''
    
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'GET_PAGE_INFO',
    } as ExtensionMessage)
    
    if (response?.success && response.data) {
      hasSelection = response.data.hasSelection
      updateSelectionButton()
    }
  } catch (error) {
    console.error('Failed to load page info:', error)
    pageTitle.textContent = '无法访问页面'
  }
}

// ==================== Event Listeners ====================

function setupEventListeners(): void {
  // Tabs
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab')
      tabs.forEach(t => t.classList.remove('active'))
      tabContents.forEach(c => c.classList.remove('active'))
      tab.classList.add('active')
      document.getElementById(`tab-${tabId}`)?.classList.add('active')
    })
  })
  
  // Mode buttons
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.hasAttribute('disabled')) return
      modeBtns.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      currentMode = btn.getAttribute('data-mode') as ClipMode
    })
  })
  
  // Target buttons
  targetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      targetBtns.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      const targetType = btn.getAttribute('data-target') as 'journal' | 'page'
      currentTarget = { type: targetType }
      updatePageNameVisibility()
    })
  })
  
  // Template select
  templateSelect.addEventListener('change', () => {
    currentTemplate = templateSelect.value
  })
  
  // Clip button
  clipBtn.addEventListener('click', handleClip)
  
  // Settings buttons
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveSettings)
  }
  
  if (testConnectionBtn) {
    testConnectionBtn.addEventListener('click', handleTestConnection)
  }
  
  // AI Settings event listeners
  if (aiProviderSelect) {
    aiProviderSelect.addEventListener('change', () => {
      updateCustomUrlVisibility()
      updateDefaultModel()
    })
  }
  
  if (aiCleaningModeSelect) {
    aiCleaningModeSelect.addEventListener('change', () => {
      updateTranslateLanguageVisibility()
    })
  }
  
  if (useAICleaningCheckbox) {
    useAICleaningCheckbox.addEventListener('change', () => {
      useAICleaning = useAICleaningCheckbox.checked
    })
  }
  
  if (testAIBtn) {
    testAIBtn.addEventListener('click', handleTestAI)
  }
}

// ==================== Clip Action ====================

async function handleClip(): Promise<void> {
  clipBtn.classList.add('loading')
  clipBtn.disabled = true
  hideStatus()
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('没有活动标签页')
    
    // Extract content
    const extractResponse = await chrome.tabs.sendMessage(tab.id, {
      type: 'EXTRACT_CONTENT',
      payload: { mode: currentMode },
    } as ExtensionMessage) as ExtensionResponse<ExtractedContent & { highlights?: Array<{ color: string; text: string }> }>
    
    if (!extractResponse.success) {
      throw new Error(extractResponse.error || '提取内容失败')
    }
    
    let extracted = extractResponse.data!
    let content = extracted.text
    
    // Apply AI cleaning if enabled and user opted in
    if (useAICleaning && useAICleaningCheckbox?.checked) {
      showStatus('🤖 AI 正在处理内容...', 'success')
      
      try {
        const aiOptions = await getAICleaningOptionsFromStorage()
        
        if (aiOptions) {
          const { cleanContentWithAI } = await import('../shared/aiCleaner')
          
          const aiResult = await cleanContentWithAI({
            html: extracted.html,
            url: tab.url || '',
            title: tab.title || '',
            options: aiOptions,
          })
          
          if (aiResult.success && aiResult.content) {
            content = aiResult.content
          } else {
            console.warn('AI cleaning failed, using rule-based content:', aiResult.error)
          }
        }
      } catch (aiError) {
        console.warn('AI cleaning error, using rule-based content:', aiError)
      }
    }
    
    // Generate brief summary for research template (if AI is configured)
    let summary: string | undefined
    if (currentTemplate === 'research') {
      try {
        const aiConfig = await getAIModelConfigFromStorage()
        if (aiConfig) {
          showStatus('📝 生成摘要...', 'success')
          const { generateBriefSummary } = await import('../shared/aiCleaner')
          const summaryResult = await generateBriefSummary(
            extracted.html,
            tab.url || '',
            tab.title || '',
            aiConfig
          )
          if (summaryResult.success && summaryResult.content) {
            summary = summaryResult.content
          }
        }
      } catch (summaryError) {
        console.warn('Brief summary generation failed:', summaryError)
      }
    }
    
    // Generate abstract (100 chars max) if AI is configured
    let abstract: string | undefined
    try {
      const aiConfig = await getAIModelConfigFromStorage()
      if (aiConfig) {
        showStatus('📝 生成摘要描述...', 'success')
        const { generateAbstract } = await import('../shared/aiCleaner')
        const abstractResult = await generateAbstract(
          content,
          tab.title || '',
          aiConfig
        )
        if (abstractResult.success && abstractResult.content) {
          abstract = abstractResult.content
        }
      }
    } catch (abstractError) {
      console.warn('Abstract generation failed:', abstractError)
    }
    
    // Build payload
    const now = new Date()
    const capturedAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    
    // Build target with pageName if targeting a page
    const targetWithPageName: ClipTarget = currentTarget.type === 'page'
      ? { type: 'page', pageName: pageNameInput?.value.trim() || tab.title || '' }
      : { type: 'journal' }
    
    const payload: ClipPayload = {
      metadata: {
        url: tab.url || '',
        title: tab.title || '',
        ...extracted.metadata,
        capturedAt, // Must be after spread to override
        abstract, // AI-generated abstract (100 chars max)
      },
      content, // Use AI-cleaned or rule-based content
      mode: currentMode,
      target: targetWithPageName,
      template: currentTemplate,
      note: noteInput?.value || undefined,
      summary,
    }
    
    // Screenshot feature removed - MCP payload size limit makes it impractical
    
    // Send to Orca (copies to clipboard)
    // Directly call API instead of sending message to background
    // This avoids "Could not establish connection" errors if service worker is inactive
    const clipResponse = await sendClipToOrca(payload)
    
    if (clipResponse.success) {
      // Different message based on mode
      const storage = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.USE_MCP)
      const isMcp = storage[CONFIG.STORAGE_KEYS.USE_MCP] === true
      
      if (isMcp) {
        showStatus('✓ 已直接保存到 Orca！', 'success')
      } else {
        showStatus('✓ 已复制到剪贴板！请在 Orca 中按 Ctrl+Shift+V', 'success')
      }
      // Auto-close disabled for debugging - uncomment when ready for production
      // setTimeout(() => window.close(), 2500)
    } else {
      throw new Error(clipResponse.error || '保存失败')
    }
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '剪藏失败', 'error')
  } finally {
    clipBtn.classList.remove('loading')
    clipBtn.disabled = false
  }
}

// ==================== Settings ====================

async function loadSettings(): Promise<void> {
  const storage = await chrome.storage.local.get([
    CONFIG.STORAGE_KEYS.DEFAULT_MODE,
    CONFIG.STORAGE_KEYS.DEFAULT_TARGET,
    CONFIG.STORAGE_KEYS.DEFAULT_TEMPLATE,
    CONFIG.STORAGE_KEYS.USE_MCP,
    CONFIG.STORAGE_KEYS.MCP_TOKEN,
    CONFIG.STORAGE_KEYS.MCP_REPO_ID,
    CONFIG.STORAGE_KEYS.SERVER_PORT,
    CONFIG.STORAGE_KEYS.AUTH_TOKEN,
    // AI settings
    CONFIG.STORAGE_KEYS.AI_ENABLED,
    CONFIG.STORAGE_KEYS.AI_PROVIDER,
    CONFIG.STORAGE_KEYS.AI_MODEL,
    CONFIG.STORAGE_KEYS.AI_API_KEY,
    CONFIG.STORAGE_KEYS.AI_BASE_URL,
    CONFIG.STORAGE_KEYS.AI_CLEANING_MODE,
  ])
  
  // Default settings
  if (defaultModeSelect && storage[CONFIG.STORAGE_KEYS.DEFAULT_MODE]) {
    defaultModeSelect.value = storage[CONFIG.STORAGE_KEYS.DEFAULT_MODE]
    currentMode = storage[CONFIG.STORAGE_KEYS.DEFAULT_MODE] as ClipMode
    // Update mode button UI
    modeBtns.forEach(btn => {
      const mode = btn.getAttribute('data-mode')
      btn.classList.toggle('active', mode === currentMode)
    })
  }
  if (defaultTargetSelect && storage[CONFIG.STORAGE_KEYS.DEFAULT_TARGET]) {
    defaultTargetSelect.value = storage[CONFIG.STORAGE_KEYS.DEFAULT_TARGET]
    const targetType = storage[CONFIG.STORAGE_KEYS.DEFAULT_TARGET] === 'new-page' ? 'page' : 'journal'
    currentTarget = { type: targetType }
    // Update target button UI
    targetBtns.forEach(btn => {
      const target = btn.getAttribute('data-target')
      btn.classList.toggle('active', target === targetType)
    })
    // Show/hide page name section
    if (pageNameSection) {
      pageNameSection.style.display = targetType === 'page' ? 'block' : 'none'
    }
  }
  if (defaultTemplateSelect && storage[CONFIG.STORAGE_KEYS.DEFAULT_TEMPLATE]) {
    defaultTemplateSelect.value = storage[CONFIG.STORAGE_KEYS.DEFAULT_TEMPLATE]
    currentTemplate = storage[CONFIG.STORAGE_KEYS.DEFAULT_TEMPLATE]
    // Update template select in clip tab
    if (templateSelect) {
      templateSelect.value = currentTemplate
    }
  }
  
  // MCP settings
  if (useMcpCheckbox) {
    useMcpCheckbox.checked = storage[CONFIG.STORAGE_KEYS.USE_MCP] === true
  }
  if (mcpTokenInput && storage[CONFIG.STORAGE_KEYS.MCP_TOKEN]) {
    mcpTokenInput.value = storage[CONFIG.STORAGE_KEYS.MCP_TOKEN]
  }
  if (mcpRepoIdInput && storage[CONFIG.STORAGE_KEYS.MCP_REPO_ID]) {
    mcpRepoIdInput.value = storage[CONFIG.STORAGE_KEYS.MCP_REPO_ID]
  }
  
  // Legacy settings
  if (serverPortInput && storage[CONFIG.STORAGE_KEYS.SERVER_PORT]) {
    serverPortInput.value = storage[CONFIG.STORAGE_KEYS.SERVER_PORT]
  }
  if (authTokenInput && storage[CONFIG.STORAGE_KEYS.AUTH_TOKEN]) {
    authTokenInput.value = storage[CONFIG.STORAGE_KEYS.AUTH_TOKEN]
  }
  
  // AI settings
  if (aiEnabledCheckbox) {
    aiEnabledCheckbox.checked = storage[CONFIG.STORAGE_KEYS.AI_ENABLED] === true
  }
  if (aiProviderSelect && storage[CONFIG.STORAGE_KEYS.AI_PROVIDER]) {
    aiProviderSelect.value = storage[CONFIG.STORAGE_KEYS.AI_PROVIDER]
  }
  if (aiModelInput && storage[CONFIG.STORAGE_KEYS.AI_MODEL]) {
    aiModelInput.value = storage[CONFIG.STORAGE_KEYS.AI_MODEL]
  }
  if (aiApiKeyInput && storage[CONFIG.STORAGE_KEYS.AI_API_KEY]) {
    aiApiKeyInput.value = storage[CONFIG.STORAGE_KEYS.AI_API_KEY]
  }
  if (aiBaseUrlInput && storage[CONFIG.STORAGE_KEYS.AI_BASE_URL]) {
    aiBaseUrlInput.value = storage[CONFIG.STORAGE_KEYS.AI_BASE_URL]
  }
  if (aiCleaningModeSelect && storage[CONFIG.STORAGE_KEYS.AI_CLEANING_MODE]) {
    aiCleaningModeSelect.value = storage[CONFIG.STORAGE_KEYS.AI_CLEANING_MODE]
  }
  
  // Update UI based on loaded settings
  updateCustomUrlVisibility()
  updateDefaultModel()
}

async function saveSettings(): Promise<void> {
  const settings: Record<string, unknown> = {}
  
  // Default settings
  if (defaultModeSelect) {
    settings[CONFIG.STORAGE_KEYS.DEFAULT_MODE] = defaultModeSelect.value
  }
  if (defaultTargetSelect) {
    settings[CONFIG.STORAGE_KEYS.DEFAULT_TARGET] = defaultTargetSelect.value
  }
  if (defaultTemplateSelect) {
    settings[CONFIG.STORAGE_KEYS.DEFAULT_TEMPLATE] = defaultTemplateSelect.value
  }
  
  // MCP settings
  if (useMcpCheckbox) {
    settings[CONFIG.STORAGE_KEYS.USE_MCP] = useMcpCheckbox.checked
  }
  if (mcpTokenInput && mcpTokenInput.value) {
    settings[CONFIG.STORAGE_KEYS.MCP_TOKEN] = mcpTokenInput.value.trim()
  }
  if (mcpRepoIdInput) {
    // Always save repoId, even if empty (to allow clearing)
    const repoIdValue = mcpRepoIdInput.value.trim()
    settings[CONFIG.STORAGE_KEYS.MCP_REPO_ID] = repoIdValue
    console.log('[Settings] Saving repoId:', repoIdValue, 'key:', CONFIG.STORAGE_KEYS.MCP_REPO_ID)
  }
  
  // Legacy settings
  if (serverPortInput && serverPortInput.value) {
    settings[CONFIG.STORAGE_KEYS.SERVER_PORT] = parseInt(serverPortInput.value, 10)
  }
  if (authTokenInput && authTokenInput.value) {
    settings[CONFIG.STORAGE_KEYS.AUTH_TOKEN] = authTokenInput.value.trim()
  }
  
  // AI settings - always save all fields to ensure persistence
  if (aiEnabledCheckbox) {
    settings[CONFIG.STORAGE_KEYS.AI_ENABLED] = aiEnabledCheckbox.checked
  }
  if (aiProviderSelect) {
    settings[CONFIG.STORAGE_KEYS.AI_PROVIDER] = aiProviderSelect.value
  }
  // Always save model, api key, base url - even if empty (to allow clearing)
  if (aiModelInput) {
    settings[CONFIG.STORAGE_KEYS.AI_MODEL] = aiModelInput.value.trim()
  }
  if (aiApiKeyInput) {
    settings[CONFIG.STORAGE_KEYS.AI_API_KEY] = aiApiKeyInput.value.trim()
  }
  if (aiBaseUrlInput) {
    settings[CONFIG.STORAGE_KEYS.AI_BASE_URL] = aiBaseUrlInput.value.trim()
  }
  if (aiCleaningModeSelect) {
    settings[CONFIG.STORAGE_KEYS.AI_CLEANING_MODE] = aiCleaningModeSelect.value
  }
  
  console.log('[Settings] Saving all settings:', Object.keys(settings))
  await chrome.storage.local.set(settings)
  console.log('[Settings] Settings saved successfully')
  showStatus('设置已保存', 'success')
  
  // Re-check connection and update AI visibility
  await checkConnection()
  await updateAIOptionVisibility()
}

async function handleTestConnection(): Promise<void> {
  showStatus('正在测试连接...', 'success')
  
  try {
    // First save any pending changes
    await saveSettings()
    
    const status = await checkOrcaConnection()
    
    if (status.connected) {
      showStatus(`✓ 连接成功: ${status.version}`, 'success')
    } else {
      showStatus(`✗ 连接失败: ${status.error || '无法连接'}`, 'error')
    }
  } catch (error) {
    showStatus(`✗ 测试失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error')
  }
}

// ==================== Helpers ====================

async function sendMessage<T = any>(message: ExtensionMessage): Promise<ExtensionResponse<T>> {
  try {
    return await chrome.runtime.sendMessage(message)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '消息发送失败',
    }
  }
}

function setConnectionStatus(status: 'connected' | 'disconnected' | 'checking', detail?: string): void {
  connectionStatus.className = `status status-${status}`
  statusText.textContent = detail || (status === 'connected' ? '已连接' : '未连接')
}

function updateSelectionButton(): void {
  const selectionBtn = document.getElementById('mode-selection') as HTMLButtonElement
  selectionBtn.disabled = !hasSelection
}

function updatePageNameVisibility(): void {
  if (!pageNameSection) return
  pageNameSection.style.display = currentTarget.type === 'page' ? 'block' : 'none'
}

function showStatus(message: string, type: 'success' | 'error'): void {
  statusMessage.textContent = message
  statusMessage.className = `status-message ${type}`
}

function hideStatus(): void {
  statusMessage.className = 'status-message hidden'
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// ==================== AI Functions ====================

/**
 * Update AI option visibility in clip tab based on whether AI is configured
 */
async function updateAIOptionVisibility(): Promise<void> {
  if (!aiOptionSection) return
  
  try {
    const storage = await chrome.storage.local.get([
      CONFIG.STORAGE_KEYS.AI_ENABLED,
      CONFIG.STORAGE_KEYS.AI_API_KEY,
    ])
    
    const isConfigured = storage[CONFIG.STORAGE_KEYS.AI_ENABLED] === true && 
                         !!storage[CONFIG.STORAGE_KEYS.AI_API_KEY]
    
    aiOptionSection.style.display = isConfigured ? 'block' : 'none'
  } catch {
    aiOptionSection.style.display = 'none'
  }
}

/**
 * Show/hide custom URL input based on provider selection
 */
function updateCustomUrlVisibility(): void {
  if (!aiProviderSelect || !aiCustomUrlRow) return
  
  const provider = aiProviderSelect.value
  aiCustomUrlRow.style.display = (provider === 'custom' || provider === 'openrouter') ? 'flex' : 'none'
}

/**
 * Update model placeholder based on provider
 */
function updateDefaultModel(): void {
  if (!aiProviderSelect || !aiModelInput) return
  
  const provider = aiProviderSelect.value as AIProvider
  const defaultModel = DEFAULT_AI_MODELS[provider] || ''
  aiModelInput.placeholder = defaultModel ? `${defaultModel} (默认)` : '输入模型名称'
}

/**
 * Handle AI connection test
 */
async function handleTestAI(): Promise<void> {
  if (!aiApiKeyInput || !aiProviderSelect) return
  
  const apiKey = aiApiKeyInput.value.trim()
  if (!apiKey) {
    showStatus('请先输入 API Key', 'error')
    return
  }
  
  showStatus('正在测试 AI 连接...', 'success')
  
  try {
    const provider = aiProviderSelect.value as AIProvider
    const model = aiModelInput?.value.trim() || DEFAULT_AI_MODELS[provider]
    const baseUrl = aiBaseUrlInput?.value.trim() || undefined
    
    const result = await testAIConnection({
      provider,
      model,
      apiKey,
      baseUrl,
    })
    
    if (result.success) {
      showStatus('✓ AI 连接成功！', 'success')
    } else {
      showStatus(`✗ AI 连接失败: ${result.error}`, 'error')
    }
  } catch (error) {
    showStatus(`✗ 测试失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error')
  }
}

/**
 * Get AI cleaning options from storage
 */
async function getAICleaningOptionsFromStorage(): Promise<import('../shared/types').AICleaningOptions | null> {
  try {
    const storage = await chrome.storage.local.get([
      CONFIG.STORAGE_KEYS.AI_ENABLED,
      CONFIG.STORAGE_KEYS.AI_PROVIDER,
      CONFIG.STORAGE_KEYS.AI_MODEL,
      CONFIG.STORAGE_KEYS.AI_API_KEY,
      CONFIG.STORAGE_KEYS.AI_BASE_URL,
      CONFIG.STORAGE_KEYS.AI_CLEANING_MODE,
    ])
    
    if (!storage[CONFIG.STORAGE_KEYS.AI_ENABLED] || !storage[CONFIG.STORAGE_KEYS.AI_API_KEY]) {
      return null
    }
    
    const provider = (storage[CONFIG.STORAGE_KEYS.AI_PROVIDER] || 'openai') as AIProvider
    
    return {
      enabled: true,
      model: {
        provider,
        model: storage[CONFIG.STORAGE_KEYS.AI_MODEL] || DEFAULT_AI_MODELS[provider],
        apiKey: storage[CONFIG.STORAGE_KEYS.AI_API_KEY],
        baseUrl: storage[CONFIG.STORAGE_KEYS.AI_BASE_URL] || undefined,
      },
      mode: (storage[CONFIG.STORAGE_KEYS.AI_CLEANING_MODE] || 'extract') as import('../shared/types').AICleaningMode,
      preserveImages: true,
      preserveLinks: true,
      preserveCode: true,
    }
  } catch {
    return null
  }
}

/**
 * Get AI model config from storage (for summary generation)
 */
async function getAIModelConfigFromStorage(): Promise<import('../shared/types').AIModelConfig | null> {
  try {
    const storage = await chrome.storage.local.get([
      CONFIG.STORAGE_KEYS.AI_ENABLED,
      CONFIG.STORAGE_KEYS.AI_PROVIDER,
      CONFIG.STORAGE_KEYS.AI_MODEL,
      CONFIG.STORAGE_KEYS.AI_API_KEY,
      CONFIG.STORAGE_KEYS.AI_BASE_URL,
    ])
    
    if (!storage[CONFIG.STORAGE_KEYS.AI_ENABLED] || !storage[CONFIG.STORAGE_KEYS.AI_API_KEY]) {
      return null
    }
    
    const provider = (storage[CONFIG.STORAGE_KEYS.AI_PROVIDER] || 'openai') as AIProvider
    
    return {
      provider,
      model: storage[CONFIG.STORAGE_KEYS.AI_MODEL] || DEFAULT_AI_MODELS[provider],
      apiKey: storage[CONFIG.STORAGE_KEYS.AI_API_KEY],
      baseUrl: storage[CONFIG.STORAGE_KEYS.AI_BASE_URL] || undefined,
    }
  } catch {
    return null
  }
}
