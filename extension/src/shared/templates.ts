/**
 * Orca Web Clipper - Template System
 */

export interface ClipTemplate {
  id: string
  name: string
  /** Title line (first block) - supports tags like #WebClip */
  titleLine: string
  /** Content template (inserted as children of title block) */
  content: string
  isDefault?: boolean
  tags?: string[]
  /** Tag properties to set on the WebClip tag (e.g., source, clipped) */
  tagProperties?: Record<string, string>
}

// Available template variables
export const TEMPLATE_VARIABLES = {
  '{{title}}': 'Page title',
  '{{url}}': 'Page URL',
  '{{siteName}}': 'Site name',
  '{{author}}': 'Author',
  '{{publishedAt}}': 'Published date',
  '{{capturedAt}}': 'Capture date',
  '{{content}}': 'Main content (Markdown)',
  '{{selection}}': 'Selected text',
  '{{summary}}': 'AI-generated brief summary',
  '{{abstract}}': 'AI-generated brief description (100 chars)',
  '{{note}}': 'User note/annotation',
  '{{favicon}}': 'Favicon URL',
  '{{date}}': 'Current date (YYYY-MM-DD)',
  '{{time}}': 'Current time (HH:mm)',
}

// Default templates
// titleLine: inserted as first block (parent)
// content: inserted as children of titleLine block
// tagProperties: property values for WebClip tag (source=URL, clipped=datetime)
// Note: Tag properties are inserted as special property blocks (propName:: value)
export const DEFAULT_TEMPLATES: ClipTemplate[] = [
  {
    id: 'default',
    name: '通用',
    isDefault: true,
    tags: ['WebClip'],
    titleLine: `{{title}} #WebClip`,
    // Metadata properties first, then content
    content: `Source:: {{url}}
Clipped:: {{capturedAt}}
Author:: {{author}}
Published:: {{publishedAt}}
Abstract:: {{abstract}}
{{content}}
{{note}}`,
  },
  {
    id: 'article',
    name: 'Article',
    tags: ['WebClip', 'Article'],
    titleLine: `{{title}} #WebClip #Article`,
    content: `Source:: {{url}}
Clipped:: {{capturedAt}}
Site:: {{siteName}}
Author:: {{author}}
Published:: {{publishedAt}}
---
{{content}}
---
**My Notes**
{{note}}`,
  },
  {
    id: 'bookmark',
    name: 'Bookmark',
    tags: ['WebClip', 'Bookmark'],
    titleLine: `[{{title}}]({{url}}) #WebClip #Bookmark`,
    content: `Source:: {{url}}
Clipped:: {{capturedAt}}
Site: {{siteName}}
{{note}}`,
  },
  {
    id: 'research',
    name: 'Research',
    tags: ['WebClip', 'Research'],
    titleLine: `{{title}} #WebClip #Research`,
    content: `Source:: {{url}}
Clipped:: {{capturedAt}}
**Metadata**
- Author: {{author}}
- Published: {{publishedAt}}
**Summary**
{{summary}}
**Notes**
{{note}}
**Full Content**
{{content}}`,
  },
]

/**
 * Apply template with given data
 * Returns titleLine, content, and tagProperties with variables replaced
 */
export function applyTemplate(
  template: ClipTemplate,
  data: Record<string, string>
): { titleLine: string; content: string; tagProperties?: Record<string, string> } {
  const replaceVariables = (text: string): string => {
    let result = text
    
    for (const [variable, value] of Object.entries(data)) {
      const pattern = new RegExp(`\\{\\{${variable}\\}\\}`, 'g')
      result = result.replace(pattern, value || '')
    }
    
    // Clean up any remaining variables
    result = result.replace(/\{\{[^}]+\}\}/g, '')
    
    // Clean up multiple empty lines
    result = result.replace(/\n{3,}/g, '\n\n')
    
    return result.trim()
  }

  // Process tag properties if defined
  let processedTagProperties: Record<string, string> | undefined
  if (template.tagProperties) {
    processedTagProperties = {}
    for (const [propName, propTemplate] of Object.entries(template.tagProperties)) {
      processedTagProperties[propName] = replaceVariables(propTemplate)
    }
  }

  return {
    titleLine: replaceVariables(template.titleLine),
    content: replaceVariables(template.content),
    tagProperties: processedTagProperties,
  }
}

/**
 * Get template by ID
 */
export function getTemplate(id: string): ClipTemplate | undefined {
  return DEFAULT_TEMPLATES.find(t => t.id === id)
}

/**
 * Get default template
 */
export function getDefaultTemplate(): ClipTemplate {
  return DEFAULT_TEMPLATES.find(t => t.isDefault) || DEFAULT_TEMPLATES[0]
}

/**
 * Save custom template
 */
export async function saveCustomTemplate(template: ClipTemplate): Promise<void> {
  const storage = await chrome.storage.local.get('customTemplates')
  const templates: ClipTemplate[] = storage.customTemplates || []
  
  const existingIndex = templates.findIndex(t => t.id === template.id)
  if (existingIndex >= 0) {
    templates[existingIndex] = template
  } else {
    templates.push(template)
  }
  
  await chrome.storage.local.set({ customTemplates: templates })
}

/**
 * Get all templates (default + custom)
 */
export async function getAllTemplates(): Promise<ClipTemplate[]> {
  const storage = await chrome.storage.local.get('customTemplates')
  const customTemplates: ClipTemplate[] = storage.customTemplates || []
  
  return [...DEFAULT_TEMPLATES, ...customTemplates]
}

/**
 * Delete custom template
 */
export async function deleteCustomTemplate(id: string): Promise<void> {
  const storage = await chrome.storage.local.get('customTemplates')
  const templates: ClipTemplate[] = storage.customTemplates || []
  
  const filtered = templates.filter(t => t.id !== id)
  await chrome.storage.local.set({ customTemplates: filtered })
}
