/**
 * Orca Web Clipper - Content Script
 * Runs in the context of web pages to extract content
 */

import type { ExtractedContent, ClipMetadata, ExtensionMessage, ExtensionResponse } from '../shared/types'
import { htmlToMarkdown } from '../shared/markdown'

/**
 * Format date to local readable format: YYYY-MM-DD HH:mm
 */
function formatDateTime(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * Extract metadata from the current page
 * Enhanced extraction for author and published time
 */
function extractMetadata(): Partial<ClipMetadata> {
  const metadata: Partial<ClipMetadata> = {
    url: window.location.href,
    title: document.title,
    capturedAt: formatDateTime(new Date()),
  }
  
  // Try to get site name
  const ogSiteName = document.querySelector('meta[property="og:site_name"]')
  if (ogSiteName) {
    metadata.siteName = ogSiteName.getAttribute('content') || undefined
  }
  
  // === Enhanced Author Extraction ===
  // Priority order: meta tags -> schema.org -> visible elements
  const authorSelectors = [
    // Meta tags (most reliable)
    'meta[name="author"]',
    'meta[property="article:author"]',
    'meta[property="og:article:author"]',
    'meta[name="twitter:creator"]',
    // Schema.org
    '[itemprop="author"] [itemprop="name"]',
    '[itemprop="author"]',
    // Common class patterns
    '.author-name',
    '.author__name',
    '.byline__name',
    '.article-author',
    '.post-author',
    // WeChat specific
    '#js_name',
    '.rich_media_meta_nickname',
    // Zhihu
    '.AuthorInfo-name',
    '.UserLink-link',
    // Generic patterns
    '[rel="author"]',
    '.byline a',
    '.author a',
  ]
  
  for (const selector of authorSelectors) {
    try {
      const el = document.querySelector(selector)
      if (el) {
        const content = el.getAttribute('content') || el.textContent?.trim()
        if (content && content.length < 100) { // Sanity check
          metadata.author = content
          break
        }
      }
    } catch { /* skip invalid selector */ }
  }
  
  // === Enhanced Published Date Extraction ===
  // Priority order: meta tags -> schema.org -> time elements -> visible text
  const dateSelectors = [
    // Meta tags
    { selector: 'meta[property="article:published_time"]', attr: 'content' },
    { selector: 'meta[name="date"]', attr: 'content' },
    { selector: 'meta[name="pubdate"]', attr: 'content' },
    { selector: 'meta[property="og:updated_time"]', attr: 'content' },
    { selector: 'meta[name="DC.date.issued"]', attr: 'content' },
    // Schema.org
    { selector: '[itemprop="datePublished"]', attr: 'content' },
    { selector: '[itemprop="datePublished"]', attr: 'datetime' },
    { selector: '[itemprop="dateCreated"]', attr: 'content' },
    // HTML5 time element
    { selector: 'time[datetime]', attr: 'datetime' },
    { selector: 'time[pubdate]', attr: 'datetime' },
    { selector: 'article time', attr: 'datetime' },
    // WeChat specific
    { selector: '#publish_time', attr: 'textContent' },
    // Common patterns
    { selector: '.publish-time', attr: 'textContent' },
    { selector: '.post-date', attr: 'textContent' },
    { selector: '.article-date', attr: 'textContent' },
    { selector: '.entry-date', attr: 'textContent' },
    { selector: '.date', attr: 'textContent' },
  ]
  
  for (const { selector, attr } of dateSelectors) {
    try {
      const el = document.querySelector(selector)
      if (el) {
        let dateStr: string | null = null
        if (attr === 'textContent') {
          dateStr = el.textContent?.trim() || null
        } else {
          dateStr = el.getAttribute(attr)
        }
        if (dateStr) {
          // Try to parse and format the date
          const formatted = formatPublishedDate(dateStr)
          if (formatted) {
            metadata.publishedAt = formatted
            break
          }
        }
      }
    } catch { /* skip invalid selector */ }
  }
  
  // Get favicon
  const faviconLink = document.querySelector('link[rel="icon"]') ||
                      document.querySelector('link[rel="shortcut icon"]')
  if (faviconLink) {
    const href = faviconLink.getAttribute('href')
    if (href) {
      metadata.favicon = new URL(href, window.location.origin).href
    }
  }
  
  return metadata
}

/**
 * Format published date to readable format
 * Handles ISO 8601, various date strings, Chinese date formats
 */
function formatPublishedDate(dateStr: string): string | null {
  if (!dateStr) return null
  
  // Try parsing as ISO 8601 or standard date
  const date = new Date(dateStr)
  if (!isNaN(date.getTime())) {
    return formatDateTime(date)
  }
  
  // Try Chinese date patterns: 2024年1月15日, 2024-01-15
  const chinesePattern = /(\d{4})[年\-\/](\d{1,2})[月\-\/](\d{1,2})[日]?/
  const match = dateStr.match(chinesePattern)
  if (match) {
    const [, year, month, day] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  
  // If all else fails, return cleaned original string (if reasonable length)
  const cleaned = dateStr.trim()
  if (cleaned.length < 50) {
    return cleaned
  }
  
  return null
}

/**
 * Extract selected content from the page
 */
function extractSelection(): ExtractedContent | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) {
    return null
  }
  
  const range = selection.getRangeAt(0)
  const container = document.createElement('div')
  container.appendChild(range.cloneContents())
  
  // Convert to Markdown with base URL for resolving relative links
  const baseUrl = window.location.href
  const markdown = htmlToMarkdown(container.innerHTML, baseUrl)
  
  return {
    html: container.innerHTML,
    text: markdown,
    metadata: extractMetadata(),
  }
}

