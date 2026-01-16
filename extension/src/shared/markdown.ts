/**
 * Orca Web Clipper - HTML to Markdown Converter
 * Optimized for clean, readable output that preserves article structure
 */

// Conversion context for tracking state during recursive conversion
interface ConversionContext {
  baseUrl: string
  listDepth: number
  inBlockquote: boolean
  preserveWhitespace: boolean
}

/**
 * Convert HTML string to Markdown
 */
export function htmlToMarkdown(html: string, baseUrl?: string): string {
  const container = document.createElement('div')
  container.innerHTML = html
  
  const context: ConversionContext = {
    baseUrl: baseUrl || window.location.href,
    listDepth: 0,
    inBlockquote: false,
    preserveWhitespace: false,
  }
  
  const raw = convertNode(container, context)
  return normalizeOutput(raw)
}

/**
 * Recursively convert a DOM node to Markdown
 */
function convertNode(node: Node, ctx: ConversionContext): string {
  // Text node
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || ''
    if (ctx.preserveWhitespace) {
      return text
    }
    // Collapse whitespace but preserve single spaces
    return text.replace(/[\t\n\r]+/g, ' ')
  }
  
  // Non-element nodes
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }
  
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  
  // Skip invisible and unwanted elements
  if (shouldSkipElement(el, tag)) {
    return ''
  }
  
  // Convert children
  const children = convertChildren(el, ctx)
  
  // Handle each tag type
  switch (tag) {
    // === Block Elements ===
    
    // Headings
    case 'h1': return `\n\n# ${children.trim()}\n\n`
    case 'h2': return `\n\n## ${children.trim()}\n\n`
    case 'h3': return `\n\n### ${children.trim()}\n\n`
    case 'h4': return `\n\n#### ${children.trim()}\n\n`
    case 'h5': return `\n\n##### ${children.trim()}\n\n`
    case 'h6': return `\n\n###### ${children.trim()}\n\n`
    
    // Paragraphs
    case 'p': {
      const trimmed = children.trim()
      if (!trimmed) return ''
      return `\n\n${trimmed}\n\n`
    }
    
    // Line breaks
    case 'br': return '\n'
    case 'hr': return '\n\n---\n\n'
    
    // Divs and sections - just pass through with minimal spacing
    case 'div':
    case 'section':
    case 'article':
    case 'main':
    case 'header':
    case 'footer':
    case 'aside': {
      const trimmed = children.trim()
      if (!trimmed) return ''
      return `\n${trimmed}\n`
    }
    
    // === Inline Elements ===
    
    case 'strong':
    case 'b': {
      const trimmed = children.trim()
      if (!trimmed) return ''
      return `**${trimmed}**`
    }
    
    case 'em':
    case 'i': {
      const trimmed = children.trim()
      if (!trimmed) return ''
      return `*${trimmed}*`
    }
    
    case 'u': {
      const trimmed = children.trim()
      if (!trimmed) return ''
      return `<u>${trimmed}</u>`
    }
    
    case 's':
    case 'del':
    case 'strike': {
      const trimmed = children.trim()
      if (!trimmed) return ''
      return `~~${trimmed}~~`
    }
    
    case 'code': {
      // Don't double-wrap if inside pre
      if (el.parentElement?.tagName.toLowerCase() === 'pre') {
        return el.textContent || ''
      }
      const text = el.textContent || ''
      if (!text) return ''
      // Use double backticks if content contains backtick
      if (text.includes('`')) {
        return `\`\` ${text} \`\``
      }
      return `\`${text}\``
    }
    
    case 'mark': {
      const trimmed = children.trim()
      if (!trimmed) return ''
      return `==${trimmed}==`
    }
    
    case 'sup': return `<sup>${children}</sup>`
    case 'sub': return `<sub>${children}</sub>`
    
    case 'span': return children
    
    // === Links and Images ===
    
    case 'a': {
      const href = el.getAttribute('href') || ''
      const absoluteHref = resolveUrl(href, ctx.baseUrl)
      if (!isSafeUrl(absoluteHref)) return children
      
      const text = children.trim() || absoluteHref
      const title = el.getAttribute('title')
      
      if (title) {
        return `[${text}](${absoluteHref} "${escapeQuotes(title)}")`
      }
      return `[${text}](${absoluteHref})`
    }
    
    case 'img': {
      // Handle lazy-loaded images - check multiple src attributes
      let src = el.getAttribute('src') || ''
      
      // Common lazy-load attribute patterns
      const lazySrcAttrs = [
        'data-src',
        'data-original',
        'data-lazy-src',
        'data-actualsrc',
        'data-original-src',
        'data-echo',
        'data-lazyload',
        'data-source',
        'data-url',
        'data-img-src',
        'data-real-src',
        'srcset', // Use first srcset image if no src
      ]
      
      // If src is empty, a placeholder, or a data URI placeholder, try lazy-load attributes
      const isPlaceholder = !src || 
        src.includes('data:image/gif') || 
        src.includes('data:image/png;base64,iVBOR') ||
        src.includes('placeholder') ||
        src.includes('loading') ||
        src.includes('blank') ||
        src.length < 50 && src.startsWith('data:')
      
      if (isPlaceholder) {
        for (const attr of lazySrcAttrs) {
          const lazySrc = el.getAttribute(attr)
          if (lazySrc && !lazySrc.startsWith('data:')) {
            if (attr === 'srcset') {
              // Parse srcset and get the first/largest image
              const srcsetParts = lazySrc.split(',')[0]?.trim().split(' ')[0]
              if (srcsetParts) {
                src = srcsetParts
                break
              }
            } else {
              src = lazySrc
              break
            }
          }
        }
      }
      
      // Skip if still no valid src
      if (!src || src.startsWith('data:image/gif') || src.startsWith('data:image/svg+xml')) {
        return ''
      }
      
      // Resolve URL - ensure protocol-relative URLs get https: prefix
      let absoluteSrc = resolveUrl(src, ctx.baseUrl)
      
      // Double-check: ensure we have a proper protocol
      if (absoluteSrc.startsWith('//')) {
        absoluteSrc = 'https:' + absoluteSrc
      }
      
      if (!isSafeUrl(absoluteSrc)) return ''
      
      const alt = el.getAttribute('alt') || ''
      const title = el.getAttribute('title')
      
      if (title) {
        return `![${alt}](${absoluteSrc} "${escapeQuotes(title)}")`
      }
      return `![${alt}](${absoluteSrc})`
    }
    
    case 'figure': {
      // Handle figure with figcaption
      const img = el.querySelector('img')
      const caption = el.querySelector('figcaption')
      
      if (img) {
        // Get image src with lazy-load fallback
        let src = img.getAttribute('src') || ''
        const lazySrcAttrs = ['data-src', 'data-original', 'data-lazy-src', 'data-actualsrc']
        
        const isPlaceholder = !src || src.includes('data:image') || src.includes('placeholder')
        if (isPlaceholder) {
          for (const attr of lazySrcAttrs) {
            const lazySrc = img.getAttribute(attr)
            if (lazySrc && !lazySrc.startsWith('data:')) {
              src = lazySrc
              break
            }
          }
        }
        
        if (src && !src.startsWith('data:image/gif')) {
          let absoluteSrc = resolveUrl(src, ctx.baseUrl)
          // Ensure protocol-relative URLs get https: prefix
          if (absoluteSrc.startsWith('//')) {
            absoluteSrc = 'https:' + absoluteSrc
          }
          const alt = caption?.textContent?.trim() || img.getAttribute('alt') || ''
          if (isSafeUrl(absoluteSrc)) {
            return `\n\n![${alt}](${absoluteSrc})\n\n`
          }
        }
      }
      return `\n\n${children.trim()}\n\n`
    }
    
    // === Lists ===
    
    case 'ul':
    case 'ol': {
      const isOrdered = tag === 'ol'
      const start = parseInt(el.getAttribute('start') || '1', 10)
      return convertList(el, isOrdered, start, ctx)
    }
    
    case 'li': {
      // Li is handled by convertList, but in case it's called directly
      return children.trim()
    }
    
    // === Blockquote ===
    
    case 'blockquote': {
      const newCtx = { ...ctx, inBlockquote: true }
      const content = convertChildren(el, newCtx).trim()
      if (!content) return ''
      
      // Add > prefix to each line
      const lines = content.split('\n')
      const quoted = lines.map(line => `> ${line}`).join('\n')
      return `\n\n${quoted}\n\n`
    }
    
    // === Code Blocks ===
    
    case 'pre': {
      const codeEl = el.querySelector('code')
      const lang = extractLanguage(codeEl || el)
      const code = (codeEl || el).textContent || ''
      
      if (!code.trim()) return ''
      return `\n\n\`\`\`${lang}\n${code.trimEnd()}\n\`\`\`\n\n`
    }
    
    // === Tables ===
    
    case 'table': return convertTable(el, ctx)
    case 'thead':
    case 'tbody':
    case 'tfoot':
    case 'tr':
    case 'th':
    case 'td': return children // Handled by convertTable
    
    // === Definition Lists ===
    
    case 'dl': return convertDefinitionList(el, ctx)
    case 'dt':
    case 'dd': return children // Handled by convertDefinitionList
    
    // === Skip these entirely ===
    
    case 'script':
    case 'style':
    case 'noscript':
    case 'template':
    case 'svg':
    case 'canvas':
    case 'video':
    case 'audio':
    case 'iframe':
    case 'object':
    case 'embed':
      return ''
    
    // === Default: pass through children ===
    
    default:
      return children
  }
}

