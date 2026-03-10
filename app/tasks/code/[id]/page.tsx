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
interface FileNode {
  name: string
  path: string
  kind: 'file' | 'directory'
  children?: FileNode[]
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle
}

interface ChatMsg {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

interface Agent {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
}

// ── Helpers ────────────────────────────────────────────
const langFromPath = (path: string): string => {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin',
    cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp', cs: 'csharp',
    rb: 'ruby', php: 'php', swift: 'swift', sh: 'shell', bash: 'shell',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', html: 'html', css: 'css', scss: 'scss',
    sql: 'sql', xml: 'xml', dockerfile: 'dockerfile',
  }
  return map[ext] || 'plaintext'
}

const IGNORED = new Set([
  'node_modules', '.git', '.next', '__pycache__', '.venv', 'venv',
  'dist', 'build', '.DS_Store', '.env', '.env.local',
  'coverage', '.turbo', '.cache',
])

async function readDirectory(dirHandle: FileSystemDirectoryHandle, parentPath = ''): Promise<FileNode[]> {
  const entries: FileNode[] = []
  for await (const [name, handle] of dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (IGNORED.has(name)) continue
    const path = parentPath ? `${parentPath}/${name}` : name
    if (handle.kind === 'directory') {
      const children = await readDirectory(handle as FileSystemDirectoryHandle, path)
      entries.push({ name, path, kind: 'directory', children, handle: handle as FileSystemDirectoryHandle })
    } else {
      entries.push({ name, path, kind: 'file', handle: handle as FileSystemFileHandle })
    }
  }
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return entries
}

async function readFileContent(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  return file.text()
}

// ── File Tree Component ────────────────────────────────
function FileTreeNode({
  node, depth, selectedPath, onSelect, onShare,
}: {
  node: FileNode; depth: number; selectedPath: string; onSelect: (node: FileNode) => void; onShare?: (node: FileNode) => void
}) {
  const [expanded, setExpanded] = useState(depth < 1)
  const isDir = node.kind === 'directory'
  const isSelected = node.path === selectedPath

  return (
    <div>
      <div
        className={`group flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[12px] hover:bg-slate-200/60 ${isSelected ? 'bg-indigo-100 font-medium text-indigo-700' : 'text-slate-600'}`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        <button
          className="flex flex-1 items-center gap-1 truncate"
          onClick={() => {
            if (isDir) setExpanded(!expanded)
            else onSelect(node)
          }}
        >
          <span className="shrink-0 text-[11px]">
            {isDir ? (expanded ? '📂' : '📁') : '📄'}
          </span>
          <span className="truncate">{node.name}</span>
        </button>
        {!isDir && onShare && (
          <button
            onClick={() => onShare(node)}
            title="Share to topic"
            className="hidden shrink-0 rounded px-0.5 text-[10px] text-indigo-400 hover:bg-indigo-100 hover:text-indigo-600 group-hover:inline"
          >📤</button>
        )}
      </div>
      {isDir && expanded && node.children?.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} onShare={onShare} />
      ))}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────