// ==================== Article Content Selectors ====================

/**
 * Prioritized selectors for finding article content
 * Based on Readability.js heuristics - more specific selectors first
 */
const ARTICLE_SELECTORS = [
  // Schema.org structured data (highest priority)
  '[itemprop="articleBody"]',
  '[itemprop="blogPost"]',
  '[itemtype*="Article"] [itemprop="text"]',
  
  // Data attributes (modern sites)
  '[data-testid="article-body"]',
  '[data-article-body]',
  '[data-content-body]',
  '[data-post-content]',
  
  // Chinese platforms (high priority for Chinese users)
  '#js_content',                    // WeChat
  '.rich_media_content',            // WeChat
  '.Post-RichText',                 // Zhihu
  '.RichContent-inner',             // Zhihu
  '.PostIndex-content',             // Zhihu column
  '#artibody',                      // Sina
  '#article-body',                  // Sina
  '.article-content-left',          // Sina
  '.art_content',                   // Various Chinese news
  '.art_box',
  '.TRS_Editor',                    // TRS CMS (used by many Chinese gov sites)
  '.wp_articlecontent',             // WP CMS Chinese
  '.con_txt',                       // Common Chinese pattern
  '.content_txt',
  '.news_txt',
  '#content_txt',
  '.article-holder',                // 36kr
  '.article-detail-bd',
  '.post-content-main',
  
  // International sites - specific patterns
  '.article-body',
  '.article__body',
  '.article-content',
  '.article_content',
  '.article-text',
  '.article-detail',
  '.story-body',
  '.story-body__inner',
  '.story-content',
  '.entry-content',
  '.post-body',
  '.post-content',
  '.post_content',
  '.content-body',
  '.blog-content',
  '.blog_content',
  '.markdown-body',                 // GitHub
  '.blob-wrapper',                  // GitHub code view
  
  // News sites
  '.main-content',
  '.news-content',
  '.content-article',
  '.text-content',
  '.news_content',
  '.news-article',
  '.news_article',
  
  // CMS patterns
  '.td-post-content',               // Flavor theme
  '.jeg_inner_content',             // JNews theme
  '.single-content',
  '.single-post-content',
  '.elementor-widget-theme-post-content', // Elementor
  
  // Medium / Substack
  '.postArticle-content',
  '.article-content',
  '.post-content',
  
  // Generic semantic elements (lowest priority)
  'article',
  '[role="article"]',
  '[role="main"]',
  'main',
]

/**
 * Selectors for elements that should be completely removed
 * Comprehensive list based on Readability.js patterns
 */
