'use client'

import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code,
  Code2,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  FileUp,
  Send,
  Download,
  ChevronDown,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { Table as TableExtension } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { CircularProgress } from './circular-progress'
import TextAlign from '@tiptap/extension-text-align'

import type { EditorTopic } from './markdown-editor'

/* ------------------------------------------------------------------ */
/*  Markdown → HTML (for import)                                       */
/* ------------------------------------------------------------------ */

function markdownToHtml(md: string): string {
  let html = md

  // Code blocks (protect first)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<pre><code${lang ? ` class="language-${lang}"` : ''}>${escaped}</code></pre>`
  })

  // Headings
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>')

  // Blockquotes
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote><p>$1</p></blockquote>')

  // Task lists
  html = html.replace(/^- \[x\]\s+(.+)$/gm, '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>$1</p></li></ul>')
  html = html.replace(/^- \[ \]\s+(.+)$/gm, '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>$1</p></li></ul>')

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<ul><li><p>$1</p></li></ul>')

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<ol><li><p>$1</p></li></ol>')

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // Inline styles
  html = html.replace(/==(.*?)==/g, '<mark>$1</mark>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Paragraphs — wrap remaining plain lines
  html = html.replace(/^(?!<[a-z])((?!<).+)$/gm, '<p>$1</p>')

  // Merge adjacent same-type lists
  html = html.replace(/<\/ul>\s*<ul>/g, '')
  html = html.replace(/<\/ol>\s*<ol>/g, '')
  html = html.replace(/<\/ul>\s*<ul data-type="taskList">/g, '')

  return html
}

/* ------------------------------------------------------------------ */
/*  File helpers                                                       */
/* ------------------------------------------------------------------ */

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

function isMarkdownFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.mdx') || name.endsWith('.txt')
}

/* ------------------------------------------------------------------ */
/*  Topic Selector (inline, matches markdown-editor style)             */
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
/*  Toolbar button helper                                              */
/* ------------------------------------------------------------------ */

function ToolbarButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`rounded p-1.5 transition-colors ${
        active
          ? 'bg-slate-200/80 text-indigo-600'
          : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-800'
      }`}
    >
      {icon}
    </button>
  )
}