export default function CodeTaskPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string

  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [modifiedContent, setModifiedContent] = useState('')
  const [isModified, setIsModified] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [dirName, setDirName] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [openFiles, setOpenFiles] = useState<FileNode[]>([])

  // Load task
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

  // Load messages from task topic as chat history
  const { data: topicMessages, mutate: mutateMessages } = useSWR(
    task?.topic_id && session?.accessToken ? [`code-chat-${task.topic_id}`, session.accessToken] : null,
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

  // Load agents
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

  // ── Publish to topic helper ─────────────────────────
  const publishToTopic = async (content: string, semanticType = 'post') => {
    if (!task?.topic_id || !selectedAgentId) return
    await fetch(`${CLIENT_WTT_API_BASE}/topics/${task.topic_id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.accessToken ?? ''}`,
      },
      body: JSON.stringify({
        sender_id: selectedAgentId,
        content,
        content_type: 'text',
        semantic_type: semanticType,
      }),
    })
    mutateMessages()
  }

  // ── Build tree text ────────────────────────────────
  const buildTreeText = (nodes: FileNode[], prefix = ''): string => {
    return nodes.map((n, i) => {
      const isLast = i === nodes.length - 1
      const connector = isLast ? '└── ' : '├── '
      const childPrefix = isLast ? '    ' : '│   '
      let line = `${prefix}${connector}${n.name}`
      if (n.kind === 'directory' && n.children?.length) {
        line += '\n' + buildTreeText(n.children, prefix + childPrefix)
      }
      return line
    }).join('\n')
  }

  // ── Open Directory ─────────────────────────────────
  const openDirectory = async () => {
    try {
      const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker()
      setDirName(dirHandle.name)
      const tree = await readDirectory(dirHandle)
      setFileTree(tree)

      // Auto-publish file tree structure to topic so agent can see the codebase
      if (task?.topic_id) {
        const treeText = buildTreeText(tree)
        await publishToTopic(
          `[CODEBASE] ${dirHandle.name}\n\`\`\`\n${dirHandle.name}/\n${treeText}\n\`\`\`\nCodebase opened with ${countFiles(tree)} files. Ask me to share specific files for analysis.`,
          'notification',
        )
      }
    } catch {
      // User cancelled
    }
  }

  // ── Count files helper ─────────────────────────────
  const countFiles = (nodes: FileNode[]): number => {
    let c = 0
    for (const n of nodes) {
      if (n.kind === 'file') c++
      if (n.children) c += countFiles(n.children)
    }
    return c
  }

  // ── Share file to topic ────────────────────────────
  const shareFile = async (node: FileNode) => {
    if (!node.handle || node.kind !== 'file') return
    try {
      const content = await readFileContent(node.handle as FileSystemFileHandle)
      const lang = langFromPath(node.path)
      await publishToTopic(
        `[FILE] ${node.path}\n\`\`\`${lang}\n${content}\n\`\`\``,
        'post',
      )
    } catch (e) {
      console.error('Share failed:', e)
    }
  }

  // ── Share all open files ───────────────────────────
  const [sharing, setSharing] = useState(false)
  const shareAllFiles = async () => {
    if (fileTree.length === 0) return
    setSharing(true)
    const allFiles: FileNode[] = []
    const collect = (nodes: FileNode[]) => {
      for (const n of nodes) {
        if (n.kind === 'file') allFiles.push(n)
        if (n.children) collect(n.children)
      }
    }
    collect(fileTree)

    // Share in batches to avoid message size limits
    let batch = ''
    let batchCount = 0
    for (const f of allFiles) {
      if (!f.handle) continue
      try {
        const content = await readFileContent(f.handle as FileSystemFileHandle)
        const entry = `### ${f.path}\n\`\`\`${langFromPath(f.path)}\n${content}\n\`\`\`\n\n`
        if ((batch + entry).length > 30000 && batch) {
          await publishToTopic(`[CODEBASE FILES batch]\n\n${batch}`, 'post')
          batch = entry
          batchCount++
        } else {
          batch += entry
        }
      } catch {
        // skip unreadable files
      }
    }
    if (batch) {
      await publishToTopic(`[CODEBASE FILES${batchCount > 0 ? ' batch' : ''}]\n\n${batch}`, 'post')
    }
    setSharing(false)
  }

  // ── Select file ────────────────────────────────────
  const selectFile = async (node: FileNode) => {
    if (!node.handle || node.kind !== 'file') return
    try {
      const content = await readFileContent(node.handle as FileSystemFileHandle)
      setSelectedFile(node)
      setFileContent(content)
      setModifiedContent(content)
      setIsModified(false)
      if (!openFiles.find((f) => f.path === node.path)) {
        setOpenFiles((prev) => [...prev, node])
      }
    } catch (e) {
      console.error('Failed to read file:', e)
    }
  }

  // ── Save file ──────────────────────────────────────
  const saveFile = async () => {
    if (!selectedFile?.handle || !isModified) return
    try {
      const handle = selectedFile.handle as FileSystemFileHandle
      const writable = await handle.createWritable()
      await writable.write(modifiedContent)
      await writable.close()
      setFileContent(modifiedContent)
      setIsModified(false)
    } catch (e) {
      alert(`Save failed: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  // ── Send chat message ──────────────────────────────
  const sendMessage = async () => {
    const text = chatInput.trim()
    if (!text || !task?.topic_id || sending) return
    setSending(true)
    setChatInput('')

    try {
      // If a file is open, include it as context
      let fullContent = text
      if (selectedFile && modifiedContent) {
        fullContent = `[Context: ${selectedFile.path}]\n\`\`\`${langFromPath(selectedFile.path)}\n${modifiedContent.slice(0, 8000)}\n\`\`\`\n\n${text}`
      }
      await publishToTopic(fullContent)
    } catch {
      // ignore
    } finally {
      setSending(false)
    }
  }

  const fileCount = useMemo(() => countFiles(fileTree), [fileTree])

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Top bar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/tasks')} className="text-sm text-indigo-500 hover:underline">← Tasks</button>
          <span className="text-sm font-semibold text-slate-700">{task?.title || 'Code Task'}</span>
          <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700">💻 Code</span>
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
          <button onClick={openDirectory} className="rounded-lg bg-indigo-500 px-3 py-1 text-xs text-white">
            {dirName ? `📁 ${dirName}` : 'Open Folder'}
          </button>
        </div>
      </div>

      {/* Main area: file tree | editor | chat */}
      <div className="flex flex-1 overflow-hidden">
        {/* File tree panel */}
        <div className="w-60 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50/80 p-2">
          {fileTree.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-3xl">📂</p>
              <p className="text-sm text-slate-500">No folder open</p>
              <button onClick={openDirectory} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white">
                Open Folder
              </button>
              <p className="mt-2 text-[11px] text-slate-400">Files stay local — nothing is uploaded</p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">{dirName}</p>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400">{fileCount} files</span>
                  <button
                    onClick={shareAllFiles}
                    disabled={sharing}
                    title="Share all files to topic (Agent can see the full codebase)"
                    className="rounded bg-indigo-100 px-1 py-0.5 text-[10px] text-indigo-600 hover:bg-indigo-200 disabled:opacity-50"
                  >
                    {sharing ? '⏳' : '📤 All'}
                  </button>
                </div>
              </div>
              {fileTree.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedFile?.path || ''}
                  onSelect={selectFile}
                  onShare={shareFile}
                />
              ))}
            </>
          )}
        </div>

        {/* Editor panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Tab bar */}
          {openFiles.length > 0 && (
            <div className="flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-slate-200 bg-slate-100 px-1">
              {openFiles.map((f) => (
                <button
                  key={f.path}
                  onClick={() => selectFile(f)}
                  className={`group flex items-center gap-1 rounded-t px-2 py-1 text-[11px] ${
                    f.path === selectedFile?.path ? 'bg-white font-medium text-slate-800' : 'text-slate-500 hover:bg-white/60'
                  }`}
                >
                  <span className="truncate max-w-[120px]">{f.name}</span>
                  <span
                    className="ml-1 hidden text-slate-400 hover:text-red-500 group-hover:inline"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenFiles((prev) => prev.filter((x) => x.path !== f.path))
                      if (selectedFile?.path === f.path) {
                        setSelectedFile(null)
                        setFileContent('')
                      }
                    }}
                  >×</span>
                </button>
              ))}
            </div>
          )}

          {/* Monaco editor */}
          {selectedFile ? (
            <div className="flex-1">
              <MonacoEditor
                height="100%"
                language={langFromPath(selectedFile.path)}
                value={modifiedContent}
                onChange={(v) => {
                  setModifiedContent(v || '')
                  setIsModified(v !== fileContent)
                }}
                theme="vs-light"
                options={{
                  fontSize: 13,
                  minimap: { enabled: true },
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                }}
              />
              {isModified && (
                <div className="absolute bottom-2 right-[calc(33%+12px)] z-10">
                  <button onClick={saveFile} className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs text-white shadow-lg">
                    💾 Save (Ctrl+S)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-slate-400">
              <div className="text-center">
                <p className="text-4xl">📝</p>
                <p className="mt-2 text-sm">Select a file to edit</p>
              </div>
            </div>
          )}
        </div>

        {/* Chat panel */}
        <div className="flex w-[33%] min-w-[320px] shrink-0 flex-col border-l border-slate-200">
          <div className="flex h-10 items-center justify-between border-b border-slate-200 bg-slate-50 px-3">
            <span className="text-xs font-semibold text-slate-600">Agent Chat</span>
            {task?.runner_agent_id && (
              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-600">{task.runner_agent_id}</span>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {chatMessages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center text-slate-400">
                  <p className="text-3xl">💬</p>
                  <p className="mt-2 text-sm">Ask the agent about your code</p>
                  <p className="mt-1 text-[11px]">Selected file will be sent as context</p>
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
            {selectedFile && (
              <div className="mb-2 flex items-center gap-1 rounded bg-indigo-50 px-2 py-1 text-[11px] text-indigo-600">
                <span>📎</span>
                <span className="truncate">{selectedFile.path}</span>
                <span className="text-slate-400">will be sent as context</span>
              </div>
            )}
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                placeholder="Ask about code..."
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
