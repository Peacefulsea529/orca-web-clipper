/**
 * Orca Web Clipper - Template System
 */

export interface ClipTemplate {
  id: string
  name: string
  content: string
  isDefault?: boolean
  tags?: string[]
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
  '{{note}}': 'User note/annotation',
  '{{favicon}}': 'Favicon URL',
  '{{date}}': 'Current date (YYYY-MM-DD)',
  '{{time}}': 'Current time (HH:mm)',
}

// Default templates
export const DEFAULT_TEMPLATES: ClipTemplate[] = [
  {
    id: 'default',
    name: 'Default',
    isDefault: true,
    tags: ['WebClip'],
    content: `{{title}} #WebClip
Source: {{url}}
Clipped: {{capturedAt}}
---
{{content}}

{{note}}
`,
  },
  {
    id: 'article',
    name: 'Article',
    tags: ['WebClip', 'Article'],
    content: `# {{title}} #WebClip #Article

| Property | Value |
|----------|-------|
| Source | [Link]({{url}}) |
| Site | {{siteName}} |
| Author | {{author}} |
| Published | {{publishedAt}} |
| Clipped | {{capturedAt}} |

---

{{content}}

---

## My Notes

{{note}}
`,
  },
  {
    id: 'bookmark',
    name: 'Bookmark',
    tags: ['WebClip', 'Bookmark'],
    content: `- [{{title}}]({{url}}) - {{siteName}} #WebClip #Bookmark
  - Clipped: {{capturedAt}}
  - {{note}}
`,
  },
  {
    id: 'research',
    name: 'Research',
    tags: ['WebClip', 'Research'],
    content: `## {{title}} #WebClip #Research

### Metadata
- **URL**: {{url}}
- **Author**: {{author}}
- **Published**: {{publishedAt}}
- **Accessed**: {{capturedAt}}

### Summary
{{summary}}

### Notes
{{note}}

### Full Content
{{content}}
`,
  },
]

/**
 * Apply template with given data
 */
export function applyTemplate(
  template: string,
  data: Record<string, string>
): string {
  let result = template
  
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