/**
 * Convert all child nodes
 */
function convertChildren(el: HTMLElement, ctx: ConversionContext): string {
  return Array.from(el.childNodes)
    .map(child => convertNode(child, ctx))
    .join('')
}

/**
 * Convert list (ul/ol) with proper indentation
 */
function convertList(
  el: HTMLElement,
  ordered: boolean,
  start: number,
  ctx: ConversionContext
): string {
  const items = Array.from(el.children)
  const indent = '  '.repeat(ctx.listDepth)
  const newCtx = { ...ctx, listDepth: ctx.listDepth + 1 }
  
  let result = '\n'
  let index = start
  
  for (const item of items) {
    if (item.tagName.toLowerCase() !== 'li') continue
    
    const prefix = ordered ? `${index}. ` : '- '
    const content = convertNode(item, newCtx).trim()
    
    // Handle multi-line list items (indent continuation lines)
    const lines = content.split('\n')
    const firstLine = lines[0]
    const restLines = lines.slice(1)
      .map(line => line ? `${indent}  ${line}` : '')
      .join('\n')
    
    result += `${indent}${prefix}${firstLine}`
    if (restLines) {
      result += `\n${restLines}`
    }
    result += '\n'
    
    index++
  }
  
  return result + '\n'
}

/**
 * Convert table with proper header/body handling
 * Supports tables with or without thead, handles colspan
 */
