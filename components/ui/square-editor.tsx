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
  ImageIcon,
  Table as TableIcon,
  Minus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  FileUp,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import LinkExt from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { Table as TableExtension } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'

const CLIENT_WTT_API_BASE = '/api/wtt'
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

/* ------------------------------------------------------------------ */
/*  Markdown → HTML converter                                          */
/* ------------------------------------------------------------------ */

function markdownToHtml(md: string): string {
  let html = md

  // Code blocks (protect first)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<pre><code${lang ? ` class="language-${lang}"` : ''}>${escaped}</code></pre>`
  })

  // Tables (GFM)
  html = html.replace(
    /^(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_m, headerRow: string, _sep: string, bodyRows: string) => {
      const headers = headerRow.split('|').filter(Boolean).map((c: string) => c.trim())
      const hCells = headers.map((h: string) => `<th><p>${h}</p></th>`).join('')
      const rows = bodyRows.trim().split('\n').map((row: string) => {
        const cells = row.split('|').filter(Boolean).map((c: string) => c.trim())
        return `<tr>${cells.map((c: string) => `<td><p>${c}</p></td>`).join('')}</tr>`
      }).join('')
      return `<table><thead><tr>${hCells}</tr></thead><tbody>${rows}</tbody></table>`
    }
  )

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
  html = html.replace(/^[-*+]\s+(.+)$/gm, '<ul><li><p>$1</p></li></ul>')

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

/** Detect if plain text looks like markdown */
function looksLikeMarkdown(text: string): boolean {
  const indicators = [
    /^#{1,6}\s/m,                       // headings
    /^\s*[-*+]\s/m,                     // unordered lists
    /^\d+\.\s/m,                        // ordered lists
    /\*\*.+?\*\*/,                      // bold
    /\[.+?\]\(.+?\)/,                   // links
    /^>\s/m,                            // blockquotes
    /```[\s\S]*?```/,                   // code blocks
    /^\|.+\|$/m,                        // tables
    /^---$/m,                           // horizontal rules
    /^- \[[ x]\]/m,                     // task lists
  ]
  let score = 0
  for (const re of indicators) {
    if (re.test(text)) score++
  }
  return score >= 2
}

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

function isDocxFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

/* ------------------------------------------------------------------ */
/*  Image upload: sign → PUT → commit → insert into editor             */
/* ------------------------------------------------------------------ */

async function uploadImage(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`文件过大，最大 100MB，当前 ${(file.size / (1024 * 1024)).toFixed(1)}MB`)
  }

  const signRes = await fetch(`${CLIENT_WTT_API_BASE}/media/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, mime_type: file.type, size: file.size }),
  })
  if (!signRes.ok) throw new Error(await signRes.text().catch(() => `签名失败: ${signRes.status}`))
  const signed = await signRes.json()

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(xhr.responseText || `上传失败: ${xhr.status}`))
    })
    xhr.addEventListener('error', () => reject(new Error('上传失败')))
    xhr.open('PUT', `${CLIENT_WTT_API_BASE}${signed.upload_url}`)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.send(file)
  })

  const commitRes = await fetch(`${CLIENT_WTT_API_BASE}/media/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_token: signed.upload_token }),
  })
  if (!commitRes.ok) throw new Error(await commitRes.text().catch(() => `提交失败: ${commitRes.status}`))
  const asset = await commitRes.json()
  return asset.url as string
}

/* ------------------------------------------------------------------ */
/*  Toolbar button                                                     */
/* ------------------------------------------------------------------ */

