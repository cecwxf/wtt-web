'use client'

import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  ImageIcon,
  Undo2,
  Redo2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import LinkExt from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'

const CLIENT_WTT_API_BASE = '/api/wtt'
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

/* ------------------------------------------------------------------ */
/*  Image upload: sign → PUT → commit → insert into editor             */
/* ------------------------------------------------------------------ */

async function uploadImage(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`文件过大，最大 100MB，当前 ${(file.size / (1024 * 1024)).toFixed(1)}MB`)
  }

  // Step 1: Sign
  const signRes = await fetch(`${CLIENT_WTT_API_BASE}/media/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, mime_type: file.type, size: file.size }),
  })
  if (!signRes.ok) throw new Error(await signRes.text().catch(() => `签名失败: ${signRes.status}`))
  const signed = await signRes.json()

  // Step 2: Upload
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

  // Step 3: Commit
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
      className={`rounded p-1 transition-colors ${
        active
          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200'
      }`}
    >
      {icon}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  SquareEditor — reusable Tiptap editor with image upload            */
/* ------------------------------------------------------------------ */

interface SquareEditorProps {
  /** 'full' = compose page (tall, full toolbar); 'mini' = reply (short, compact toolbar) */
  variant?: 'full' | 'mini'
  placeholder?: string
  /** Initial HTML content */
  initialContent?: string
  /** Called when content changes. Returns HTML string. */
  onChange?: (html: string) => void
  /** Expose the getHTML helper for parent to read content on demand */
  onReady?: (helpers: { getHTML: () => string; isEmpty: () => boolean; clear: () => void }) => void
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const isMini = variant === 'mini'
  const sz = isMini ? 'h-3.5 w-3.5' : 'h-4 w-4'

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Highlight,
      LinkExt.configure({ openOnClick: false }),
      Image,
      Placeholder.configure({ placeholder }),
      Underline,
    ],
    content: initialContent || '',
    editorProps: {
      attributes: {
        class: isMini
          ? 'prose prose-sm dark:prose-invert max-w-none outline-none px-3 py-2 min-h-[160px]'
          : 'prose prose-sm dark:prose-invert max-w-none outline-none px-4 py-4 min-h-[480px]',
      },
      // Handle pasted/dropped images
      handleDrop: (view, event) => {
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
      handlePaste: (view, event) => {
        const files = event.clipboardData?.files
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
    },
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getHTML())
    },
  })

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
      })
    }
  }, [editor, onReady])

  // Image upload handler
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

  if (!editor) return null

  return (
    <div className={`border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700 ${className || ''}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 px-2 py-1">
        <Btn icon={<Bold className={sz} />} label="粗体" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <Btn icon={<Italic className={sz} />} label="斜体" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <Btn icon={<UnderlineIcon className={sz} />} label="下划线" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <Btn icon={<Strikethrough className={sz} />} label="删除线" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />

        <span className="mx-0.5 h-4 w-px bg-gray-200 dark:bg-gray-600" />

        {!isMini && (
          <>
            <Btn icon={<Heading2 className={sz} />} label="标题2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
            <Btn icon={<Heading3 className={sz} />} label="标题3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
            <span className="mx-0.5 h-4 w-px bg-gray-200 dark:bg-gray-600" />
          </>
        )}

        <Btn icon={<List className={sz} />} label="无序列表" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <Btn icon={<ListOrdered className={sz} />} label="有序列表" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />

        {!isMini && (
          <>
            <Btn icon={<Quote className={sz} />} label="引用" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
            <Btn icon={<Code className={sz} />} label="代码" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
          </>
        )}

        <span className="mx-0.5 h-4 w-px bg-gray-200 dark:bg-gray-600" />

        <Btn icon={<LinkIcon className={sz} />} label="链接" active={editor.isActive('link')} onClick={setLink} />
        <Btn
          icon={uploading ? <span className="animate-spin text-xs">⏳</span> : <ImageIcon className={sz} />}
          label="插入图片"
          onClick={() => fileInputRef.current?.click()}
        />

        {!isMini && (
          <>
            <span className="mx-0.5 h-4 w-px bg-gray-200 dark:bg-gray-600" />
            <Btn icon={<Undo2 className={sz} />} label="撤销" onClick={() => editor.chain().focus().undo().run()} />
            <Btn icon={<Redo2 className={sz} />} label="重做" onClick={() => editor.chain().focus().redo().run()} />
          </>
        )}

        {uploading && <span className="ml-2 text-xs text-blue-500 animate-pulse">上传中…</span>}
      </div>

      {/* Editor area */}
      <EditorContent editor={editor} />

      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImageUpload(f)
          e.currentTarget.value = ''
        }}
      />
    </div>
  )
}
