/**
 * Orca Web Clipper - AI Content Cleaner
 * Optional AI-powered content extraction and cleaning
 */

import type {
  AIModelConfig,
  AICleaningOptions,
  AICleaningRequest,
  AICleaningResponse,
} from './types'

/**
 * System prompts for different cleaning modes
 */
const SYSTEM_PROMPTS = {
  extract: `You are a web content extractor. Your task is to extract the main article content from HTML, removing all noise and improving formatting.

Rules:
1. Output clean, well-formatted Markdown
2. Remove: navigation, headers, footers, ads, comments, social buttons, related articles, author bios, "read more" links, promotional text
3. Preserve the article structure (headings, paragraphs, lists, code blocks)
4. Keep all images with their alt text as ![alt](url)
5. Keep all important links
6. Fix formatting issues (extra whitespace, broken lists, heading hierarchy)
7. Do NOT summarize or shorten the content
8. Do NOT add any commentary or explanations
9. If content is in Chinese, keep it in Chinese`,

  summarize: `You are a content summarizer. Your task is to create a concise summary of the main article content.

Rules:
1. Output clean Markdown format
2. Create a brief summary (3-5 paragraphs max)
3. Include key points and main arguments
4. Preserve any critical data, numbers, or quotes
5. Include the most important images if relevant
6. Write in the same language as the original content`,

  enhance: `You are a content formatter. Your task is to improve the Markdown formatting without changing the content.

Rules:
1. Fix heading hierarchy (h1 for title, h2 for sections, etc.)
2. Improve list formatting and consistency
3. Clean up code blocks with proper language tags
4. Fix broken image and link syntax
5. Remove extra whitespace and line breaks
6. Keep ALL content - do not remove or summarize anything
7. Do NOT add any commentary`,

  brief: `You are a content summarizer. Create an ultra-concise summary in 1-3 bullet points.

Rules:
1. Maximum 3 bullet points, each under 20 words
2. Capture ONLY the core idea/conclusion
3. No introduction, no context, just key takeaways
4. Use the same language as the original content
5. Format as a simple bullet list with "-"
6. Be direct and specific, avoid vague statements`,

  abstract: `You are a content summarizer. Create a brief one-sentence description of the article.

Rules:
1. Output a SINGLE sentence, maximum 100 characters
2. Capture the core topic/theme of the article
3. Use the same language as the original content
4. No bullet points, no line breaks, just one sentence
5. Be direct and informative
6. Do NOT include phrases like "This article discusses..." or "The author..."
7. If content is in Chinese, output in Chinese`,
}

/**
 * Clean content using AI
 */
export async function cleanContentWithAI(
  request: AICleaningRequest
): Promise<AICleaningResponse> {
  const { html, url, title, options } = request
  const { model, mode } = options

  try {
    // Prepare the content for AI
    const userPrompt = buildUserPrompt(html, url, title, options)
    const systemPrompt = SYSTEM_PROMPTS[mode]

    // Call the appropriate AI provider
    const response = await callAIProvider(model, systemPrompt, userPrompt)

    return response
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'AI cleaning failed',
    }
  }
}

/**
 * Build the user prompt with content
 */
function buildUserPrompt(
  html: string,
  url: string,
  title: string,
  options: AICleaningOptions
): string {
  // Truncate HTML if too long (most models have token limits)
  const maxLength = 100000 // ~25k tokens for most models
  let content = html
  if (content.length > maxLength) {
    content = content.substring(0, maxLength) + '\n\n[Content truncated due to length...]'
  }

  let prompt = `URL: ${url}\nTitle: ${title}\n\n`

  if (options.preserveImages) {
    prompt += 'Note: Please preserve all images in the output.\n'
  }
  if (options.preserveLinks) {
    prompt += 'Note: Please preserve all important links.\n'
  }
  if (options.preserveCode) {
    prompt += 'Note: Please preserve all code blocks with proper formatting.\n'
  }

  prompt += `\nHTML Content:\n\`\`\`html\n${content}\n\`\`\`\n\nPlease extract and clean the main article content, outputting clean Markdown.`

  return prompt
}

/**
 * Call the AI provider API
 */