const UNWANTED_SELECTORS = [
  // === Scripts, styles, and invisible elements ===
  'script',
  'style',
  'noscript',
  'template',
  'link[rel="stylesheet"]',
  'meta',
  
  // === Media embeds (often ads or distractions) ===
  'iframe:not([src*="youtube"]):not([src*="vimeo"]):not([src*="bilibili"])',
  'object',
  'embed',
  'applet',
  
  // === Semantic navigation elements ===
  'nav',
  'header',
  'footer',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[role="search"]',
  '[role="menu"]',
  '[role="menubar"]',
  '[role="toolbar"]',
  
  // === Sidebars and widgets ===
  'aside',
  '.sidebar', '.side-bar', '.side_bar', '#sidebar',
  '.widget', '.widget-area', '.widgets',
  '.left-rail', '.right-rail',
  '.aside-content', '.aside-module',
  
  // === Comments sections ===
  '.comments', '.comment', '.comment-section', '.comment-list', '.comment-area',
  '#comments', '#comment-section', '#disqus_thread', '#respond',
  '.discuss', '.discussion', '.discussions',
  '.comment-form', '.comment-respond', '.comment-reply',
  '[class*="comment"]',
  
  // === Social sharing ===
  '.social-share', '.share-buttons', '.share-bar', '.share-box',
  '.social-buttons', '.sharing', '.social-links', '.social-icons',
  '.share-this', '.sharethis', '.addthis',
  '.share-container', '.sharing-buttons',
  '[class*="share-"]', '[class*="social-"]',
  '[data-share]', '[data-social]',
  
  // === Advertisements ===
  '.advertisement', '.ad', '.ads', '.ad-container', '.ad-wrapper', '.ad-slot',
  '.advert', '.advertising', '.adsbygoogle', '.ad-unit', '.ad-banner',
  '.sponsored', '.sponsor', '.promoted', '.promo',
  '[class*="ad-"]', '[class*="advert"]', '[class*="sponsor"]',
  '[id*="ad-"]', '[id*="advert"]', '[id*="sponsor"]',
  '[data-ad]', '[data-advertisement]', '[data-sponsored]',
  'ins.adsbygoogle', // Google Adsense
  
  // === Related content / Recommendations ===
  '.related-posts', '.related-articles', '.related-content', '.related-links',
  '.related', '.recommended', '.recommendations', '.suggested',
  '.more-stories', '.read-more', '.also-read', '.you-may-like',
  '.more-from', '.more-in', '.read-next', '.up-next',
  '.outbrain', '.taboola', '.mgid', // Content recommendation networks
  '[class*="related"]', '[class*="recommend"]',
  
  // === Navigation elements ===
  '.breadcrumb', '.breadcrumbs', '.bread-crumb',
  '.pagination', '.pager', '.page-nav', '.page-numbers',
  '.prev-next', '.nav-links', '.post-navigation',
  '.toc', '.table-of-contents', // Sometimes useful but often noise
  
  // === Author/meta boxes ===
  '.author-box', '.author-info', '.author-bio', '.author-card',
  '.byline', '.meta-info', '.post-meta', '.entry-meta',
  '.article-meta', '.article-info',
  
  // === Subscriptions / Newsletters / CTAs ===
  '.newsletter', '.subscribe', '.subscription', '.signup',
  '.cta', '.call-to-action', '.email-signup',
  '.follow-us', '.follow-box',
  '.membership', '.paywall', '.premium-content',
  '[class*="newsletter"]', '[class*="subscribe"]',
  
  // === Popups, modals, and overlays ===
  '.popup', '.modal', '.overlay', '.lightbox',
  '.dialog', '.drawer', '.flyout',
  '[class*="popup"]', '[class*="modal"]',
  
  // === Hidden elements ===
  '[aria-hidden="true"]',
  '[hidden]',
  '.hidden', '.hide', '.invisible', '.sr-only', '.visually-hidden',
  '.d-none', '.display-none', // Bootstrap patterns
  '[style*="display: none"]', '[style*="display:none"]',
  '[style*="visibility: hidden"]',
  
  // === Interactive elements (not content) ===
  '.accordion', '.tabs-container', '.tab-navigation',
  '.dropdown', '.dropdown-menu',
  '.tooltip', '.popover',
  
  // === Form elements ===
  'form:not([class*="search"])',
  '.login-form', '.register-form', '.contact-form',
  '.form-wrapper', '.form-container',
  
  // === E-commerce elements ===
  '.cart', '.shopping-cart', '.add-to-cart',
  '.price-box', '.buy-now', '.purchase',
  '.product-meta', '.product-details',
  
  // === Chinese site specific ===
  '.hot-news', '.hot-list', '.hot-words', '.hot-search',
  '.rank-list', '.ranking', '.top-list',
  '.news-list', '.article-list', '.post-list',
  '.recommend-list', '.recommend-box', '.recommend-module',
  '.feed-list', '.feed-item',
  '.timeline', '.weibo-list', '.weibo-feed',
  '.media-list', '.card-list', '.photo-list', '.video-list',
  '.keywords', '.tags-list', '.tag-list', '.key-word', '.tags',
  '.statement', '.copyright', '.disclaimer', '.notice', // 声明/版权信息
  '.qrcode', '.qr-code', '.scan-code', // 二维码
  '.app-download', '.download-app',
  '.follow-wechat', '.wechat-qr',
  '.live-chat', '.customer-service',
  '.back-to-top', '.gotop',
  
  // === Specific site patterns ===
  '.article-footer', '.entry-footer', '.post-footer', // Footer within article
  '.article-tags', '.entry-tags', '.post-tags',
  '.article-source', '.source-info',
  '.print-only', '.no-print',
]

/**
 * Text patterns that indicate non-article content
 * Comprehensive patterns for Chinese and English content
 */
const NOISE_PATTERNS = [
  // === Chinese interaction patterns ===
  /^(阅读|评论|点赞|分享|收藏|转发|举报|喜欢|赞同|反对)[\s:：]?\d*/,
  /^(热门|推荐|相关|更多|精选|最新|热点)[\s:：]/,
  /^(加载中|loading|正在加载)/i,
  /^(登录|注册|退出|登出|注销)/,
  /^(上一篇|下一篇|返回|回到顶部|回到首页)/,
  /^(版权|声明|免责|法律|隐私|条款)/,
  /^(关注|订阅|扫码|扫一扫|长按识别)/,
  /^(广告|推广|赞助|商业合作)/i,
  /^(编辑|责编|责任编辑|来源|出处|原文链接)[\s:：]/,
  /^(作者|记者|撰文|文\/|图\/)/,
  /^(本文|此文|该文)(转载|来自|出自)/,
  /^(点击|查看|了解)(更多|详情|全文)/,
  /^(分类|标签|Tags?)[\s:：]/i,
  /^\d+\s*(阅读|浏览|评论|回复|点赞|收藏)/,
  /^(发布|更新|修改)(时间|日期|于)[\s:：]/,
  
  // === English interaction patterns ===
  /^(read|views?|comments?|likes?|shares?|reactions?)[\s:]*\d*/i,
  /^(loading|please wait|fetching)/i,
  /^(sign in|log ?in|sign up|register|create account)/i,
  /^(previous|next|back to|return to)/i,
  /^(copyright|©|all rights reserved)/i,
  /^(follow us|subscribe|newsletter)/i,
  /^(advertisement|sponsored|promoted)/i,
  /^(written by|by\s+\w+|author[\s:]*)/i,
  /^(source|via|originally published)/i,
  /^(click here|learn more|read more|see more)/i,
  /^(category|categories|tags?)[\s:]/i,
  /^(posted|published|updated)[\s:]*(on|at)?/i,
  /^(share|tweet|pin|email) this/i,
  
  // === Social media patterns ===
  /^(tweet|retweet|like|follow|share on)/i,
  /^(facebook|twitter|instagram|linkedin|pinterest|whatsapp)/i,
  /^@\w+\s*(说|said|tweeted|wrote)/i,
  
  // === Navigation patterns ===
  /^(home|about|contact|menu|navigation)/i,
  /^(首页|关于|联系|菜单|导航)/,
  
  // === E-commerce patterns ===
  /^(add to cart|buy now|purchase|order now)/i,
  /^(加入购物车|立即购买|立即下单|马上抢购)/,
  /^(¥|￥|\$|€|£)\s*\d+/,
  /^\d+(\.\d{2})?\s*(元|块|美元|dollars?)/i,
  
  // === Cookie/Privacy notices ===
  /^(we use cookies|cookie policy|accept cookies)/i,
  /^(privacy policy|terms of service|user agreement)/i,
  
  // === Time-based patterns (often metadata, not content) ===
  /^\d{1,2}[\s\/\-]\d{1,2}[\s\/\-]\d{2,4}$/,  // Date only
  /^\d{1,2}:\d{2}(:\d{2})?(\s*(am|pm))?$/i,   // Time only
]

