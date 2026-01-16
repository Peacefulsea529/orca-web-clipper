/**
 * Orca Web Clipper Plugin - Templates
 */

import type { ClipPayload, ClipTemplate } from './types'

// Default templates
export const TEMPLATES: Record<string, ClipTemplate> = {
  default: {
    id: 'default',
    name: '默认模板',
    content: `{{content}}

{{#if highlights}}
### 高亮内容
{{#each highlights}}
> {{text}}
{{/each}}
{{/if}}

{{#if note}}
### 笔记
{{note}}
{{/if}}

---
[原文链接]({{metadata.url}})`
  },
  
  simple: {
    id: 'simple',
    name: '简单链接',
    content: `[{{metadata.title}}]({{metadata.url}})

{{#if selection}}
> {{selection}}
{{/if}}`
  },
  
  tasks: {
    id: 'tasks',
    name: '待办任务',
    content: `TODO 阅读: [{{metadata.title}}]({{metadata.url}})
DEADLINE: {{date}}`
  },
  
  quote: {
    id: 'quote',
    name: '引用卡片',
    content: `> {{selection}}

-- [{{metadata.title}}]({{metadata.url}})`
  },
  
  literature: {
    id: 'literature',
    name: '文献笔记',
    content: `## {{metadata.title}}

**来源**: {{metadata.siteName}}
**作者**: {{metadata.author}}
**链接**: {{metadata.url}}
**日期**: {{metadata.publishedAt}}

### 摘要
{{selection}}

### 笔记
{{note}}`
  }
}

/**
 * Get a template by ID
 */
export function getTemplate(id: string): ClipTemplate {
  return TEMPLATES[id] || TEMPLATES.default
}

/**
 * Apply template to payload
 * Simple mustache-like replacement
 */
export function applyTemplate(template: ClipTemplate, payload: ClipPayload): string {
  let result = template.content
  
  // Replace simple variables
  const variables: Record<string, string> = {
    '{{content}}': payload.content || '',
    '{{selection}}': payload.content || '', // In selection mode, content IS selection
    '{{note}}': payload.note || '',
    '{{metadata.url}}': payload.metadata.url || '',
    '{{metadata.title}}': payload.metadata.title || '',
    '{{metadata.siteName}}': payload.metadata.siteName || '',
    '{{metadata.author}}': payload.metadata.author || '',
    '{{metadata.publishedAt}}': payload.metadata.publishedAt || '',
    '{{metadata.capturedAt}}': payload.metadata.capturedAt || '',
    '{{date}}': new Date().toLocaleDateString(),
  }
  
  // Replace variables
  Object.entries(variables).forEach(([key, value]) => {
    result = result.replaceAll(key, value)
  })
  
  // Handle simple conditionals (very basic)
  result = result.replace(/{{#if (\w+)}}([\s\S]*?){{\/if}}/g, (match, condition, content) => {
    const val = payload[condition as keyof ClipPayload] || payload.metadata[condition as keyof typeof payload.metadata]
    return val ? content : ''
  })
  
  // Handle highlights loop (special case)
  if (result.includes('{{#each highlights}}')) {
    const highlightLoopRegex = /{{#each highlights}}([\s\S]*?){{\/each}}/g
    result = result.replace(highlightLoopRegex, (match, loopContent) => {
      if (!payload.highlights || payload.highlights.length === 0) return ''
      
      return payload.highlights.map(h => {
        return loopContent.replaceAll('{{text}}', h.text).replaceAll('{{color}}', h.color)
      }).join('\n')
    })
  }
  
  return result
}