function Btn({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded p-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active
          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200'
      }`}
    >
      {icon}
    </button>
  )
}

function Sep() {
  return <span className="mx-0.5 h-4 w-px bg-gray-200 dark:bg-gray-600" />
}

/* ------------------------------------------------------------------ */
/*  SquareEditor — rich Tiptap editor with markdown/docx support       */
/* ------------------------------------------------------------------ */

interface SquareEditorProps {
  /** 'full' = compose page (tall, full toolbar); 'mini' = reply (short, compact toolbar) */
  variant?: 'full' | 'mini'
  placeholder?: string
  /** Initial HTML content */
  initialContent?: string
  /** Called when content changes. Returns HTML string. */
  onChange?: (html: string) => void
  /** Expose helpers for parent controls */
  onReady?: (helpers: {
    getHTML: () => string
    isEmpty: () => boolean
    clear: () => void
    insertText: (text: string) => void
    focus: () => void
    openImagePicker: () => void
  }) => void
  className?: string
}

export function SquareEditor({
  variant = 'full',
  placeholder = '输入内容…',
  initialContent,
  onChange,
  onReady,
  className,
}: SquareEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [importing, setImporting] = useState(false)
  // Ref to access editor instance inside paste/drop handlers (avoids closure stale ref)
  const editorRef = useRef<Editor | null>(null) as React.MutableRefObject<Editor | null>

  const isMini = variant === 'mini'
  const sz = isMini ? 'h-3.5 w-3.5' : 'h-4 w-4'

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      LinkExt.configure({ openOnClick: false }),
      Image,
      TableExtension.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: initialContent || '',
    editorProps: {
      attributes: {
        class: isMini
          ? 'prose prose-sm dark:prose-invert max-w-none outline-none px-3 py-3 min-h-[360px] [&_table]:border-collapse [&_table]:w-full [&_th]:border [&_th]:border-slate-300 [&_th]:dark:border-zinc-600 [&_th]:px-3 [&_th]:py-2 [&_th]:bg-slate-100 [&_th]:dark:bg-zinc-800 [&_td]:border [&_td]:border-slate-300 [&_td]:dark:border-zinc-600 [&_td]:px-3 [&_td]:py-2'
          : 'prose prose-base dark:prose-invert max-w-none outline-none px-4 py-4 min-h-[820px] [&_table]:border-collapse [&_table]:w-full [&_th]:border [&_th]:border-slate-300 [&_th]:dark:border-zinc-600 [&_th]:px-3 [&_th]:py-2 [&_th]:bg-slate-100 [&_th]:dark:bg-zinc-800 [&_td]:border [&_td]:border-slate-300 [&_td]:dark:border-zinc-600 [&_td]:px-3 [&_td]:py-2',
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files
        if (files && files.length > 0) {
          const imageFile = Array.from(files).find(f => f.type.startsWith('image/'))
          if (imageFile) {
            event.preventDefault()
            handleImageUpload(imageFile)
            return true
          }
        }
        return false
      },
      handlePaste: (_view, event) => {
        // Image paste
        const files = event.clipboardData?.files
        if (files && files.length > 0) {
          const imageFile = Array.from(files).find(f => f.type.startsWith('image/'))
          if (imageFile) {
            event.preventDefault()
            handleImageUpload(imageFile)
            return true
          }
        }
        // Markdown paste: if plain text looks like markdown, convert to rich content
        const plainText = event.clipboardData?.getData('text/plain') || ''
        const hasHtml = event.clipboardData?.types.includes('text/html')
        if (plainText && !hasHtml && looksLikeMarkdown(plainText)) {
          event.preventDefault()
          const html = markdownToHtml(plainText)
          editorRef.current?.chain().focus().insertContent(html).run()
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getHTML())
    },
  })

  // Keep ref in sync for paste/drop handlers
  editorRef.current = editor

  // Expose helpers to parent
  useEffect(() => {
    if (editor && onReady) {
      onReady({
        getHTML: () => editor.getHTML(),
        isEmpty: () => {
          const text = editor.state.doc.textContent.trim()
          return text.length === 0 && !editor.getHTML().includes('<img')
        },
        clear: () => editor.commands.clearContent(),
        insertText: (text: string) => {
          editor.chain().focus().insertContent(text).run()
        },
        focus: () => {
          editor.chain().focus().run()
        },
        openImagePicker: () => {
          imageInputRef.current?.click()
        },
      })
    }
  }, [editor, onReady])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleImageUpload = useCallback(async (file: File) => {
    if (!editor || uploading) return
    setUploading(true)
    try {
      const url = await uploadImage(file)
      editor.chain().focus().setImage({ src: url, alt: file.name }).run()
    } catch (e) {
      alert(e instanceof Error ? e.message : '图片上传失败')
    } finally {
      setUploading(false)
    }
  }, [editor, uploading])

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = prompt('输入链接地址:', prev || 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }, [editor])

  const insertTable = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }, [editor])

  // File import handler (markdown + docx)
  const handleImport = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    e.currentTarget.value = ''

    if (isDocxFile(file)) {
      setImporting(true)
      try {
        const arrayBuffer = await file.arrayBuffer()
        const mammoth = await import('mammoth')
        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            // Strip base64 images to avoid bloating the DB
            convertImage: mammoth.images.imgElement(() => {
              return Promise.resolve({ src: '' })
            }),
          }
        )
        if (result.value) {
          // Remove empty img tags from stripped images
          const cleaned = result.value.replace(/<img[^>]*src=""[^>]*>/g, '')
          editor.chain().focus().insertContent(cleaned).run()
        }
      } catch {
        alert('DOCX导入失败，请检查文件格式')
      } finally {
        setImporting(false)
      }
    } else if (isMarkdownFile(file)) {
      setImporting(true)
      try {
        const text = await readFileAsText(file)
        const html = markdownToHtml(text)
        editor.chain().focus().insertContent(html).run()
      } catch {
        alert('文件读取失败')
      } finally {
        setImporting(false)
      }
    } else {
      alert('支持导入 Markdown (.md) 和 Word (.docx) 文件')
    }
  }, [editor])

  if (!editor) return null

  return (
    <div className={`border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700 ${className || ''}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 px-2 py-1">
        {/* Text formatting */}
        <Btn icon={<Bold className={sz} />} label="粗体" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <Btn icon={<Italic className={sz} />} label="斜体" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <Btn icon={<UnderlineIcon className={sz} />} label="下划线" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <Btn icon={<Strikethrough className={sz} />} label="删除线" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
        {!isMini && (
          <Btn icon={<Highlighter className={sz} />} label="高亮" active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} />
        )}

        <Sep />

        {/* Headings */}
        {!isMini && (
          <>
            <Btn icon={<Heading1 className={sz} />} label="标题1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
            <Btn icon={<Heading2 className={sz} />} label="标题2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
            <Btn icon={<Heading3 className={sz} />} label="标题3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
            <Sep />
          </>
        )}

        {/* Lists */}
        <Btn icon={<List className={sz} />} label="无序列表" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <Btn icon={<ListOrdered className={sz} />} label="有序列表" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        {!isMini && (
          <Btn icon={<ListChecks className={sz} />} label="任务列表" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} />
        )}

        {!isMini && (
          <>
            <Sep />
            {/* Block elements */}
            <Btn icon={<Quote className={sz} />} label="引用" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
            <Btn icon={<Code className={sz} />} label="行内代码" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
            <Btn icon={<Code2 className={sz} />} label="代码块" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
            <Btn icon={<Minus className={sz} />} label="分割线" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
          </>
        )}

        <Sep />

        {/* Insert: link, image, table */}
        <Btn icon={<LinkIcon className={sz} />} label="链接" active={editor.isActive('link')} onClick={setLink} />
        <Btn
          icon={uploading ? <span className="animate-spin text-xs">⏳</span> : <ImageIcon className={sz} />}
          label="插入图片"
          onClick={() => imageInputRef.current?.click()}
        />
        {!isMini && (
          <Btn icon={<TableIcon className={sz} />} label="插入表格 (3×3)" onClick={insertTable} />
        )}

        {!isMini && (
          <>
            <Sep />
            {/* Text alignment */}
            <Btn icon={<AlignLeft className={sz} />} label="居左" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
            <Btn icon={<AlignCenter className={sz} />} label="居中" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
            <Btn icon={<AlignRight className={sz} />} label="居右" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
          </>
        )}

        <Sep />

        {/* Undo/Redo */}
        <Btn icon={<Undo2 className={sz} />} label="撤销" onClick={() => editor.chain().focus().undo().run()} />
        <Btn icon={<Redo2 className={sz} />} label="重做" onClick={() => editor.chain().focus().redo().run()} />

        {/* Import */}
        {!isMini && (
          <>
            <Sep />
            <Btn
              icon={importing ? <span className="animate-spin text-xs">⏳</span> : <FileUp className={sz} />}
              label="导入文件 (Markdown / Word)"
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
            />
          </>
        )}

        {uploading && <span className="ml-2 text-xs text-blue-500 animate-pulse">上传图片中…</span>}
        {importing && <span className="ml-2 text-xs text-green-500 animate-pulse">导入中…</span>}
      </div>

      {/* Editor area */}
      <EditorContent editor={editor} />

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImageUpload(f)
          e.currentTarget.value = ''
        }}
      />
      <input
        ref={importInputRef}
        type="file"
        accept=".md,.markdown,.mdx,.txt,.docx"
        className="hidden"
        onChange={handleImport}
      />
    </div>
  )
}