/**
 * Readability.js official regex patterns
 * Source: https://github.com/mozilla/readability
 */
const READABILITY_REGEXPS = {
  // Elements unlikely to be article content
  unlikelyCandidates: /-ad-|ai2html|banner|breadcrumbs|combx|comment|community|cover-wrap|disqus|extra|footer|gdpr|header|legends|menu|related|remark|replies|rss|shoutbox|sidebar|skyscraper|social|sponsor|supplemental|ad-break|agegate|pagination|pager|popup|yom-remote/i,
  
  // But maybe it's a candidate after all
  okMaybeItsACandidate: /and|article|body|column|content|main|mathjax|shadow/i,
  
  // Positive class/id patterns (boost score)
  positive: /article|body|content|entry|hentry|h-entry|main|page|pagination|post|text|blog|story|reading/i,
  
  // Negative class/id patterns (reduce score)
  negative: /-ad-|hidden|^hid$| hid$| hid |^hid |banner|combx|comment|com-|contact|footer|gdpr|masthead|media|meta|outbrain|promo|related|scroll|share|shoutbox|sidebar|skyscraper|sponsor|shopping|tags|tool|widget/i,
  
  // Extraneous elements
  extraneous: /print|archive|comment|discuss|e[\-]?mail|share|reply|all|login|sign|single|utility/i,
  
  // Byline patterns
  byline: /byline|author|dateline|writtenby|p-author/i,
  
  // Video embed patterns (to preserve)
  videos: /\/\/(www\.)?((dailymotion|youtube|youtube-nocookie|player\.vimeo|v\.qq|bilibili|live\.bilibili)\.com|(archive|upload\.wikimedia)\.org|player\.twitch\.tv)/i,
}

/**
 * Positive content indicators (boost score)
 * Based on Readability.js positive patterns
 */
const POSITIVE_INDICATORS = [
  'article', 'body', 'content', 'entry', 'hentry', 'h-entry',
  'main', 'page', 'pagination', 'post', 'text', 'blog', 'story',
  'reading', 'news', 'column',
]

/**
 * Negative content indicators (reduce score)
 * Based on Readability.js negative patterns
 */
const NEGATIVE_INDICATORS = [
  // From Readability.js negative pattern
  '-ad-', 'hidden', 'hid', 'banner', 'combx', 'comment', 'com-',
  'contact', 'footer', 'gdpr', 'masthead', 'media', 'meta',
  'outbrain', 'promo', 'related', 'scroll', 'share', 'shoutbox',
  'sidebar', 'skyscraper', 'sponsor', 'shopping', 'tags', 'tool', 'widget',
  // Additional patterns
  'nav', 'menu', 'header', 'advert', 'recommend', 'popular',
  'trending', 'hot', 'social', 'subscribe', 'newsletter', 'signup',
  'modal', 'popup', 'overlay', 'toast', 'notification',
  'author', 'byline', 'category', 'breadcrumb',
]

/**
 * Extract article content using improved heuristics
 */
function extractArticle(): ExtractedContent {
  const metadata = extractMetadata()
  
  // Try to find main content area using prioritized selectors
  let contentElement = findContentElement()
  
  // Fallback to heuristic-based detection
  if (!contentElement) {
    contentElement = findLargestTextBlock()
  }
  
  // Fallback to body
  if (!contentElement) {
    contentElement = document.body
  }
  
  // Clone and clean the content
  const clone = contentElement.cloneNode(true) as HTMLElement
  cleanElement(clone)
  removeNoiseElements(clone)
  
  // Remove duplicate title from content (if first heading matches page title)
  removeDuplicateTitle(clone, metadata.title || document.title)
  
  // Convert to Markdown with base URL for resolving relative links
  const baseUrl = window.location.href
  const markdown = htmlToMarkdown(clone.innerHTML, baseUrl)
  
  return {
    html: clone.innerHTML,
    text: markdown,
    metadata,
  }
}

/**
 * Find content element using prioritized selectors
 * Enhanced with Readability.js unlikelyCandidates/okMaybeItsACandidate logic
 */