function convertTable(table: HTMLElement, ctx: ConversionContext): string {
  const rows: string[][] = []
  let headerRowCount = 0
  
  // Process thead
  const thead = table.querySelector('thead')
  if (thead) {
    const headerRows = thead.querySelectorAll('tr')
    headerRows.forEach(tr => {
      const cells = extractTableCells(tr, ctx)
      if (cells.length > 0) {
        rows.push(cells)
        headerRowCount++
      }
    })
  }
  
  // Process tbody (or direct tr children if no tbody)
  const tbody = table.querySelector('tbody')
  const bodyContainer = tbody || table
  const bodyRows = tbody 
    ? tbody.querySelectorAll('tr')
    : table.querySelectorAll(':scope > tr')
  
  bodyRows.forEach((tr, index) => {
    const cells = extractTableCells(tr as HTMLElement, ctx)
    if (cells.length > 0) {
      // If no thead, check if first row has th elements (treat as header)
      if (headerRowCount === 0 && index === 0) {
        const hasThCells = tr.querySelectorAll('th').length > 0
        if (hasThCells) {
          headerRowCount = 1
        }
      }
      rows.push(cells)
    }
  })
  
  if (rows.length === 0) return ''
  
  // Determine column count
  const colCount = Math.max(...rows.map(r => r.length))
  
  // Normalize row lengths
  const normalizedRows = rows.map(row => {
    while (row.length < colCount) row.push('')
    return row
  })
  
  // Build markdown table
  let result = '\n\n'
  
  // If no header, create an empty header row (markdown tables require headers)
  if (headerRowCount === 0 && normalizedRows.length > 0) {
    // Use first row as header
    result += `| ${normalizedRows[0].join(' | ')} |\n`
    result += `| ${normalizedRows[0].map(() => '---').join(' | ')} |\n`
    
    // Body rows (skip first since it's now header)
    for (let i = 1; i < normalizedRows.length; i++) {
      result += `| ${normalizedRows[i].join(' | ')} |\n`
    }
  } else {
    // Normal case: has header
    result += `| ${normalizedRows[0].join(' | ')} |\n`
    result += `| ${normalizedRows[0].map(() => '---').join(' | ')} |\n`
    
    // Body rows
    for (let i = 1; i < normalizedRows.length; i++) {
      result += `| ${normalizedRows[i].join(' | ')} |\n`
    }
  }
  
  return result + '\n'
}

