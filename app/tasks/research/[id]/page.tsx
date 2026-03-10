'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { normalizeAndFilterAgents } from '@/lib/agents'

interface Agent {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
}

interface DocFile {
  name: string
  type: string
  size: number
  content: string
  url?: string
}

interface ChatMsg {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ResearchTaskPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string

  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [documents, setDocuments] = useState<DocFile[]>([])
  const [selectedDoc, setSelectedDoc] = useState<DocFile | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: task } = useSWR(
    session?.accessToken ? [`task-${taskId}`, session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!r.ok) return null
      return r.json()
    },
  )

  const { data: topicMessages, mutate: mutateMessages } = useSWR(
    task?.topic_id && session?.accessToken ? [`research-chat-${task.topic_id}`, session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/topics/${task.topic_id}/messages?limit=200&agent_id=${selectedAgentId}`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!r.ok) return []
      return r.json()
    },
    { refreshInterval: 3000 },
  )

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
    const r = await fetch(`${CLIENT_WTT_API_BASE}/agents/my`, {
      headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
    })
    if (!r.ok) return
    const data = await r.json()
    const list = normalizeAndFilterAgents(data)
    setAgents(list)
    if (list.length > 0 && !selectedAgentId) {
      setSelectedAgentId(list.find((a: Agent) => a.is_primary)?.agent_id || list[0].agent_id)
    }
  }, [session?.accessToken, selectedAgentId])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'authenticated') loadAgents()
  }, [status, router, loadAgents])

  // ── Import Document ────────────────────────────────
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    setUploading(true)

    for (const file of Array.from(files)) {
      try {
        let content = ''
        const ext = file.name.split('.').pop()?.toLowerCase() || ''

        if (['txt', 'md', 'markdown', 'csv', 'json', 'xml', 'bib', 'tex'].includes(ext)) {
          content = await file.text()
        } else if (ext === 'pdf') {
          content = `[PDF Document: ${file.name}] (${formatSize(file.size)})\n\nPDF content extraction requires server-side processing. The file has been imported for reference.`
        } else {
          content = `[Document: ${file.name}] (${formatSize(file.size)})`
        }

        // Upload to WTT media API if topic exists
        let url = ''
        if (task?.topic_id) {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('agent_id', selectedAgentId || 'research-agent')
          const uploadResp = await fetch(`${CLIENT_WTT_API_BASE}/media/upload`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` },
            body: formData,
          })
          if (uploadResp.ok) {
            const uploadData = await uploadResp.json()
            url = uploadData.url || uploadData.file_url || ''
          }
        }

        setDocuments((prev) => [...prev, {
          name: file.name,
          type: ext,
          size: file.size,
          content,
          url,
        }])
      } catch (err) {
        console.error('Import failed:', err)
      }
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Send message ───────────────────────────────────
  const sendMessage = async () => {
    const text = chatInput.trim()
    if (!text || !task?.topic_id || sending) return
    setSending(true)

    // Build context from selected document
    let fullContent = text
    if (selectedDoc) {
      const docSnippet = selectedDoc.content.slice(0, 6000)
      fullContent = `[Research Document: ${selectedDoc.name}]\n${docSnippet}\n\n---\n${text}`
    }

    setChatInput('')
    try {
      await fetch(`${CLIENT_WTT_API_BASE}/topics/${task.topic_id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.accessToken ?? ''}`,
        },
        body: JSON.stringify({
          sender_id: selectedAgentId,
          content: fullContent,
          content_type: 'text',
          semantic_type: 'post',
        }),
      })
      mutateMessages()
    } catch {
      // ignore
    } finally {
      setSending(false)
    }
  }

  // ── Quick action: generate report ──────────────────
  const generateReport = async () => {
    if (!task?.topic_id || documents.length === 0) return
    setSending(true)
    const docList = documents.map((d) => `- ${d.name} (${d.type}, ${formatSize(d.size)})`).join('\n')
    const docContents = documents.map((d) => `## ${d.name}\n${d.content.slice(0, 3000)}`).join('\n\n')
    const prompt = `请根据以下导入的研究文献生成一份分析报告，包括：\n1. 文献概述\n2. 核心观点总结\n3. 关键发现\n4. 研究方法对比\n5. 结论与建议\n\n导入文献列表：\n${docList}\n\n文献内容：\n${docContents}`

    try {
      await fetch(`${CLIENT_WTT_API_BASE}/topics/${task.topic_id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.accessToken ?? ''}`,
        },
        body: JSON.stringify({
          sender_id: selectedAgentId,
          content: prompt,
          content_type: 'text',
          semantic_type: 'post',
        }),
      })
      mutateMessages()
    } catch {
      // ignore
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Top bar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/tasks')} className="text-sm text-indigo-500 hover:underline">← Tasks</button>
          <span className="text-sm font-semibold text-slate-700">{task?.title || 'Research Task'}</span>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">📄 Research</span>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Document panel */}
        <div className="flex w-[50%] flex-col border-r border-slate-200">
          {/* Document toolbar */}
          <div className="flex h-10 items-center justify-between border-b border-slate-200 bg-slate-50 px-3">
            <span className="text-xs font-semibold text-slate-600">Documents ({documents.length})</span>
            <div className="flex gap-2">
              <button
                onClick={generateReport}
                disabled={documents.length === 0 || sending}
                className="rounded bg-emerald-500 px-2 py-1 text-[11px] text-white disabled:opacity-50"
              >
                📊 Generate Report
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded bg-indigo-500 px-2 py-1 text-[11px] text-white disabled:opacity-50"
              >
                {uploading ? 'Importing...' : '+ Import'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.md,.txt,.csv,.json,.tex,.bib,.docx,.xml"
                className="hidden"
                onChange={handleFileImport}
              />
            </div>
          </div>

          {/* Document list + preview */}
          <div className="flex flex-1 overflow-hidden">
            {/* Doc list */}
            <div className="w-56 shrink-0 overflow-y-auto border-r border-slate-100 bg-slate-50/50 p-2">
              {documents.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <p className="text-3xl">📄</p>
                  <p className="text-sm text-slate-500">No documents</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white"
                  >
                    Import Files
                  </button>
                  <p className="mt-1 text-[11px] text-slate-400">PDF, Markdown, TXT, CSV, TeX</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {documents.map((doc, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedDoc(doc)}
                      className={`w-full rounded-lg border p-2 text-left text-[12px] ${
                        selectedDoc?.name === doc.name ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <p className="truncate font-medium text-slate-700">{doc.name}</p>
                      <p className="text-[10px] text-slate-400">{doc.type.toUpperCase()} · {formatSize(doc.size)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Doc preview */}
            <div className="flex-1 overflow-y-auto p-4">
              {selectedDoc ? (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700">{selectedDoc.name}</h3>
                    {selectedDoc.url && (
                      <a href={selectedDoc.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:underline">
                        Download ↗
                      </a>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-700">
                    {selectedDoc.content}
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-slate-400">
                  <div className="text-center">
                    <p className="text-4xl">📖</p>
                    <p className="mt-2 text-sm">Select a document to preview</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Chat panel */}
        <div className="flex flex-1 flex-col">
          <div className="flex h-10 items-center justify-between border-b border-slate-200 bg-slate-50 px-3">
            <span className="text-xs font-semibold text-slate-600">Research Assistant</span>
            {task?.runner_agent_id && (
              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-600">{task.runner_agent_id}</span>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {chatMessages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center text-slate-400">
                  <p className="text-3xl">🔬</p>
                  <p className="mt-2 text-sm">Ask questions about your research</p>
                  <p className="mt-1 text-[11px]">Import documents and let the agent analyze them</p>
                </div>
              </div>
            )}
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
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
          <div className="border-t border-slate-200 bg-slate-50 p-3">
            {selectedDoc && (
              <div className="mb-2 flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-600">
                <span>📎</span>
                <span className="truncate">{selectedDoc.name}</span>
                <span className="text-slate-400">as context</span>
                <button onClick={() => setSelectedDoc(null)} className="ml-auto text-slate-400 hover:text-red-500">×</button>
              </div>
            )}
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                placeholder="Ask about research..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                disabled={sending}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !chatInput.trim()}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {sending ? '...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