function ToolbarSeparator() {
  return <span className="mx-1 h-5 w-px bg-slate-200" />
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

interface RichTextEditorProps {
  topics: EditorTopic[]
  defaultTopicId?: string | null
  onPublish: (topicId: string, content: string) => Promise<void>
  onClose: () => void
}

export function RichTextEditor({ topics, defaultTopicId, onPublish, onClose }: RichTextEditorProps) {
  const [selectedTopicId, setSelectedTopicId] = useState(defaultTopicId || topics[0]?.topic_id || '')
  const [publishing, setPublishing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // we could use code-block-lowlight, but StarterKit's is fine for now
      }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      Image,
      TableExtension.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-slate prose-sm max-w-none outline-none min-h-full p-4 sm:p-6',
      },
    },
  })

  // Word count
  const wordCount = useMemo(() => {
    if (!editor) return { words: 0, chars: 0 }
    const text = editor.state.doc.textContent
    const trimmed = text.trim()
    if (!trimmed) return { words: 0, chars: 0 }
    const cjk = (trimmed.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length
    const words = trimmed.split(/\s+/).filter(Boolean).length
    return { words: words + cjk, chars: trimmed.length }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, editor?.state.doc.content])

  // Escape to close
  useEffect(() => {
    function handleEscape(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  // Toolbar actions
  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = prompt('Enter URL:', prev || 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }, [editor])

  const addImage = useCallback(() => {
    if (!editor) return
    const url = prompt('Enter image URL:')
    if (url) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }, [editor])

  const insertTable = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }, [editor])

  // Import
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    if (!isMarkdownFile(file)) {
      alert('Please select a Markdown file (.md, .markdown, .mdx, or .txt)')
      e.currentTarget.value = ''
      return
    }
    try {
      const text = await readFileAsText(file)
      const html = markdownToHtml(text)
      editor.chain().focus().insertContent(html).run()
    } catch {
      alert('Failed to read file')
    }
    e.currentTarget.value = ''
  }, [editor])

  // Save local
  const handleSaveLocal = useCallback(() => {
    if (!editor) return
    const html = editor.getHTML()
    if (!html.trim() || html === '<p></p>') return
    const defaultName = `draft-${new Date().toISOString().slice(0, 10)}.html`
    const filename = prompt('Save as:', defaultName)
    if (!filename) return
    const finalName = filename.endsWith('.html') || filename.endsWith('.htm') ? filename : `${filename}.html`
    const fullHtml = `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${finalName}</title></head><body>\n${html}\n</body></html>`
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = finalName
    a.click()
    URL.revokeObjectURL(url)
  }, [editor])

  // Publish
  const handlePublish = useCallback(async () => {
    if (!editor || !selectedTopicId) return
    const html = editor.getHTML()
    if (!html.trim() || html === '<p></p>') return
    setPublishing(true)
    try {
      await onPublish(selectedTopicId, html)
      editor.commands.clearContent()
      onClose()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }, [editor, selectedTopicId, onPublish, onClose])

  const hasContent = editor ? editor.state.doc.textContent.trim().length > 0 : false

  if (!editor) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <h2 className="text-base font-semibold text-slate-800">Rich Text Editor</h2>
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
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50/80 px-2 py-1.5">
        {/* Text formatting */}
        <ToolbarButton
          icon={<Bold className="h-4 w-4" />}
          label="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={<Italic className="h-4 w-4" />}
          label="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={<UnderlineIcon className="h-4 w-4" />}
          label="Underline"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          icon={<Strikethrough className="h-4 w-4" />}
          label="Strikethrough"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolbarButton
          icon={<Highlighter className="h-4 w-4" />}
          label="Highlight"
          active={editor.isActive('highlight')}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
        />

        <ToolbarSeparator />

        {/* Headings */}
        <ToolbarButton
          icon={<Heading1 className="h-4 w-4" />}
          label="Heading 1"
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolbarButton
          icon={<Heading2 className="h-4 w-4" />}
          label="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          icon={<Heading3 className="h-4 w-4" />}
          label="Heading 3"
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        />

        <ToolbarSeparator />

        {/* Lists */}
        <ToolbarButton
          icon={<List className="h-4 w-4" />}
          label="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={<ListOrdered className="h-4 w-4" />}
          label="Ordered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          icon={<ListChecks className="h-4 w-4" />}
          label="Task list"
          active={editor.isActive('taskList')}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        />

        <ToolbarSeparator />

        {/* Block elements */}
        <ToolbarButton
          icon={<Quote className="h-4 w-4" />}
          label="Blockquote"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          icon={<Code className="h-4 w-4" />}
          label="Inline code"
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
        <ToolbarButton
          icon={<Code2 className="h-4 w-4" />}
          label="Code block"
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />

        <ToolbarSeparator />

        {/* Link, Image, Table */}
        <ToolbarButton
          icon={<LinkIcon className="h-4 w-4" />}
          label="Link"
          active={editor.isActive('link')}
          onClick={setLink}
        />
        <ToolbarButton
          icon={<ImageIcon className="h-4 w-4" />}
          label="Image"
          onClick={addImage}
        />
        <ToolbarButton
          icon={<TableIcon className="h-4 w-4" />}
          label="Insert table (3×3)"
          onClick={insertTable}
        />

        <ToolbarSeparator />

        {/* Text align */}
        <ToolbarButton
          icon={<AlignLeft className="h-4 w-4" />}
          label="Align left"
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        />
        <ToolbarButton
          icon={<AlignCenter className="h-4 w-4" />}
          label="Align center"
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        />
        <ToolbarButton
          icon={<AlignRight className="h-4 w-4" />}
          label="Align right"
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        />

        <ToolbarSeparator />

        {/* Undo / Redo */}
        <ToolbarButton
          icon={<Undo2 className="h-4 w-4" />}
          label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
        />
        <ToolbarButton
          icon={<Redo2 className="h-4 w-4" />}
          label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
        />

        <ToolbarSeparator />

        {/* Import */}
        <ToolbarButton
          icon={<FileUp className="h-4 w-4" />}
          label="Import markdown file"
          onClick={handleImportClick}
        />
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-auto">
        <EditorContent editor={editor} className="h-full" />
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
            disabled={!hasContent}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Save
          </button>

          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing || !hasContent || !selectedTopicId}
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