/**
 * Extract cells from a table row, handling colspan
 */
function extractTableCells(tr: HTMLElement, ctx: ConversionContext): string[] {
  const cells: string[] = []
  const cellElements = tr.querySelectorAll('th, td')
  
  cellElements.forEach(cell => {
    const content = convertNode(cell, ctx).trim()
      .replace(/\|/g, '\\|')  // Escape pipe characters
      .replace(/\n/g, ' ')     // Replace newlines with spaces
    
    // Handle colspan
    const colspan = parseInt(cell.getAttribute('colspan') || '1', 10)
    cells.push(content)
    
    // Add empty cells for colspan > 1
    for (let i = 1; i < colspan; i++) {
      cells.push('')
    }
  })
  
  return cells
}

/**
 * Convert definition list (dl/dt/dd)
 */
function convertDefinitionList(dl: HTMLElement, ctx: ConversionContext): string {
  let result = '\n\n'
  let currentTerm = ''
  
  for (const child of Array.from(dl.children)) {
    const tag = child.tagName.toLowerCase()
    const content = convertNode(child, ctx).trim()
    
    if (tag === 'dt') {
      currentTerm = content
    } else if (tag === 'dd') {
      result += `**${currentTerm}**\n: ${content}\n\n`
    }
  }
  
  return result
}

/**
 * Extract language from code element class
 */
function extractLanguage(el: Element): string {
  const className = el.className || ''
  
  // Common patterns: language-xxx, lang-xxx, xxx
  const match = className.match(/(?:language-|lang-)(\w+)/i)
  if (match) return match[1]
  
  // Check data attribute
  const dataLang = el.getAttribute('data-language') || el.getAttribute('data-lang')
  if (dataLang) return dataLang
  
  return ''
}

/**
 * Normalize final output - clean up whitespace
 */
function normalizeOutput(text: string): string {
  return text
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    // Remove leading/trailing whitespace from lines
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    // Collapse 3+ newlines to 2
    .replace(/\n{3,}/g, '\n\n')
    // Remove leading/trailing whitespace
    .trim()
}

/**
 * Check if element should be skipped
 */
function shouldSkipElement(el: HTMLElement, _tag: string): boolean {
  // Hidden elements
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') {
    return true
  }
  
  // Check computed style if available
  try {
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') {
      return true
    }
  } catch {
    // Ignore errors (element may not be in DOM)
  }
  
  return false
}

/**
 * Resolve relative URL to absolute
 */
function resolveUrl(url: string, baseUrl: string): string {
  if (!url) return ''
  
  // Already absolute
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
    return url.startsWith('//') ? `https:${url}` : url
  }
  
  // Data URL or other special protocols
  if (url.includes(':')) {
    return url
  }
  
  try {
    return new URL(url, baseUrl).href
  } catch {
    return url
  }
}

/**
 * Check if URL is safe (not javascript:, vbscript:, etc.)
 */
function isSafeUrl(url: string): boolean {
  if (!url) return false
  
  const lower = url.trim().toLowerCase()
  const dangerous = ['javascript:', 'vbscript:', 'data:text/html', 'data:application/']
  
  return !dangerous.some(proto => lower.startsWith(proto))
}

/**
 * Escape quotes in title attributes
 */