async function callAIProvider(
  config: AIModelConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<AICleaningResponse> {
  const { provider, model, apiKey, baseUrl, maxTokens = 4096, temperature = 0.1 } = config

  switch (provider) {
    case 'openai':
    case 'openrouter':
      return callOpenAICompatible(
        baseUrl || (provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1'),
        apiKey,
        model,
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature,
        provider === 'openrouter'
      )

    case 'anthropic':
      return callAnthropic(
        baseUrl || 'https://api.anthropic.com/v1',
        apiKey,
        model,
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature
      )

    case 'gemini':
      return callGemini(
        apiKey,
        model,
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature
      )

    case 'custom':
      if (!baseUrl) {
        return { success: false, error: 'Custom provider requires a base URL' }
      }
      return callOpenAICompatible(
        baseUrl,
        apiKey,
        model,
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature,
        false
      )

    default:
      return { success: false, error: `Unsupported provider: ${provider}` }
  }
}

/**
 * Call OpenAI-compatible API (OpenAI, OpenRouter, custom)
 */
async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
  isOpenRouter: boolean
): Promise<AICleaningResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }

  if (isOpenRouter) {
    headers['HTTP-Referer'] = 'https://orca-web-clipper.local'
    headers['X-Title'] = 'Orca Web Clipper'
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return {
      success: false,
      error: `API error (${response.status}): ${errorText.substring(0, 200)}`,
    }
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content

  if (!content) {
    return { success: false, error: 'No content in AI response' }
  }

  return {
    success: true,
    content,
    tokensUsed: data.usage?.total_tokens,
  }
}

/**
 * Call Anthropic API
 */
async function callAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number
): Promise<AICleaningResponse> {
  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: maxTokens,
      temperature,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return {
      success: false,
      error: `API error (${response.status}): ${errorText.substring(0, 200)}`,
    }
  }

  const data = await response.json()
  const content = data.content?.[0]?.text

  if (!content) {
    return { success: false, error: 'No content in AI response' }
  }

  return {
    success: true,
    content,
    tokensUsed: data.usage?.input_tokens + data.usage?.output_tokens,
  }
}

/**
 * Call Google Gemini API
 */
async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number
): Promise<AICleaningResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return {
      success: false,
      error: `API error (${response.status}): ${errorText.substring(0, 200)}`,
    }
  }

  const data = await response.json()
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!content) {
    return { success: false, error: 'No content in AI response' }
  }

  return {
    success: true,
    content,
    tokensUsed: data.usageMetadata?.totalTokenCount,
  }
}

/**
 * Validate AI configuration
 */
export function validateAIConfig(config: AIModelConfig): { valid: boolean; error?: string } {
  if (!config.apiKey) {
    return { valid: false, error: 'API key is required' }
  }

  if (!config.model) {
    return { valid: false, error: 'Model name is required' }
  }

  if (config.provider === 'custom' && !config.baseUrl) {
    return { valid: false, error: 'Base URL is required for custom provider' }
  }

  return { valid: true }
}

/**
 * Generate a brief summary for research template
 */
export async function generateBriefSummary(
  html: string,
  url: string,
  title: string,
  modelConfig: AIModelConfig
): Promise<AICleaningResponse> {
  try {
    // Truncate HTML for brief summary (don't need full content)
    const maxLength = 50000
    let content = html
    if (content.length > maxLength) {
      content = content.substring(0, maxLength)
    }

    const userPrompt = `URL: ${url}
Title: ${title}

HTML Content:
\`\`\`html
${content}
\`\`\`

Please provide an ultra-concise summary (1-3 bullet points only).`

    const response = await callAIProvider(
      modelConfig,
      SYSTEM_PROMPTS.brief,
      userPrompt
    )

    return response
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Brief summary generation failed',
    }
  }
}

/**
 * Test AI connection with a simple request
 */
export async function testAIConnection(config: AIModelConfig): Promise<{ success: boolean; error?: string }> {
  const validation = validateAIConfig(config)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  try {
    const response = await callAIProvider(
      config,
      'You are a helpful assistant.',
      'Say "OK" to confirm the connection is working.'
    )

    if (response.success && response.content?.toLowerCase().includes('ok')) {
      return { success: true }
    }

    return { success: false, error: response.error || 'Unexpected response from AI' }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection test failed',
    }
  }
}

/**
 * Generate a brief abstract (100 characters max) for the article
 * Used for the {{abstract}} template variable
 */
export async function generateAbstract(
  content: string,
  title: string,
  modelConfig: AIModelConfig
): Promise<AICleaningResponse> {
  try {
    // Use markdown content instead of HTML for efficiency
    // Truncate if too long
    const maxLength = 10000
    let text = content
    if (text.length > maxLength) {
      text = text.substring(0, maxLength)
    }

    const userPrompt = `Title: ${title}

Content:
${text}

Please provide a brief one-sentence description (max 100 characters) of this article.`

    const response = await callAIProvider(
      modelConfig,
      SYSTEM_PROMPTS.abstract,
      userPrompt
    )

    // Ensure the abstract is within 100 characters
    if (response.success && response.content) {
      let abstract = response.content.trim()
      // Remove any quotes if the AI wrapped it
      abstract = abstract.replace(/^["']|["']$/g, '').trim()
      // Truncate if still too long
      if (abstract.length > 100) {
        abstract = abstract.substring(0, 97) + '...'
      }
      return {
        success: true,
        content: abstract,
        tokensUsed: response.tokensUsed,
      }
    }

    return response
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Abstract generation failed',
    }
  }
}