function findContentElement(): Element | null {
  for (const selector of ARTICLE_SELECTORS) {
    try {
      const elements = document.querySelectorAll(selector)
      
      for (const el of Array.from(elements)) {
        // Get class and id for pattern matching
        const className = el.className?.toString() || ''
        const id = (el as HTMLElement).id || ''
        const matchString = className + ' ' + id
        
        // Skip if element matches unlikelyCandidates pattern
        // UNLESS it also matches okMaybeItsACandidate
        if (READABILITY_REGEXPS.unlikelyCandidates.test(matchString)) {
          if (!READABILITY_REGEXPS.okMaybeItsACandidate.test(matchString)) {
            continue
          }
        }
        
        // Skip if element is inside unwanted containers
        if (isInsideUnwantedContainer(el)) continue
        
        // Check if element has substantial text content
        const textLength = getCleanTextLength(el)
        if (textLength > 200) {
          return el
        }
      }
    } catch {
      // Invalid selector, skip
      continue
    }
  }
  
  return null
}

/**
 * Check if element is inside an unwanted container
 * Uses Readability.js unlikelyCandidates regex for comprehensive detection
 */
function isInsideUnwantedContainer(el: Element): boolean {
  let parent = el.parentElement
  while (parent && parent !== document.body) {
    const tagName = parent.tagName.toLowerCase()
    
    // Semantic elements that are definitely not content
    if (tagName === 'aside' || tagName === 'nav' || tagName === 'footer' || tagName === 'header') {
      return true
    }
    
    // Check class and id against Readability.js patterns
    const className = parent.className?.toString() || ''
    const id = parent.id || ''
    const matchString = className + ' ' + id
    
    // Test against unlikelyCandidates regex
    if (READABILITY_REGEXPS.unlikelyCandidates.test(matchString)) {
      // But allow if it matches okMaybeItsACandidate
      if (!READABILITY_REGEXPS.okMaybeItsACandidate.test(matchString)) {
        return true
      }
    }
    
    parent = parent.parentElement
  }
  return false
}

/**
 * Get clean text length (excluding scripts, styles, etc.)
 */
function getCleanTextLength(el: Element): number {
  const clone = el.cloneNode(true) as HTMLElement
  
  // Remove scripts, styles, etc.
  clone.querySelectorAll('script, style, noscript, iframe').forEach(e => e.remove())
  
  const text = clone.textContent || ''
  // Remove extra whitespace
  return text.replace(/\s+/g, ' ').trim().length
}

/**
 * Extract full page content
 */
function extractFullPage(): ExtractedContent {
  const metadata = extractMetadata()
  
  // Clone body and clean
  const clone = document.body.cloneNode(true) as HTMLElement
  cleanElement(clone)
  
  // Convert to Markdown with base URL for resolving relative links
  const baseUrl = window.location.href
  const markdown = htmlToMarkdown(clone.innerHTML, baseUrl)
  
  return {
    html: clone.innerHTML,
    text: markdown,
    metadata,
  }
}

/**
 * Find the largest text block on the page (improved algorithm)
 */
function findLargestTextBlock(): Element | null {
  const candidates = document.querySelectorAll('div, section, article, main')
  let bestElement: Element | null = null
  let bestScore = 0
  
  for (const el of Array.from(candidates)) {
    // Skip unwanted containers
    if (isInsideUnwantedContainer(el)) continue
    
    // Skip elements that are likely navigation or lists
    const tagName = el.tagName.toLowerCase()
    if (tagName === 'nav' || tagName === 'aside' || tagName === 'footer') continue
    
    // Calculate score
    const score = calculateContentScore(el)
    
    if (score > bestScore) {
      bestScore = score
      bestElement = el
    }
  }
  
  return bestElement
}

/**
 * Calculate content score for an element
 * Higher score = more likely to be article content
 * Based on Readability.js scoring algorithm
 */