function escapeQuotes(text: string): string {
  return text.replace(/"/g, '\\"')
}

/**
 * Create metadata block as tag format
 */
export function createMetadataBlock(metadata: {
  url: string
  title: string
  siteName?: string
  author?: string
  publishedAt?: string
  capturedAt: string
}): string {
  const lines: string[] = []
  
  lines.push('#WebClip')
  lines.push('')
  lines.push(`- **Source**: [${metadata.title}](${metadata.url})`)
  
  if (metadata.siteName) {
    lines.push(`- **Site**: ${metadata.siteName}`)
  }
  
  if (metadata.author) {
    lines.push(`- **Author**: ${metadata.author}`)
  }
  
  if (metadata.publishedAt) {
    lines.push(`- **Published**: ${formatDate(metadata.publishedAt)}`)
  }
  
  lines.push(`- **Clipped**: ${formatDate(metadata.capturedAt)}`)
  lines.push('')
  lines.push('---')
  lines.push('')
  
  return lines.join('\n')
}

/**
 * Format date string for display
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

// ==================== Image Processing ====================

// Regex to match Markdown image syntax: ![alt](url)
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g

/**
 * Process images in markdown content
 * Downloads external images and converts them to base64 data URLs
 * This allows Orca plugin to upload them to its asset system
 */
export async function processMarkdownImages(content: string): Promise<string> {
  // Find all markdown image references
  const imageMatches: Array<{ full: string; alt: string; url: string }> = []
  let match: RegExpExecArray | null
  
  // Reset regex state
  MARKDOWN_IMAGE_REGEX.lastIndex = 0
  
  while ((match = MARKDOWN_IMAGE_REGEX.exec(content)) !== null) {
    imageMatches.push({
      full: match[0],
      alt: match[1],
      url: match[2]
    })
  }
  
  if (imageMatches.length === 0) {
    return content
  }
  
  console.log(`[Orca Web Clipper] Processing ${imageMatches.length} images`)
  
  // Process each image in parallel
  const replacements = new Map<string, string>()
  
  await Promise.all(imageMatches.map(async (img) => {
    // Skip data URLs (already embedded) and already-local paths
    if (img.url.startsWith('data:') || img.url.startsWith('assets/')) {
      return
    }
    
    try {
      const dataUrl = await downloadImageAsDataUrl(img.url)
      if (dataUrl) {
        // Create new markdown with data URL
        const newMarkdown = `![${img.alt}](${dataUrl})`
        replacements.set(img.full, newMarkdown)
        console.log(`[Orca Web Clipper] Image converted: ${img.url.substring(0, 50)}...`)
      }
    } catch (error) {
      console.warn(`[Orca Web Clipper] Failed to process image: ${img.url}`, error)
      // Keep original URL on failure
    }
  }))
  
  // Apply all replacements
  let processedContent = content
  for (const [original, replacement] of replacements) {
    processedContent = processedContent.replace(original, replacement)
  }
  
  return processedContent
}

/**
 * Download an image from URL and convert to base64 data URL
 */
async function downloadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    // Handle protocol-relative URLs
    const fullUrl = url.startsWith('//') ? `https:${url}` : url
    
    const response = await fetch(fullUrl, {
      mode: 'cors',
      credentials: 'omit',
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const blob = await response.blob()
    
    // Validate it's actually an image
    if (!blob.type.startsWith('image/')) {
      // Try to infer from URL extension
      const mimeType = inferMimeType(url)
      if (!mimeType) {
        throw new Error(`Not an image: ${blob.type}`)
      }
    }
    
    // Convert to base64 data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        resolve(result)
      }
      reader.onerror = () => reject(new Error('Failed to read blob'))
      reader.readAsDataURL(blob)
    })
  } catch (error) {
    console.error(`[Orca Web Clipper] Failed to download image: ${url}`, error)
    return null
  }
}

/**
 * Infer MIME type from URL extension
 */
function inferMimeType(url: string): string | null {
  const extensionMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif'
  }
  
  try {
    const urlPath = new URL(url).pathname.toLowerCase()
    for (const [ext, mime] of Object.entries(extensionMap)) {
      if (urlPath.endsWith(ext)) {
        return mime
      }
    }
  } catch {
    // Invalid URL, try simple extension match
    const lowerUrl = url.toLowerCase()
    for (const [ext, mime] of Object.entries(extensionMap)) {
      if (lowerUrl.includes(ext)) {
        return mime
      }
    }
  }
  
  return null
}
