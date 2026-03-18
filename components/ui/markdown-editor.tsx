'use client'

import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Link,
  Image as ImageIcon,
  Table,
  Minus,
  Info,
  Highlighter,
  FileUp,
  Send,
  Download,
  Eye,
  Columns2,
  Pencil,
  ChevronDown,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CircularProgress } from './circular-progress'
// DOMPurify loaded lazily — the module is browser-only
let _purify: { sanitize: (dirty: string, cfg?: Record<string, unknown>) => string } | null = null
function getPurify() {
  if (!_purify && typeof window !== 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('dompurify')
      // dompurify CJS exports the factory; ESM exports an instance
      const inst = mod.default ?? mod
      if (typeof inst === 'function') {
        _purify = inst(window)
      } else if (inst && typeof (inst as Record<string, unknown>).sanitize === 'function') {
        _purify = inst
      }
    } catch { /* unavailable */ }
  }
  return _purify
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EditorTopic {
  topic_id: string
  name: string
  topic_type: 'broadcast' | 'discussion' | 'p2p' | 'collaborative'
}

interface MarkdownEditorProps {
  topics: EditorTopic[]
  defaultTopicId?: string | null
  onPublish: (topicId: string, content: string) => Promise<void>
  onClose: () => void
}

type ViewMode = 'edit' | 'split' | 'preview'

/* ------------------------------------------------------------------ */
/*  Toolbar actions                                                    */
/* ------------------------------------------------------------------ */

export interface ToolbarAction {
  icon: React.ReactNode
  label: string
  shortcut?: string
  action: (ta: HTMLTextAreaElement) => void
  separator?: boolean
}

function wrapSelection(ta: HTMLTextAreaElement, before: string, after: string) {
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const text = ta.value
  const selected = text.slice(start, end)
  const replacement = `${before}${selected || 'text'}${after}`
  ta.setRangeText(replacement, start, end, 'select')
  ta.focus()
  ta.dispatchEvent(new Event('input', { bubbles: true }))
}

function insertAtCursor(ta: HTMLTextAreaElement, text: string) {
  const start = ta.selectionStart
  ta.setRangeText(text, start, start, 'end')
  ta.focus()
  ta.dispatchEvent(new Event('input', { bubbles: true }))
}

function prefixLine(ta: HTMLTextAreaElement, prefix: string) {
  const start = ta.selectionStart
  const text = ta.value
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  ta.setRangeText(prefix, lineStart, lineStart, 'end')
  ta.focus()
  ta.dispatchEvent(new Event('input', { bubbles: true }))
}

export function buildActions(): ToolbarAction[] {
  return [
    { icon: <Heading1 className="h-4 w-4" />, label: 'Heading 1', shortcut: 'Ctrl+1', action: (ta) => prefixLine(ta, '# ') },
    { icon: <Heading2 className="h-4 w-4" />, label: 'Heading 2', shortcut: 'Ctrl+2', action: (ta) => prefixLine(ta, '## ') },
    { icon: <Heading3 className="h-4 w-4" />, label: 'Heading 3', shortcut: 'Ctrl+3', action: (ta) => prefixLine(ta, '### ') },
    { icon: <Bold className="h-4 w-4" />, label: 'Bold', shortcut: 'Ctrl+B', action: (ta) => wrapSelection(ta, '**', '**'), separator: true },
    { icon: <Italic className="h-4 w-4" />, label: 'Italic', shortcut: 'Ctrl+I', action: (ta) => wrapSelection(ta, '_', '_') },
    { icon: <Strikethrough className="h-4 w-4" />, label: 'Strikethrough', shortcut: 'Ctrl+D', action: (ta) => wrapSelection(ta, '~~', '~~') },
    { icon: <Highlighter className="h-4 w-4" />, label: 'Highlight', shortcut: 'Ctrl+H', action: (ta) => wrapSelection(ta, '==', '==') },
    { icon: <Code className="h-4 w-4" />, label: 'Code', shortcut: 'Ctrl+E', action: (ta) => wrapSelection(ta, '`', '`'), separator: true },
    { icon: <Quote className="h-4 w-4" />, label: 'Quote', action: (ta) => prefixLine(ta, '> ') },
    { icon: <List className="h-4 w-4" />, label: 'Bullet list', action: (ta) => prefixLine(ta, '- ') },
    { icon: <ListOrdered className="h-4 w-4" />, label: 'Numbered list', action: (ta) => prefixLine(ta, '1. ') },
    { icon: <ListChecks className="h-4 w-4" />, label: 'Task list', action: (ta) => prefixLine(ta, '- [ ] '), separator: true },
    { icon: <Link className="h-4 w-4" />, label: 'Link', shortcut: 'Ctrl+K', action: (ta) => wrapSelection(ta, '[', '](url)') },
    { icon: <ImageIcon className="h-4 w-4" />, label: 'Image', action: (ta) => insertAtCursor(ta, '![alt](url)') },
    { icon: <Table className="h-4 w-4" />, label: 'Table', action: (ta) => insertAtCursor(ta, '\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Cell | Cell | Cell |\n'), separator: true },
    { icon: <Minus className="h-4 w-4" />, label: 'Horizontal rule', action: (ta) => insertAtCursor(ta, '\n---\n') },
    {
      icon: <Info className="h-4 w-4" />,
      label: 'Callout',
      action: (ta) => insertAtCursor(ta, '\n> [!note]\n> Your note here\n'),
    },
  ]
}