function calculateContentScore(el: Element): number {
  const text = el.textContent || ''
  const cleanText = text.replace(/\s+/g, ' ').trim()
  const textLength = cleanText.length
  
  // Minimum text length threshold
  if (textLength < 200) return 0
  
  let score = 0
  
  // === Base score from text length ===
  // Logarithmic scaling to prevent very long pages from dominating
  score += Math.min(Math.sqrt(textLength) * 2, 500)
  
  // === Paragraph analysis ===
  const paragraphs = el.querySelectorAll('p')
  const paragraphCount = paragraphs.length
  
  // Bonus for having paragraphs (articles have paragraphs)
  score += paragraphCount * 10
  
  // Analyze paragraph quality
  let qualityParagraphs = 0
  paragraphs.forEach(p => {
    const pText = p.textContent?.trim() || ''
    // Good paragraphs are 50-500 characters
    if (pText.length >= 50 && pText.length <= 500) {
      qualityParagraphs++
    }
    // Bonus for paragraphs with sentences (contain periods)
    if ((pText.match(/[.。！？!?]/g) || []).length >= 2) {
      score += 5
    }
  })
  score += qualityParagraphs * 15
  
  // === Link density analysis ===
  const links = el.querySelectorAll('a')
  const linkTextLength = Array.from(links).reduce(
    (acc, a) => acc + (a.textContent?.length || 0),
    0
  )
  const linkDensity = textLength > 0 ? linkTextLength / textLength : 1
  
  // Heavy penalty for high link density (navigation-like content)
  if (linkDensity > 0.5) return 0
  if (linkDensity > 0.3) score *= 0.3
  else if (linkDensity > 0.2) score *= 0.5
  else if (linkDensity > 0.1) score *= 0.8
  else score *= (1 - linkDensity * 0.5) // Small bonus for low link density
  
  // === Semantic element analysis ===
  // Bonus for containing semantic article elements
  const headings = el.querySelectorAll('h1, h2, h3, h4, h5, h6')
  score += Math.min(headings.length * 15, 60)
  
  // Bonus for blockquotes (often in articles)
  const blockquotes = el.querySelectorAll('blockquote')
  score += blockquotes.length * 10
  
  // Bonus for images with alt text (quality content)
  const images = el.querySelectorAll('img[alt]')
  score += Math.min(images.length * 5, 30)
  
  // Bonus for code blocks (technical articles)
  const codeBlocks = el.querySelectorAll('pre, code')
  score += Math.min(codeBlocks.length * 8, 40)
  
  // Bonus for lists (structured content)
  const lists = el.querySelectorAll('ul, ol')
  score += Math.min(lists.length * 5, 25)
  
  // === Class/ID name analysis using Readability.js regex patterns ===
  const className = el.className?.toString() || ''
  const id = el.id || ''
  const matchString = className + ' ' + id
  
  // Use Readability.js official regex patterns for better accuracy
  if (READABILITY_REGEXPS.positive.test(matchString)) {
    score *= 1.3
  }
  
  if (READABILITY_REGEXPS.negative.test(matchString)) {
    score *= 0.2
  }
  
  // Additional check: if matches unlikelyCandidates but not okMaybeItsACandidate
  if (READABILITY_REGEXPS.unlikelyCandidates.test(matchString) && 
      !READABILITY_REGEXPS.okMaybeItsACandidate.test(matchString)) {
    score *= 0.1
  }
  
  // === Element depth analysis ===
  // Content too deeply nested is often not main content
  let depth = 0
  let parent = el.parentElement
  while (parent && parent !== document.body && depth < 20) {
    depth++
    parent = parent.parentElement
  }
  if (depth > 10) score *= 0.7
  if (depth > 15) score *= 0.5
  
  // === Sibling analysis ===
  // If siblings have similar structure, might be a list item not article
  const siblings = el.parentElement?.children || []
  if (siblings.length > 10) {
    const similarSiblings = Array.from(siblings).filter(s => 
      s.tagName === el.tagName && 
      Math.abs((s.textContent?.length || 0) - textLength) < textLength * 0.3
    ).length
    if (similarSiblings > 5) score *= 0.3 // Likely a list of items
  }
  
  return score
}

/**
 * Clean an element by removing unwanted content
 * Enhanced with site-specific rules and comprehensive filtering
 */
function cleanElement(element: HTMLElement): void {
  // Apply site-specific cleaning first
  applySiteSpecificRules(element)
  
  // Remove unwanted elements by selector
  for (const selector of UNWANTED_SELECTORS) {
    try {
      element.querySelectorAll(selector).forEach(el => el.remove())
    } catch {
      // Invalid selector, skip
    }
  }
  
  // Remove elements with suspicious class/id names
  const suspiciousPatterns = [
    // Navigation/UI
    'comment', 'sidebar', 'side-bar', 'widget', 'footer', 'header',
    'nav', 'menu', 'breadcrumb', 'pagination', 'pager',
    // Promotions
    'recommend', 'related', 'advertisement', 'ad-', 'advert', 'sponsor', 'promo',
    'social', 'share', 'subscribe', 'newsletter', 'signup', 'cta',
    // Dynamic content
    'popup', 'modal', 'overlay', 'dialog', 'toast', 'notification',
    'dropdown', 'tooltip', 'popover',
    // Lists (often not main content)
    'ranking', 'hot-', 'rank-', 'list-news', 'feed-', 'timeline',
    'trending', 'popular', 'top-',
    // Interactive
    'accordion', 'tab-', 'tabs-', 'carousel', 'slider', 'gallery',
    // Chinese specific
    'qrcode', 'qr-code', 'wechat', 'weixin', 'app-download',
  ]
  
  element.querySelectorAll('*').forEach(el => {
    const className = (el.className?.toString() || '').toLowerCase()
    const id = (el.id || '').toLowerCase()
    
    for (const pattern of suspiciousPatterns) {
      if (className.includes(pattern) || id.includes(pattern)) {
        // Don't remove if it contains images (preserve content with media)
        if (el.querySelector('img, video, picture, figure')) {
          return
        }
        // Don't remove if it contains substantial text (might be false positive)
        const textLen = (el.textContent || '').replace(/\s+/g, ' ').trim().length
        if (textLen < 500) {
          el.remove()
          return
        }
      }
    }
  })
  
  // Remove elements that look like metadata/info blocks
  removeMetadataBlocks(element)
  
  // Remove empty elements
  removeEmptyElements(element)
}

/**
 * Apply site-specific cleaning rules
 */
