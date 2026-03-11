'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import dynamic from 'next/dynamic'
import { CLIENT_WTT_API_BASE, DEFAULT_WTT_API_ORIGIN, WS_BASE_URL } from '@/lib/api/base-url'
import { normalizeAndFilterAgents } from '@/lib/agents'
import { useWebSocket, type WsMessage } from '@/lib/useWebSocket'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

// Local relay (runs on user's machine) preferred; falls back to backend
const LOCAL_RELAY_URL = 'http://localhost:9877'
const REMOTE_SSH_FALLBACK = (typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_WTT_API_URL || 'https://www.waxbyte.com') : DEFAULT_WTT_API_ORIGIN).replace(/\/+$/, '')

const FULL_CODEBASE_MAX_FILES = 120
const FULL_CODEBASE_MAX_CHARS = 45000

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
  sender_display_name?: string
}

interface Agent {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
}

interface SSHConfig {
  host: string
  port: number
  username: string
  password: string
  private_key: string
  project_path: string
}

const DEFAULT_SSH_CONFIG: SSHConfig = {
  host: '',
  port: 22,
  username: '',
  password: '',
  private_key: '',
  project_path: '~',
}

const getSessionSenderName = (session: unknown): string => {
  const s = session as { userId?: string; user?: { name?: string | null; email?: string | null } } | null | undefined
  const uid = s?.userId || ''
  return s?.user?.name || s?.user?.email || (uid ? `user_${uid.slice(0, 8)}` : 'user_default')
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

function findFileNodeByPath(nodes: FileNode[], target: string): FileNode | null {
  for (const n of nodes) {
    if (n.kind === 'file' && n.path === target) return n
    if (n.children?.length) {
      const hit = findFileNodeByPath(n.children, target)
      if (hit) return hit
    }
  }
  return null
}

// ── File Tree Component ────────────────────────────────
function FileTreeNode({
  node, depth, selectedPath, onSelect,
}: {
  node: FileNode; depth: number; selectedPath: string; onSelect: (node: FileNode) => void
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
      </div>
      {isDir && expanded && node.children?.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
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
  const codebaseSharedSigRef = useRef<string>('')

  // ── Remote agent (SSH) state ──────────────────────
  const [agentMode, setAgentMode] = useState<'local' | 'remote'>('local')
  const [sshConfig, setSshConfig] = useState<SSHConfig>(DEFAULT_SSH_CONFIG)
  const [sshConnected, setSshConnected] = useState(false)
  const [sshTree, setSshTree] = useState<FileNode[]>([])
  const [sshConnecting, setSshConnecting] = useState(false)
  const [sshTesting, setSshTesting] = useState(false)
  const [sshTestResult, setSshTestResult] = useState('')
  const [sshPanelOpen, setSshPanelOpen] = useState(true)
  const remoteContentCacheRef = useRef<Record<string, string>>({})
  const [sshRemoteDirName, setSshRemoteDirName] = useState('')

  // ── Local relay detection ──────────────────────────
  const [relayAvailable, setRelayAvailable] = useState<boolean | null>(null)
  const sshApiBase = relayAvailable ? LOCAL_RELAY_URL : REMOTE_SSH_FALLBACK

  useEffect(() => {
    if (agentMode !== 'remote') return
    let cancelled = false
    const check = async () => {
      try {
        const r = await fetch(`${LOCAL_RELAY_URL}/ssh/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ host: '127.0.0.1', port: 22, username: 'test', password: 'test' }),
          signal: AbortSignal.timeout(2000),
        }).catch(() => null)
        if (!cancelled) setRelayAvailable(r !== null && r.status !== 0)
      } catch {
        if (!cancelled) setRelayAvailable(false)
      }
    }
    check()
    return () => { cancelled = true }
  }, [agentMode])
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

  // ── WebSocket for real-time messages ───────────────
  const wsUrl = selectedAgentId ? `${WS_BASE_URL}/ws/${selectedAgentId}` : ''
  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.type !== 'new_message' || !msg.message) return
      if (msg.message.topic_id !== task?.topic_id) return
      const m = msg.message as Record<string, string>
      const incoming: ChatMsg = {
        id: m.id,
        role: m.sender_type === 'HUMAN' ? 'user' : 'assistant',
        content: m.content,
        timestamp: m.created_at,
        sender_display_name: m.sender_id,
      }
      setChatMessages(prev => {
        if (prev.some(x => x.id === incoming.id)) return prev
        // Replace optimistic message (opt-*) with real server message if content matches
        if (incoming.role === 'user') {
          const optIdx = prev.findIndex(x => x.id.startsWith('opt-') && incoming.content.includes(x.content.replace(/^⚠️ /, '').split('\n\n(Send failed')[0]))
          if (optIdx >= 0) {
            const updated = [...prev]
            updated[optIdx] = incoming
            return updated
          }
        }
        return [...prev, incoming]
      })

      // Agent can ask: REQUEST_FILES: path/a.ts, path/b.py
      if (incoming.role === 'assistant') {
        const mm = incoming.content.match(/REQUEST_FILES\s*:\s*([^\n]+)/i)
        if (mm?.[1] && task?.topic_id && selectedAgentId) {
          const requested = Array.from(new Set(mm[1].split(',').map((s) => s.trim()).filter(Boolean))).slice(0, 20)
          if (requested.length) {
            const activeTree = agentMode === 'remote' ? sshTree : fileTree
            void (async () => {
              for (const p of requested) {
                const node = findFileNodeByPath(activeTree, p)
                if (!node || node.kind !== 'file') continue
                if (agentMode === 'local' && !node.handle) continue
                try {
                  let content: string
                  if (selectedFile && selectedFile.path === node.path) {
                    content = modifiedContent
                  } else if (agentMode === 'remote') {
                    // Read remote file via SSH
                    const cached = remoteContentCacheRef.current[node.path]
                    if (cached !== undefined) {
                      content = cached
                    } else {
                      const r = await fetch(`${sshApiBase}/ssh/read?path=${encodeURIComponent(node.path)}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
                        body: JSON.stringify(sshConfig),
                      })
                      if (!r.ok) continue
                      const data = await r.json()
                      content = data.content
                      remoteContentCacheRef.current[node.path] = content
                    }
                  } else {
                    content = await readFileContent(node.handle as FileSystemFileHandle)
                  }
                  const body = {
                    content: `[FILE] ${node.path}\n\`\`\`${langFromPath(node.path)}\n${content}\n\`\`\``,
                    content_type: 'text',
                    semantic_type: 'post',
                    sender_type: 'HUMAN',
                  }
                  await fetch(`${CLIENT_WTT_API_BASE}/topics/${task.topic_id}/messages?agent_id=${encodeURIComponent(selectedAgentId)}`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${session?.accessToken ?? ''}`,
                    },
                    body: JSON.stringify(body),
                  })
                } catch {
                  // ignore per-file failures
                }
              }
            })()
          }
        }
      }
    },
    [task?.topic_id, selectedAgentId, fileTree, selectedFile, modifiedContent, session?.accessToken, agentMode, sshTree, sshConfig],
  )
  const { state: wsState, sendAction } = useWebSocket({
    url: wsUrl,
    enabled: !!selectedAgentId,
    token: session?.accessToken || undefined,
    onMessage: handleWsMessage,
  })

  // Load initial message history via HTTP (once)
  const { data: topicMessages } = useSWR(
    task?.topic_id && session?.accessToken && selectedAgentId ? [`code-chat-${task.topic_id}`, session.accessToken, selectedAgentId] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/topics/${task.topic_id}/messages?limit=200&agent_id=${encodeURIComponent(selectedAgentId)}`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!r.ok) return []
      return r.json()
    },
    { revalidateOnFocus: false },
  )

  // Seed chat from history (only once on load or agent switch)
  useEffect(() => {
    if (!topicMessages) return
    const mapped: ChatMsg[] = topicMessages.map((m: Record<string, string>) => ({
      id: m.message_id,
      role: m.sender_type === 'HUMAN' ? 'user' : 'assistant',
      content: m.content,
      timestamp: m.timestamp,
      sender_display_name: m.sender_display_name,
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

  // ── Load saved SSH config from localStorage ───────
  useEffect(() => {
    if (!taskId) return
    try {
      const saved = localStorage.getItem(`ssh-config-${taskId}`)
      if (saved) setSshConfig(JSON.parse(saved) as SSHConfig)
    } catch { /* ignore */ }
  }, [taskId])

  // ── Publish to topic helper (WS first, HTTP fallback) ──
  const publishToTopic = async (content: string, semanticType = 'post', senderType: 'HUMAN' | 'AGENT' = 'AGENT') => {
    if (!task?.topic_id || !selectedAgentId) {
      throw new Error('No topic or agent selected')
    }

    // Try WebSocket first (wrapped in try-catch — sendAction can throw on timeout)
    try {
      const wsResult = await sendAction('publish', {
        topic_id: task.topic_id,
        content,
        content_type: 'text',
        semantic_type: semanticType,
        sender_type: senderType,
      })
      if (wsResult !== null) return // WS succeeded
    } catch {
      console.warn('[CodeTask] WS publish failed, falling back to HTTP')
    }

    // HTTP fallback
    const url = `${CLIENT_WTT_API_BASE}/topics/${task.topic_id}/messages?agent_id=${encodeURIComponent(selectedAgentId)}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.accessToken ?? ''}`,
      },
      body: JSON.stringify({
        content,
        content_type: 'text',
        semantic_type: semanticType,
        sender_type: senderType,
      }),
    })
    if (!resp.ok) {
      const err = await resp.text().catch(() => 'unknown')
      console.error('[CodeTask] HTTP publish failed:', resp.status, err)
      throw new Error(`Publish failed: ${resp.status} ${err}`)
    }
  }

  const codebaseSignature = (nodes: FileNode[], label?: string): string => {
    const paths: string[] = []
    const walk = (arr: FileNode[]) => {
      for (const n of arr) {
        paths.push(`${n.kind}:${n.path}`)
        if (n.children) walk(n.children)
      }
    }
    walk(nodes)
    return `${label ?? dirName}|${paths.join('|')}`
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

  // ── SSH helpers ────────────────────────────────────
  const testSshConnection = async () => {
    setSshTesting(true)
    setSshTestResult('')
    try {
      const r = await fetch(`${sshApiBase}/ssh/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify(sshConfig),
      })
      const data = await r.json()
      setSshTestResult(data.ok ? `✅ ${data.detail || 'Connected'}` : `❌ ${data.detail || 'Failed'}`)
    } catch (e) {
      setSshTestResult(`❌ ${e instanceof Error ? e.message : 'Connection error'}`)
    } finally {
      setSshTesting(false)
    }
  }

  const connectSsh = async () => {
    setSshConnecting(true)
    try {
      const r = await fetch(`${sshApiBase}/ssh/tree?max_depth=3`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify(sshConfig),
      })
      if (!r.ok) { const err = await r.text().catch(() => ""); throw new Error(`HTTP ${r.status}: ${err}`) }
      const data = await r.json()
      const tree: FileNode[] = data.tree || []
      setSshTree(tree)
      setSshConnected(true)
      setSshRemoteDirName(data.project_path || sshConfig.project_path)
      setSshPanelOpen(false)
      remoteContentCacheRef.current = {}
      localStorage.setItem(`ssh-config-${taskId}`, JSON.stringify(sshConfig))
      if (task?.topic_id) {
        const treeText = buildTreeText(tree)
        const name = data.project_path || sshConfig.project_path
        await publishToTopic(
          `[CODEBASE] ${name} (remote)\n\`\`\`\n${name}/\n${treeText}\n\`\`\`\nRemote codebase opened with ${countFiles(tree)} files. Ask me to share specific files for analysis.`,
          'notification',
        )
      }
    } catch (e) {
      alert(`SSH connect failed: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setSshConnecting(false)
    }
  }

  const refreshSshTree = async () => {
    if (!sshConnected) return
    setSshConnecting(true)
    try {
      const r = await fetch(`${sshApiBase}/ssh/tree?max_depth=3`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
        body: JSON.stringify(sshConfig),
      })
      if (!r.ok) { const err = await r.text().catch(() => ""); throw new Error(`HTTP ${r.status}: ${err}`) }
      const data = await r.json()
      setSshTree(data.tree || [])
    } catch (e) {
      console.error('SSH tree refresh failed:', e)
    } finally {
      setSshConnecting(false)
    }
  }

  const readRemoteFile = async (filePath: string): Promise<string> => {
    const cached = remoteContentCacheRef.current[filePath]
    if (cached !== undefined) return cached
    const r = await fetch(`${sshApiBase}/ssh/read?path=${encodeURIComponent(filePath)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
      body: JSON.stringify(sshConfig),
    })
    if (!r.ok) { const err = await r.text().catch(() => ""); throw new Error(`HTTP ${r.status}: ${err}`) }
    const data = await r.json()
    remoteContentCacheRef.current[filePath] = data.content
    return data.content
  }

  // ── Select file ────────────────────────────────────
  const selectFile = async (node: FileNode) => {
    if (agentMode === 'remote') {
      if (node.kind !== 'file') return
      try {
        const content = await readRemoteFile(node.path)
        setSelectedFile(node)
        setFileContent(content)
        setModifiedContent(content)
        setIsModified(false)
        if (!openFiles.find((f) => f.path === node.path)) {
          setOpenFiles((prev) => [...prev, node])
        }
      } catch (e) {
        console.error('Failed to read remote file:', e)
      }
      return
    }
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

  const buildCodebaseContextMessage = async (text: string): Promise<{ content: string; fullCodebase: boolean }> => {
    const activeTree = agentMode === 'remote' ? sshTree : fileTree
    const activeDirName = agentMode === 'remote' ? sshRemoteDirName : dirName

    if (activeTree.length === 0) return { content: text, fullCodebase: false }

    const sig = codebaseSignature(activeTree, activeDirName)
    const needFullCodebase = codebaseSharedSigRef.current !== sig

    // Full codebase already shared for current tree: send lightweight context only
    if (!needFullCodebase) {
      if (selectedFile && modifiedContent) {
        const lightweight = `[Context: ${selectedFile.path}]\n\`\`\`${langFromPath(selectedFile.path)}\n${modifiedContent.slice(0, 8000)}\n\`\`\`\n\n${text}`
        return { content: lightweight, fullCodebase: false }
      }
      return { content: text, fullCodebase: false }
    }

    // Remote mode: send tree + cached files + REQUEST_FILES protocol
    if (agentMode === 'remote') {
      const treeText = buildTreeText(activeTree)
      const allFiles: FileNode[] = []
      const collect = (nodes: FileNode[]) => {
        for (const n of nodes) {
          if (n.kind === 'file') allFiles.push(n)
          if (n.children) collect(n.children)
        }
      }
      collect(activeTree)

      const cachedBlocks: string[] = []
      let used = 0
      for (const f of allFiles) {
        const cached = remoteContentCacheRef.current[f.path]
        if (cached === undefined) continue
        const content = (selectedFile && f.path === selectedFile.path) ? modifiedContent : cached
        const block = `\n[FILE] ${f.path}\n\`\`\`${langFromPath(f.path)}\n${content}\n\`\`\`\n`
        if (used + block.length > FULL_CODEBASE_MAX_CHARS) break
        cachedBlocks.push(block)
        used += block.length
      }

      const parts = [
        text,
        '',
        `[CODEBASE INDEX] ${activeDirName || 'workspace'} (remote)`,
        `files_in_workspace=${allFiles.length}, cached_files=${cachedBlocks.length}`,
        '',
        '[PROJECT TREE]',
        '```',
        `${activeDirName || 'workspace'}/`,
        treeText,
        '```',
      ]
      if (cachedBlocks.length > 0) {
        parts.push('', '[CACHED FILES]', ...cachedBlocks)
      }
      parts.push('', '需要具体文件请回复: REQUEST_FILES: path/a.ts, path/b.py')
      return { content: parts.join('\n'), fullCodebase: true }
    }

    // Local mode: existing behavior
    const allFiles: FileNode[] = []
    const collect = (nodes: FileNode[]) => {
      for (const n of nodes) {
        if (n.kind === 'file') allFiles.push(n)
        if (n.children) collect(n.children)
      }
    }
    collect(fileTree)

    // Large repos: share index only, then let agent request files via REQUEST_FILES
    if (allFiles.length > FULL_CODEBASE_MAX_FILES) {
      const treeText = buildTreeText(fileTree)
      const topList = allFiles.slice(0, 200).map((f) => `- ${f.path}`).join('\n')
      const indexed = [
        text,
        '',
        `[CODEBASE INDEX] ${dirName || 'workspace'}`,
        `files_in_workspace=${allFiles.length}`,
        '',
        '[PROJECT TREE]',
        '```',
        `${dirName || 'workspace'}/`,
        treeText,
        '```',
        '',
        '[FILES sample<=200]',
        topList,
        '',
        '需要具体文件请回复: REQUEST_FILES: path/a.ts, path/b.py',
      ].join('\n')
      return { content: indexed, fullCodebase: true }
    }

    let used = 0
    let included = 0
    let skipped = 0
    const fileBlocks: string[] = []

    for (const f of allFiles) {
      if (!f.handle) continue
      try {
        let content = ''
        if (selectedFile && f.path === selectedFile.path) {
          content = modifiedContent
        } else {
          content = await readFileContent(f.handle as FileSystemFileHandle)
        }
        const lang = langFromPath(f.path)
        const block = `\n[FILE] ${f.path}\n\
\`\`\`${lang}\n${content}\n\`\`\`\n`
        if (used + block.length > FULL_CODEBASE_MAX_CHARS) {
          skipped++
          continue
        }
        fileBlocks.push(block)
        used += block.length
        included++
      } catch {
        skipped++
      }
    }

    const treeText = buildTreeText(fileTree)
    const header = [
      `[CODEBASE CONTEXT] ${dirName || 'workspace'}`,
      `files_in_workspace=${allFiles.length}, files_included=${included}, files_skipped=${skipped}`,
      `\n[PROJECT TREE]\n\
\`\`\`\n${dirName || 'workspace'}/\n${treeText}\n\`\`\``,
    ].join('\n')

    return { content: `${text}\n\n${header}${fileBlocks.join('')}`, fullCodebase: true }
  }

  // ── Send chat message ──────────────────────────────
  const [awaitingAgent, setAwaitingAgent] = useState(false)

  const sendMessage = async () => {
    const text = chatInput.trim()
    if (!text || sending) return
    if (!task?.topic_id) { console.error('[CodeTask] No topic_id yet'); return }
    if (!selectedAgentId) { alert('Please select an agent first'); return }
    setSending(true)
    setChatInput('')

    const optimisticId = `opt-${Date.now()}`
    try {
      const built = await buildCodebaseContextMessage(text)
      const fullContent = built.content
      const senderName = getSessionSenderName(session)
      const displayContent = [
        '┌─ 来源标识 ─────────────',
        `│ 来源用户: ${senderName}`,
        '└────────────────────',
        fullContent,
      ].join('\n')

      // Optimistic: mirror feed/topic info flow in right chat panel immediately
      const optimisticMsg: ChatMsg = {
        id: optimisticId,
        role: 'user',
        content: displayContent,
        timestamp: new Date().toISOString(),
        sender_display_name: senderName,
      }
      setChatMessages(prev => [...prev, optimisticMsg])

      await publishToTopic(fullContent, 'post', 'HUMAN')
      if (built.fullCodebase) {
        const at = agentMode === 'remote' ? sshTree : fileTree
        const adn = agentMode === 'remote' ? sshRemoteDirName : dirName
        codebaseSharedSigRef.current = codebaseSignature(at, adn)
      }
      setAwaitingAgent(true)
    } catch (e) {
      console.error('[CodeTask] sendMessage failed:', e)
      // Mark optimistic message as failed
      setChatMessages(prev => prev.map(m =>
        m.id === optimisticId ? { ...m, content: `⚠️ ${text}\n\n(Send failed: ${e instanceof Error ? e.message : 'unknown'})` } : m
      ))
    } finally {
      setSending(false)
    }
  }

  // Clear thinking indicator when agent responds
  useEffect(() => {
    if (!awaitingAgent) return
    const lastMsg = chatMessages[chatMessages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') setAwaitingAgent(false)
  }, [chatMessages, awaitingAgent])

  const fileCount = useMemo(() => countFiles(fileTree), [fileTree])

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Top bar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/tasks')} className="text-sm text-indigo-500 hover:underline">← Tasks</button>
          <span className="text-sm font-semibold text-slate-700">{task?.title || 'Code Task'}</span>
          <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700">💻 Code</span>
          {task?.status && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              task.status === 'doing' ? 'bg-amber-100 text-amber-700' :
              task.status === 'done' ? 'bg-green-100 text-green-700' :
              'bg-slate-100 text-slate-500'
            }`}>{task.status === 'doing' ? '⚡ Running' : task.status === 'done' ? '✅ Done' : task.status}</span>
          )}
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
          <div className="flex rounded-lg border border-slate-200 bg-white text-[11px]">
            <button
              onClick={() => setAgentMode('local')}
              className={`px-2 py-1 rounded-l-lg transition-colors ${agentMode === 'local' ? 'bg-indigo-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >🖥️ Local</button>
            <button
              onClick={() => setAgentMode('remote')}
              className={`px-2 py-1 rounded-r-lg transition-colors ${agentMode === 'remote' ? 'bg-indigo-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >☁️ Remote</button>
          </div>
          {agentMode === 'remote' && sshConnected && (
            <span className="flex items-center gap-1 text-[11px] text-green-600">
              <span className="h-2 w-2 rounded-full bg-green-400" />
              SSH
            </span>
          )}
          {agentMode === 'local' && (
            <button onClick={openDirectory} className="rounded-lg bg-indigo-500 px-3 py-1 text-xs text-white">
              {dirName ? `📁 ${dirName}` : 'Open Folder'}
            </button>
          )}
        </div>
      </div>

      {/* Main area: file tree | editor | chat */}
      <div className="flex flex-1 overflow-hidden">
        {/* File tree panel */}
        <div className="w-60 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50/80 p-2">
          {agentMode === 'remote' ? (
            <>
              {/* SSH Config Panel */}
              <button
                onClick={() => setSshPanelOpen(!sshPanelOpen)}
                className="mb-2 flex w-full items-center justify-between rounded bg-slate-200/60 px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
              >
                <span className="flex items-center gap-1.5">
                  {sshConnected ? <span className="h-2 w-2 rounded-full bg-green-400" /> : <span className="h-2 w-2 rounded-full bg-slate-300" />}
                  SSH Config
                </span>
                <span>{sshPanelOpen ? '▼' : '▶'}</span>
              </button>
              {/* Relay status */}
              <div className={`mb-2 flex items-center gap-1.5 rounded px-2 py-1 text-[10px] ${
                relayAvailable === null ? 'bg-slate-100 text-slate-400' : relayAvailable ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${relayAvailable === null ? 'bg-slate-300' : relayAvailable ? 'bg-green-400' : 'bg-amber-400'}`} />
                {relayAvailable === null ? 'Detecting local relay...' : relayAvailable ? '🔌 Local Relay active (localhost:9877)' : '☁️ Using cloud SSH (run wtt_local_relay.py for local)'}
              </div>
              {sshPanelOpen && (
                <div className="mb-2 space-y-1.5 rounded border border-slate-200 bg-white p-2">
                  <input
                    className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-indigo-400 focus:outline-none"
                    placeholder="Host"
                    value={sshConfig.host}
                    onChange={(e) => setSshConfig({ ...sshConfig, host: e.target.value })}
                  />
                  <div className="flex gap-1">
                    <input
                      className="w-16 rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-indigo-400 focus:outline-none"
                      placeholder="Port"
                      type="number"
                      value={sshConfig.port}
                      onChange={(e) => setSshConfig({ ...sshConfig, port: parseInt(e.target.value) || 22 })}
                    />
                    <input
                      className="flex-1 rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-indigo-400 focus:outline-none"
                      placeholder="Username"
                      value={sshConfig.username}
                      onChange={(e) => setSshConfig({ ...sshConfig, username: e.target.value })}
                    />
                  </div>
                  <input
                    className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-indigo-400 focus:outline-none"
                    placeholder="Password"
                    type="password"
                    value={sshConfig.password}
                    onChange={(e) => setSshConfig({ ...sshConfig, password: e.target.value })}
                  />
                  <textarea
                    className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] font-mono focus:border-indigo-400 focus:outline-none"
                    placeholder="Private Key (paste PEM content)"
                    rows={3}
                    value={sshConfig.private_key}
                    onChange={(e) => setSshConfig({ ...sshConfig, private_key: e.target.value })}
                  />
                  <input
                    className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-indigo-400 focus:outline-none"
                    placeholder="Project Path (e.g. ~/myproject)"
                    value={sshConfig.project_path}
                    onChange={(e) => setSshConfig({ ...sshConfig, project_path: e.target.value })}
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={testSshConnection}
                      disabled={sshTesting || !sshConfig.host || !sshConfig.username}
                      className="flex-1 rounded bg-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50"
                    >{sshTesting ? '...' : 'Test'}</button>
                    <button
                      onClick={connectSsh}
                      disabled={sshConnecting || !sshConfig.host || !sshConfig.username}
                      className="flex-1 rounded bg-indigo-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
                    >{sshConnecting ? 'Connecting...' : 'Connect'}</button>
                  </div>
                  {sshTestResult && (
                    <p className="text-[10px] text-slate-500">{sshTestResult}</p>
                  )}
                </div>
              )}
              {/* Remote tree */}
              {sshConnected && sshTree.length > 0 && (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="truncate text-xs font-semibold text-slate-500">{sshRemoteDirName}</p>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400">{countFiles(sshTree)} files</span>
                      <button
                        onClick={refreshSshTree}
                        disabled={sshConnecting}
                        className="rounded p-0.5 text-[11px] text-slate-400 hover:bg-slate-200 hover:text-slate-600 disabled:opacity-50"
                        title="Refresh"
                      >🔄</button>
                    </div>
                  </div>
                  {sshTree.map((node) => (
                    <FileTreeNode
                      key={node.path}
                      node={node}
                      depth={0}
                      selectedPath={selectedFile?.path || ''}
                      onSelect={selectFile}
                    />
                  ))}
                </>
              )}
              {sshConnected && sshTree.length === 0 && !sshConnecting && (
                <p className="text-center text-[11px] text-slate-400">No files found</p>
              )}
              {!sshConnected && !sshPanelOpen && (
                <div className="flex h-32 flex-col items-center justify-center text-center">
                  <p className="text-2xl">☁️</p>
                  <p className="mt-1 text-[11px] text-slate-400">Configure SSH to connect</p>
                </div>
              )}
            </>
          ) : (
            <>
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
                    </div>
                  </div>
                  {fileTree.map((node) => (
                    <FileTreeNode
                      key={node.path}
                      node={node}
                      depth={0}
                      selectedPath={selectedFile?.path || ''}
                      onSelect={selectFile}
                    />
                  ))}
                </>
              )}
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
                  readOnly: agentMode === 'remote',
                }}
              />
              {isModified && agentMode === 'local' && (
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
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Agent Chat</span>
              <span className={`h-2 w-2 rounded-full ${wsState === 'connected' ? 'bg-green-400' : 'bg-slate-300'}`} title={wsState === 'connected' ? 'WebSocket connected' : 'Disconnected'} />
            </div>
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
                  {msg.role === 'user' && (
                    <p className="mb-1 text-[11px] font-semibold text-emerald-600">You</p>
                  )}
                  {msg.role === 'assistant' && (
                    <p className="mb-1 text-[11px] font-semibold text-indigo-600">🤖 {msg.sender_display_name || 'Agent'}</p>
                  )}
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  <p className="mt-1 text-[10px] text-slate-400">{new Date(msg.timestamp).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
            {awaitingAgent && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="animate-pulse">🤔</span> Agent is thinking...
                  </span>
                </div>
              </div>
            )}
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
