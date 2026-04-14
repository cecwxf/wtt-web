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

// ── Helpers ────────────────────────────────────────────
const isMarkdownPath = (p: string) => /\.(md|mdx|markdown)$/i.test(p)
const isBinaryPath = (p: string) => /\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|zip|tar|gz|exe|dll|so|dylib|wasm|mp[34]|mov|avi|webm)$/i.test(p)
const isDocumentPath = (p: string) => /\.(pdf|docx?|xlsx?|pptx?)$/i.test(p)
const langFromExt = (p: string): string => {
  const ext = p.split('.').pop()?.toLowerCase() || ''
  const m: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
    rb: 'ruby', sh: 'bash', yml: 'yaml', yaml: 'yaml', json: 'json',
    css: 'css', html: 'html', sql: 'sql', toml: 'toml', xml: 'xml',
  }
  return m[ext] || ''
}

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
  const [selectedFilePath, setSelectedFilePath] = useState('')
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileLoading, setFileLoading] = useState(false)

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<string[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Layout — right panel width (left takes the rest)
  const [rightW, setRightW] = useState(420)
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

  // Persist right-panel width
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('research-right-w', String(rightW))
  }, [rightW])

  // ── Open Folder ────────────────────────────────────
  const openFolder = async () => {
    const result = await pickAndScanFolder('Open folder for research', { includeAll: true, maxFileSize: 50 * 1024 * 1024 })
    if (!result || result.files.length === 0) return
    setFileTree(scannedToFileNodes(result.files))
    setLocalProjectRoot(result.path)
    setSelectedFilePath('')
    setFileContent(null)
    if (selectedAgentId) {
      indexLocalProject(taskId, selectedAgentId, result.path, result.files, CLIENT_WTT_API_BASE, {
        Authorization: `Bearer ${session?.accessToken ?? ''}`
      }).then(r => {
        if (r.ok) {
          setProjectIndexed(true)
          console.log(`[Research] Indexed ${r.indexed_files} files`)
        }
      }).catch(() => {})
    }
    // Compact chat notification
    const folderName = result.path.split(/[/\\]/).pop() || result.path
    setChatMessages(prev => [...prev, {
      id: `import-${Date.now()}`,
      role: 'user' as const,
      content: `📁 Folder opened: **${folderName}** (${result.files.length} files)\n_Agent can access files via MCP tools._`,
      timestamp: new Date().toISOString(),
      sender_display_name: session?.user?.name || 'You',
    }])
  }

  // ── View a file ────────────────────────────────────
  const viewFile = async (node: FileNode) => {
    if (node.kind !== 'file' || isBinaryPath(node.path)) return
    const fullPath = localProjectRoot ? `${localProjectRoot}/${node.path}` : node.path
    setSelectedFilePath(node.path)
    setFileLoading(true)
    if (isDocumentPath(node.path)) {
      // PDF/Word/Excel — show info card, agent can analyze via MCP
      const ext = node.path.split('.').pop()?.toUpperCase() || 'DOC'
      const name = node.path.split(/[/\\]/).pop() || node.path
      setFileContent(`__DOCUMENT__\n${ext}\n${name}\n${fullPath}`)
      setFileLoading(false)
      return
    }
    try {
      const content = await readLocalFile(fullPath)
      setFileContent(content || '(empty file)')
    } catch {
      setFileContent('(failed to read file)')
    } finally {
      setFileLoading(false)
    }
  }

  // ── Share file references to agent ─────────────────
  const shareFilesToAgent = async (filePaths: string[]) => {
    if (!task?.topic_id || filePaths.length === 0) return
    const fileList = filePaths.map(p => `  📎 \`${p}\``).join('\n')
    const msg = `[RESEARCH_FILES]\n${fileList}\n\nPlease analyze these files. Use wtt_local_read to access their content.`
    setSending(true)
    try {
      await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify({ content: msg, sender_type: 'HUMAN', semantic_type: 'post', include_task_context: true }),
      })
      mutateMessages()
    } catch { /* ignore */ }
    setSending(false)
  }

  // ── Attach local files ────────────────────────────
  const attachLocalFiles = async () => {
    const files = await pickLocalFiles({
      title: 'Attach files to research task',
      filters: [
        { name: 'Documents', extensions: ['pdf', 'md', 'txt', 'docx', 'html', 'csv', 'json'] },
        { name: 'Code', extensions: ['py', 'js', 'ts', 'tsx', 'go', 'rs', 'java', 'c', 'cpp', 'rb', 'sh'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      multiple: true,
    })
    if (!files?.length) return
    if (projectIndexed) {
      const refs = files.map(f => `  📎 \`${f.name}\``).join('\n')
      setPendingAttachments(prev => [...prev, `[RESEARCH_FILES]\n${refs}\n\nPlease analyze these files. Use wtt_local_read to access their content.`])
    } else {
      for (const f of files) {
        const content = await readLocalFile(f.path)
        if (!content) continue
        const trunc = content.length > 32000 ? content.slice(0, 32000) + '\n... (truncated)' : content
        setPendingAttachments(prev => [...prev, `📎 **${f.name}** (${(f.size / 1024).toFixed(1)} KB)\n\`\`\`\n${trunc}\n\`\`\``])
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
    const userContent = attachmentText ? `${attachmentText}\n\n${content}` : content
    try {
      const resp = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify({
          content: userContent,
          sender_type: 'HUMAN',
          semantic_type: 'post',
          auto_run: task?.status === 'todo',
          include_task_context: task?.status === 'todo',
        }),
      })
      if (!resp.ok) console.error('[Research] chat/send failed:', resp.status)
      mutateMessages()
    } catch { /* ignore */ } finally {
      setSending(false)
    }
  }

  // ── Quick actions ──────────────────────────────────
  const quickAction = (action: string) => {
    const prompts: Record<string, string> = {
      summarize: 'Please summarize the key contents of the files in this project.',
      review: 'Please write a literature review based on the documents in this project.',
      compare: 'Please compare and analyze the different documents in this project.',
      gap: 'Please identify research gaps based on the documents in this project.',
      translate: selectedFilePath
        ? `Please translate the content of ${selectedFilePath} to Chinese.`
        : 'Please translate the selected document to Chinese.',
      draft: 'Based on the documents in this project, please draft a structured research section.',
      cite: 'Please format the references found in the project documents in APA style.',
    }
    const prompt = prompts[action]
    if (prompt) sendMessage(prompt)
  }

  // ── Resize handler (drag from left to adjust right panel width) ──
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = true
    resizeStartX.current = e.clientX
    resizeStartW.current = rightW
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      const dx = e.clientX - resizeStartX.current
      setRightW(Math.max(280, Math.min(700, resizeStartW.current - dx)))
    }
    const onUp = () => {
      resizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Render ─────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-zinc-900">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="mt-3 text-sm text-slate-400">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-zinc-900">
      {/* ── Header ──────────────────────────────────── */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(buildAgentUrl('/tasks', selectedAgentId))} className="text-sm text-indigo-500 hover:underline">← Tasks</button>
          <span className="text-sm font-semibold text-slate-700 dark:text-zinc-200 max-w-[300px] truncate">{task?.title || 'Research Task'}</span>
          <span className="rounded bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">📄 Research</span>
          {task?.status && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              task.status === 'doing' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
              task.status === 'done' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
              task.status === 'cancelled' ? 'bg-red-100 text-red-600' :
              'bg-slate-100 dark:bg-zinc-700 text-slate-500 dark:text-zinc-400'
            }`}>{task.status === 'doing' ? '⚡ Running' : task.status === 'done' ? '✅ Done' : task.status === 'cancelled' ? '🚫 Cancelled' : task.status}</span>
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
            title="Import local project folder for agent to index and access"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75zM10 10.25a.75.75 0 01.75.75v1.5h1.5a.75.75 0 010 1.5h-1.5v1.5a.75.75 0 01-1.5 0v-1.5h-1.5a.75.75 0 010-1.5h1.5V11a.75.75 0 01.75-.75z" clipRule="evenodd" />
            </svg>
            {localProjectRoot ? 'Change Folder' : 'Import Folder'}
          </button>
          <ThemeToggle />
        </div>
      </div>

      {/* ── Main two-column area ──────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ═══ LEFT COLUMN: File tree + content viewer ═══ */}
        <div className="flex flex-1 overflow-hidden">
          {/* File tree sidebar */}
          {fileTree.length > 0 && (
            <FileTreePanel
              fileTree={fileTree}
              projectRoot={localProjectRoot}
              selectedPath={selectedFilePath}
              onSelect={(node) => viewFile(node)}
              onShare={(node) => { if (node.kind === 'file') shareFilesToAgent([node.path]) }}
              onClose={() => { setFileTree([]); setLocalProjectRoot(null); setSelectedFilePath(''); setFileContent(null); setProjectIndexed(false) }}
              onImportFolder={openFolder}
              title="📂 Files"
              width={220}
            />
          )}

          {/* Content viewer */}
          <div className="flex-1 overflow-hidden flex flex-col min-w-0">
            {fileContent !== null ? (
              <>
                {/* File header bar */}
                <div className="flex h-8 shrink-0 items-center justify-between border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-medium text-slate-600 dark:text-zinc-300 truncate">{selectedFilePath.split(/[/\\]/).pop()}</span>
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">{selectedFilePath}</span>
                    {langFromExt(selectedFilePath) && (
                      <span className="rounded bg-slate-100 dark:bg-zinc-700 px-1 py-0.5 text-[9px] text-slate-500 dark:text-zinc-400">{langFromExt(selectedFilePath)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => shareFilesToAgent([selectedFilePath])}
                      className="rounded px-1.5 py-0.5 text-[10px] text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                      title="Send to agent for analysis"
                    >@Agent</button>
                    <button
                      onClick={() => { setSelectedFilePath(''); setFileContent(null) }}
                      className="rounded px-1 py-0.5 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
                    >✕</button>
                  </div>
                </div>
                {/* File content */}
                <div className="flex-1 overflow-auto">
                  {fileLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-500" />
                    </div>
                  ) : fileContent?.startsWith('__DOCUMENT__\n') ? (() => {
                    const lines = fileContent.split('\n')
                    const ext = lines[1] || 'DOC'
                    const name = lines[2] || 'Document'
                    const icons: Record<string, string> = { PDF: '📕', DOCX: '📘', DOC: '📘', XLSX: '📗', PPTX: '📙' }
                    return (
                      <div className="flex h-full items-center justify-center">
                        <div className="text-center px-6">
                          <p className="text-6xl">{icons[ext] || '📄'}</p>
                          <p className="mt-3 text-sm font-medium text-slate-700 dark:text-zinc-300">{name}</p>
                          <p className="mt-1 text-[11px] text-slate-400 dark:text-zinc-500">{ext} document · Click below to send to agent for analysis</p>
                          <button
                            onClick={() => shareFilesToAgent([selectedFilePath])}
                            className="mt-4 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
                          >
                            🤖 Send to Agent
                          </button>
                        </div>
                      </div>
                    )
                  })() : isMarkdownPath(selectedFilePath) ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none p-4">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
                    </div>
                  ) : langFromExt(selectedFilePath) ? (
                    <pre className="p-4 text-[12px] leading-relaxed font-mono whitespace-pre-wrap break-words">
                      <code className={`language-${langFromExt(selectedFilePath)} text-slate-700 dark:text-zinc-300`}>{fileContent}</code>
                    </pre>
                  ) : (
                    <pre className="p-4 text-[12px] leading-relaxed text-slate-700 dark:text-zinc-300 font-mono whitespace-pre-wrap break-words">
                      {fileContent}
                    </pre>
                  )}
                </div>
              </>
            ) : (
              /* Empty state */
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center px-6">
                  <p className="text-5xl">📂</p>
                  <p className="mt-3 text-sm font-medium text-slate-600 dark:text-zinc-400">
                    {fileTree.length > 0 ? 'Select a file to view' : 'Open a folder to browse files'}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400 dark:text-zinc-500 max-w-[240px] mx-auto">
                    Browse files and chat with your AI research assistant. Files stay local — the agent reads them via MCP tools.
                  </p>
                  {fileTree.length === 0 && (
                    <button
                      onClick={openFolder}
                      className="mt-4 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
                    >
                      Open Folder
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Resize handle ─────────────────────────── */}
        <div
          className="w-[3px] shrink-0 cursor-col-resize hover:bg-indigo-400 dark:hover:bg-indigo-600 active:bg-indigo-500 transition-colors bg-transparent"
          onMouseDown={startResize}
        />

        {/* ═══ RIGHT COLUMN: Chat panel ═══ */}
        <div className="flex flex-col overflow-hidden" style={{ width: rightW }}>
          {/* Chat header */}
          <div className="flex h-9 items-center justify-between border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-300">🤖 Research Assistant</span>
            {task?.runner_agent_id && (
              <span className="rounded bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 text-[10px] text-indigo-600 dark:text-indigo-300 truncate max-w-[120px]">{task.runner_agent_id}</span>
            )}
          </div>

          {/* Quick action buttons */}
          <div className="flex flex-wrap gap-1 border-b border-slate-100 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-800/50 px-2 py-1.5">
            {[
              { key: 'summarize', label: '📋 Summarize', tip: 'Summarize project files' },
              { key: 'review', label: '📝 Literature Review', tip: 'Generate literature review' },
              { key: 'compare', label: '📊 Compare', tip: 'Compare documents' },
              { key: 'gap', label: '🔍 Gap Analysis', tip: 'Find research gaps' },
              { key: 'translate', label: '🌐 Translate', tip: 'Translate to Chinese' },
              { key: 'draft', label: '📄 Draft', tip: 'Draft a research section' },
              { key: 'cite', label: '📎 Format Refs', tip: 'Format references in APA style' },
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
                  <p className="mt-2 text-sm">Import files and ask your Agent</p>
                  <p className="mt-1 text-[11px]">Open a folder on the left, then ask questions here.</p>
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
              {isDesktop() && (
                <>
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
                </>
              )}
              <textarea
                data-chat-input
                className="flex-1 rounded-lg border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-slate-800 dark:text-zinc-200 focus:border-indigo-400 focus:outline-none resize-none"
                rows={chatInput.includes('\n') ? Math.min(chatInput.split('\n').length, 5) : 1}
                placeholder="Ask about your files…"
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
                {sending ? '…' : '↑'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