function applySiteSpecificRules(element: HTMLElement): void {
  const hostname = window.location.hostname
  
  // WeChat articles
  if (hostname.includes('weixin.qq.com') || hostname.includes('mp.weixin')) {
    element.querySelectorAll('.rich_media_meta_list, .rich_media_area_extra, .qr_code_pc, .reward_area, .like_area').forEach(el => el.remove())
  }
  
  // Zhihu
  if (hostname.includes('zhihu.com')) {
    element.querySelectorAll('.ContentItem-actions, .Reward, .FollowButton, .VoteButton, .ContentItem-meta, .RichContent-actions').forEach(el => el.remove())
  }
  
  // Sina/Weibo
  if (hostname.includes('sina.com') || hostname.includes('weibo.com')) {
    element.querySelectorAll('.article-info, .article-source, .article-editor, .sina-share, .keywords, .article-keywords').forEach(el => el.remove())
  }
  
  // Medium
  if (hostname.includes('medium.com')) {
    element.querySelectorAll('.pw-post-body-actions, .ae.lx, .speechify-ignore').forEach(el => el.remove())
  }
  
  // GitHub
  if (hostname.includes('github.com')) {
    element.querySelectorAll('.flash, .flash-notice, .flash-warn, .Box-header, .file-navigation, .commit-tease').forEach(el => el.remove())
  }
  
  // 36kr
  if (hostname.includes('36kr.com')) {
    element.querySelectorAll('.article-bottom, .article-title-icon, .article-info-wrap, .article-share').forEach(el => el.remove())
  }
  
  // CSDN
  if (hostname.includes('csdn.net')) {
    element.querySelectorAll('.article-bar-top, .hide-article-box, .recommend-box, .blog-vote-box, .csdn-side-toolbar').forEach(el => el.remove())
  }
  
  // Juejin
  if (hostname.includes('juejin.cn') || hostname.includes('juejin.im')) {
    element.querySelectorAll('.article-suspended-panel, .follow-button, .like-btn, .comment-action').forEach(el => el.remove())
  }
  
  // 知乎专栏
  if (hostname.includes('zhuanlan.zhihu.com')) {
    element.querySelectorAll('.ColumnPageHeader, .Post-SideActions, .FollowButton').forEach(el => el.remove())
  }
  
  // 简书
  if (hostname.includes('jianshu.com')) {
    element.querySelectorAll('.author, .follow-btn, .like-btn, .share-btn, ._1kCBjS').forEach(el => el.remove())
  }
  
  // Substack
  if (hostname.includes('substack.com')) {
    element.querySelectorAll('.subscribe-widget, .footer-wrap, .post-meta').forEach(el => el.remove())
  }
}

/**
 * Remove duplicate title from content
 * If the first heading or prominent text matches the page title, remove it
 * to avoid duplication with the template's {{title}} variable
 */
function removeDuplicateTitle(element: HTMLElement, pageTitle: string): void {
  if (!pageTitle) return
  
  // Normalize page title for comparison (remove site name suffix, common separators)
  const normalizedPageTitle = normalizeTitle(pageTitle)
  if (!normalizedPageTitle) return
  
  // Check ALL h1 headings first (not just first 2)
  const h1Headings = element.querySelectorAll('h1')
  for (const heading of Array.from(h1Headings)) {
    const headingText = normalizeTitle(heading.textContent || '')
    if (headingText && isTitleMatch(headingText, normalizedPageTitle)) {
      heading.remove()
      return // Only remove first match
    }
  }
  
  // Check first few H2 headings
  const h2Headings = element.querySelectorAll('h2')
  for (const heading of Array.from(h2Headings).slice(0, 3)) {
    const headingText = normalizeTitle(heading.textContent || '')
    if (headingText && isTitleMatch(headingText, normalizedPageTitle)) {
      heading.remove()
      return
    }
  }
  
  // Also check first prominent element (sometimes title is in div/p)
  const firstElements = element.querySelectorAll(':scope > *')
  for (const el of Array.from(firstElements).slice(0, 5)) {
    const text = el.textContent?.trim() || ''
    // Only consider short text that could be a title (increased limit for long titles)
    if (text.length < 300 && text.length > 5) {
      const normalizedText = normalizeTitle(text)
      if (normalizedText && isTitleMatch(normalizedText, normalizedPageTitle)) {
        // Check if this element only contains the title (not mixed with other content)
        const innerText = el.textContent?.trim() || ''
        if (innerText.length < 400) {
          el.remove()
          return
        }
      }
    }
  }
}

/**
 * Normalize title for comparison
 * Removes common suffixes like site names, separators, etc.
 */
