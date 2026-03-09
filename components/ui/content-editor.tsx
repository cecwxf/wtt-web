'use client'

import { useState } from 'react'
import { FileText, Type } from 'lucide-react'
import { MarkdownEditor, type EditorTopic } from './markdown-editor'
import { RichTextEditor } from './rich-text-editor'

export type EditorMode = 'markdown' | 'richtext'

interface ContentEditorProps {
  topics: EditorTopic[]
  defaultTopicId?: string | null
  onPublish: (topicId: string, content: string) => Promise<void>
  onClose: () => void
}

const MODES: { key: EditorMode; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'markdown', label: 'Markdown', icon: <FileText className="h-4 w-4" />, desc: 'Obsidian-style markdown with live preview' },
  { key: 'richtext', label: 'Rich Text', icon: <Type className="h-4 w-4" />, desc: 'WYSIWYG editor with formatting toolbar' },
]

export function ContentEditor({ topics, defaultTopicId, onPublish, onClose }: ContentEditorProps) {
  const [mode, setMode] = useState<EditorMode | null>(null)

  // Once a mode is selected, render the corresponding editor
  if (mode === 'markdown') {
    return (
      <MarkdownEditor
        topics={topics}
        defaultTopicId={defaultTopicId}
        onPublish={onPublish}
        onClose={onClose}
      />
    )
  }

  if (mode === 'richtext') {
    return (
      <RichTextEditor
        topics={topics}
        defaultTopicId={defaultTopicId}
        onPublish={onPublish}
        onClose={onClose}
      />
    )
  }

  // Mode selector screen
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        <h2 className="text-xl font-semibold text-slate-800">Choose Editor</h2>
        <p className="mt-1 text-sm text-slate-500">Select the editor type for your content</p>

        <div className="mt-6 grid grid-cols-2 gap-4">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className="group flex flex-col items-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-4 py-6 text-center transition-all hover:border-indigo-400 hover:bg-indigo-50/50 hover:shadow-md"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-indigo-100 group-hover:text-indigo-600">
                {m.icon}
              </div>
              <div>
                <p className="font-semibold text-slate-800 group-hover:text-indigo-700">{m.label}</p>
                <p className="mt-0.5 text-xs text-slate-400">{m.desc}</p>
              </div>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-500 transition hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
