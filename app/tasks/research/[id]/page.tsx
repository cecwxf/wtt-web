'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { normalizeAndFilterAgents } from '@/lib/agents'
import { ChatFileUpload, FileAttachmentPreview, stripFileTokens, PendingAttachments } from '@/components/ui/chat-file-upload'
import { isDesktop, pickLocalFiles, readLocalFile, pickAndScanFolder, indexLocalProject } from '@/lib/desktop'
import { FileTreePanel, scannedToFileNodes, type FileNode } from '@/components/ui/file-tree'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { TaskAgentSidebar } from '@/components/ui/task-agent-sidebar'
import { stripMetaBlocks, isProgressMessage } from '@/components/ui/chat-view'
import { useAgentId, buildAgentUrl } from '@/lib/hooks/use-agent-id'
import { formatTime } from '@/lib/time'

// ── Types ──────────────────────────────────────────────
interface Agent { id: string; agent_id: string; display_name: string; is_primary: boolean }
interface ChatMsg {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  sender_display_name?: string
}

const isMarkdownFile = (p: string) => /\.(md|mdx|markdown)$/i.test(p)
const isBinaryFile = (p: string) => /\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|pdf|zip|tar|gz|exe|dll|so|dylib|wasm|mp[34]|mov|avi|webm)$/i.test(p)

// ── Page ───────────────────────────────────────────────
export default function ResearchTaskPageWrapper() {
  return <Suspense fallback={null}><ResearchTaskPageInner /></Suspense>
}

function ResearchTaskPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string

  // Desktop-only guard
  useEffect(() => {
    if (typeof window !== 'undefined' && !isDesktop()) router.replace('/tasks')
  }, [router])

  // ── State ──────────────────────────────────────────
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useAgentId()

  // File tree
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [localProjectRoot, setLocalProjectRoot] = useState<string | null>(null)
  const [projectIndexed, setProjectIndexed] = useState(false)

  // File viewer
  const [viewingFile, setViewingFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [fileLoading, setFileLoading] = useState(false)

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<string[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Layout
  const [leftWidth, setLeftWidth] = useState(380)
  const resizingRef = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartW = useRef(0)

  // ── Auth + Data fetching ───────────────────────────
  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${session?.accessToken ?? ''}`,
  }), [session?.accessToken])

  const { data: task } = useSWR(
    session?.accessToken ? [`task-${taskId}`, session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}`, { headers: authHeaders() })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
  )

  const { data: topicMessages, mutate: mutateMessages } = useSWR(
    task?.topic_id && session?.accessToken ? [`research-chat-${task.topic_id}`, session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/topics/${task.topic_id}/messages?limit=200&agent_id=${selectedAgentId}`, { headers: authHeaders() })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
    { refreshInterval: 5000, keepPreviousData: true },
  )

  // ── Effects ────────────────────────────────────────
  useEffect(() => {
    if (!topicMessages) return
    const mapped: ChatMsg[] = topicMessages
      .filter((m: Record<string, string>) => {
        if (!m.content) return false
        if ((m.semantic_type || '').toUpperCase() === 'PROJECT_INDEX') return false
        return true
      })
      .map((m: Record<string, string>) => ({
        id: m.message_id,
        role: m.sender_id === selectedAgentId ? 'user' : 'assistant',
        content: m.content,
        timestamp: m.timestamp,
        sender_display_name: m.sender_display_name || agents.find(a => a.agent_id === m.sender_id)?.display_name || m.sender_id,
      }))
    setChatMessages(mapped)
  }, [topicMessages, selectedAgentId, agents])

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
  }, [selectedAgentId, authHeaders, setSelectedAgentId])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'authenticated') loadAgents()
  }, [status, router, loadAgents])

  // ── Open Folder ────────────────────────────────────
  const openFolder = async () => {
    const result = await pickAndScanFolder('Open folder for research')
    if (!result || result.files.length === 0) return
    const tree = scannedToFileNodes(result.files)
    setFileTree(tree)
    setLocalProjectRoot(result.path)
    setViewingFile(null)
    setFileContent('')
    if (selectedAgentId) {
      indexLocalProject(taskId, selectedAgentId, result.path, result.files, CLIENT_WTT_API_BASE, {
        Authorization: `Bearer ${session?.accessToken ?? ''}`
      }).then(r => { if (r.ok) setProjectIndexed(true) }).catch(() => {})
    }
  }

  // ── View a file ────────────────────────────────────
  const viewFile = async (filePath: string) => {
    if (isBinaryFile(filePath)) return
    setViewingFile(filePath)
    setFileLoading(true)
    try {
      const content = await readLocalFile(filePath)
      setFileContent(content || '(empty file)')
    } catch {
      setFileContent('(failed to read file)')
    } finally {
      setFileLoading(false)
    }
  }

  // ── Share file reference to chat input ─────────────
  const shareFilesToAgent = (paths: string[]) => {
    if (paths.length === 0) return
    const refs = paths.map(p => {
      const rel = localProjectRoot ? p.replace(localProjectRoot, '').replace(/^[/\\]/, '') : p
      return `@file ${rel}`
    }).join('\n')
    setChatInput(prev => (prev ? prev + '\n' : '') + refs)
  }

  // ── Attach local files ────────────────────────────
  const attachLocalFiles = async () => {
    const files = await pickLocalFiles({
      title: 'Attach files',
      filters: [
        { name: 'Documents', extensions: ['pdf', 'md', 'txt', 'docx', 'html', 'csv', 'json'] },
        { name: 'Code', extensions: ['py', 'js', 'ts', 'tsx', 'go', 'rs', 'java', 'c', 'cpp', 'rb', 'sh'] },
        { name: 'All', extensions: ['*'] },
      ],
      multiple: true,
    })
    if (!files?.length) return
    if (projectIndexed) {
      const refs = files.map(f => `@file ${f.name}`).join('\n')
      setPendingAttachments(prev => [...prev, `[RESEARCH_FILES]\n${refs}\n\nPlease analyze these files using wtt_local_read.`])
    } else {
      for (const f of files) {
        const content = await readLocalFile(f.path)
        if (!content) continue
        const trunc = content.length > 32000 ? content.slice(0, 32000) + '\n...(truncated)' : content
        setPendingAttachments(prev => [...prev, `📎 **${f.name}** (${(f.size / 1024).toFixed(1)}KB)\n\`\`\`\n${trunc}\n\`\`\``])
      }
    }
  }

  // ── Send message ───────────────────────────────────
  const sendMessage = async (text?: string) => {
    const attachmentText = pendingAttachments.join('\n')
    const content = (text || chatInput).trim()
    if ((!content && !attachmentText) || !task?.topic_id || sending) return
    setSending(true)
    if (!text) setChatInput('')
    setPendingAttachments([])
    const fullContent = attachmentText ? `${attachmentText}\n\n${content}` : content
    try {
      const resp = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/chat/send`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: fullContent,
          sender_type: 'HUMAN',
          semantic_type: 'post',
          auto_run: task?.status === 'todo',
        }),
      })
      if (!resp.ok) console.error('[Research] send failed:', resp.status)
      mutateMessages()
    } catch { /* ignore */ } finally {
      setSending(false)
    }
  }

  // ── Quick actions ──────────────────────────────────
  const quickAction = (key: string) => {
    const fileRef = viewingFile
      ? `@file ${localProjectRoot ? viewingFile.replace(localProjectRoot, '').replace(/^[/\\]/, '') : viewingFile}`
      : null
    const prompts: Record<string, string> = {
      summarize: fileRef
        ? `Please summarize this file: ${fileRef}`
        : 'Please summarize the key findings from the files in this project.',
      analyze: 'Analyze the structure and content of this project. What are the main topics and themes?',
      compare: 'Compare the key documents in this project. What are the similarities and differences?',
      outline: fileRef
        ? `Create a structured outline of ${fileRef}`
        : 'Create a structured outline based on the project content.',
      translate: fileRef
        ? `Translate ${fileRef} to Chinese, preserving technical terms.`
        : 'Translate the key content to Chinese.',
      extract: 'Extract key data, findings, and conclusions from the project files into a structured summary.',
    }
    const prompt = prompts[key]
    if (prompt) sendMessage(prompt)
  }

  // ── Resize handler ─────────────────────────────────
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = true
    resizeStartX.current = e.clientX
    resizeStartW.current = leftWidth
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      const w = resizeStartW.current + (e.clientX - resizeStartX.current)
      setLeftWidth(Math.max(200, Math.min(w, 700)))
    }
    const onUp = () => { resizingRef.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Render ─────────────────────────────────────────
  if (status === 'loading' || !task) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-zinc-900">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="mt-3 text-sm text-slate-400">Loading…</p>
        </div>
      </div>
    )
  }

  const relPath = (p: string) => localProjectRoot ? p.replace(localProjectRoot, '').replace(/^[/\\]/, '') : p

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-zinc-900">
      {/* ── Header ──────────────────────────────────── */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(buildAgentUrl('/tasks', selectedAgentId))} className="text-sm text-indigo-500 hover:underline">← Tasks</button>
          <span className="text-sm font-semibold text-slate-700 dark:text-zinc-200 max-w-[300px] truncate">{task?.title || 'Research'}</span>
          <span className="rounded bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">📄 Research</span>
          {task?.status && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              task.status === 'doing' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
              task.status === 'done' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
              'bg-slate-100 dark:bg-zinc-700 text-slate-500 dark:text-zinc-400'
            }`}>{task.status === 'doing' ? '⚡ Running' : task.status === 'done' ? '✅ Done' : task.status}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {localProjectRoot && (
            <span className="text-[10px] text-slate-400 dark:text-zinc-500 truncate max-w-[180px]" title={localProjectRoot}>
              📁 {localProjectRoot.split(/[/\\]/).pop()}
            </span>
          )}
          <button
            onClick={openFolder}
            className="flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M4.75 3A1.75 1.75 0 003 4.75v2.752l.104-.002h13.792c.035 0 .07 0 .104.002V6.75A1.75 1.75 0 0015.25 5h-3.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H4.75zM3.104 9a1.75 1.75 0 00-1.673 2.265l1.385 4.5A1.75 1.75 0 004.488 17h11.023a1.75 1.75 0 001.673-1.235l1.384-4.5A1.75 1.75 0 0016.896 9H3.104z" />
            </svg>
            {localProjectRoot ? 'Change Folder' : 'Open Folder'}
          </button>
          <ThemeToggle />
        </div>
      </div>

      {/* ── Body: Left (files) + Right (chat) ──────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ═══ LEFT: File Explorer + Content Viewer ═══ */}
        <div className="flex flex-col border-r border-slate-200 dark:border-zinc-700 overflow-hidden" style={{ width: leftWidth }}>
          {fileTree.length > 0 ? (
            <>
              {/* File tree */}
              <div className={`flex flex-col overflow-hidden ${viewingFile ? 'h-[40%] min-h-[120px]' : 'flex-1'} border-b border-slate-100 dark:border-zinc-700/50`}>
                <FileTreePanel
                  fileTree={fileTree}
                  projectRoot={localProjectRoot}
                  selectedPath={viewingFile || ''}
                  onSelect={(node) => { if (node.kind === 'file') viewFile(node.path) }}
                  onShare={(node) => { if (node.kind === 'file') shareFilesToAgent([node.path]) }}
                  onImportFolder={openFolder}
                  onClose={() => { setFileTree([]); setLocalProjectRoot(null); setViewingFile(null); setFileContent(''); setProjectIndexed(false) }}
                />
              </div>

              {/* File content viewer */}
              {viewingFile && (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="flex h-8 shrink-0 items-center justify-between border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3">
                    <span className="text-[11px] text-slate-600 dark:text-zinc-400 truncate" title={viewingFile}>{relPath(viewingFile)}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => shareFilesToAgent([viewingFile])}
                        className="rounded px-1.5 py-0.5 text-[10px] text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                        title="Send file reference to chat"
                      >@Agent</button>
                      <button
                        onClick={() => { setViewingFile(null); setFileContent('') }}
                        className="rounded px-1 py-0.5 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
                      >✕</button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto">
                    {fileLoading ? (
                      <div className="flex h-full items-center justify-center">
                        <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-500" />
                      </div>
                    ) : isMarkdownFile(viewingFile) ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none p-4">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
                      </div>
                    ) : (
                      <pre className="p-4 text-[12px] leading-relaxed text-slate-700 dark:text-zinc-300 font-mono whitespace-pre-wrap break-words">
                        {fileContent}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center px-6">
                <p className="text-5xl">📂</p>
                <p className="mt-3 text-sm font-medium text-slate-600 dark:text-zinc-400">Open a local folder</p>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-zinc-500 max-w-[220px] mx-auto">
                  Browse files and chat with your agent about them. Files stay local.
                </p>
                <button
                  onClick={openFolder}
                  className="mt-4 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
                >
                  Open Folder
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Resize handle */}
        <div
          className="w-1 cursor-col-resize hover:bg-indigo-300 dark:hover:bg-indigo-700 active:bg-indigo-400 transition-colors shrink-0"
          onMouseDown={startResize}
        />

        {/* ═══ RIGHT: Chat Panel ═══ */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Chat header */}
          <div className="flex h-9 items-center justify-between border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-300">🤖 Research Assistant</span>
            {task?.runner_agent_id && (
              <span className="rounded bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 text-[10px] text-indigo-600 dark:text-indigo-300 truncate max-w-[140px]">{task.runner_agent_id}</span>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-1 border-b border-slate-100 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-800/50 px-2 py-1.5">
            {[
              { key: 'summarize', label: '📋 Summarize', tip: 'Summarize current file or project' },
              { key: 'analyze', label: '🔍 Analyze', tip: 'Analyze project structure' },
              { key: 'compare', label: '📊 Compare', tip: 'Compare documents' },
              { key: 'outline', label: '📝 Outline', tip: 'Create structured outline' },
              { key: 'translate', label: '🌐 Translate', tip: 'Translate content' },
              { key: 'extract', label: '📎 Extract', tip: 'Extract key findings' },
            ].map(({ key, label, tip }) => (
              <button
                key={key}
                onClick={() => quickAction(key)}
                disabled={sending}
                title={tip}
                className="rounded bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 px-2 py-0.5 text-[10px] text-slate-600 dark:text-zinc-300 hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-50 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {chatMessages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center text-slate-400 dark:text-zinc-500 px-4">
                  <p className="text-4xl">🔬</p>
                  <p className="mt-2 text-sm">Open a folder and start researching</p>
                  <p className="mt-1 text-[11px]">Browse local files on the left, chat with agent on the right.</p>
                </div>
              </div>
            )}
            {chatMessages.filter(m => !isProgressMessage(m.content)).map((msg) => {
              const { meta, body: cleanBody } = stripMetaBlocks(msg.content || '')
              return (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'border border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/80 dark:bg-indigo-950/30 text-slate-800 dark:text-zinc-200 rounded-tr-md'
                      : 'border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 rounded-tl-md'
                  }`}>
                    {msg.sender_display_name && (
                      <p className={`mb-0.5 text-[10px] font-semibold ${msg.role === 'user' ? 'text-indigo-500' : 'text-emerald-500'}`}>{msg.sender_display_name}</p>
                    )}
                    {meta.length > 0 && (
                      <div className="mb-1.5 space-y-1">
                        {meta.map((m, mi) => {
                          const entries = Object.entries(m.entries).filter(([, v]) => v !== '')
                          if (entries.length === 0) return null
                          return (
                            <div key={mi} className="rounded-md border border-slate-200/60 dark:border-zinc-700/40 bg-slate-50/60 dark:bg-zinc-900/30 px-2 py-1">
                              <div className="grid gap-x-3 gap-y-0.5" style={{ gridTemplateColumns: 'auto 1fr' }}>
                                {entries.map(([k, v]) => (
                                  <div key={k} className="contents text-[11px]">
                                    <span className="text-slate-400 dark:text-zinc-500 whitespace-nowrap">{k}</span>
                                    <span className="font-medium truncate">{v}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap break-words prose prose-sm dark:prose-invert max-w-none">
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanBody}</ReactMarkdown>
                      ) : (
                        stripFileTokens(cleanBody) || cleanBody
                      )}
                    </div>
                    <FileAttachmentPreview content={msg.content} />
                    <p className="mt-1 text-[10px] text-slate-400">{formatTime(msg.timestamp)}</p>
                  </div>
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 p-2.5">
            {pendingAttachments.length > 0 && (
              <div className="mb-1.5">
                <PendingAttachments attachments={pendingAttachments} onRemove={(i) => setPendingAttachments(prev => prev.filter((_, j) => j !== i))} />
              </div>
            )}
            <div className="flex gap-1.5 items-center">
              <ChatFileUpload
                compact
                onUploaded={(asset) => setPendingAttachments(prev => [...prev, asset.markdownToken])}
                disabled={sending}
              />
              <button
                onClick={attachLocalFiles}
                disabled={sending}
                className="rounded-lg border border-emerald-300 dark:border-emerald-700 px-2 py-2 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 disabled:opacity-50"
                title="Attach local files"
              >📄</button>
              <button
                onClick={openFolder}
                disabled={sending}
                className="rounded-lg border border-cyan-300 dark:border-cyan-700 px-2 py-2 text-xs text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 disabled:opacity-50"
                title="Open local folder"
              >📂</button>
              <textarea
                data-chat-input
                className="flex-1 rounded-lg border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-slate-800 dark:text-zinc-200 focus:border-indigo-400 focus:outline-none resize-none"
                rows={chatInput.includes('\n') ? Math.min(chatInput.split('\n').length, 5) : 1}
                placeholder="Ask about your files..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                disabled={sending}
              />
              <button
                onClick={() => sendMessage()}
                disabled={sending || (!chatInput.trim() && !pendingAttachments.length)}
                className="rounded-lg bg-indigo-500 px-3 py-2 text-sm text-white disabled:opacity-50 hover:bg-indigo-600"
              >
                {sending ? '...' : '↑'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Agent sidebar */}
      <TaskAgentSidebar
        agents={agents}
        selectedAgentId={selectedAgentId}
        onSelectAgent={setSelectedAgentId}
        currentUserName={session?.user?.name || undefined}
        defaultCollapsed
      />
    </div>
  )
}