/* ------------------------------------------------------------------ */
/*  Keyboard shortcut handler                                          */
/* ------------------------------------------------------------------ */

export function handleEditorKeyDown(
  e: KeyboardEvent<HTMLTextAreaElement>,
  actions: ToolbarAction[],
) {
  const meta = e.ctrlKey || e.metaKey
  if (!meta) return

  // Let native browser shortcuts pass through (copy, paste, undo, redo, select-all, cut)
  const nativeKeys = new Set(['c', 'v', 'x', 'z', 'a', 'y'])
  if (nativeKeys.has(e.key.toLowerCase())) return

  const keyMap: Record<string, string> = {
    b: 'Bold',
    i: 'Italic',
    d: 'Strikethrough',
    h: 'Highlight',
    e: 'Code',
    k: 'Link',
    '1': 'Heading 1',
    '2': 'Heading 2',
    '3': 'Heading 3',
  }

  const label = keyMap[e.key.toLowerCase()]
  if (!label) return

  const action = actions.find((a) => a.label === label)
  if (!action) return

  e.preventDefault()
  action.action(e.currentTarget)
}

/* ------------------------------------------------------------------ */
/*  Custom remark plugin: Obsidian callouts                            */
/* ------------------------------------------------------------------ */

// Callouts are rendered via CSS + custom component mapping rather than
// a full remark plugin, keeping the implementation lightweight.

const CALLOUT_RE = /^\[!(note|tip|warning|danger|info|example|quote|abstract|success|question|failure|bug)\]\s*/i

function CalloutBlockquote({ children, ...props }: React.ComponentPropsWithoutRef<'blockquote'>) {
  // Detect if the first child text starts with [!type]
  const firstChild = Array.isArray(children) ? children[0] : children
  let calloutType: string | null = null

  if (firstChild && typeof firstChild === 'object' && 'props' in firstChild) {
    const inner = firstChild.props?.children
    if (typeof inner === 'string') {
      const m = CALLOUT_RE.exec(inner)
      if (m) calloutType = m[1].toLowerCase()
    } else if (Array.isArray(inner) && typeof inner[0] === 'string') {
      const m = CALLOUT_RE.exec(inner[0])
      if (m) calloutType = m[1].toLowerCase()
    }
  }

  if (calloutType) {
    // Strip blockquote-specific props before spreading onto div
    const { cite: _cite, ...divProps } = props as React.ComponentPropsWithoutRef<'blockquote'> & { cite?: string } // eslint-disable-line @typescript-eslint/no-unused-vars
    return (
      <div className={`callout callout-${calloutType}`} {...(divProps as React.ComponentPropsWithoutRef<'div'>)}>
        <div className="callout-title">{calloutType.charAt(0).toUpperCase() + calloutType.slice(1)}</div>
        <div className="callout-content">{children}</div>
      </div>
    )
  }

  return <blockquote {...props}>{children}</blockquote>
}

