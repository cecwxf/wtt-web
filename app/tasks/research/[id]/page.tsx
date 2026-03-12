'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import dynamic from 'next/dynamic'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { normalizeAndFilterAgents } from '@/lib/agents'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

// ── Types ──────────────────────────────────────────────
interface Agent {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
}

interface Paper {
  id: string
  task_id: string
  title: string
  authors: string
  year: number | null
  journal: string
  doi: string
  abstract: string
  conclusion: string
  content_markdown?: string
  content_type: string
  source_url: string
  source_filename: string
  tags: string
  citation_count: number
  notes: string
  created_at: string
  updated_at: string
}

interface ChatMsg {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

// ── Helpers ────────────────────────────────────────────
const paperIcon = (type: string) => {
  const m: Record<string, string> = { pdf: '📕', md: '📝', markdown: '📝', bibtex: '📚', bib: '📚', txt: '📄', tex: '📐' }
  return m[type] || '📄'
}

const parseAuthors = (raw: string): string => {
  if (!raw) return ''
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.join(', ')
  } catch { /* ignore */ }
  return raw
}

// ── Main Component ─────────────────────────────────────
export default function ResearchTaskPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string

  // Agent
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')

  // Papers
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Center panel
  const [centerTab, setCenterTab] = useState<'read' | 'write' | 'export'>('read')
  const [readingLevel, setReadingLevel] = useState<1 | 2 | 3 | 4>(2)
  const [writeContent, setWriteContent] = useState('')

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Resize
  const [leftW, setLeftW] = useState(() => {
    if (typeof window !== 'undefined') return parseInt(localStorage.getItem('research-left-w') || '280') || 280
    return 280
  })
  const [rightW, setRightW] = useState(() => {
    if (typeof window !== 'undefined') return parseInt(localStorage.getItem('research-right-w') || '420') || 420
    return 420
  })
  const resizingRef = useRef<'left' | 'right' | null>(null)
  const resizeStartXRef = useRef(0)
  const resizeStartWRef = useRef(0)

  // Export state
  const [exportTemplate, setExportTemplate] = useState('academic')
  const [exporting, setExporting] = useState(false)

  // ── Drag-and-drop ────────────────────────────────────
  const [dragOver, setDragOver] = useState(false)

  // ── Data fetching ────────────────────────────────────
  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${session?.accessToken ?? ''}`,
  }), [session?.accessToken])

  const { data: task, mutate: mutateTask } = useSWR(
    session?.accessToken ? [`task-${taskId}`, session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}`, { headers: authHeaders() })
      if (!r.ok) return null
      return r.json()
    },
  )

  const { data: papersData, mutate: mutatePapers } = useSWR(
    session?.accessToken ? [`research-papers-${taskId}`, session.accessToken, searchQuery] : null,
    async () => {
      const q = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/papers?limit=200${q}`, { headers: authHeaders() })
      if (!r.ok) return { papers: [], total: 0 }
      return r.json()
    },
    { refreshInterval: 10000 },
  )

  const papers: Paper[] = useMemo(() => papersData?.papers || [], [papersData])

  const { data: selectedPaperFull } = useSWR(
    selectedPaperId && session?.accessToken ? [`paper-full-${selectedPaperId}`, session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/papers/${selectedPaperId}`, { headers: authHeaders() })
      if (!r.ok) return null
      return r.json()
    },
  )

  const { data: topicMessages, mutate: mutateMessages } = useSWR(
    task?.topic_id && session?.accessToken ? [`research-chat-${task.topic_id}`, session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/topics/${task.topic_id}/messages?limit=200&agent_id=${selectedAgentId}`, { headers: authHeaders() })
      if (!r.ok) return []
      return r.json()
    },
    { refreshInterval: 3000 },
  )

  // ── Effects ──────────────────────────────────────────
  useEffect(() => {
    if (!topicMessages) return
    const mapped: ChatMsg[] = topicMessages.map((m: Record<string, string>) => ({
      id: m.message_id,
      role: m.sender_id === selectedAgentId ? 'user' : 'assistant',
      content: m.content,
      timestamp: m.timestamp,
    }))
    setChatMessages(mapped)
  }, [topicMessages, selectedAgentId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const loadAgents = useCallback(async () => {
    const r = await fetch(`${CLIENT_WTT_API_BASE}/agents/my`, { headers: authHeaders() })
    if (!r.ok) return
    const data = await r.json()
    const list = normalizeAndFilterAgents(data)
    setAgents(list)
    if (list.length > 0 && !selectedAgentId) {
      setSelectedAgentId(list.find((a: Agent) => a.is_primary)?.agent_id || list[0].agent_id)
    }
  }, [selectedAgentId, authHeaders])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'authenticated') loadAgents()
  }, [status, router, loadAgents])

  // Resize persistence
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('research-left-w', String(leftW))
      localStorage.setItem('research-right-w', String(rightW))
    }
  }, [leftW, rightW])

  // Resize handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      const dx = e.clientX - resizeStartXRef.current
      if (resizingRef.current === 'left') {
        setLeftW(Math.max(200, Math.min(500, resizeStartWRef.current + dx)))
      } else {
        setRightW(Math.max(280, Math.min(700, resizeStartWRef.current - dx)))
      }
    }
    const onUp = () => {
      resizingRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const startResize = (which: 'left' | 'right', e: React.MouseEvent) => {
    resizingRef.current = which
    resizeStartXRef.current = e.clientX
    resizeStartWRef.current = which === 'left' ? leftW : rightW
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // ── Paper Upload ─────────────────────────────────────
  const uploadFiles = async (files: FileList | File[]) => {
    setUploading(true)
    for (const file of Array.from(files)) {
      try {
        const formData = new FormData()
        formData.append('file', file)
        const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/papers/upload`, {
          method: 'POST',
          headers: authHeaders(),
          body: formData,
        })
        if (!r.ok) {
          console.error('Upload failed:', await r.text())
          continue
        }
        const paper = await r.json()

        // Notify agent via task topic
        if (task?.topic_id) {
          const paperTitle = paper.title || file.name
          const paperUrl = paper.source_url || ''
          const paperDoi = paper.doi ? ` | DOI: ${paper.doi}` : ''
          const paperAuthors = paper.authors ? ` | Authors: ${parseAuthors(paper.authors)}` : ''
          const paperYear = paper.year ? ` (${paper.year})` : ''
          const msg = `[📄 Paper Imported] ${paperTitle}${paperYear}${paperAuthors}${paperDoi}\nFile: ${paperUrl}\n\nPlease analyze this paper and provide key insights.`

          await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/chat/send`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: msg,
              sender_type: 'HUMAN',
              semantic_type: 'post',
              auto_run: task?.status === 'todo',
              include_task_context: false,
            }),
          })
        }
      } catch (err) {
        console.error('Upload error:', err)
      }
    }
    setUploading(false)
    mutatePapers()
    mutateMessages()
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) uploadFiles(e.target.files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files)
  }

  // ── Delete paper ─────────────────────────────────────
  const deletePaper = async (paperId: string) => {
    if (!confirm('Delete this paper?')) return
    await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/papers/${paperId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    if (selectedPaperId === paperId) setSelectedPaperId(null)
    mutatePapers()
  }

  // ── Chat ─────────────────────────────────────────────
  const sendMessage = async (text?: string) => {
    const content = (text || chatInput).trim()
    if (!content || !task?.topic_id || sending) return
    setSending(true)
    if (!text) setChatInput('')

    // Attach selected paper context
    let fullContent = content
    if (selectedPaperFull && centerTab === 'read') {
      const ctx = `[Context Paper: ${selectedPaperFull.title || 'Untitled'}]\nURL: ${selectedPaperFull.source_url || 'N/A'}\n${selectedPaperFull.doi ? `DOI: ${selectedPaperFull.doi}` : ''}\n---\n`
      fullContent = ctx + content
    }

    try {
      await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/chat/send`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: fullContent,
          sender_type: 'HUMAN',
          semantic_type: 'post',
          auto_run: task?.status === 'todo',
        }),
      })
      mutateMessages()
    } catch { /* ignore */ } finally {
      setSending(false)
    }
  }

  // ── Quick actions (send to Agent) ────────────────────
  const quickAction = (action: string) => {
    const allPapersList = papers.map((p, i) => `${i + 1}. ${p.title || 'Untitled'} (${p.year || 'N/A'}) - URL: ${p.source_url}`).join('\n')

    const prompts: Record<string, string> = {
      summarize: selectedPaperFull
        ? `请总结这篇论文的核心内容：\n标题: ${selectedPaperFull.title}\nURL: ${selectedPaperFull.source_url}\n\n请提供：1) 研究问题 2) 方法 3) 主要发现 4) 贡献`
        : '请总结当前工作区中所有论文的核心内容。',
      review: `请基于以下论文生成一份文献综述：\n${allPapersList}\n\n请包括：1) 研究背景 2) 各论文核心观点 3) 方法对比 4) 研究空白 5) 未来方向`,
      compare: `请对比分析以下论文：\n${allPapersList}\n\n请从以下维度对比：1) 研究目标 2) 方法论 3) 数据集 4) 实验结果 5) 优缺点`,
      gap: `请分析以下论文集合中的研究空白：\n${allPapersList}\n\n请指出：1) 尚未解决的问题 2) 方法的局限 3) 潜在的研究方向`,
      translate: selectedPaperFull?.abstract
        ? `请将以下摘要翻译成中文，保留学术术语：\n\n${selectedPaperFull.abstract}`
        : '请帮我翻译选中论文的摘要。',
    }
    const prompt = prompts[action]
    if (prompt) sendMessage(prompt)
  }

  // ── Export ───────────────────────────────────────────
  const exportPptx = async () => {
    setExporting(true)
    try {
      // Collect latest agent content from chat for inclusion
      const agentMessages = chatMessages.filter(m => m.role === 'assistant').map(m => m.content).join('\n\n')
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/export/pptx`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: task?.title || 'Research Report',
          template: exportTemplate,
          include_content: agentMessages.slice(0, 20000) || undefined,
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(task?.title || 'research').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')}.pptx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`Export failed: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setExporting(false)
    }
  }

  const exportBibtex = async () => {
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/export/bibtex`, { headers: authHeaders() })
      if (!r.ok) throw new Error(await r.text())
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `research_${taskId.slice(0, 8)}.bib`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`Export failed: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  const exportMarkdown = () => {
    const content = writeContent || chatMessages.filter(m => m.role === 'assistant').map(m => m.content).join('\n\n---\n\n')
    if (!content) { alert('No content to export'); return }
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(task?.title || 'research').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Filtered papers ──────────────────────────────────
  const filteredPapers = useMemo(() => {
    if (!searchQuery) return papers
    const q = searchQuery.toLowerCase()
    return papers.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.authors || '').toLowerCase().includes(q) ||
      (p.journal || '').toLowerCase().includes(q) ||
      (p.tags || '').toLowerCase().includes(q)
    )
  }, [papers, searchQuery])

  // ── Render ───────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Top bar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/tasks')} className="text-sm text-indigo-500 hover:underline">← Tasks</button>
          <span className="text-sm font-semibold text-slate-700 max-w-[300px] truncate">{task?.title || 'Research Task'}</span>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">📄 Research</span>
          {task?.status && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              task.status === 'doing' ? 'bg-amber-100 text-amber-700' :
              task.status === 'done' ? 'bg-green-100 text-green-700' :
              task.status === 'cancelled' ? 'bg-red-100 text-red-600' :
              'bg-slate-100 text-slate-500'
            }`}>{task.status === 'doing' ? '⚡ Running' : task.status === 'done' ? '✅ Done' : task.status === 'cancelled' ? '🚫 Cancelled' : task.status}</span>
          )}
          {task?.status && task.status !== 'done' && task.status !== 'cancelled' && (
            <button
              onClick={async () => {
                if (!confirm('Cancel this task?')) return
                try {
                  const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/cancel`, {
                    method: 'POST', headers: authHeaders(),
                  })
                  if (!r.ok) throw new Error(await r.text())
                  await mutateTask()
                } catch (e) { alert(`Cancel failed: ${e instanceof Error ? e.message : 'unknown'}`) }
              }}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-50"
            >✕ Cancel</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">{papers.length} papers</span>
          {agents.length > 1 && (
            <select
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
            >
              {agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.display_name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Three-panel area */}
      <div className="flex flex-1 overflow-hidden">

        {/* ═══ LEFT: Library Panel ═══ */}
        <div className="flex flex-col border-r border-slate-200 overflow-hidden" style={{ width: leftW }}>
          {/* Search + Import */}
          <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
            <input
              className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
              placeholder="🔍 Search papers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="shrink-0 rounded bg-indigo-500 px-2 py-1 text-[11px] text-white hover:bg-indigo-600 disabled:opacity-50"
              title="Import PDF, Markdown, BibTeX"
            >
              {uploading ? '⏳' : '+ Import'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.md,.txt,.tex,.bib,.csv,.json,.xml"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          {/* Paper list */}
          <div
            className={`flex-1 overflow-y-auto p-1.5 ${dragOver ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-300' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {filteredPapers.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center p-4">
                {papers.length === 0 ? (
                  <>
                    <p className="text-4xl">📚</p>
                    <p className="text-sm text-slate-500">No papers yet</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-600"
                    >
                      Import Papers
                    </button>
                    <p className="text-[11px] text-slate-400">Drop PDF, MD, or BibTeX files here</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">No matching papers</p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredPapers.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => { setSelectedPaperId(p.id); setCenterTab('read') }}
                    className={`group cursor-pointer rounded-lg border p-2 transition-colors ${
                      selectedPaperId === p.id
                        ? 'border-indigo-300 bg-indigo-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-1.5">
                      <span className="mt-0.5 text-sm">{paperIcon(p.content_type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-slate-700 leading-tight line-clamp-2">{p.title || 'Untitled'}</p>
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                          {p.year && <span>{p.year}</span>}
                          {p.journal && <><span>·</span><span className="truncate max-w-[100px]">{p.journal}</span></>}
                          {p.citation_count > 0 && <><span>·</span><span>🔗{p.citation_count}</span></>}
                        </div>
                        {p.authors && (
                          <p className="mt-0.5 text-[10px] text-slate-400 truncate">{parseAuthors(p.authors)}</p>
                        )}
                        {p.tags && (
                          <div className="mt-1 flex flex-wrap gap-0.5">
                            {p.tags.split(',').filter(Boolean).map((t, i) => (
                              <span key={i} className="rounded bg-slate-100 px-1 py-0 text-[9px] text-slate-500">{t.trim()}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deletePaper(p.id) }}
                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 text-xs p-0.5"
                        title="Delete paper"
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Left resize handle */}
        <div
          className="w-[3px] shrink-0 cursor-col-resize hover:bg-indigo-400 transition-colors bg-transparent"
          onMouseDown={(e) => startResize('left', e)}
        />

        {/* ═══ CENTER: Reader / Writer / Export ═══ */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          {/* Tab bar */}
          <div className="flex h-9 items-center justify-between border-b border-slate-200 bg-slate-50 px-3">
            <div className="flex items-center gap-1">
              {(['read', 'write', 'export'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setCenterTab(tab)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    centerTab === tab ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab === 'read' ? '📖 Read' : tab === 'write' ? '✏️ Write' : '📤 Export'}
                </button>
              ))}
            </div>
            {centerTab === 'read' && selectedPaperFull && (
              <div className="flex items-center gap-1">
                {([1, 2, 3, 4] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setReadingLevel(l)}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      readingLevel >= l ? 'bg-indigo-100 text-indigo-600 font-medium' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    L{l}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Center content */}
          <div className="flex-1 overflow-y-auto">
            {centerTab === 'read' && (
              <div className="p-4">
                {selectedPaperFull ? (
                  <div className="max-w-4xl mx-auto space-y-4">
                    {/* L1: Metadata Card */}
                    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
                      <h1 className="text-lg font-bold text-slate-800 leading-snug">{selectedPaperFull.title || 'Untitled'}</h1>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-500">
                        {selectedPaperFull.authors && <span>👤 {parseAuthors(selectedPaperFull.authors)}</span>}
                        {selectedPaperFull.year && <span>📅 {selectedPaperFull.year}</span>}
                        {selectedPaperFull.journal && <span>📰 {selectedPaperFull.journal}</span>}
                        {selectedPaperFull.citation_count > 0 && <span>🔗 {selectedPaperFull.citation_count} citations</span>}
                      </div>
                      {selectedPaperFull.doi && (
                        <a href={`https://doi.org/${selectedPaperFull.doi}`} target="_blank" rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs text-indigo-500 hover:underline">
                          DOI: {selectedPaperFull.doi} ↗
                        </a>
                      )}
                      {selectedPaperFull.source_url && (
                        <a href={selectedPaperFull.source_url} target="_blank" rel="noopener noreferrer"
                          className="ml-3 mt-1 inline-block text-xs text-emerald-500 hover:underline">
                          📥 Download source file
                        </a>
                      )}
                      {selectedPaperFull.tags && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {selectedPaperFull.tags.split(',').filter(Boolean).map((t: string, i: number) => (
                            <span key={i} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-600">{t.trim()}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* L2: Abstract */}
                    {readingLevel >= 2 && selectedPaperFull.abstract && (
                      <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                        <h2 className="text-sm font-semibold text-blue-700 mb-2">📋 Abstract</h2>
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedPaperFull.abstract}</p>
                      </div>
                    )}

                    {/* L3: Conclusion */}
                    {readingLevel >= 3 && selectedPaperFull.conclusion && (
                      <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
                        <h2 className="text-sm font-semibold text-emerald-700 mb-2">🎯 Conclusion</h2>
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedPaperFull.conclusion}</p>
                      </div>
                    )}

                    {/* L4: Full text */}
                    {readingLevel >= 4 && selectedPaperFull.content_markdown && (
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <h2 className="text-sm font-semibold text-slate-600 mb-2">📄 Full Text</h2>
                        <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-700">
                          {selectedPaperFull.content_markdown}
                        </div>
                      </div>
                    )}

                    {/* Notes section */}
                    {readingLevel >= 2 && (
                      <div className="rounded-lg border border-amber-100 bg-amber-50/30 p-4">
                        <h2 className="text-sm font-semibold text-amber-700 mb-2">📝 Notes</h2>
                        <textarea
                          className="w-full rounded border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-amber-400 focus:outline-none"
                          rows={3}
                          placeholder="Add your notes about this paper..."
                          defaultValue={selectedPaperFull.notes || ''}
                          onBlur={async (e) => {
                            await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/research/papers/${selectedPaperId}`, {
                              method: 'PATCH',
                              headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                              body: JSON.stringify({ notes: e.target.value }),
                            })
                          }}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-400 min-h-[400px]">
                    <div className="text-center">
                      <p className="text-5xl">📖</p>
                      <p className="mt-3 text-sm">Select a paper to read</p>
                      <p className="mt-1 text-[11px]">L1 Metadata → L2 Abstract → L3 Conclusion → L4 Full Text</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {centerTab === 'write' && (
              <div className="flex flex-col h-full">
                <MonacoEditor
                  height="100%"
                  language="markdown"
                  theme="vs"
                  value={writeContent}
                  onChange={(v) => setWriteContent(v || '')}
                  options={{
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    fontSize: 14,
                    lineNumbers: 'off',
                    padding: { top: 16 },
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>
            )}

            {centerTab === 'export' && (
              <div className="p-6 max-w-2xl mx-auto space-y-6">
                <h2 className="text-lg font-bold text-slate-700">📤 Export Research</h2>

                {/* PPT Export */}
                <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700">📊 PowerPoint Presentation</h3>
                  <p className="text-xs text-slate-500">Generate a PPT from your papers and Agent analysis</p>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500">Template:</label>
                    <select
                      className="rounded border border-slate-200 px-2 py-1 text-xs"
                      value={exportTemplate}
                      onChange={(e) => setExportTemplate(e.target.value)}
                    >
                      <option value="academic">🎓 Academic</option>
                      <option value="business">💼 Business</option>
                      <option value="minimal">◻️ Minimal</option>
                    </select>
                  </div>
                  <button
                    onClick={exportPptx}
                    disabled={exporting || papers.length === 0}
                    className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-600 disabled:opacity-50"
                  >
                    {exporting ? '⏳ Generating...' : '⬇️ Download PPTX'}
                  </button>
                </div>

                {/* BibTeX Export */}
                <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700">📚 BibTeX</h3>
                  <p className="text-xs text-slate-500">Export reference list for LaTeX</p>
                  <button
                    onClick={exportBibtex}
                    disabled={papers.length === 0}
                    className="rounded-lg bg-emerald-500 px-4 py-2 text-sm text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    ⬇️ Download .bib
                  </button>
                </div>

                {/* Markdown Export */}
                <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700">📝 Markdown</h3>
                  <p className="text-xs text-slate-500">Export your writing or Agent responses as Markdown</p>
                  <button
                    onClick={exportMarkdown}
                    className="rounded-lg bg-slate-600 px-4 py-2 text-sm text-white hover:bg-slate-700"
                  >
                    ⬇️ Download .md
                  </button>
                </div>

                {/* Publish to Topic */}
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-indigo-700">🚀 Publish to Topic</h3>
                  <p className="text-xs text-slate-500">Share your research findings to a WTT topic</p>
                  <button
                    onClick={() => {
                      const content = writeContent || chatMessages.filter(m => m.role === 'assistant').map(m => m.content).join('\n\n')
                      if (!content) { alert('Write something first'); return }
                      // Copy to clipboard for now
                      navigator.clipboard.writeText(content)
                      alert('Content copied! Go to Feed → Write to publish.')
                    }}
                    className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-600"
                  >
                    📋 Copy & Publish
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right resize handle */}
        <div
          className="w-[3px] shrink-0 cursor-col-resize hover:bg-indigo-400 transition-colors bg-transparent"
          onMouseDown={(e) => startResize('right', e)}
        />

        {/* ═══ RIGHT: AI Chat Panel ═══ */}
        <div className="flex flex-col border-l border-slate-200 overflow-hidden" style={{ width: rightW }}>
          {/* Chat header */}
          <div className="flex h-9 items-center justify-between border-b border-slate-200 bg-slate-50 px-3">
            <span className="text-[11px] font-semibold text-slate-600">🤖 Research Assistant</span>
            {task?.runner_agent_id && (
              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-600 truncate max-w-[120px]">{task.runner_agent_id}</span>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-1 border-b border-slate-100 bg-slate-50/50 px-2 py-1.5">
            {[
              { key: 'summarize', label: '📋 Summarize', tip: 'Summarize selected paper' },
              { key: 'review', label: '📝 Literature Review', tip: 'Generate review from all papers' },
              { key: 'compare', label: '📊 Compare', tip: 'Compare all papers' },
              { key: 'gap', label: '🔍 Gap Analysis', tip: 'Find research gaps' },
              { key: 'translate', label: '🌐 Translate', tip: 'Translate abstract' },
            ].map(({ key, label, tip }) => (
              <button
                key={key}
                onClick={() => quickAction(key)}
                disabled={sending}
                title={tip}
                className="rounded bg-white border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {chatMessages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center text-slate-400 px-4">
                  <p className="text-4xl">🔬</p>
                  <p className="mt-2 text-sm">Import papers and ask your Agent</p>
                  <p className="mt-1 text-[11px]">Papers are uploaded to WTT server.<br/>Agent downloads and analyzes them.</p>
                </div>
              </div>
            )}
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'border border-indigo-200 bg-indigo-50/80 text-slate-800 rounded-tr-md'
                    : 'border border-slate-200 bg-white text-slate-700 rounded-tl-md'
                }`}>
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  <p className="mt-1 text-[10px] text-slate-400">{new Date(msg.timestamp).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-200 bg-slate-50 p-2.5">
            {selectedPaperFull && centerTab === 'read' && (
              <div className="mb-1.5 flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-600">
                <span>📎</span>
                <span className="truncate">{selectedPaperFull.title || 'Paper'}</span>
                <span className="text-slate-400 shrink-0">as context</span>
              </div>
            )}
            <div className="flex gap-1.5">
              <input
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                placeholder="Ask about your papers..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                disabled={sending}
              />
              <button
                onClick={() => sendMessage()}
                disabled={sending || !chatInput.trim()}
                className="rounded-lg bg-indigo-500 px-3 py-2 text-sm text-white disabled:opacity-50 hover:bg-indigo-600"
              >
                {sending ? '...' : '↑'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