function normalizeTitle(title: string): string {
  return title
    // Remove common separators and what follows (site names)
    .replace(/[\|｜\-–—_]\s*[^|\-–—_]*$/, '')
    .replace(/\s*[-–—]\s*[^-–—]*$/, '')
    // Remove leading/trailing whitespace and punctuation
    .trim()
    .replace(/^[【\[\(（]/, '')
    .replace(/[】\]\)）]$/, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Check if two titles match (allowing for minor differences)
 */
function isTitleMatch(title1: string, title2: string): boolean {
  // Exact match
  if (title1 === title2) return true
  
  // Case-insensitive match
  if (title1.toLowerCase() === title2.toLowerCase()) return true
  
  // One contains the other (for cases where one has extra text)
  const shorter = title1.length < title2.length ? title1 : title2
  const longer = title1.length < title2.length ? title2 : title1
  
  // If shorter is at least 80% of longer and is contained within it
  if (shorter.length > 10 && shorter.length >= longer.length * 0.7) {
    if (longer.includes(shorter) || shorter.includes(longer.substring(0, shorter.length))) {
      return true
    }
  }
  
  return false
}


/**
 * Remove metadata/info blocks that are not main content
 */
function removeMetadataBlocks(element: HTMLElement): void {
  element.querySelectorAll('*').forEach(el => {
    const text = el.textContent?.trim() || ''
    if (text.length > 200) return // Skip elements with substantial content
    
    // Check for metadata patterns
    const metadataPatterns = [
      /^(作者|编辑|来源|责编|记者)[：:]/,
      /^(发布|更新|修改)(时间|日期)[：:]/,
      /^(阅读|浏览|评论|点赞)\s*[：:]?\s*\d+/,
      /^(原文链接|转载自|出处)[：:]/,
      /^(by|author|source|editor)[:\s]/i,
      /^(posted|published|updated|modified)[:\s]/i,
      /^\d+\s*(views?|reads?|comments?|likes?)/i,
    ]
    
    for (const pattern of metadataPatterns) {
      if (pattern.test(text)) {
        el.remove()
        return
      }
    }
  })
}

/**
 * Remove noise elements based on text patterns
 * Enhanced with more comprehensive detection
 */
function removeNoiseElements(element: HTMLElement): void {
  // First pass: remove elements matching noise patterns
  element.querySelectorAll('*').forEach(el => {
    const text = el.textContent?.trim() || ''
    
    // Skip if has significant content
    if (text.length > 150) return
    
    // Check against noise patterns
    for (const pattern of NOISE_PATTERNS) {
      if (pattern.test(text)) {
        el.remove()
        return
      }
    }
  })
  
  // Second pass: remove tiny elements that are likely noise
  element.querySelectorAll('*').forEach(el => {
    const text = el.textContent?.trim() || ''
    
    // Very short text with links is likely navigation
    if (text.length < 30 && el.querySelectorAll('a').length > 0) {
      const linkText = Array.from(el.querySelectorAll('a'))
        .map(a => a.textContent?.trim() || '')
        .join('')
      if (linkText.length >= text.length * 0.8) {
        el.remove()
        return
      }
    }
  })
  
  // Third pass: remove isolated short paragraphs that match common noise
  element.querySelectorAll('p, div, span').forEach(el => {
    const text = el.textContent?.trim() || ''
    if (text.length < 50) {
      // Common noise phrases
      const noiseTexts = [
        '点击查看', '展开全文', '显示全部', '查看更多', '阅读原文',
        '分享到', '转发给', '复制链接', '举报', '投诉',
        'read more', 'show more', 'see all', 'expand', 'click here',
        'share this', 'copy link', 'report',
      ]
      for (const noise of noiseTexts) {
        if (text.toLowerCase().includes(noise.toLowerCase())) {
          el.remove()
          return
        }
      }
    }
  })
  
  // Final cleanup of empty elements
  removeEmptyElements(element)
}

/**
 * Remove empty elements recursively
 */
function removeEmptyElements(element: HTMLElement): void {
  const elements = Array.from(element.querySelectorAll('*'))
  
  // Process from innermost to outermost
  elements.reverse().forEach(el => {
    // Keep media elements themselves
    const tagName = el.tagName.toLowerCase()
    if (['img', 'video', 'audio', 'svg', 'canvas', 'iframe', 'picture', 'figure', 'table'].includes(tagName)) return
    
    // Keep elements with images or other media
    if (el.querySelector('img, video, audio, svg, canvas, iframe, picture, figure, table')) return
    
    // Keep elements with actual text content
    const text = el.textContent?.trim() || ''
    if (text.length > 0) return
    
    // Remove empty element
    el.remove()
  })
}

/**
 * Get basic page info
 */
function getPageInfo(): Partial<ClipMetadata> & { hasSelection: boolean } {
  const selection = window.getSelection()
  return {
    ...extractMetadata(),
    hasSelection: selection ? !selection.isCollapsed : false,
  }
}

// ==================== Message Handler ====================

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (response: ExtensionResponse) => void) => {
    try {
      switch (message.type) {
        case 'GET_PAGE_INFO':
          sendResponse({
            success: true,
            data: getPageInfo(),
          })
          break
          
        case 'EXTRACT_SELECTION':
          const selection = extractSelection()
          if (selection) {
            sendResponse({
              success: true,
              data: selection,
            })
          } else {
            sendResponse({
              success: false,
              error: 'No text selected',
            })
          }
          break
          
        case 'EXTRACT_CONTENT':
          const mode = message.payload?.mode || 'article'
          let content: ExtractedContent
          
          if (mode === 'selection') {
            const sel = extractSelection()
            if (!sel) {
              sendResponse({
                success: false,
                error: 'No text selected',
              })
              return true
            }
            content = sel
          } else if (mode === 'full-page') {
            content = extractFullPage()
          } else {
            content = extractArticle()
          }
          
          sendResponse({
            success: true,
            data: content,
          })
          break
          
        default:
          sendResponse({
            success: false,
            error: `Unknown message type: ${message.type}`,
          })
      }
    } catch (error) {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
    
    return true
  }
)

console.log('[Orca Web Clipper] Content script loaded')