/* ------------------------------------------------------------------ */
/*  Highlight support: ==text== → <mark>                               */
/* ------------------------------------------------------------------ */

function processHighlights(content: string): string {
  const raw = content.replace(/==(.*?)==/g, '<mark>$1</mark>')
  const purify = getPurify()
  return purify ? purify.sanitize(raw, { ALLOWED_TAGS: ['mark'] }) : raw
}

/* ------------------------------------------------------------------ */
/*  File import helpers                                                */
/* ------------------------------------------------------------------ */

export function readMarkdownFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

export function isMarkdownFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.mdx') || name.endsWith('.txt')
}

/* ------------------------------------------------------------------ */
/*  Toolbar Component                                                  */
/* ------------------------------------------------------------------ */

export function EditorToolbar({
  actions,
  textareaRef,
  viewMode,
  onViewModeChange,
  onImport,
}: {
  actions: ToolbarAction[]
  textareaRef: RefObject<HTMLTextAreaElement | null>
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onImport: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50/80 px-2 py-1.5">
      {actions.map((a, i) => (
        <span key={a.label} className="contents">
          {a.separator && i > 0 && <span className="mx-1 h-5 w-px bg-slate-200" />}
          <button
            type="button"
            title={`${a.label}${a.shortcut ? ` (${a.shortcut})` : ''}`}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 transition-colors"
            onClick={() => textareaRef.current && a.action(textareaRef.current)}
          >
            {a.icon}
          </button>
        </span>
      ))}

      <span className="mx-1 h-5 w-px bg-slate-200" />

      <button
        type="button"
        title="Import markdown file"
        className="rounded p-1.5 text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 transition-colors"
        onClick={onImport}
      >
        <FileUp className="h-4 w-4" />
      </button>

      <div className="ml-auto flex items-center gap-0.5 rounded-lg bg-slate-200/60 p-0.5">
        {([
          { mode: 'edit' as const, icon: <Pencil className="h-3.5 w-3.5" />, label: 'Edit' },
          { mode: 'split' as const, icon: <Columns2 className="h-3.5 w-3.5" />, label: 'Split' },
          { mode: 'preview' as const, icon: <Eye className="h-3.5 w-3.5" />, label: 'Preview' },
        ]).map(({ mode, icon, label }) => (
          <button
            key={mode}
            type="button"
            title={label}
            onClick={() => onViewModeChange(mode)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              viewMode === mode
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Preview Component                                                  */
/* ------------------------------------------------------------------ */

export function MarkdownPreview({ content }: { content: string }) {
  const processed = useMemo(() => processHighlights(content), [content])

  return (
    <div className="prose prose-slate prose-sm max-w-none overflow-auto p-4 sm:p-6 md-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          blockquote: CalloutBlockquote,
          // Render <mark> from ==text== processed HTML
          p: ({ children, ...props }) => {
            if (typeof children === 'string' && children.includes('<mark>')) {
              return <p {...props} dangerouslySetInnerHTML={{ __html: children }} />
            }
            return <p {...props}>{children}</p>
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Topic Selector                                                     */
/* ------------------------------------------------------------------ */

function TopicSelector({
  topics,
  selectedTopicId,
  onSelect,
}: {
  topics: EditorTopic[]
  selectedTopicId: string
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selected = topics.find((t) => t.topic_id === selectedTopicId)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-slate-300 transition-colors"
      >
        <span className="max-w-[180px] truncate">{selected?.name || 'Select topic...'}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 max-h-60 w-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg z-50">
          {topics.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-400">No topics available</p>
          ) : (
            topics.map((t) => (
              <button
                key={t.topic_id}
                type="button"
                onClick={() => { onSelect(t.topic_id); setOpen(false) }}
                className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
                  t.topic_id === selectedTopicId
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="font-medium">{t.name}</span>
                <span className="ml-2 text-xs text-slate-400">{t.topic_type}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Editor Component                                              */
/* ------------------------------------------------------------------ */

export function MarkdownEditor({ topics, defaultTopicId, onPublish, onClose }: MarkdownEditorProps) {
  const [content, setContent] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [selectedTopicId, setSelectedTopicId] = useState(defaultTopicId || topics[0]?.topic_id || '')
  const [publishing, setPublishing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const actions = useMemo(() => buildActions(), [])

  const wordCount = useMemo(() => {
    const trimmed = content.trim()
    if (!trimmed) return { words: 0, chars: 0 }
    // Count CJK characters + word-boundary tokens
    const cjk = (trimmed.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length
    const words = trimmed.split(/\s+/).filter(Boolean).length
    return { words: words + cjk, chars: trimmed.length }
  }, [content])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const importFile = useCallback(async (file: File) => {
    if (!isMarkdownFile(file)) {
      alert('Please select a Markdown file (.md, .markdown, .mdx, or .txt)')
      return
    }
    try {
      const text = await readMarkdownFile(file)
      setContent((prev) => (prev ? `${prev}\n\n${text}` : text))
    } catch {
      alert('Failed to read file')
    }
  }, [])

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) importFile(file)
      e.currentTarget.value = ''
    },
    [importFile],
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) importFile(file)
    },
    [importFile],
  )

  const handlePublish = useCallback(async () => {
    if (!selectedTopicId || !content.trim()) return
    setPublishing(true)
    try {
      await onPublish(selectedTopicId, content.trim())
      setContent('')
      onClose()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }, [selectedTopicId, content, onPublish, onClose])

  const handleSaveLocal = useCallback(() => {
    if (!content.trim()) return
    const defaultName = `draft-${new Date().toISOString().slice(0, 10)}.md`
    const filename = prompt('Save as:', defaultName)
    if (!filename) return
    const finalName = filename.endsWith('.md') || filename.endsWith('.markdown') ? filename : `${filename}.md`
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = finalName
    a.click()
    URL.revokeObjectURL(url)
  }, [content])

  // Close with Escape
  useEffect(() => {
    function handleEscape(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  // Auto-focus textarea on mount
  useEffect(() => {
    if (viewMode !== 'preview') {
      textareaRef.current?.focus()
    }
  }, [viewMode])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <h2 className="text-base font-semibold text-slate-800">Markdown Editor</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          title="Close (Esc)"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Toolbar */}
      <EditorToolbar
        actions={actions}
        textareaRef={textareaRef}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onImport={handleImportClick}
      />

      {/* Editor + Preview area */}
      <div className="relative flex flex-1 overflow-hidden">
        {dragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-indigo-50/80 border-2 border-dashed border-indigo-300 rounded-lg m-2">
            <div className="text-center">
              <FileUp className="mx-auto h-10 w-10 text-indigo-400" />
              <p className="mt-2 text-sm font-medium text-indigo-600">Drop your markdown file here</p>
            </div>
          </div>
        )}

        {/* Editor pane */}
        {viewMode !== 'preview' && (
          <div className={`flex flex-col ${viewMode === 'split' ? 'w-1/2 border-r border-slate-200' : 'w-full'}`}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => handleEditorKeyDown(e, actions)}
              placeholder="Start writing markdown...&#10;&#10;Tips:&#10;  Ctrl+B  Bold&#10;  Ctrl+I  Italic&#10;  Ctrl+K  Link&#10;  Ctrl+H  Highlight&#10;  > [!note]  Callout block"
              className="flex-1 resize-none bg-white p-4 sm:p-6 font-mono text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-300"
              spellCheck={false}
            />
          </div>
        )}

        {/* Preview pane */}
        {viewMode !== 'edit' && (
          <div className={`overflow-auto ${viewMode === 'split' ? 'w-1/2' : 'w-full'} bg-white`}>
            {content.trim() ? (
              <MarkdownPreview content={content} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-300">
                Preview will appear here
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-4 py-2">
        <div className="flex items-center gap-4">
          <TopicSelector
            topics={topics.filter((t) => t.topic_type !== 'p2p')}
            selectedTopicId={selectedTopicId}
            onSelect={setSelectedTopicId}
          />
          <span className="text-xs text-slate-400">
            {wordCount.words} words · {wordCount.chars} chars
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveLocal}
            disabled={!content.trim()}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Save
          </button>

          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing || !content.trim() || !selectedTopicId}
            className="flex items-center gap-2 rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishing ? (
              <CircularProgress progress={-1} size={16} strokeWidth={2} color="#fff" trackColor="rgba(255,255,255,0.3)" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {publishing ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.mdx,.txt"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
