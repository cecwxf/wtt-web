'use client'

import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import dynamic from 'next/dynamic'
import { CLIENT_WTT_API_BASE, DEFAULT_WTT_API_ORIGIN, WS_BASE_URL } from '@/lib/api/base-url'
import { normalizeAndFilterAgents } from '@/lib/agents'
import { useWebSocket, type WsMessage } from '@/lib/useWebSocket'
import { buildWttUserSourceFlow } from '@/lib/wtt-info-flow'
import { ChatFileUpload, FileAttachmentPreview, stripFileTokens, PendingAttachments } from '@/components/ui/chat-file-upload'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { TaskAgentSidebar } from '@/components/ui/task-agent-sidebar'
import { stripMetaBlocks, isProgressMessage } from '@/components/ui/chat-view'
import { formatTime, formatDateGroup } from '@/lib/time'
import { useAgentId, buildAgentUrl } from '@/lib/hooks/use-agent-id'
import { isDesktop, getDesktopBridge, pickAndScanFolder, readLocalFile, watchLocalFolder, registerFileBridge, type ScannedFile } from '@/lib/desktop'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })
const MonacoDiffEditor = dynamic(() => import('@monaco-editor/react').then(m => ({ default: m.DiffEditor })), { ssr: false })

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

interface RepoTreeItem {
  path: string
  kind: 'file' | 'directory'
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

/** Convert flat ScannedFile[] (from Electron localSync.scanFolder) into a hierarchical FileNode[] tree. */
function scannedToFileNodes(files: ScannedFile[]): FileNode[] {
  const root: FileNode[] = []
  const dirs = new Map<string, FileNode>()

  const ensureDir = (dirPath: string): FileNode => {
    if (dirs.has(dirPath)) return dirs.get(dirPath)!
    const parts = dirPath.split('/')
    const name = parts[parts.length - 1]
    const node: FileNode = { name, path: dirPath, kind: 'directory', children: [] }
    dirs.set(dirPath, node)
    if (parts.length === 1) {
      root.push(node)
    } else {
      const parent = ensureDir(parts.slice(0, -1).join('/'))
      parent.children!.push(node)
    }
    return node
  }

  for (const f of files) {
    const parts = f.relativePath.split('/')
    const fileNode: FileNode = { name: parts[parts.length - 1], path: f.relativePath, kind: 'file' }
    if (parts.length === 1) {
      root.push(fileNode)
    } else {
      const parentDir = ensureDir(parts.slice(0, -1).join('/'))
      parentDir.children!.push(fileNode)
    }
  }

  // Sort recursively: directories first, then alphabetical
  const sortNodes = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const n of nodes) if (n.children) sortNodes(n.children)
  }
  sortNodes(root)
  return root
}

// ── File icons by extension (VSCode-style) ─────────────
const fileIcon = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const base = name.toLowerCase()
  // Special filenames
  if (base === 'package.json') return '📦'
  if (base === 'tsconfig.json' || base === 'jsconfig.json') return '⚙️'
  if (base === 'dockerfile' || base === '.dockerignore') return '🐳'
  if (base === '.gitignore' || base === '.gitmodules') return '🔀'
  if (base === 'readme.md' || base === 'readme') return '📖'
  if (base === 'license' || base === 'license.md') return '📜'
  if (base === '.env' || base.startsWith('.env.')) return '🔑'
  if (base === 'makefile' || base === 'cmakelists.txt') return '🔧'
  const iconMap: Record<string, string> = {
    ts: '🟦', tsx: '⚛️', js: '🟨', jsx: '⚛️',
    py: '🐍', rs: '🦀', go: '🔷', java: '☕', kt: '🟣',
    cpp: '🔵', c: '🔵', h: '🔵', hpp: '🔵', cs: '💜',
    rb: '💎', php: '🐘', swift: '🍊', sh: '🐚', bash: '🐚',
    json: '📋', yaml: '📋', yml: '📋', toml: '📋', xml: '📋',
    md: '📝', html: '🌐', css: '🎨', scss: '🎨', less: '🎨',
    sql: '🗃️', graphql: '🔮', prisma: '🔺',
    svg: '🖼️', png: '🖼️', jpg: '🖼️', gif: '🖼️', ico: '🖼️',
    lock: '🔒', map: '🗺️', wasm: '⚡',
    vue: '💚', svelte: '🧡',
  }
  return iconMap[ext] || '📄'
}

// ── Compact single-child folder chains (like VSCode) ───
function compactTree(nodes: FileNode[]): FileNode[] {
  return nodes.map(node => {
    if (node.kind !== 'directory' || !node.children?.length) return node
    let current = node
    const nameParts = [current.name]
    // Merge chain of single-child directories
    while (
      current.kind === 'directory' &&
      current.children?.length === 1 &&
      current.children[0].kind === 'directory'
    ) {
      current = current.children[0]
      nameParts.push(current.name)
    }
    if (nameParts.length > 1) {
      return {
        ...current,
        name: nameParts.join('/'),
        children: current.children ? compactTree(current.children) : undefined,
      }
    }
    return {
      ...node,
      children: compactTree(node.children),
    }
  })
}

function buildFileTreeFromFlat(items: RepoTreeItem[]): FileNode[] {
  type NodeMap = Record<string, { __node: FileNode; __children: NodeMap }>
  const root: NodeMap = {}

  for (const it of items) {
    const parts = it.path.split('/').filter(Boolean)
    if (!parts.length) continue
    let level = root
    let pathAcc = ''

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      pathAcc = pathAcc ? `${pathAcc}/${part}` : part
      const isLast = i === parts.length - 1
      const kind: 'file' | 'directory' = isLast ? it.kind : 'directory'

      if (!level[part]) {
        level[part] = {
          __node: { name: part, path: pathAcc, kind, children: kind === 'directory' ? [] : undefined },
          __children: {},
        }
      }
      if (kind === 'directory') level[part].__node.kind = 'directory'
      level = level[part].__children
    }
  }

  const materialize = (m: NodeMap): FileNode[] => {
    const nodes = Object.values(m).map((x) => {
      const n = x.__node
      if (n.kind === 'directory') {
        n.children = materialize(x.__children)
      }
      return n
    })
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return nodes
  }

  return compactTree(materialize(root))
}

// ── Fuzzy file search (VSCode Ctrl+P style) ────────────
function flattenTree(nodes: FileNode[], out: FileNode[] = []): FileNode[] {
  for (const n of nodes) {
    if (n.kind === 'file') out.push(n)
    if (n.children) flattenTree(n.children, out)
  }
  return out
}

function fuzzyMatch(query: string, target: string): { match: boolean; score: number; indices: number[] } {
  const ql = query.toLowerCase()
  const tl = target.toLowerCase()
  if (!ql) return { match: true, score: 0, indices: [] }

  // Exact substring gets highest score
  const subIdx = tl.indexOf(ql)
  if (subIdx >= 0) {
    const indices = Array.from({ length: ql.length }, (_, i) => subIdx + i)
    // Prefer matches at start of filename, then shorter paths
    const nameStart = target.lastIndexOf('/') + 1
    const atNameStart = subIdx === nameStart ? 200 : 0
    return { match: true, score: 300 + atNameStart - target.length * 0.5, indices }
  }

  // Fuzzy: each query char must appear in order
  let qi = 0
  const indices: number[] = []
  let score = 0
  let lastIdx = -1
  for (let ti = 0; ti < tl.length && qi < ql.length; ti++) {
    if (tl[ti] === ql[qi]) {
      indices.push(ti)
      // Bonus for consecutive matches
      if (ti === lastIdx + 1) score += 10
      // Bonus for match after separator (/, ., -, _)
      if (ti === 0 || '/.-_'.includes(target[ti - 1])) score += 15
      // Bonus for matching uppercase (camelCase boundary)
      if (target[ti] === target[ti].toUpperCase() && target[ti] !== target[ti].toLowerCase()) score += 5
      lastIdx = ti
      qi++
    }
  }
  if (qi < ql.length) return { match: false, score: 0, indices: [] }
  // Penalize longer paths / larger gaps
  score += 100 - (target.length - ql.length) * 0.5
  return { match: true, score, indices }
}

// Render text with fuzzy-matched characters highlighted
function renderHighlighted(text: string, allIndices: number[], offset: number) {
  // Convert absolute path indices to relative indices for the displayed text
  const localIndices = new Set(allIndices.filter(i => i >= offset).map(i => i - offset))
  return (
    <span>
      {text.split('').map((ch, i) =>
        localIndices.has(i) ? <b key={i} className="text-indigo-600">{ch}</b> : <span key={i}>{ch}</span>
      )}
    </span>
  )
}

async function readFileContent(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  return file.text()
}

function extractFilePatch(content: string): { path: string; code: string } | null {
  const m = content.match(/\[FILE\]\s+([^\n]+)\n```[\w-]*\n([\s\S]*?)\n```/)
  if (!m) return null
  return { path: m[1].trim(), code: m[2] }
}

interface PendingPatch {
  path: string
  code: string
  status: 'pending' | 'accepted' | 'rejected'
  originalContent?: string
  fileStatus?: string // 'added' | 'modified' | 'removed' | 'renamed'
  additions?: number
  deletions?: number
}

function extractAllPatches(content: string): PendingPatch[] {
  const re = /\[FILE\]\s+([^\n]+)\n```[\w-]*\n([\s\S]*?)\n```/g
  const patches: PendingPatch[] = []
  let m
  while ((m = re.exec(content)) !== null) {
    patches.push({ path: m[1].trim(), code: m[2], status: 'pending' })
  }
  return patches
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

// ── Context Menu Component ─────────────────────────────
interface ContextMenuItem {
  label: string
  icon?: string
  shortcut?: string
  onClick: () => void
  danger?: boolean
  divider?: boolean
  disabled?: boolean
}

function ContextMenu({ items, x, y, onClose }: { items: ContextMenuItem[]; x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', keyHandler) }
  }, [onClose])

  // Adjust position to stay in viewport
  const adjustedX = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 220)
  const adjustedY = Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 800) - items.length * 30 - 20)

  return (
    <div ref={ref} className="fixed z-[100] min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
      style={{ left: adjustedX, top: adjustedY }}>
      {items.map((item, i) => item.divider ? (
        <div key={i} className="my-1 border-t border-slate-100" />
      ) : (
        <button key={i} disabled={item.disabled}
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] ${
            item.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100'
          } disabled:opacity-40 disabled:cursor-default`}
          onClick={() => { item.onClick(); onClose() }}>
          {item.icon && <span className="w-4 text-center text-[11px]">{item.icon}</span>}
          <span className="flex-1">{item.label}</span>
          {item.shortcut && <span className="text-[10px] text-slate-400">{item.shortcut}</span>}
        </button>
      ))}
    </div>
  )
}

const SYMBOL_ICONS: Record<string, string> = {
  Function: '𝑓', Method: '𝑓', Class: '◆', Interface: '◇', Enum: '∈',
  Variable: '𝑥', Constant: 'π', Property: '◉', Field: '◉', Type: '𝑇',
  Constructor: '⊕', Module: '◫', Namespace: '◫', Struct: '◆', EnumMember: '∷',
  H1: '#', H2: '##', H3: '###', H4: '####', H5: '#####', H6: '######',
  Symbol: '○',
}

// ── File Tree Component (VSCode-style) ─────────────────
function FileTreeNode({
  node, depth, selectedPath, onSelect, onContextMenu, forceExpanded, collapseSignal,
}: {
  node: FileNode; depth: number; selectedPath: string
  onSelect: (node: FileNode) => void
  onContextMenu?: (e: React.MouseEvent, node: FileNode) => void
  forceExpanded?: Set<string>
  collapseSignal?: number
}) {
  const [expanded, setExpanded] = useState(depth < 1 || (forceExpanded?.has(node.path) ?? false))
  const isDir = node.kind === 'directory'
  const isSelected = node.path === selectedPath
  // Check if any descendant is the selected file (highlight path)
  const containsSelected = isDir && selectedPath.startsWith(node.path + '/')

  // Auto-expand when forceExpanded includes this path
  useEffect(() => {
    if (forceExpanded?.has(node.path)) setExpanded(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceExpanded, node.path])

  // Collapse All: reset to collapsed when signal changes (except root level)
  useEffect(() => {
    if (collapseSignal && depth > 0) setExpanded(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseSignal])

  // Auto-expand folders containing the selected file
  useEffect(() => {
    if (containsSelected && !expanded) setExpanded(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath])

  const childCount = isDir ? (node.children?.length ?? 0) : 0

  return (
    <div className="relative">
      {/* Indent guide lines */}
      {depth > 0 && (
        <div
          className="absolute top-0 bottom-0 border-l border-slate-200/80"
          style={{ left: `${(depth - 1) * 16 + 11}px` }}
        />
      )}
      <div
        className={`group flex w-full cursor-pointer items-center gap-0 py-[1px] text-left text-[12px] transition-colors
          ${isSelected ? 'bg-indigo-500/15 text-indigo-700 font-medium' : containsSelected ? 'text-slate-700' : 'text-slate-600'}
          hover:bg-slate-500/10`}
        style={{ paddingLeft: `${depth * 16 + 4}px`, height: '22px' }}
        onClick={() => {
          if (isDir) setExpanded(!expanded)
          else onSelect(node)
        }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e, node) }}
      >
        {/* Chevron for directories */}
        <span className="flex w-4 shrink-0 items-center justify-center text-[9px] text-slate-400">
          {isDir ? (expanded ? '▼' : '▶') : ''}
        </span>
        {/* Icon */}
        <span className="mr-1 flex w-4 shrink-0 items-center justify-center text-[12px]">
          {isDir ? (expanded ? '📂' : '📁') : fileIcon(node.name)}
        </span>
        {/* Name */}
        <span className="truncate">{node.name}</span>
        {/* Child count badge for directories */}
        {isDir && !expanded && childCount > 0 && (
          <span className="ml-1 text-[9px] text-slate-400">{childCount}</span>
        )}
        {/* Quick actions on hover */}
        {isDir && onContextMenu && (
          <div className="ml-auto hidden shrink-0 items-center gap-0.5 pr-1 group-hover:flex">
            <button onClick={(e) => { e.stopPropagation(); setExpanded(true); onContextMenu(e, { ...node, _action: 'newFile' } as FileNode & { _action: string }) }}
              className="rounded px-0.5 text-[10px] text-slate-400 hover:bg-slate-300 hover:text-slate-700" title="New file">+</button>
          </div>
        )}
      </div>
      {isDir && expanded && node.children?.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath}
          onSelect={onSelect} onContextMenu={onContextMenu} forceExpanded={forceExpanded} collapseSignal={collapseSignal} />
      ))}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────
export default function CodeTaskPageWrapper() {
  return <Suspense fallback={null}><CodeTaskPageInner /></Suspense>
}

function CodeTaskPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string

  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useAgentId()
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [modifiedContent, setModifiedContent] = useState('')
  const [isModified, setIsModified] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<string[]>([])
  const [dirName, setDirName] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [openFiles, setOpenFiles] = useState<FileNode[]>([])
  const [repoTree, setRepoTree] = useState<FileNode[]>([])
  const [repoLoading, setRepoLoading] = useState(false)
  const [repoLinking, setRepoLinking] = useState(false)
  const [repoCreating, setRepoCreating] = useState(false)
  const [repoQuery, setRepoQuery] = useState('')
  const [forceExpandedPaths, setForceExpandedPaths] = useState<Set<string>>(new Set())
  const [collapseSignal, setCollapseSignal] = useState(0)

  // ── Resizable panel widths ─────────────────────────
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    if (typeof window === 'undefined') return 240
    try { return parseInt(localStorage.getItem('code-left-panel-w') || '240') || 240 } catch { return 240 }
  })
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    if (typeof window === 'undefined') return 420
    try { return parseInt(localStorage.getItem('code-right-panel-w') || '420') || 420 } catch { return 420 }
  })
  const resizingRef = useRef<'left' | 'right' | null>(null)
  const resizeStartXRef = useRef(0)
  const resizeStartWRef = useRef(0)

  useEffect(() => {
    try { localStorage.setItem('code-left-panel-w', String(leftPanelWidth)) } catch {}
  }, [leftPanelWidth])
  useEffect(() => {
    try { localStorage.setItem('code-right-panel-w', String(rightPanelWidth)) } catch {}
  }, [rightPanelWidth])

  // Global mouse move/up for resize (attached only while dragging)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return
      e.preventDefault()
      const dx = e.clientX - resizeStartXRef.current
      if (resizingRef.current === 'left') {
        setLeftPanelWidth(Math.max(160, Math.min(500, resizeStartWRef.current + dx)))
      } else {
        setRightPanelWidth(Math.max(280, Math.min(700, resizeStartWRef.current - dx)))
      }
    }
    const onUp = () => { resizingRef.current = null; document.body.style.cursor = ''; document.body.style.userSelect = '' }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const startResize = (which: 'left' | 'right', e: React.MouseEvent) => {
    resizingRef.current = which
    resizeStartXRef.current = e.clientX
    resizeStartWRef.current = which === 'left' ? leftPanelWidth : rightPanelWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  const codebaseSharedSigRef = useRef<string>('')
  const [repoBranches, setRepoBranches] = useState<string[]>([])
  const [currentBranch, setCurrentBranch] = useState<string>('')
  const [defaultBranch, setDefaultBranch] = useState<string>('main')

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

  // ── Desktop (Electron) local project state ──────────
  const [desktopMode, setDesktopMode] = useState(false)
  const [projectRoot, setProjectRoot] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try { return localStorage.getItem(`code-project-${params.id as string}`) } catch { return null }
  })
  const desktopContentCacheRef = useRef<Record<string, string>>({})
  const desktopWatchCleanupRef = useRef<(() => void) | null>(null)

  // ── Local relay detection ──────────────────────────
  const [relayAvailable, setRelayAvailable] = useState<boolean | null>(null)
  const sshApiBase = relayAvailable ? LOCAL_RELAY_URL : REMOTE_SSH_FALLBACK

  useEffect(() => {
    if (agentMode !== 'remote') return
    let cancelled = false
    const check = async () => {
      try {
        const r = await fetch(`${LOCAL_RELAY_URL}/health`, {
          signal: AbortSignal.timeout(2000),
        }).catch(() => null)
        if (!cancelled) setRelayAvailable(r !== null && r.ok)
      } catch {
        if (!cancelled) setRelayAvailable(false)
      }
    }
    check()
    return () => { cancelled = true }
  }, [agentMode])

  // ── Desktop: auto-restore saved project on mount ───
  useEffect(() => {
    if (!isDesktop() || !projectRoot || fileTree.length > 0) return
    let cancelled = false
    const restore = async () => {
      try {
        const result = await import('@/lib/desktop').then(m => m.scanLocalFolder(projectRoot))
        if (cancelled || !result) return
        const tree = scannedToFileNodes(result.files)
        const folderName = result.path.split(/[/\\]/).pop() || result.path
        setDirName(folderName)
        setFileTree(tree)
        setDesktopMode(true)
        desktopContentCacheRef.current = {}
      } catch { /* ignore restore failures */ }
    }
    restore()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRoot])

  // ── Desktop: file watcher for external changes ─────
  useEffect(() => {
    if (!desktopMode || !projectRoot) return
    let cleanup: (() => void) | null = null
    watchLocalFolder(projectRoot, (event) => {
      if (event.eventType === 'rename') {
        // File added/removed: re-scan project tree
        void (async () => {
          try {
            const result = await import('@/lib/desktop').then(m => m.scanLocalFolder(projectRoot))
            if (!result) return
            setFileTree(scannedToFileNodes(result.files))
          } catch { /* ignore */ }
        })()
      }
    }).then(c => {
      cleanup = c
      desktopWatchCleanupRef.current = c
    })
    return () => {
      cleanup?.()
      desktopWatchCleanupRef.current = null
    }
  }, [desktopMode, projectRoot])

  const { data: task, mutate: mutateTask } = useSWR(
    session?.accessToken ? [`task-${taskId}`, session.accessToken] : null,
    async () => {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
  )

  // ── WebSocket for real-time messages ───────────────
  const streamAgentId = selectedAgentId || task?.runner_agent_id || task?.owner_agent_id || ''
  const wsUrl = streamAgentId ? `${WS_BASE_URL}/ws/${streamAgentId}` : ''
  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.type !== 'new_message' || !msg.message) return
      if (msg.message.topic_id !== task?.topic_id) return
      const m = msg.message as Record<string, unknown>
      const senderType = String(m.sender_type || '').toLowerCase()
      const senderId = String(m.sender_id || '')
      const incoming: ChatMsg = {
        id: String(m.id || ''),
        role: senderType === 'human' ? 'user' : 'assistant',
        content: String(m.content || ''),
        timestamp: String(m.created_at || new Date().toISOString()),
        sender_display_name: m.sender_display_name ? String(m.sender_display_name) : agents.find(a => a.agent_id === senderId)?.display_name || senderId,
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
        if (mm?.[1] && task?.topic_id && streamAgentId) {
          const requested = Array.from(new Set(mm[1].split(',').map((s) => s.trim()).filter(Boolean))).slice(0, 20)
          if (requested.length) {
            const activeTree = agentMode === 'remote' ? sshTree : fileTree
            void (async () => {
              for (const p of requested) {
                const node = findFileNodeByPath(activeTree, p)
                if (!node || node.kind !== 'file') continue
                // In desktop mode, we don't need node.handle; in browser local mode we do
                if (agentMode === 'local' && !desktopMode && !node.handle) continue
                try {
                  let content: string
                  if (selectedFile && selectedFile.path === node.path) {
                    content = modifiedContent
                  } else if (desktopMode && projectRoot) {
                    // Desktop: read via Electron IPC
                    const cached = desktopContentCacheRef.current[node.path]
                    if (cached !== undefined) {
                      content = cached
                    } else {
                      const read = await readLocalFile(`${projectRoot}/${node.path}`)
                      if (read === null) continue
                      content = read
                      desktopContentCacheRef.current[node.path] = content
                    }
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
                  await fetch(`${CLIENT_WTT_API_BASE}/topics/${task.topic_id}/messages?agent_id=${encodeURIComponent(streamAgentId)}`, {
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
    [task?.topic_id, streamAgentId, fileTree, selectedFile, modifiedContent, session?.accessToken, agentMode, sshTree, sshConfig, desktopMode, projectRoot],
  )
  const { state: wsState, sendAction } = useWebSocket({
    url: wsUrl,
    enabled: !!streamAgentId,
    token: session?.accessToken || undefined,
    onMessage: handleWsMessage,
  })

  // Load initial message history via HTTP (once), then switch to WS-first.
  const { data: topicMessages, mutate: mutateTopicMessages } = useSWR(
    task?.topic_id && session?.accessToken ? [`code-chat-${task.topic_id}`, session.accessToken, streamAgentId] : null,
    async () => {
      const tryFetch = async (agentId?: string) => {
        const q = agentId ? `?limit=200&agent_id=${encodeURIComponent(agentId)}` : '?limit=200'
        const r = await fetch(`${CLIENT_WTT_API_BASE}/topics/${task.topic_id}/messages${q}`, {
          headers: { Authorization: `Bearer ${session?.accessToken}` },
        })
        return r
      }

      let r = await tryFetch(streamAgentId || undefined)
      if (!r.ok && task?.runner_agent_id && task.runner_agent_id !== streamAgentId) {
        r = await tryFetch(task.runner_agent_id)
      }
      if (!r.ok) {
        r = await tryFetch(undefined)
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
    { revalidateOnFocus: false, refreshInterval: wsState === 'connected' ? 0 : 5000, keepPreviousData: true },
  )

  const prevWsStateRef = useRef<string>('disconnected')
  useEffect(() => {
    if (wsState === 'connected' && prevWsStateRef.current !== 'connected') {
      // one-shot backfill after reconnect to cover short WS gaps
      void mutateTopicMessages()
    }
    prevWsStateRef.current = wsState
  }, [wsState, mutateTopicMessages])

  // Seed chat from history (only once on load or agent switch)
  useEffect(() => {
    if (!topicMessages) return
    const mapped: ChatMsg[] = topicMessages
      .filter((m: Record<string, string>) => !!(m.content || m.message || m.text))
      .map((m: Record<string, string>) => ({
        id: m.id || m.message_id || `${m.sender_id || 'unknown'}-${m.created_at || m.timestamp || Date.now()}`,
        role: String(m.sender_type || '').toUpperCase() === 'HUMAN' ? 'user' : 'assistant',
        content: m.content || m.message || m.text || '',
        timestamp: m.created_at || m.timestamp || new Date().toISOString(),
        sender_display_name: m.sender_display_name || agents.find(a => a.agent_id === m.sender_id)?.display_name || m.sender_id,
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

  // Keep chat subscription aligned with task runner to avoid missing topic feed updates
  useEffect(() => {
    if (!task?.runner_agent_id || agents.length === 0) return
    const hasRunner = agents.some((a) => a.agent_id === task.runner_agent_id)
    if (hasRunner && selectedAgentId !== task.runner_agent_id) {
      setSelectedAgentId(task.runner_agent_id)
    }
  }, [task?.runner_agent_id, agents, selectedAgentId])

  // Build headers for repo API calls: WTT auth + GitHub OAuth token
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ghToken = (session as any)?.githubToken as string | undefined
  const repoHeaders = useCallback(() => {
    const h: Record<string, string> = { Authorization: `Bearer ${session?.accessToken ?? ''}` }
    if (ghToken) h['X-GitHub-Token'] = ghToken
    return h
  }, [session?.accessToken, ghToken])

  const loadRepoTree = useCallback(async (branchOverride?: string) => {
    if (!task?.repo_url || !session?.accessToken) {
      setRepoTree([])
      return
    }
    setRepoLoading(true)
    try {
      const params = branchOverride ? `?ref=${encodeURIComponent(branchOverride)}` : ''
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/tree${params}`, {
        headers: repoHeaders(),
      })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      const tree = buildFileTreeFromFlat((data.tree || []) as RepoTreeItem[])
      setRepoTree(tree)
      if (data.branch) setCurrentBranch(data.branch)
    } catch (e) {
      console.error('load repo tree failed', e)
      setRepoTree([])
    } finally {
      setRepoLoading(false)
    }
  }, [task?.repo_url, session?.accessToken, taskId])

  useEffect(() => {
    void loadRepoTree()
  }, [loadRepoTree])

  // Load branches list
  useEffect(() => {
    if (!task?.repo_url || !session?.accessToken) return
    fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/branches`, { headers: repoHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.branches) {
          setRepoBranches(data.branches)
          setDefaultBranch(data.default_branch || 'main')
          if (!currentBranch) setCurrentBranch(data.default_branch || 'main')
        }
      })
      .catch(() => {})
  }, [task?.repo_url, session?.accessToken, taskId])

  const linkRepo = async () => {
    if (!task?.id) return
    const repo = window.prompt('GitHub repo URL (e.g. https://github.com/owner/repo)')?.trim()
    if (!repo) return
    const branch = window.prompt('Branch', task?.repo_branch || 'main')?.trim() || 'main'
    const repoPath = window.prompt('Repo sub path (optional)', task?.repo_path || '')?.trim() || null
    setRepoLinking(true)
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${task.id}/repo/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...repoHeaders(),
        },
        body: JSON.stringify({ repo_url: repo, repo_branch: branch, repo_path: repoPath }),
      })
      if (!r.ok) throw new Error(await r.text())
      await mutateTask()
      await loadRepoTree()
    } catch (e) {
      alert(`Link repo failed: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setRepoLinking(false)
    }
  }

  const createRepo = async () => {
    if (!task?.id) return
    const defaultName = `wtt-${task.id.slice(0, 8)}`
    const name = window.prompt('New GitHub repo name', defaultName)?.trim() || defaultName
    const branch = window.prompt('Branch', 'main')?.trim() || 'main'
    setRepoCreating(true)
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${task.id}/repo/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...repoHeaders(),
        },
        body: JSON.stringify({ repo_name: name, repo_branch: branch, private: true }),
      })
      if (!r.ok) throw new Error(await r.text())
      await mutateTask()
      await loadRepoTree()
    } catch (e) {
      alert(`Create repo failed: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setRepoCreating(false)
    }
  }

  // Local fuzzy file search (like VSCode Ctrl+P)
  const fuzzySearchResults = useMemo(() => {
    const q = repoQuery.trim()
    if (!q) return []
    const allFiles = flattenTree(repoTree)
    const scored: Array<{ node: FileNode; score: number; indices: number[] }> = []
    for (const f of allFiles) {
      const { match, score, indices } = fuzzyMatch(q, f.path)
      if (match) scored.push({ node: f, score, indices })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 30)
  }, [repoQuery, repoTree])

  // ── Load saved SSH config from localStorage ───────
  useEffect(() => {
    if (!taskId) return
    try {
      const saved = localStorage.getItem(`ssh-config-${taskId}`)
      if (saved) setSshConfig(JSON.parse(saved) as SSHConfig)
    } catch { /* ignore */ }
  }, [taskId])

  const SEND_TIMEOUT_MS = 15000

  // ── Publish to topic helper (WS first, HTTP fallback) ──
  const publishToTopic = async (
    content: string,
    semanticType = 'post',
    senderType: 'HUMAN' | 'AGENT' = 'AGENT',
  ): Promise<'ws' | 'http'> => {
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
      if (wsResult !== null) return 'ws' // WS succeeded
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
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
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
    return 'http'
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
    // Desktop (Electron): use native folder picker + recursive scan
    if (isDesktop()) {
      try {
        const result = await pickAndScanFolder('Open project folder')
        if (!result) return // cancelled
        const tree = scannedToFileNodes(result.files)
        const folderName = result.path.split(/[/\\]/).pop() || result.path
        setDirName(folderName)
        setFileTree(tree)
        setProjectRoot(result.path)
        setDesktopMode(true)
        desktopContentCacheRef.current = {}
        try { localStorage.setItem(`code-project-${taskId}`, result.path) } catch {}

        // Register file bridge so agent can read files on demand via WS relay
        if (selectedAgentId) {
          registerFileBridge(taskId, selectedAgentId, result.path, result.files).catch(() => {})
        }

        if (task?.topic_id) {
          const treeText = buildTreeText(tree)
          await publishToTopic(
            `[CODEBASE] ${folderName}\n\`\`\`\n${folderName}/\n${treeText}\n\`\`\`\nCodebase opened with ${countFiles(tree)} files. Ask me to share specific files for analysis.`,
            'notification',
          )
        }
      } catch {
        // User cancelled or error
      }
      return
    }
    // Browser: use File System Access API
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
    if (task?.repo_url) {
      if (node.kind !== 'file') return
      if (!node.path || !String(node.path).trim()) {
        alert('文件路径为空，无法读取')
        return
      }
      setSelectedFile(node)
      setFileLoading(true)
      setFileContent('')
      setModifiedContent('// Loading file content...')
      setIsModified(false)
      try {
        // If file was saved on edit branch, read from there to preserve edits
        const readBranch = (editBranch && savedFiles.has(node.path)) ? editBranch : currentBranch
        const branchParam = readBranch ? `?ref=${encodeURIComponent(readBranch)}` : ''
        const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/file/${encodeURIComponent(node.path)}${branchParam}`, {
          headers: repoHeaders(),
        })
        if (!r.ok) throw new Error(await r.text())
        const data = await r.json()
        const content = data.content || ''
        setFileContent(content)
        setModifiedContent(content)
        setIsModified(false)
        if (!openFiles.find((f) => f.path === node.path)) {
          setOpenFiles((prev) => [...prev, node])
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown error'
        console.error('Failed to read repo file:', e)
        setFileContent('')
        setModifiedContent(`// Failed to load file\n// ${msg}`)
        alert(`读取仓库文件失败: ${msg}`)
      } finally {
        setFileLoading(false)
      }
      return
    }

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
    // Desktop (Electron) local mode: read via IPC
    if (desktopMode && projectRoot && node.kind === 'file') {
      setSelectedFile(node)
      setFileLoading(true)
      setFileContent('')
      setModifiedContent('// Loading file content...')
      setIsModified(false)
      try {
        const fullPath = `${projectRoot}/${node.path}`
        const content = await readLocalFile(fullPath)
        if (content === null) throw new Error('Failed to read file')
        desktopContentCacheRef.current[node.path] = content
        setFileContent(content)
        setModifiedContent(content)
        setIsModified(false)
        if (!openFiles.find((f) => f.path === node.path)) {
          setOpenFiles((prev) => [...prev, node])
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown error'
        setFileContent('')
        setModifiedContent(`// Failed to load file\n// ${msg}`)
      } finally {
        setFileLoading(false)
      }
      return
    }
    // Browser File System Access API fallback
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
    if (!isModified || !selectedFile?.path) return
    // Desktop (Electron) local mode: save via IPC
    if (desktopMode && projectRoot) {
      try {
        const bridge = getDesktopBridge()
        if (!bridge) throw new Error('Desktop bridge not available')
        const fullPath = `${projectRoot}/${selectedFile.path}`
        const result = await bridge.fs.writeFile(fullPath, modifiedContent)
        if (!result.ok) throw new Error(result.error || 'Write failed')
        desktopContentCacheRef.current[selectedFile.path] = modifiedContent
        setFileContent(modifiedContent)
        setIsModified(false)
      } catch (e) {
        alert(`Save failed: ${e instanceof Error ? e.message : 'unknown'}`)
      }
      return
    }
    if (selectedFile?.handle) {
      // Browser File System Access API save
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
    } else if (task?.repo_url && session?.accessToken) {
      // GitHub mode: save file to remote edit branch (keep original baseline)
      setSaving(true)
      try {
        const branch = await ensureEditBranch()
        if (!branch) { setSaving(false); return }
        const resp = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/file/${encodeURIComponent(selectedFile.path)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...repoHeaders() },
          body: JSON.stringify({ content: modifiedContent, branch, message: `Update ${selectedFile.path}` }),
        })
        if (!resp.ok) throw new Error(await resp.text())
        // Don't overwrite fileContent — keep main branch baseline for discard
        setIsModified(false)
        setSavedFiles(prev => { const s = new Set(Array.from(prev)); s.add(selectedFile.path); return s })
      } catch (e) {
        alert(`Save failed: ${e instanceof Error ? e.message : 'unknown'}`)
      } finally {
        setSaving(false)
      }
    }
  }

  const discardEdits = () => {
    // Revert editor to original main-branch content
    setModifiedContent(fileContent)
    setIsModified(false)
    setEditBranch(null)
    setSavedFiles(new Set())
  }

  const createPR = async () => {
    if (!editBranch || savedFiles.size === 0 || !session?.accessToken) return
    const title = prompt('PR title:', `WTT edit: ${Array.from(savedFiles).map(f => f.split('/').pop()).join(', ')}`)
    if (!title) return
    try {
      const resp = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...repoHeaders() },
        body: JSON.stringify({ title, head: editBranch, body: `Modified files:\n${Array.from(savedFiles).map(f => `- ${f}`).join('\n')}` }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      alert(`PR #${data.number} created!`)
      // Clear saved-files tracking but keep editBranch — fixed branch reused next time
      setEditBranch(null)
      setSavedFiles(new Set())
      void fetchPulls()
      setRightTab('prs')
    } catch (e) {
      alert(`Create PR failed: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  // Ctrl+S global handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveFile()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

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

    // Local mode: desktop (Electron IPC) or browser (File System Access API)
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
        `[CODEBASE INDEX] ${dirName || 'workspace'}${desktopMode ? ' (desktop)' : ''}`,
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
      try {
        let content = ''
        if (selectedFile && f.path === selectedFile.path) {
          content = modifiedContent
        } else if (desktopMode && projectRoot) {
          // Desktop: read via Electron IPC (use cache when available)
          const cached = desktopContentCacheRef.current[f.path]
          if (cached !== undefined) {
            content = cached
          } else {
            const read = await readLocalFile(`${projectRoot}/${f.path}`)
            if (read === null) { skipped++; continue }
            content = read
            desktopContentCacheRef.current[f.path] = content
          }
        } else if (f.handle) {
          // Browser: File System Access API
          content = await readFileContent(f.handle as FileSystemFileHandle)
        } else {
          skipped++
          continue
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
      `[CODEBASE CONTEXT] ${dirName || 'workspace'}${desktopMode ? ' (desktop)' : ''}`,
      `files_in_workspace=${allFiles.length}, files_included=${included}, files_skipped=${skipped}`,
      `\n[PROJECT TREE]\n\
\`\`\`\n${dirName || 'workspace'}/\n${treeText}\n\`\`\``,
    ].join('\n')

    return { content: `${text}\n\n${header}${fileBlocks.join('')}`, fullCodebase: true }
  }

  const applyPatchToEditor = (path: string, code: string) => {
    if (!path || !code) return
    if (selectedFile && selectedFile.path !== path) {
      const node = findFileNodeByPath(repoTree, path)
      if (node) {
        setSelectedFile(node)
      }
    }
    setModifiedContent(code)
    setIsModified(true)
  }

  // ── Editor preferences ─────────────────────────────
  const [editorFontSize, setEditorFontSize] = useState(13)
  const [editorWordWrap, setEditorWordWrap] = useState<'on' | 'off'>('on')
  const [editorMinimap, setEditorMinimap] = useState(true)
  const [editorTabSize, setEditorTabSize] = useState(2)
  const editorRef = useRef<unknown>(null)
  const monacoRef = useRef<unknown>(null)
  const selectedFileRef = useRef(selectedFile)
  selectedFileRef.current = selectedFile
  const [aiCompletionEnabled, setAiCompletionEnabled] = useState(true)

  // ── Outline (symbols) ────────────────────────────────
  interface OutlineSymbol { name: string; kind: string; line: number; children?: OutlineSymbol[] }
  const [outlineSymbols, setOutlineSymbols] = useState<OutlineSymbol[]>([])
  const [showOutline, setShowOutline] = useState(false)

  const refreshOutline = useCallback(() => {
    const text = modifiedContent
    if (!text) { setOutlineSymbols([]); return }
    const syms: OutlineSymbol[] = []
    const lines = text.split('\n')
    const lang = selectedFile ? langFromPath(selectedFile.path) : ''

    lines.forEach((line: string, i: number) => {
      const trimmed = line.trimStart()
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return

      // ── Markdown ──
      if (lang === 'markdown') {
        const md = line.match(/^(#{1,6})\s+(.+)/)
        if (md) syms.push({ name: md[2].trim(), kind: `H${md[1].length}`, line: i + 1 })
        return
      }
      // ── CSS/SCSS ──
      if (lang === 'css' || lang === 'scss') {
        const sel = line.match(/^([.#@][\w-][^\{]*)\s*\{/)
        if (sel) syms.push({ name: sel[1].trim(), kind: 'Property', line: i + 1 })
        return
      }
      // ── Python ──
      if (lang === 'python') {
        const py = line.match(/^(\s*)(class|def|async def)\s+(\w+)/)
        if (py) syms.push({ name: py[3], kind: py[2].includes('class') ? 'Class' : 'Function', line: i + 1 })
        return
      }
      // ── Go ──
      if (lang === 'go') {
        const goFunc = line.match(/^func\s+(\(.*?\)\s+)?(\w+)/)
        const goType = line.match(/^type\s+(\w+)\s+(struct|interface)/)
        if (goFunc) syms.push({ name: goFunc[2], kind: 'Function', line: i + 1 })
        else if (goType) syms.push({ name: goType[1], kind: goType[2] === 'interface' ? 'Interface' : 'Struct', line: i + 1 })
        return
      }
      // ── Rust ──
      if (lang === 'rust') {
        const rustFn = line.match(/^\s*(pub\s+)?(async\s+)?fn\s+(\w+)/)
        const rustStruct = line.match(/^\s*(pub\s+)?struct\s+(\w+)/)
        const rustEnum = line.match(/^\s*(pub\s+)?enum\s+(\w+)/)
        const rustTrait = line.match(/^\s*(pub\s+)?trait\s+(\w+)/)
        const rustImpl = line.match(/^\s*impl(<.*?>)?\s+(\w+)/)
        if (rustFn) syms.push({ name: rustFn[3], kind: 'Function', line: i + 1 })
        else if (rustStruct) syms.push({ name: rustStruct[2], kind: 'Struct', line: i + 1 })
        else if (rustEnum) syms.push({ name: rustEnum[2], kind: 'Enum', line: i + 1 })
        else if (rustTrait) syms.push({ name: rustTrait[2], kind: 'Interface', line: i + 1 })
        else if (rustImpl) syms.push({ name: `impl ${rustImpl[2]}`, kind: 'Class', line: i + 1 })
        return
      }
      // ── Java/Kotlin/C# ──
      if (lang === 'java' || lang === 'kotlin' || lang === 'csharp') {
        const jc = line.match(/^\s*(public|private|protected)?\s*(static\s+)?(abstract\s+)?(class|interface|enum)\s+(\w+)/)
        const jm = line.match(/^\s*(public|private|protected)\s+(static\s+)?(async\s+)?[\w<>\[\]]+\s+(\w+)\s*\(/)
        if (jc) syms.push({ name: jc[5], kind: jc[4] === 'enum' ? 'Enum' : jc[4] === 'interface' ? 'Interface' : 'Class', line: i + 1 })
        else if (jm) syms.push({ name: jm[4], kind: 'Method', line: i + 1 })
        return
      }
      // ── C/C++ ──
      if (lang === 'c' || lang === 'cpp') {
        // Preprocessor macros
        const define = line.match(/^\s*#define\s+(\w+)/)
        if (define) { syms.push({ name: define[1], kind: 'Constant', line: i + 1 }); return }
        // Namespace
        const ns = line.match(/^\s*namespace\s+(\w+)/)
        if (ns) { syms.push({ name: ns[1], kind: 'Namespace', line: i + 1 }); return }
        // Class/struct forward declarations (skip single-line forward decls: `class Foo;`)
        const classDecl = line.match(/^\s*(class|struct)\s+(\w+)\s*[:{]/)
        if (classDecl) { syms.push({ name: classDecl[2], kind: classDecl[1] === 'struct' ? 'Struct' : 'Class', line: i + 1 }); return }
        // Enum
        const enumDecl = line.match(/^\s*enum\s+(class\s+)?(\w+)/)
        if (enumDecl) { syms.push({ name: enumDecl[2], kind: 'Enum', line: i + 1 }); return }
        // Typedef / using alias
        const td = line.match(/^\s*typedef\s+.*\s+(\w+)\s*;/)
        const usingAlias = line.match(/^\s*using\s+(\w+)\s*=/)
        if (td) { syms.push({ name: td[1], kind: 'Type', line: i + 1 }); return }
        if (usingAlias) { syms.push({ name: usingAlias[1], kind: 'Type', line: i + 1 }); return }
        // Template line — skip, the next line will have the actual declaration
        if (line.match(/^\s*template\s*</)) return
        // Function/method definitions: return_type [Class::]name(...)
        // Match: optional qualifiers, return type (with possible template/pointer/ref), optional scope, name, open paren
        const funcMatch = line.match(/^\s*(?:(?:static|inline|virtual|explicit|constexpr|extern|friend)\s+)*(?:const\s+)?(?:[\w:]+(?:\s*<[^>]*>)?(?:\s*[*&]+\s*|\s+))(?:[\w]+::)*(\w+)\s*\(/)
        // Also match constructor/destructor: ClassName::ClassName( or ClassName::~ClassName(
        const ctorDtor = line.match(/^\s*(?:[\w]+::)?(~?\w+)\s*\([^)]*\)\s*(?::\s|{|$)/)
        // Simple C-style: `type name(` at start of line (not indented much = top-level)
        const cSimple = line.match(/^(\w[\w*& ]*?)\s+(\w+)\s*\([^;]*$/)
        if (funcMatch && !line.match(/^\s*(if|else|for|while|switch|return|case|delete|new)\b/)) {
          syms.push({ name: funcMatch[1], kind: 'Function', line: i + 1 })
        } else if (ctorDtor && line.includes('(') && !line.match(/^\s*(if|else|for|while|switch|return)\b/)) {
          // Only if it looks like a constructor/destructor definition (has `{` or `:` initializer)
          if (line.match(/\)\s*(:\s|{|const)/)) {
            syms.push({ name: ctorDtor[1], kind: 'Function', line: i + 1 })
          }
        } else if (cSimple && !line.includes(';') && !line.match(/^\s*(if|else|for|while|switch|return|#|\/\/|typedef|using)\b/)) {
          // C-style function: `int main(int argc, char** argv) {`
          const name = cSimple[2]
          // Skip common false positives
          if (!['if', 'else', 'for', 'while', 'switch', 'return', 'sizeof', 'typeof', 'defined'].includes(name)) {
            syms.push({ name, kind: 'Function', line: i + 1 })
          }
        }
        return
      }
      // ── JS/TS (default) ──
      const fn = line.match(/^\s*(export\s+)?(async\s+)?function\s+(\w+)/)
      const cls = line.match(/^\s*(export\s+)?(default\s+)?(abstract\s+)?class\s+(\w+)/)
      const iface = line.match(/^\s*(export\s+)?interface\s+(\w+)/)
      const typ = line.match(/^\s*(export\s+)?type\s+(\w+)\s*[=<{]/)
      const constFn = line.match(/^\s*(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?(\([^)]*\)|[a-zA-Z_]\w*)\s*=>/)
      const constFn2 = line.match(/^\s*(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?function/)
      const enumDecl = line.match(/^\s*(export\s+)?enum\s+(\w+)/)
      const reactComp = line.match(/^\s*(export\s+)?const\s+(\w+)\s*[:=]\s*(React\.)?(memo|forwardRef|styled|lazy)/)
      if (fn) syms.push({ name: fn[3], kind: 'Function', line: i + 1 })
      else if (cls) syms.push({ name: cls[4], kind: 'Class', line: i + 1 })
      else if (iface) syms.push({ name: iface[2], kind: 'Interface', line: i + 1 })
      else if (typ) syms.push({ name: typ[2], kind: 'Type', line: i + 1 })
      else if (enumDecl) syms.push({ name: enumDecl[2], kind: 'Enum', line: i + 1 })
      else if (constFn) syms.push({ name: constFn[2], kind: 'Function', line: i + 1 })
      else if (constFn2) syms.push({ name: constFn2[2], kind: 'Function', line: i + 1 })
      else if (reactComp) syms.push({ name: reactComp[2], kind: 'Class', line: i + 1 })
    })
    setOutlineSymbols(syms)
  }, [modifiedContent, selectedFile])

  // Refresh outline when file content settles
  useEffect(() => {
    if (!selectedFile || !showOutline) return
    const t = setTimeout(refreshOutline, 500)
    return () => clearTimeout(t)
  }, [modifiedContent, selectedFile, showOutline, refreshOutline])

  // ── File tree actions (new file, new folder, delete, rename) ──
  // Fixed per-task edit branch — reused across sessions, no timestamp clutter
  const editBranchName = `wtt-edit-${taskId}`
  const ensureEditBranch = async (): Promise<string | null> => {
    if (editBranch) return editBranch
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/branch`, {
        method: 'POST',
        headers: { ...repoHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_name: editBranchName, base_branch: currentBranch || defaultBranch }),
      })
      // 422 = branch already exists on remote — reuse it
      if (!r.ok && r.status !== 422) throw new Error(await r.text())
      setEditBranch(editBranchName)
      return editBranchName
    } catch (e) {
      alert(`创建分支失败: ${e instanceof Error ? e.message : 'unknown'}`)
      return null
    }
  }

  const handleNewFile = async (parentPath: string) => {
    const name = window.prompt('New file name:')
    if (!name?.trim()) return
    const filePath = parentPath ? `${parentPath}/${name.trim()}` : name.trim()
    const branch = await ensureEditBranch()
    if (!branch) return
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/file/${encodeURIComponent(filePath)}`, {
        method: 'PUT',
        headers: { ...repoHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '', branch, message: `Create ${filePath}` }),
      })
      if (!r.ok) throw new Error(await r.text())
      setSavedFiles(prev => { const s = new Set(Array.from(prev)); s.add(filePath); return s })
      void loadRepoTree(branch)
      // Auto-select the new file
      setTimeout(() => selectFile({ name: name.trim(), path: filePath, kind: 'file' }), 800)
    } catch (e) {
      alert(`创建文件失败: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  const handleNewFolder = async (parentPath: string) => {
    const name = window.prompt('New folder name:')
    if (!name?.trim()) return
    // GitHub doesn't support empty folders; create a .gitkeep
    const filePath = parentPath ? `${parentPath}/${name.trim()}/.gitkeep` : `${name.trim()}/.gitkeep`
    const branch = await ensureEditBranch()
    if (!branch) return
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/file/${encodeURIComponent(filePath)}`, {
        method: 'PUT',
        headers: { ...repoHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '', branch, message: `Create folder ${name.trim()}` }),
      })
      if (!r.ok) throw new Error(await r.text())
      setSavedFiles(prev => { const s = new Set(Array.from(prev)); s.add(filePath); return s })
      void loadRepoTree(branch)
    } catch (e) {
      alert(`创建文件夹失败: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  const handleDeleteFile = async (node: FileNode) => {
    if (!confirm(`确定删除 ${node.path}？`)) return
    const branch = await ensureEditBranch()
    if (!branch) return
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/file/${encodeURIComponent(node.path)}`, {
        method: 'DELETE',
        headers: { ...repoHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, message: `Delete ${node.path}` }),
      })
      if (!r.ok) throw new Error(await r.text())
      if (selectedFile?.path === node.path) {
        setSelectedFile(null)
        setFileContent('')
        setModifiedContent('')
      }
      setOpenFiles(prev => prev.filter(f => f.path !== node.path))
      void loadRepoTree(branch)
    } catch (e) {
      alert(`删除失败: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  const handleRenameFile = async (node: FileNode) => {
    const newName = window.prompt('Rename to:', node.name)
    if (!newName?.trim() || newName.trim() === node.name) return
    const parentDir = node.path.includes('/') ? node.path.substring(0, node.path.lastIndexOf('/')) : ''
    const newPath = parentDir ? `${parentDir}/${newName.trim()}` : newName.trim()
    const branch = await ensureEditBranch()
    if (!branch) return
    try {
      // Read old content
      const branchParam = `?ref=${encodeURIComponent(branch)}`
      const readR = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/file/${encodeURIComponent(node.path)}${branchParam}`, { headers: repoHeaders() })
      const oldContent = readR.ok ? (await readR.json()).content || '' : ''
      // Create new file
      const createR = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/file/${encodeURIComponent(newPath)}`, {
        method: 'PUT',
        headers: { ...repoHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: oldContent, branch, message: `Rename ${node.path} → ${newPath}` }),
      })
      if (!createR.ok) throw new Error(await createR.text())
      // Delete old file
      await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/file/${encodeURIComponent(node.path)}`, {
        method: 'DELETE',
        headers: { ...repoHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, message: `Rename ${node.path} → ${newPath} (delete old)` }),
      })
      setSavedFiles(prev => { const s = new Set(Array.from(prev)); s.delete(node.path); s.add(newPath); return s })
      void loadRepoTree(branch)
    } catch (e) {
      alert(`重命名失败: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  const handleDuplicateFile = async (node: FileNode) => {
    if (node.kind === 'directory') return
    const ext = node.name.includes('.') ? '.' + node.name.split('.').pop() : ''
    const base = node.name.includes('.') ? node.name.substring(0, node.name.lastIndexOf('.')) : node.name
    const newName = `${base}-copy${ext}`
    const parentDir = node.path.includes('/') ? node.path.substring(0, node.path.lastIndexOf('/')) : ''
    const newPath = parentDir ? `${parentDir}/${newName}` : newName
    const branch = await ensureEditBranch()
    if (!branch) return
    try {
      const branchParam = `?ref=${encodeURIComponent(branch)}`
      const readR = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/file/${encodeURIComponent(node.path)}${branchParam}`, { headers: repoHeaders() })
      const oldContent = readR.ok ? (await readR.json()).content || '' : ''
      const createR = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/file/${encodeURIComponent(newPath)}`, {
        method: 'PUT',
        headers: { ...repoHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: oldContent, branch, message: `Duplicate ${node.path} → ${newPath}` }),
      })
      if (!createR.ok) throw new Error(await createR.text())
      setSavedFiles(prev => { const s = new Set(Array.from(prev)); s.add(newPath); return s })
      void loadRepoTree(branch)
    } catch (e) {
      alert(`复制失败: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  const handleCopyPath = (node: FileNode) => {
    navigator.clipboard.writeText(node.path).catch(() => {})
  }

  const handleCopyFullPath = (node: FileNode) => {
    const fullUrl = task?.repo_url ? `${task.repo_url}/blob/${currentBranch || 'main'}/${node.path}` : node.path
    navigator.clipboard.writeText(fullUrl).catch(() => {})
  }

  const handleDownloadFile = async (node: FileNode) => {
    if (node.kind === 'directory') return
    try {
      const branchParam = currentBranch ? `?ref=${encodeURIComponent(currentBranch)}` : ''
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/file/${encodeURIComponent(node.path)}${branchParam}`, { headers: repoHeaders() })
      if (!r.ok) return
      const data = await r.json()
      const blob = new Blob([data.content || ''], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = node.name; a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
  }

  const handleFindInFolder = (node: FileNode) => {
    if (node.kind !== 'directory') return
    setRepoQuery(`path:${node.path} `)
  }

  // ── Context menu state ──
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null)

  const handleTreeContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    // Quick action from "+" button
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((node as any)._action === 'newFile') {
      handleNewFile(node.path)
      return
    }
    setCtxMenu({ x: e.clientX, y: e.clientY, node })
  }, [])

  const buildContextMenuItems = (node: FileNode): ContextMenuItem[] => {
    const isDir = node.kind === 'directory'
    const items: ContextMenuItem[] = []

    if (isDir) {
      items.push({ label: 'New File…', icon: '📄', onClick: () => handleNewFile(node.path) })
      items.push({ label: 'New Folder…', icon: '📁', onClick: () => handleNewFolder(node.path) })
      items.push({ divider: true, label: '', onClick: () => {} })
      items.push({ label: 'Find in Folder…', icon: '🔍', onClick: () => handleFindInFolder(node) })
    } else {
      items.push({ label: 'Open', icon: '📄', onClick: () => selectFile(node) })
    }

    items.push({ divider: true, label: '', onClick: () => {} })

    if (!isDir) {
      items.push({ label: 'Duplicate', icon: '📋', onClick: () => handleDuplicateFile(node) })
    }
    items.push({ label: 'Rename…', icon: '✏️', shortcut: 'F2', onClick: () => handleRenameFile(node) })
    items.push({ label: 'Delete', icon: '🗑', danger: true, onClick: () => handleDeleteFile(node), disabled: isDir })

    items.push({ divider: true, label: '', onClick: () => {} })
    items.push({ label: 'Copy Path', icon: '📎', onClick: () => handleCopyPath(node) })
    items.push({ label: 'Copy GitHub URL', icon: '🔗', onClick: () => handleCopyFullPath(node) })

    if (!isDir) {
      items.push({ label: 'Download', icon: '⬇️', onClick: () => handleDownloadFile(node) })
    }

    return items
  }

  // ── Full-page theme (VSCode-style) ──────────────────
  type PageTheme = 'light' | 'dark' | 'dark-dimmed' | 'monokai'
  const [pageTheme, setPageTheme] = useState<PageTheme>('light')
  const editorTheme = pageTheme === 'light' ? 'vs-light' : 'vs-dark'

  // Theme color maps
  const themeColors: Record<PageTheme, {
    bg: string; surface: string; border: string; text: string; textMuted: string
    activeBg: string; hoverBg: string; accent: string; inputBg: string
  }> = {
    light: {
      bg: 'bg-white', surface: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-800',
      textMuted: 'text-slate-500', activeBg: 'bg-white', hoverBg: 'hover:bg-slate-100',
      accent: 'text-indigo-600', inputBg: 'bg-white',
    },
    dark: {
      bg: 'bg-[#1e1e1e]', surface: 'bg-[#252526]', border: 'border-[#3c3c3c]', text: 'text-[#cccccc]',
      textMuted: 'text-[#858585]', activeBg: 'bg-[#1e1e1e]', hoverBg: 'hover:bg-[#2a2d2e]',
      accent: 'text-[#569cd6]', inputBg: 'bg-[#3c3c3c]',
    },
    'dark-dimmed': {
      bg: 'bg-[#22272e]', surface: 'bg-[#2d333b]', border: 'border-[#444c56]', text: 'text-[#adbac7]',
      textMuted: 'text-[#768390]', activeBg: 'bg-[#22272e]', hoverBg: 'hover:bg-[#343942]',
      accent: 'text-[#539bf5]', inputBg: 'bg-[#2d333b]',
    },
    monokai: {
      bg: 'bg-[#272822]', surface: 'bg-[#2f3029]', border: 'border-[#49483e]', text: 'text-[#f8f8f2]',
      textMuted: 'text-[#75715e]', activeBg: 'bg-[#272822]', hoverBg: 'hover:bg-[#3e3d32]',
      accent: 'text-[#a6e22e]', inputBg: 'bg-[#3e3d32]',
    },
  }
  const tc = themeColors[pageTheme]

  // Persist theme in localStorage
  useEffect(() => {
    const saved = localStorage.getItem('code-task-theme') as PageTheme | null
    if (saved && themeColors[saved]) setPageTheme(saved)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { localStorage.setItem('code-task-theme', pageTheme) }, [pageTheme])

  // ── Unsaved edits buffer (GitHub mode) ──────────────
  const [editBranch, setEditBranch] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try { return localStorage.getItem(`wtt-edit-branch-${taskId}`) || null } catch { return null }
  })
  const [savedFiles, setSavedFiles] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem(`wtt-saved-files-${taskId}`)
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch { return new Set() }
  })
  const [saving, setSaving] = useState(false)
  const hasSavedEdits = savedFiles.size > 0

  // Persist editBranch & savedFiles to localStorage
  useEffect(() => {
    try {
      if (editBranch) localStorage.setItem(`wtt-edit-branch-${taskId}`, editBranch)
      else localStorage.removeItem(`wtt-edit-branch-${taskId}`)
    } catch {}
  }, [editBranch, taskId])
  useEffect(() => {
    try {
      if (savedFiles.size > 0) localStorage.setItem(`wtt-saved-files-${taskId}`, JSON.stringify(Array.from(savedFiles)))
      else localStorage.removeItem(`wtt-saved-files-${taskId}`)
    } catch {}
  }, [savedFiles, taskId])

  // ── Send chat message ──────────────────────────────
  const [awaitingAgent, setAwaitingAgent] = useState(false)
  const [fileLoading, setFileLoading] = useState(false)
  const [rightTab, setRightTab] = useState<'chat' | 'issues' | 'prs'>('chat')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [issues, setIssues] = useState<Record<string, any>[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pulls, setPulls] = useState<Record<string, any>[]>([])
  const [issuesLoading, setIssuesLoading] = useState(false)
  const [pullsLoading, setPullsLoading] = useState(false)
  const [issueFilter, setIssueFilter] = useState<'open' | 'closed' | 'all'>('all')
  const [prFilter, setPrFilter] = useState<'open' | 'closed' | 'all'>('all')
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [issueComments, setIssueComments] = useState<Record<string, any>[]>([])
  const [expandedPR, setExpandedPR] = useState<number | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [prFiles, setPrFiles] = useState<Record<string, any>[]>([])

  // ── Diff Review state ──────────────────────────────
  const [diffMode, setDiffMode] = useState(false)
  const [pendingPatches, setPendingPatches] = useState<PendingPatch[]>([])
  const [activeDiffIndex, setActiveDiffIndex] = useState(0)
  const [diffOriginalContent, setDiffOriginalContent] = useState('')
  const [reviewingPR, setReviewingPR] = useState<{ number: number; title: string; head: string; base: string } | null>(null)
  const fetchIssues = async (state?: string) => {
    if (!task?.repo_url || !session?.accessToken) return
    setIssuesLoading(true)
    const s = state || issueFilter
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/issues?state=${s}`, {
        headers: repoHeaders(),
      })
      if (r.ok) {
        const data = await r.json()
        setIssues(data.issues || [])
      }
    } catch (e) { console.error('fetchIssues failed:', e) }
    finally { setIssuesLoading(false) }
  }

  const fetchPulls = async (state?: string) => {
    if (!task?.repo_url || !session?.accessToken) return
    setPullsLoading(true)
    const s = state || prFilter
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/pulls?state=${s}`, {
        headers: repoHeaders(),
      })
      if (r.ok) {
        const data = await r.json()
        setPulls(data.pulls || [])
      }
    } catch (e) { console.error('fetchPulls failed:', e) }
    finally { setPullsLoading(false) }
  }

  const fetchIssueDetail = async (number: number) => {
    if (!session?.accessToken) return
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/issues/${number}`, {
        headers: repoHeaders(),
      })
      if (r.ok) {
        const data = await r.json()
        setIssueComments(data.comments || [])
      }
    } catch (e) { console.error('fetchIssueDetail failed:', e) }
  }

  const fetchPRFiles = async (number: number) => {
    if (!session?.accessToken) return
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/pulls/${number}/files`, {
        headers: repoHeaders(),
      })
      if (r.ok) {
        const data = await r.json()
        setPrFiles(data.files || [])
      }
    } catch (e) { console.error('fetchPRFiles failed:', e) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (rightTab === 'issues' && issues.length === 0) fetchIssues()
    if (rightTab === 'prs' && pulls.length === 0) fetchPulls()
  }, [rightTab])

  // ── Diff Review functions ──────────────────────────
  const fetchFileFromRef = useCallback(async (filePath: string, ref?: string): Promise<string> => {
    if (!session?.accessToken) return ''
    try {
      const refParam = ref ? `?ref=${encodeURIComponent(ref)}` : ''
      const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/repo/file/${encodeURIComponent(filePath)}${refParam}`, {
        headers: repoHeaders(),
      })
      if (r.ok) {
        const data = await r.json()
        return typeof data === 'string' ? data : data.content || ''
      }
      return '// (new file)'
    } catch { return '// (unable to load)' }
  }, [session?.accessToken, taskId])

  // Enter PR diff review: fetch base vs head for each file
  const enterPRDiffReview = useCallback(async (pr: { number: number; title: string; head: string; base: string }, files: Record<string, unknown>[]) => {
    if (files.length === 0) return
    setReviewingPR(pr)
    const patches: PendingPatch[] = files.map((f: Record<string, unknown>) => ({
      path: f.filename as string,
      code: '', // will be loaded on demand
      status: 'pending' as const,
      fileStatus: (f.status as string) || 'modified',
      additions: (f.additions as number) || 0,
      deletions: (f.deletions as number) || 0,
    }))
    setPendingPatches(patches)
    setActiveDiffIndex(0)
    setDiffMode(true)
    // Load first file's base and head content
    const firstPath = patches[0].path
    const [original, modified] = await Promise.all([
      patches[0].fileStatus === 'added' ? Promise.resolve('') : fetchFileFromRef(firstPath, pr.base),
      patches[0].fileStatus === 'removed' ? Promise.resolve('') : fetchFileFromRef(firstPath, pr.head),
    ])
    setDiffOriginalContent(original)
    setPendingPatches(prev => prev.map((p, i) => i === 0 ? { ...p, code: modified } : p))
  }, [fetchFileFromRef])

  // Legacy: enter diff review from [FILE] blocks (fallback)
  const enterDiffReview = useCallback(async (patches: PendingPatch[]) => {
    if (patches.length === 0) return
    setReviewingPR(null)
    setPendingPatches(patches)
    setActiveDiffIndex(0)
    setDiffMode(true)
    const first = patches[0]
    const original = await fetchFileFromRef(first.path)
    setDiffOriginalContent(original)
  }, [fetchFileFromRef])

  // Auto-enter diff review when Agent sends [FILE] blocks (fallback)
  const lastReviewedMsgRef = useRef<string | null>(null)
  useEffect(() => {
    if (diffMode) return
    const lastMsg = chatMessages[chatMessages.length - 1]
    if (!lastMsg || lastMsg.role !== 'assistant') return
    if (lastMsg.id === lastReviewedMsgRef.current) return
    const patches = extractAllPatches(lastMsg.content)
    if (patches.length > 0) {
      lastReviewedMsgRef.current = lastMsg.id
      enterDiffReview(patches)
    }
  }, [chatMessages, diffMode, enterDiffReview])

  // Auto-detect PR mentions in Agent chat (e.g. "PR #42" or "pull request #42")
  const lastPrDetectedRef = useRef<string | null>(null)
  useEffect(() => {
    if (diffMode) return
    const lastMsg = chatMessages[chatMessages.length - 1]
    if (!lastMsg || lastMsg.role !== 'assistant') return
    if (lastMsg.id === lastPrDetectedRef.current) return
    const prMatch = lastMsg.content.match(/(?:PR|pull request)\s*#(\d+)/i)
    if (prMatch) {
      lastPrDetectedRef.current = lastMsg.id
      // Refresh the PR list so user can click to review
      fetchPulls()
    }
  }, [chatMessages, diffMode])

  const switchDiffFile = useCallback(async (index: number) => {
    setActiveDiffIndex(index)
    const patch = pendingPatches[index]
    if (!patch) return
    if (reviewingPR) {
      // PR mode: fetch from base and head branches
      const [original, modified] = await Promise.all([
        patch.fileStatus === 'added' ? Promise.resolve('') : fetchFileFromRef(patch.path, reviewingPR.base),
        patch.fileStatus === 'removed' ? Promise.resolve('') : fetchFileFromRef(patch.path, reviewingPR.head),
      ])
      setDiffOriginalContent(original)
      setPendingPatches(prev => prev.map((p, i) => i === index ? { ...p, code: modified } : p))
    } else {
      // Legacy [FILE] mode
      const original = await fetchFileFromRef(patch.path)
      setDiffOriginalContent(original)
    }
  }, [pendingPatches, reviewingPR, fetchFileFromRef])

  const updatePatchStatus = (index: number, status: 'accepted' | 'rejected') => {
    setPendingPatches(prev => prev.map((p, i) => i === index ? { ...p, status } : p))
  }

  const exitDiffReview = () => {
    setDiffMode(false)
    setPendingPatches([])
    setActiveDiffIndex(0)
    setDiffOriginalContent('')
    setReviewingPR(null)
  }

  const submitDiffReview = async () => {
    const accepted = pendingPatches.filter(p => p.status === 'accepted')
    const rejected = pendingPatches.filter(p => p.status === 'rejected')
    const pending = pendingPatches.filter(p => p.status === 'pending')

    // Desktop local mode: write accepted patches directly to disk
    if (desktopMode && projectRoot && !reviewingPR && accepted.length > 0) {
      const bridge = getDesktopBridge()
      if (bridge) {
        const applied: string[] = []
        const failed: string[] = []
        for (const patch of accepted) {
          try {
            const fullPath = `${projectRoot}/${patch.path}`
            const result = await bridge.fs.writeFile(fullPath, patch.code)
            if (result.ok) {
              applied.push(patch.path)
              desktopContentCacheRef.current[patch.path] = patch.code
              // Refresh editor if this file is currently open
              if (selectedFile?.path === patch.path) {
                setFileContent(patch.code)
                setModifiedContent(patch.code)
                setIsModified(false)
              }
            } else {
              failed.push(patch.path)
            }
          } catch {
            failed.push(patch.path)
          }
        }
        const parts: string[] = [`## Code Changes Applied to Disk`]
        if (applied.length > 0) {
          parts.push(`\n✅ **Written** (${applied.length} file${applied.length > 1 ? 's' : ''})：`)
          applied.forEach(p => parts.push(`- ${p}`))
        }
        if (failed.length > 0) {
          parts.push(`\n❌ **Failed** (${failed.length} file${failed.length > 1 ? 's' : ''})：`)
          failed.forEach(p => parts.push(`- ${p}`))
        }
        if (rejected.length > 0) {
          parts.push(`\n🚫 **Rejected** (${rejected.length} file${rejected.length > 1 ? 's' : ''})：`)
          rejected.forEach(p => parts.push(`- ${p.path}`))
        }
        setChatInput(parts.join('\n'))
        setRightTab('chat')
        exitDiffReview()
        return
      }
    }

    if (reviewingPR) {
      // PR-based review
      const parts: string[] = [`## PR #${reviewingPR.number} Review: ${reviewingPR.title}`]
      parts.push(`Branch: ${reviewingPR.head} → ${reviewingPR.base}`)
      if (rejected.length === 0 && pending.length === 0) {
        parts.push(`\n✅ All ${accepted.length} file(s) approved.`)
        parts.push(`\nPlease merge PR #${reviewingPR.number}.`)
      } else {
        if (accepted.length > 0) {
          parts.push(`\n✅ Approved (${accepted.length}):`)
          accepted.forEach(p => parts.push(`- ${p.path}`))
        }
        if (rejected.length > 0) {
          parts.push(`\n❌ Needs changes (${rejected.length}):`)
          rejected.forEach(p => parts.push(`- ${p.path}`))
          parts.push(`\nPlease fix the rejected files and update PR #${reviewingPR.number}. Do NOT merge yet.`)
        }
        if (pending.length > 0) {
          parts.push(`\n⏳ Not reviewed (${pending.length}):`)
          pending.forEach(p => parts.push(`- ${p.path}`))
        }
      }
      setChatInput(parts.join('\n'))
    } else {
      // Legacy [FILE] block review
      const parts: string[] = [`## Code Review Complete`]
      if (accepted.length > 0) {
        parts.push(`\n✅ **Accepted** (${accepted.length} file${accepted.length > 1 ? 's' : ''})：`)
        accepted.forEach(p => parts.push(`- ${p.path}`))
        parts.push(`\nPlease commit the accepted files. Use a descriptive commit message.`)
      }
      if (rejected.length > 0) {
        parts.push(`\n❌ **Rejected** (${rejected.length} file${rejected.length > 1 ? 's' : ''})：`)
        rejected.forEach(p => parts.push(`- ${p.path}`))
      }
      if (accepted.length === 0) {
        parts.push(`\nAll changes rejected. Please revise.`)
      }
      setChatInput(parts.join('\n'))
    }
    setRightTab('chat')
    exitDiffReview()
  }

  const sendMessage = async () => {
    const attachmentText = pendingAttachments.join('\n')
    const text = chatInput.trim()
    if ((!text && !attachmentText) || sending) return
    if (!streamAgentId) { alert('No available agent for this task'); return }
    setSending(true)
    setChatInput('')
    setPendingAttachments([])

    const userText = attachmentText ? `${attachmentText}\n\n${text}` : text
    const optimisticId = `opt-${Date.now()}`
    try {
      const senderName = getSessionSenderName(session)
      const built = task?.repo_url
        ? { content: userText, fullCodebase: false }
        : await buildCodebaseContextMessage(userText)
      const fullContent = built.content
      const displayContent = buildWttUserSourceFlow(senderName, fullContent)

      // Optimistic: mirror feed/topic info flow in right chat panel immediately
      const optimisticMsg: ChatMsg = {
        id: optimisticId,
        role: 'user',
        content: displayContent,
        timestamp: new Date().toISOString(),
        sender_display_name: senderName,
      }
      setChatMessages(prev => [...prev, optimisticMsg])

      if (task?.repo_url) {
        const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/chat/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.accessToken ?? ''}`,
          },
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
          body: JSON.stringify({ content: displayContent, sender_type: 'HUMAN', semantic_type: 'reply', auto_run: task?.status === 'todo', include_task_context: task?.status === 'todo' }),
        })
        if (!r.ok) throw new Error(await r.text())
        void mutateTask()
      } else {
        // Local mode: also use chat/send to trigger proper inference pipeline
        const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/chat/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.accessToken ?? ''}`,
          },
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
          body: JSON.stringify({ content: displayContent, sender_type: 'HUMAN', semantic_type: 'post', auto_run: task?.status === 'todo', include_task_context: task?.status === 'todo' }),
        })
        if (!r.ok) throw new Error(await r.text())
        void mutateTask()
        if (built.fullCodebase) {
          const at = agentMode === 'remote' ? sshTree : fileTree
          const adn = agentMode === 'remote' ? sshRemoteDirName : dirName
          codebaseSharedSigRef.current = codebaseSignature(at, adn)
        }
      }
      setAwaitingAgent(true)
    } catch (e) {
      console.error('[CodeTask] sendMessage failed:', e)
      // Mark optimistic message as failed
      setChatMessages(prev => prev.map(m =>
        m.id === optimisticId ? { ...m, content: `⚠️ ${userText}\n\n(Send failed: ${e instanceof Error ? e.message : 'unknown'})` } : m
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

  // legacy local/remote helpers kept temporarily; mark as used until full cleanup
  void sshConnecting
  void sshTesting
  void sshTestResult
  void sshPanelOpen
  void testSshConnection
  void connectSsh
  void refreshSshTree
  void setAgentMode

  const activeTree = task?.repo_url ? repoTree : (agentMode === 'remote' ? sshTree : fileTree)
  const fileCount = useMemo(() => countFiles(activeTree), [activeTree])

  // Project summary for local mode
  const projectSummary = useMemo(() => {
    if (!fileTree.length || task?.repo_url) return null
    const byExt = new Map<string, number>()
    const configs: string[] = []
    const CONFIG_NAMES = new Set(['package.json', 'requirements.txt', 'cargo.toml', 'go.mod', 'pyproject.toml', 'pom.xml', 'build.gradle', 'tsconfig.json', 'makefile', 'cmakelists.txt'])
    const walk = (nodes: FileNode[]) => {
      for (const n of nodes) {
        if (n.kind === 'file') {
          const ext = n.name.includes('.') ? n.name.split('.').pop()!.toLowerCase() : '(no ext)'
          byExt.set(ext, (byExt.get(ext) || 0) + 1)
          if (CONFIG_NAMES.has(n.name.toLowerCase())) configs.push(n.path)
        }
        if (n.children) walk(n.children)
      }
    }
    walk(fileTree)
    const topLangs = Array.from(byExt.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
    return { topLangs, configs }
  }, [fileTree, task?.repo_url])

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="mt-3 text-sm text-slate-400">Loading session…</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex h-screen flex-col ${tc.bg}`}>
      {/* Top bar */}
      <div className={`flex h-11 shrink-0 items-center justify-between border-b ${tc.border} ${tc.surface} px-4`}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(buildAgentUrl('/tasks', selectedAgentId))} className="text-sm text-indigo-500 hover:underline">← Tasks</button>
          <span className={`text-sm font-semibold ${tc.text}`}>{task?.title || 'Code Task'}</span>
          <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700">💻 Code</span>
          {task?.status && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              task.status === 'doing' ? 'bg-amber-100 text-amber-700' :
              task.status === 'done' ? 'bg-green-100 text-green-700' :
              task.status === 'cancelled' ? 'bg-red-100 text-red-600' :
              'bg-slate-100 text-slate-500'
            }`}>{task.status === 'doing' ? '⚡ Running' : task.status === 'done' ? '✅ Done' : task.status === 'cancelled' ? '🚫 Cancelled' : task.status}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {task?.repo_url ? (
            <span className="rounded bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-700">🐙 GitHub Repo Mode</span>
          ) : desktopMode ? (
            <span className="rounded bg-blue-100 px-2 py-1 text-[11px] font-medium text-blue-700">💻 Desktop Local</span>
          ) : fileTree.length > 0 ? (
            <span className="rounded bg-violet-100 px-2 py-1 text-[11px] font-medium text-violet-700">📂 Local Mode</span>
          ) : null}
          {task?.repo_url && (
            <button onClick={() => void loadRepoTree()} className={`rounded-lg border ${tc.border} ${tc.inputBg} px-3 py-1 text-xs ${tc.textMuted}`}>{repoLoading ? '...' : 'Refresh Tree'}</button>
          )}
          <button onClick={linkRepo} disabled={repoLinking} className={`rounded-lg border ${tc.border} ${tc.inputBg} px-3 py-1 text-xs ${tc.textMuted} disabled:opacity-50`}>{repoLinking ? 'Linking...' : 'Link Repo'}</button>
          {!task?.repo_url && <button onClick={createRepo} disabled={repoCreating} className="rounded-lg bg-emerald-500 px-3 py-1 text-xs text-white disabled:opacity-50">{repoCreating ? 'Creating...' : 'Create Repo'}</button>}
          <ThemeToggle />
        </div>
      </div>

      {/* Main area: agent sidebar | file tree | editor | chat */}
      <div className="flex flex-1 overflow-hidden">
        {/* Agent sidebar */}
        <TaskAgentSidebar
          agents={agents.map((a) => ({ agent_id: a.agent_id, display_name: a.display_name }))}
          selectedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
          currentUserName={session?.user?.name ?? undefined}
          defaultCollapsed
        />
        {/* File tree panel */}
        <div className={`shrink-0 overflow-y-auto border-r ${tc.border} ${tc.surface} p-2`} style={{ width: `${leftPanelWidth}px` }}>
          {task?.repo_url ? (
            <>
              <div className="mb-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-[10px] text-emerald-700">
                <div className="font-semibold truncate" title={task.repo_url}>{task.repo_url.replace('https://github.com/', '')}</div>
                <div className="mt-1 flex items-center gap-1">
                  <span>🌿</span>
                  <select
                    className="rounded border border-emerald-300 bg-white px-1 py-0.5 text-[10px] font-medium text-emerald-800 focus:outline-none"
                    value={currentBranch}
                    onChange={(e) => {
                      const b = e.target.value
                      setCurrentBranch(b)
                      setSelectedFile(null)
                      setOpenFiles([])
                      setFileContent('')
                      setModifiedContent('')
                      setIsModified(false)
                      void loadRepoTree(b)
                    }}
                  >
                    {repoBranches.length > 0 ? repoBranches.map(b => (
                      <option key={b} value={b}>{b}{b === defaultBranch ? ' ✦' : ''}</option>
                    )) : (
                      <option value={currentBranch || 'main'}>{currentBranch || 'main'}</option>
                    )}
                  </select>
                  {task.repo_path && <span className="text-emerald-500">· {task.repo_path}</span>}
                </div>
              </div>
              <div className="mb-2 space-y-1">
                <div className="flex gap-1">
                  <input
                    className={`flex-1 rounded border ${tc.border} ${tc.inputBg} px-2 py-1 text-[11px] ${tc.text}`}
                    placeholder="🔍 Fuzzy search files… (e.g. pgts → page.tsx)"
                    value={repoQuery}
                    onChange={(e) => setRepoQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { setRepoQuery(''); e.currentTarget.blur() }
                      // Enter to select first result
                      if (e.key === 'Enter' && fuzzySearchResults.length > 0) {
                        e.preventDefault()
                        const first = fuzzySearchResults[0]
                        const parts = first.node.path.split('/')
                        const paths = new Set<string>()
                        for (let i = 1; i < parts.length; i++) paths.add(parts.slice(0, i).join('/'))
                        setForceExpandedPaths(prev => { const next = new Set(prev); paths.forEach(p => next.add(p)); return next })
                        void selectFile(first.node)
                        setRepoQuery('')
                      }
                    }}
                  />
                  {repoQuery && (
                    <button onClick={() => setRepoQuery('')} className={`rounded border ${tc.border} ${tc.inputBg} px-2 py-1 text-[11px] ${tc.textMuted}`}>✕</button>
                  )}
                </div>
                {fuzzySearchResults.length > 0 && (
                  <div className={`max-h-48 overflow-y-auto rounded border ${tc.border} ${tc.inputBg} p-0.5`}>
                    {fuzzySearchResults.map((res, idx) => {
                      const p = res.node.path
                      const fileName = p.split('/').pop() || p
                      const dirPath = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
                      return (
                        <button
                          key={`${p}-${idx}`}
                          onClick={() => {
                            const parts = p.split('/')
                            const paths = new Set<string>()
                            for (let i = 1; i < parts.length; i++) paths.add(parts.slice(0, i).join('/'))
                            setForceExpandedPaths(prev => { const next = new Set(prev); paths.forEach(pp => next.add(pp)); return next })
                            void selectFile(res.node)
                            setRepoQuery('')
                          }}
                          className={`flex w-full items-center gap-1.5 rounded px-1.5 py-[3px] text-left text-[11px] hover:bg-indigo-50 ${idx === 0 ? 'bg-indigo-50/60' : ''}`}
                          title={p}
                        >
                          <span className="shrink-0 text-[11px]">{fileIcon(fileName)}</span>
                          <span className="truncate font-medium text-slate-800">{renderHighlighted(fileName, res.indices, p.lastIndexOf('/') + 1)}</span>
                          {dirPath && <span className="ml-auto truncate text-[10px] text-slate-400">{dirPath}</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
                {repoQuery.trim() && fuzzySearchResults.length === 0 && (
                  <p className={`text-[10px] ${tc.textMuted} px-1`}>No matching files</p>
                )}
              </div>

              {repoLoading ? (
                <p className={`text-center text-[11px] ${tc.textMuted}`}>Loading repo tree...</p>
              ) : repoTree.length === 0 ? (
                <p className={`text-center text-[11px] ${tc.textMuted}`}>No repo files</p>
              ) : (
                <>
                  <div className="mb-1 flex items-center justify-between">
                    <p className={`text-xs font-semibold ${tc.textMuted}`}>EXPLORER</p>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => handleNewFile('')} className={`rounded p-0.5 text-[10px] ${tc.textMuted} hover:bg-slate-200`} title="New File">📄+</button>
                      <button onClick={() => handleNewFolder('')} className={`rounded p-0.5 text-[10px] ${tc.textMuted} hover:bg-slate-200`} title="New Folder">📁+</button>
                      <button onClick={() => setCollapseSignal(s => s + 1)} className={`rounded p-0.5 text-[10px] ${tc.textMuted} hover:bg-slate-200`} title="Collapse All">⊟</button>
                      <button onClick={() => void loadRepoTree(currentBranch || undefined)} className={`rounded p-0.5 text-[10px] ${tc.textMuted} hover:bg-slate-200`} title="Refresh">↻</button>
                      <span className={`ml-1 text-[9px] ${tc.textMuted}`}>{fileCount}</span>
                    </div>
                  </div>
                  {repoTree.map((node) => (
                    <FileTreeNode
                      key={node.path}
                      node={node}
                      depth={0}
                      selectedPath={selectedFile?.path || ''}
                      onSelect={selectFile}
                      onContextMenu={handleTreeContextMenu}
                      forceExpanded={forceExpandedPaths}
                      collapseSignal={collapseSignal}
                    />
                  ))}
                  {/* Outline panel */}
                  {selectedFile && (
                    <div className="mt-3 border-t border-slate-200 pt-2">
                      <button
                        className={`mb-1 flex w-full items-center justify-between text-[11px] font-semibold ${tc.textMuted}`}
                        onClick={() => setShowOutline(v => !v)}
                      >
                        <span>{showOutline ? '▾' : '▸'} OUTLINE</span>
                        <span className="text-[9px] font-normal">{outlineSymbols.length}</span>
                      </button>
                      {showOutline && (
                        <div className="max-h-60 overflow-y-auto">
                          {outlineSymbols.length === 0 ? (
                            <p className={`text-[10px] ${tc.textMuted} pl-2`}>No symbols found</p>
                          ) : outlineSymbols.map((sym, i) => (
                            <button key={`${sym.name}-${sym.line}-${i}`}
                              className={`flex w-full items-center gap-1 rounded px-2 py-0.5 text-left text-[11px] ${tc.text} hover:bg-slate-200/60`}
                              onClick={() => {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const ed = editorRef.current as any
                                if (ed) { ed.revealLineInCenter(sym.line); ed.setPosition({ lineNumber: sym.line, column: 1 }) }
                              }}
                            >
                              <span className="w-3 shrink-0 text-center text-[10px] text-indigo-500">{SYMBOL_ICONS[sym.kind] || '○'}</span>
                              <span className="flex-1 truncate">{sym.name}</span>
                              <span className="shrink-0 text-[9px] text-slate-400">:{sym.line}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          ) : fileTree.length > 0 ? (
            /* Local project open (desktop or browser) */
            <>
              <div className={`mb-2 rounded border ${desktopMode ? 'border-blue-200 bg-blue-50' : 'border-violet-200 bg-violet-50'} p-2 text-[10px] ${desktopMode ? 'text-blue-700' : 'text-violet-700'}`}>
                <div className="flex items-center gap-1 font-semibold truncate" title={projectRoot || dirName}>
                  <span>{desktopMode ? '💻' : '📂'}</span>
                  <span className="truncate">{dirName || 'Local Project'}</span>
                  {desktopMode && <span className="ml-auto rounded bg-blue-200 px-1 text-[9px] font-medium">Desktop</span>}
                </div>
                {projectRoot && <div className="mt-0.5 truncate text-[9px] opacity-70">{projectRoot}</div>}
                {projectSummary && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {projectSummary.topLangs.map(([ext, count]) => (
                      <span key={ext} className={`rounded ${desktopMode ? 'bg-blue-100' : 'bg-violet-100'} px-1 py-0 text-[9px]`}>.{ext} ({count})</span>
                    ))}
                  </div>
                )}
                {projectSummary?.configs.length ? (
                  <div className="mt-0.5 text-[9px] opacity-80">📦 {projectSummary.configs.map(c => c.split('/').pop()).join(', ')}</div>
                ) : null}
              </div>
              <div className="mb-1 flex items-center justify-between">
                <p className={`text-xs font-semibold ${tc.textMuted}`}>EXPLORER</p>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => void openDirectory()} className={`rounded p-0.5 text-[10px] ${tc.textMuted} hover:bg-slate-200`} title="Open Another Folder">📂↻</button>
                  <button onClick={() => setCollapseSignal(s => s + 1)} className={`rounded p-0.5 text-[10px] ${tc.textMuted} hover:bg-slate-200`} title="Collapse All">⊟</button>
                  <span className={`ml-1 text-[9px] ${tc.textMuted}`}>{fileCount}</span>
                </div>
              </div>
              {fileTree.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedFile?.path || ''}
                  onSelect={selectFile}
                  forceExpanded={forceExpandedPaths}
                  collapseSignal={collapseSignal}
                />
              ))}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-3">
              <p className="text-3xl">💻</p>
              <p className={`text-sm font-medium ${tc.text}`}>Open a Project</p>
              <p className={`text-[11px] ${tc.textMuted}`}>Open a local folder or link a GitHub repo</p>
              <div className="flex flex-col gap-2 w-full">
                <button onClick={() => void openDirectory()} className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs text-white hover:bg-blue-600">
                  {isDesktop() ? '📂 Open Local Folder' : '📂 Open Directory'}
                </button>
                <div className="flex gap-2">
                  <button onClick={linkRepo} disabled={repoLinking} className={`flex-1 rounded-lg border ${tc.border} ${tc.inputBg} px-3 py-1.5 text-xs ${tc.textMuted} disabled:opacity-50`}>{repoLinking ? 'Linking...' : '🐙 Link Repo'}</button>
                  <button onClick={createRepo} disabled={repoCreating} className="flex-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs text-white disabled:opacity-50">{repoCreating ? 'Creating...' : '➕ Create Repo'}</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Left resize handle */}
        <div
          className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-indigo-400/40 active:bg-indigo-500/50 transition-colors"
          onMouseDown={(e) => startResize('left', e)}
          title="Drag to resize"
        />

        {/* Editor panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Diff mode: file list + toolbar */}
          {diffMode && pendingPatches.length > 0 ? (
            <>
              <div className="flex h-9 shrink-0 items-center gap-1 border-b border-slate-200 bg-amber-50 px-2">
                <span className="text-[11px] font-semibold text-amber-700">
                  {reviewingPR ? `🔍 PR #${reviewingPR.number}: ${reviewingPR.title}` : '🔍 Review Changes'}
                </span>
                {reviewingPR && (
                  <span className="text-[10px] text-amber-500">{reviewingPR.head} → {reviewingPR.base}</span>
                )}
                <span className="text-[10px] text-amber-600">({pendingPatches.filter(p => p.status === 'pending').length} pending)</span>
                <div className="flex-1" />
                <button onClick={submitDiffReview} disabled={pendingPatches.every(p => p.status === 'pending')}
                  className="rounded bg-green-500 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-green-600 disabled:opacity-40"
                >✅ Submit Review</button>
                <button onClick={exitDiffReview}
                  className="rounded bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-300"
                >✕ Cancel</button>
              </div>
              {/* Diff file tabs */}
              <div className={`flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b ${tc.border} ${tc.surface} px-1`}>
                {pendingPatches.map((p, i) => (
                  <button key={p.path} onClick={() => switchDiffFile(i)}
                    className={`flex items-center gap-1 rounded-t px-2 py-1 text-[11px] ${
                      i === activeDiffIndex ? `${tc.activeBg} font-medium ${tc.text}` : `${tc.textMuted} ${tc.hoverBg}`
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      p.status === 'accepted' ? 'bg-green-400' : p.status === 'rejected' ? 'bg-red-400' : 'bg-amber-400'
                    }`} />
                    <span className="truncate max-w-[140px]">{p.path.split('/').pop()}</span>
                    {p.fileStatus && (
                      <span className={`text-[9px] ${
                        p.fileStatus === 'added' ? 'text-green-500' : p.fileStatus === 'removed' ? 'text-red-500' : 'text-amber-500'
                      }`}>{p.fileStatus === 'added' ? '+' : p.fileStatus === 'removed' ? '-' : '~'}</span>
                    )}
                  </button>
                ))}
              </div>
              {/* Diff editor */}
              <div className="flex-1 relative">
                <MonacoDiffEditor
                  height="100%"
                  language={langFromPath(pendingPatches[activeDiffIndex]?.path || '')}
                  original={diffOriginalContent}
                  modified={pendingPatches[activeDiffIndex]?.code || ''}
                  theme={editorTheme}
                  options={{
                    fontSize: editorFontSize,
                    readOnly: true,
                    renderSideBySide: true,
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    minimap: { enabled: false },
                  }}
                />
                {/* Per-file accept/reject bar */}
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-slate-200 bg-white/95 px-3 py-1.5 backdrop-blur">
                  <span className="text-[12px] font-medium text-slate-600">{pendingPatches[activeDiffIndex]?.path}</span>
                  <div className="flex items-center gap-2">
                    {pendingPatches[activeDiffIndex]?.status !== 'pending' && (
                      <span className={`text-[11px] font-semibold ${pendingPatches[activeDiffIndex]?.status === 'accepted' ? 'text-green-600' : 'text-red-500'}`}>
                        {pendingPatches[activeDiffIndex]?.status === 'accepted' ? '✅ Accepted' : '❌ Rejected'}
                      </span>
                    )}
                    <button onClick={() => updatePatchStatus(activeDiffIndex, 'accepted')}
                      className="rounded bg-green-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-green-600"
                    >✅ Accept</button>
                    <button onClick={() => updatePatchStatus(activeDiffIndex, 'rejected')}
                      className="rounded bg-red-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-red-600"
                    >❌ Reject</button>
                    {activeDiffIndex < pendingPatches.length - 1 && (
                      <button onClick={() => switchDiffFile(activeDiffIndex + 1)}
                        className="rounded bg-slate-200 px-3 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-300"
                      >Next →</button>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Normal tab bar */}
              {openFiles.length > 0 && (
                <div className={`flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b ${tc.border} ${tc.surface} px-1`}>
                  {openFiles.map((f) => (
                    <button
                      key={f.path}
                      onClick={() => selectFile(f)}
                      className={`group flex items-center gap-1 rounded-t px-2 py-1 text-[11px] ${
                        f.path === selectedFile?.path ? `${tc.activeBg} font-medium ${tc.text}` : `${tc.textMuted} ${tc.hoverBg}`
                      }`}
                    >
                      <span className="truncate max-w-[120px]">{f.name}</span>
                      <span
                        className={`ml-1 hidden ${tc.textMuted} hover:text-red-500 group-hover:inline`}
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
                <>
                  {/* Editor toolbar */}
                  <div className={`flex h-7 shrink-0 items-center gap-2 border-b ${tc.border} ${tc.surface} px-2`}>
                    {/* Font size */}
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => setEditorFontSize(s => Math.max(10, s - 1))}
                        className={`rounded px-1 text-[11px] ${tc.textMuted} ${tc.hoverBg}`} title="Decrease font">A-</button>
                      <span className={`min-w-[20px] text-center text-[10px] ${tc.textMuted}`}>{editorFontSize}</span>
                      <button onClick={() => setEditorFontSize(s => Math.min(24, s + 1))}
                        className={`rounded px-1 text-[11px] ${tc.textMuted} ${tc.hoverBg}`} title="Increase font">A+</button>
                    </div>
                    <span className={tc.textMuted}>|</span>
                    {/* Tab size */}
                    <button onClick={() => setEditorTabSize(t => t === 2 ? 4 : 2)}
                      className={`rounded px-1.5 text-[10px] ${tc.textMuted} ${tc.hoverBg}`} title="Toggle tab size"
                    >Tab: {editorTabSize}</button>
                    <span className={tc.textMuted}>|</span>
                    {/* Word wrap */}
                    <button onClick={() => setEditorWordWrap(w => w === 'on' ? 'off' : 'on')}
                      className={`rounded px-1.5 text-[10px] ${tc.hoverBg} ${editorWordWrap === 'on' ? 'text-indigo-600 font-medium' : tc.textMuted}`}
                      title="Toggle word wrap"
                    >Wrap</button>
                    {/* Minimap */}
                    <button onClick={() => setEditorMinimap(m => !m)}
                      className={`rounded px-1.5 text-[10px] ${tc.hoverBg} ${editorMinimap ? 'text-indigo-600 font-medium' : tc.textMuted}`}
                      title="Toggle minimap"
                    >Minimap</button>
                    <span className={tc.textMuted}>|</span>
                    {/* Theme selector */}
                    <select
                      value={pageTheme}
                      onChange={(e) => setPageTheme(e.target.value as PageTheme)}
                      className={`rounded border ${tc.border} ${tc.inputBg} ${tc.text} px-1.5 py-0.5 text-[10px]`}
                      title="Editor theme"
                    >
                      <option value="light">☀️ Light</option>
                      <option value="dark">🌙 Dark</option>
                      <option value="dark-dimmed">🌘 Dark Dimmed</option>
                      <option value="monokai">🎨 Monokai</option>
                    </select>
                    <span className={tc.textMuted}>|</span>
                    {/* AI completion toggle */}
                    <button
                      onClick={() => setAiCompletionEnabled(v => !v)}
                      className={`rounded px-1.5 text-[10px] ${tc.hoverBg} ${aiCompletionEnabled ? 'text-indigo-600 font-medium' : tc.textMuted}`}
                      title={aiCompletionEnabled ? 'AI completion ON (Tab to accept)' : 'AI completion OFF'}
                    >✨ AI {aiCompletionEnabled ? 'ON' : 'OFF'}</button>
                    <div className="flex-1" />
                    {/* Language indicator */}
                    <span className={`text-[10px] ${tc.textMuted}`}>{langFromPath(selectedFile.path)}</span>
                    {/* Modified indicator */}
                    {isModified && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Unsaved changes" />}
                    {saving && <span className={`text-[10px] ${tc.accent} animate-pulse`}>Saving...</span>}
                    {hasSavedEdits && (
                      <span className={`text-[10px] ${tc.accent} font-medium`} title={`Branch: ${editBranch}\n${Array.from(savedFiles).join('\n')}`}>
                        🌿 {savedFiles.size} saved on {editBranch}
                      </span>
                    )}
                  </div>
                  {/* Action bar: save / PR / discard — always visible above editor */}
                  {(isModified || hasSavedEdits) && (
                    <div className={`flex h-8 shrink-0 items-center gap-2 border-b ${tc.border} px-3`} style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.08), rgba(16,185,129,0.08))' }}>
                      {isModified && (
                        <button onClick={saveFile} disabled={saving} className="rounded bg-indigo-500 px-2.5 py-1 text-[11px] text-white hover:bg-indigo-600 disabled:opacity-50">
                          {saving ? '⏳ Saving...' : '💾 Save (⌘S)'}
                        </button>
                      )}
                      {hasSavedEdits && (
                        <>
                          <span className={`text-[11px] ${tc.textMuted}`}>🌿 {savedFiles.size} file(s) on <code className="font-mono text-[10px]">{editBranch}</code></span>
                          <button onClick={createPR} className="rounded bg-emerald-500 px-2.5 py-1 text-[11px] text-white hover:bg-emerald-600">🔀 Create PR</button>
                          <button onClick={() => { if (confirm('Discard all edits and revert to main branch?')) discardEdits() }} className="rounded bg-red-500/80 px-2 py-1 text-[11px] text-white hover:bg-red-600">✕ Discard</button>
                        </>
                      )}
                    </div>
                  )}
                  <div className="flex-1 relative">
                    {fileLoading && (
                      <div className="absolute left-2 top-2 z-10 rounded bg-slate-800/80 px-2 py-1 text-[11px] text-white">Loading...</div>
                    )}
                    <MonacoEditor
                      height="100%"
                      language={langFromPath(selectedFile.path)}
                      value={modifiedContent}
                      onChange={(v) => {
                        setModifiedContent(v || '')
                        setIsModified(v !== fileContent)
                      }}
                      onMount={(editor, monaco) => {
                        editorRef.current = editor
                        monacoRef.current = monaco

                        // Register AI inline completion provider (ghost text on typing pause)
                        try {
                        let completionDisposable: { dispose: () => void } | null = null
                        const registerProvider = () => {
                          if (completionDisposable) completionDisposable.dispose()
                          if (!monaco?.languages?.registerInlineCompletionItemProvider) return
                          let debounceTimer: ReturnType<typeof setTimeout> | null = null
                          let abortController: AbortController | null = null

                          completionDisposable = monaco.languages.registerInlineCompletionItemProvider('*', {
                            provideInlineCompletionItems: async (model: { getValueInRange: (r: unknown) => string; getLineCount: () => number; getLineMaxColumn: (l: number) => number }, position: { lineNumber: number; column: number }) => {
                              // Cancel previous request
                              if (abortController) abortController.abort()
                              if (debounceTimer) clearTimeout(debounceTimer)

                              return new Promise((resolve) => {
                                debounceTimer = setTimeout(async () => {
                                  abortController = new AbortController()
                                  try {
                                    const codeBefore = model.getValueInRange({
                                      startLineNumber: Math.max(1, position.lineNumber - 50),
                                      startColumn: 1,
                                      endLineNumber: position.lineNumber,
                                      endColumn: position.column,
                                    })
                                    const codeAfter = model.getValueInRange({
                                      startLineNumber: position.lineNumber,
                                      startColumn: position.column,
                                      endLineNumber: Math.min(model.getLineCount(), position.lineNumber + 20),
                                      endColumn: model.getLineMaxColumn(Math.min(model.getLineCount(), position.lineNumber + 20)),
                                    })
                                    if (codeBefore.trim().length < 3) { resolve({ items: [] }); return }

                                    const r = await fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/completions`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
                                      body: JSON.stringify({ file_path: selectedFile?.path || 'untitled', code_before: codeBefore, code_after: codeAfter }),
                                      signal: abortController!.signal,
                                    })
                                    if (!r.ok) { resolve({ items: [] }); return }
                                    const data = await r.json()
                                    const text = data.completion?.trim()
                                    if (!text) { resolve({ items: [] }); return }
                                    resolve({
                                      items: [{
                                        insertText: text,
                                        range: {
                                          startLineNumber: position.lineNumber,
                                          startColumn: position.column,
                                          endLineNumber: position.lineNumber,
                                          endColumn: position.column,
                                        },
                                      }],
                                    })
                                  } catch {
                                    resolve({ items: [] })
                                  }
                                }, 600)
                              })
                            },
                            freeInlineCompletionItems: () => {},
                          })
                        }
                        registerProvider()
                        } catch (e) { console.warn('AI inline completion init failed:', e) }

                        // Ctrl+I / Cmd+I: inline AI edit
                        try {
                        editor.addAction({
                          id: 'ai-inline-edit',
                          label: 'AI Inline Edit',
                          keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI],
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          run: (ed: any) => {
                            const selection = ed.getSelection()
                            if (!selection) return
                            const selectedCode = ed.getModel()?.getValueInRange(selection) || ''
                            const instruction = window.prompt('AI Edit Instruction:', selectedCode ? 'Refactor this code' : 'Generate code here')
                            if (!instruction) return
                            // Send to completions endpoint with instruction
                            fetch(`${CLIENT_WTT_API_BASE}/tasks/${taskId}/completions`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken ?? ''}` },
                              body: JSON.stringify({
                                file_path: selectedFile?.path || 'untitled',
                                code_before: `// Instruction: ${instruction}\n${selectedCode ? `// Selected code:\n${selectedCode}\n// Rewritten code:\n` : ''}`,
                                code_after: '',
                                max_tokens: 512,
                              }),
                            }).then(r => r.json()).then(data => {
                              const text = data.completion?.trim()
                              if (text) {
                                ed.executeEdits('ai-edit', [{
                                  range: selection,
                                  text: text,
                                }])
                              }
                            }).catch(() => {})
                          },
                        })
                        } catch (e) { console.warn('AI action init failed:', e) }

                        // Quote to Chat: right-click selected code → insert into chat
                        try {
                        editor.addAction({
                          id: 'quote-to-chat',
                          label: '💬 Quote to Chat',
                          contextMenuGroupId: '9_cutcopypaste',
                          contextMenuOrder: 99,
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          run: (ed: any) => {
                            const selection = ed.getSelection()
                            if (!selection) return
                            const selectedCode = ed.getModel()?.getValueInRange(selection) || ''
                            if (!selectedCode.trim()) return
                            const filePath = selectedFileRef.current?.path || 'unknown'
                            const startLine = selection.startLineNumber
                            const endLine = selection.endLineNumber
                            const lineCount = endLine - startLine + 1
                            const charCount = selectedCode.length
                            const lang = langFromPath(filePath)
                            // Compact reference — agent can read the file directly
                            const ref = `📌 [Code Ref: \`${filePath}\` L${startLine}-L${endLine}, ${lineCount} lines, ${charCount} chars, ${lang}]`
                            setChatInput(prev => prev ? `${prev}\n\n${ref}\n\n` : `${ref}\n\n`)
                          },
                        })
                        } catch (e) { console.warn('Quote to Chat action init failed:', e) }
                      }}
                      theme={editorTheme}
                      options={{
                        fontSize: editorFontSize,
                        minimap: { enabled: editorMinimap },
                        wordWrap: editorWordWrap,
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: editorTabSize,
                        readOnly: false,
                        cursorBlinking: 'smooth',
                        cursorSmoothCaretAnimation: 'on',
                        smoothScrolling: true,
                        bracketPairColorization: { enabled: true },
                        guides: { bracketPairs: true, indentation: true },
                        formatOnPaste: true,
                        linkedEditing: true,
                        renderWhitespace: 'selection',
                        suggest: { showKeywords: true, showSnippets: true },
                        inlineSuggest: { enabled: aiCompletionEnabled },
                      }}
                    />
                  </div>
                </>
              ) : (
                <div className={`flex flex-1 items-center justify-center ${tc.textMuted}`}>
                  <div className="text-center">
                    <p className="text-4xl">📝</p>
                    <p className="mt-2 text-sm">Select a file to edit</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right resize handle */}
        <div
          className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-indigo-400/40 active:bg-indigo-500/50 transition-colors"
          onMouseDown={(e) => startResize('right', e)}
          title="Drag to resize"
        />

        {/* Chat panel */}
        <div className={`flex shrink-0 flex-col border-l ${tc.border}`} style={{ width: `${rightPanelWidth}px` }}>
          {/* Tab header */}
          <div className={`flex h-10 shrink-0 items-center border-b ${tc.border} ${tc.surface}`}>
            {(['chat', 'issues', 'prs'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`flex-1 h-full text-[12px] font-medium transition-colors ${
                  rightTab === tab
                    ? `text-indigo-600 border-b-2 border-indigo-500 ${tc.activeBg}`
                    : `${tc.textMuted} ${tc.hoverBg}`
                }`}
              >
                {tab === 'chat' && `💬 Chat${wsState === 'connected' ? '' : ' ⚪'}`}
                {tab === 'issues' && `🐛 Issues${issues.length ? ` (${issues.length})` : ''}`}
                {tab === 'prs' && `🔀 PRs${pulls.length ? ` (${pulls.length})` : ''}`}
              </button>
            ))}
          </div>

          {rightTab === 'chat' && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="flex h-full items-center justify-center">
                    <div className={`text-center ${tc.textMuted}`}>
                      <p className="text-3xl">💬</p>
                      <p className="mt-2 text-sm">Ask the agent about your code</p>
                      <p className="mt-1 text-[11px]">Selected file will be sent as context</p>
                    </div>
                  </div>
                )}
                {chatMessages.filter(m => !isProgressMessage(m.content)).map((msg) => {
                  const patch = msg.role === 'assistant' ? extractFilePatch(msg.content) : null
                  const allPatches = msg.role === 'assistant' ? extractAllPatches(msg.content) : []
                  const { meta: msgMeta, body: cleanBody } = stripMetaBlocks(msg.content || '')
                  const displayContent = stripFileTokens(cleanBody) || cleanBody
                  return (
                    <div key={msg.id} className={`rounded-lg border ${tc.border} ${tc.activeBg} px-3 py-2 text-[13px] leading-relaxed ${tc.text}`}>
                      <div className="mb-1 flex items-center justify-between">
                        <p className={`text-[11px] font-semibold ${msg.role === 'user' ? 'text-emerald-600' : 'text-indigo-600'}`}>
                          {msg.role === 'user' ? (msg.sender_display_name || 'User') : (msg.sender_display_name || 'Agent')}
                        </p>
                        <p className={`text-[10px] ${tc.textMuted}`}>{formatTime(msg.timestamp)}</p>
                      </div>
                      {msgMeta.length > 0 && (
                        <div className="mb-2 space-y-1">
                          {msgMeta.map((m, mi) => {
                            const entries = Object.entries(m.entries).filter(([, v]) => v !== '')
                            if (entries.length === 0) return null
                            return (
                              <div key={mi} className={`rounded-md border ${tc.border} px-2 py-1.5`}>
                                <div className="grid gap-x-3 gap-y-0.5" style={{ gridTemplateColumns: 'auto 1fr' }}>
                                  {entries.map(([k, v]) => (
                                    <div key={k} className="contents text-[11px]">
                                      <span className={tc.textMuted}>{k}</span>
                                      <span className="font-medium truncate">{v}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap break-words">{displayContent}</div>
                      <FileAttachmentPreview content={msg.content} />
                      {allPatches.length > 1 ? (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => enterDiffReview(allPatches)}
                            className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
                          >🔍 Review {allPatches.length} files</button>
                          {allPatches.map((p, i) => (
                            <button key={i} onClick={() => applyPatchToEditor(p.path, p.code)}
                              className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100"
                            >{p.path.split('/').pop()}</button>
                          ))}
                        </div>
                      ) : patch ? (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => enterDiffReview([{ ...patch, status: 'pending' }])}
                            className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
                          >🔍 Review Diff</button>
                          <button
                            onClick={() => applyPatchToEditor(patch.path, patch.code)}
                            className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] text-indigo-600 hover:bg-indigo-100"
                          >Apply ({patch.path})</button>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
                {awaitingAgent && (
                  <div className="flex justify-start">
                    <div className={`rounded-2xl rounded-tl-md border ${tc.border} ${tc.activeBg} px-4 py-3 text-[13px] ${tc.textMuted}`}>
                      <span className="inline-flex items-center gap-1">
                        <span className="animate-pulse">🤔</span> Agent is thinking...
                      </span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className={`border-t ${tc.border} ${tc.surface} p-3`}>
                {selectedFile && (
                  <div className="mb-2 flex items-center gap-1 rounded bg-indigo-50 px-2 py-1 text-[11px] text-indigo-600">
                    <span>📎</span>
                    <span className="truncate">{selectedFile.path}</span>
                    <span className="text-slate-400">will be sent as context</span>
                  </div>
                )}
                <PendingAttachments attachments={pendingAttachments} onRemove={(i) => setPendingAttachments(prev => prev.filter((_, j) => j !== i))} />
                <div className="flex gap-2 items-center">
                  <ChatFileUpload
                    compact
                    onUploaded={(asset) => setPendingAttachments(prev => [...prev, asset.markdownToken])}
                    disabled={false}
                  />
                  <textarea
                    className={`flex-1 rounded-lg border ${tc.border} ${tc.inputBg} px-3 py-2 text-sm ${tc.text} focus:border-indigo-400 focus:outline-none resize-none`}
                    rows={chatInput.includes('\n') ? Math.min(chatInput.split('\n').length, 6) : 1}
                    placeholder="Ask about code..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                    disabled={false}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={sending || (!chatInput.trim() && !pendingAttachments.length)}
                    className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white disabled:opacity-50"
                  >
                    {sending ? '...' : 'Send'}
                  </button>
                </div>
              </div>
            </>
          )}

          {rightTab === 'issues' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1">
                  {(['all', 'open', 'closed'] as const).map(s => (
                    <button key={s} onClick={() => { setIssueFilter(s); fetchIssues(s) }}
                      className={`rounded px-1.5 py-0.5 text-[10px] ${issueFilter === s ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-400 hover:bg-slate-100'}`}
                    >{s === 'all' ? 'All' : s === 'open' ? '🟢 Open' : '🔴 Closed'}</button>
                  ))}
                  <span className="ml-1 text-[10px] text-slate-300">({issues.length})</span>
                </div>
                <button onClick={() => fetchIssues()} className="text-[11px] text-indigo-500 hover:text-indigo-700">🔄</button>
              </div>
              {issuesLoading && <p className={`text-center text-[11px] ${tc.textMuted}`}>Loading...</p>}
              {!issuesLoading && issues.length === 0 && (
                <div className={`flex flex-col items-center justify-center py-8 ${tc.textMuted}`}>
                  <span className="text-2xl mb-2">🐛</span>
                  <p className="text-[12px]">No {issueFilter === 'all' ? '' : issueFilter} issues</p>
                </div>
              )}
              {issues.map((issue) => (
                <div key={issue.number} className={`rounded border ${tc.border} ${tc.activeBg}`}>
                  <button
                    onClick={() => {
                      if (expandedIssue === issue.number) { setExpandedIssue(null) }
                      else { setExpandedIssue(issue.number); fetchIssueDetail(issue.number) }
                    }}
                    className={`flex w-full items-start gap-2 p-2 text-left ${tc.hoverBg}`}
                  >
                    <span className="mt-0.5 text-[11px]">{issue.state === 'open' ? '🟢' : '🔴'}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[12px] font-medium ${tc.text} leading-tight`}>#{issue.number} {issue.title}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(issue.labels || []).map((label: Record<string, any>) => (
                          <span key={label.id || label.name} className="rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{
                            backgroundColor: `#${label.color || 'e1e4e8'}20`,
                            color: `#${label.color || '586069'}`,
                            border: `1px solid #${label.color || 'e1e4e8'}40`,
                          }}>{label.name}</span>
                        ))}
                      </div>
                      <p className={`mt-0.5 text-[10px] ${tc.textMuted}`}>by {issue.user?.login} · {formatDateGroup(issue.created_at)}</p>
                    </div>
                    <span className={`text-[10px] ${tc.textMuted}`}>{expandedIssue === issue.number ? '▼' : '▶'}</span>
                  </button>
                  {expandedIssue === issue.number && (
                    <div className={`border-t ${tc.border} p-2 space-y-2`}>
                      {issue.body && (
                        <div className={`rounded ${tc.surface} p-2 text-[11px] ${tc.textMuted} whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto`}>{issue.body}</div>
                      )}
                      {issueComments.length > 0 && (
                        <div className="space-y-1.5">
                          <p className={`text-[10px] font-semibold ${tc.textMuted}`}>💬 Comments ({issueComments.length})</p>
                          {issueComments.map((c) => (
                            <div key={c.id} className={`rounded border ${tc.border} ${tc.activeBg} p-1.5`}>
                              <p className={`text-[10px] font-medium ${tc.textMuted}`}>{c.user?.login} · {formatDateGroup(c.created_at)}</p>
                              <p className={`mt-0.5 text-[11px] ${tc.textMuted} whitespace-pre-wrap max-h-24 overflow-y-auto`}>{c.body}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => {
                          const ref = `@issue #${issue.number}: ${issue.title}\n${issue.body?.slice(0, 200) || ''}`
                          setChatInput(ref)
                          setRightTab('chat')
                        }}
                        className="w-full rounded bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-600 hover:bg-indigo-100"
                      >📎 Reference in Chat</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

           {rightTab === 'prs' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1">
                  {(['all', 'open', 'closed'] as const).map(s => (
                    <button key={s} onClick={() => { setPrFilter(s); fetchPulls(s) }}
                      className={`rounded px-1.5 py-0.5 text-[10px] ${prFilter === s ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-400 hover:bg-slate-100'}`}
                    >{s === 'all' ? 'All' : s === 'open' ? '🟢 Open' : '🔴 Closed'}</button>
                  ))}
                  <span className="ml-1 text-[10px] text-slate-300">({pulls.length})</span>
                </div>
                <button onClick={() => fetchPulls()} className="text-[11px] text-indigo-500 hover:text-indigo-700">🔄</button>
              </div>
              {pullsLoading && <p className={`text-center text-[11px] ${tc.textMuted}`}>Loading...</p>}
              {!pullsLoading && pulls.length === 0 && (
                <div className={`flex flex-col items-center justify-center py-8 ${tc.textMuted}`}>
                  <span className="text-2xl mb-2">🔀</span>
                  <p className="text-[12px]">No {prFilter === 'all' ? '' : prFilter} pull requests</p>
                </div>
              )}
              {pulls.map((pr) => (
                <div key={pr.number} className={`rounded border ${tc.border} ${tc.activeBg}`}>
                  <button
                    onClick={() => {
                      if (expandedPR === pr.number) { setExpandedPR(null) }
                      else { setExpandedPR(pr.number); fetchPRFiles(pr.number) }
                    }}
                    className={`flex w-full items-start gap-2 p-2 text-left ${tc.hoverBg}`}
                  >
                    <span className="mt-0.5 text-[11px]">{pr.state === 'open' ? '🟢' : pr.merged_at ? '🟣' : '🔴'}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[12px] font-medium ${tc.text} leading-tight`}>#{pr.number} {pr.title}</p>
                      <p className={`mt-0.5 text-[10px] ${tc.textMuted}`}>
                        {pr.head?.ref} → {pr.base?.ref} · by {pr.user?.login}
                      </p>
                    </div>
                    <span className={`text-[10px] ${tc.textMuted}`}>{expandedPR === pr.number ? '▼' : '▶'}</span>
                  </button>
                  {expandedPR === pr.number && (
                    <div className={`border-t ${tc.border} p-2 space-y-2`}>
                      {pr.body && (
                        <div className={`rounded ${tc.surface} p-2 text-[11px] ${tc.textMuted} whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto`}>{pr.body}</div>
                      )}
                      {/* Review all files button */}
                      {prFiles.length > 0 && (
                        <button
                          onClick={() => enterPRDiffReview(
                            { number: pr.number, title: pr.title, head: pr.head?.ref, base: pr.base?.ref },
                            prFiles,
                          )}
                          className="w-full rounded bg-amber-50 border border-amber-300 px-2 py-1.5 text-[12px] font-medium text-amber-700 hover:bg-amber-100"
                        >🔍 Review All {prFiles.length} Files (Diff)</button>
                      )}
                      {prFiles.length > 0 && (
                        <div className="space-y-1">
                          <p className={`text-[10px] font-semibold ${tc.textMuted}`}>📁 Changed Files ({prFiles.length})</p>
                          {prFiles.map((f) => (
                            <div key={f.filename} className={`flex w-full items-center gap-1 rounded px-1.5 py-1 ${tc.hoverBg}`}>
                              <span className={`text-[10px] font-mono ${
                                f.status === 'added' ? 'text-green-600' : f.status === 'removed' ? 'text-red-600' : 'text-amber-600'
                              }`}>{f.status === 'added' ? '+' : f.status === 'removed' ? '-' : '~'}</span>
                              <span className={`flex-1 truncate text-[11px] ${tc.textMuted}`}>{f.filename}</span>
                              <span className="text-[10px] text-green-600">+{f.additions}</span>
                              <span className="text-[10px] text-red-500">-{f.deletions}</span>
                              <button
                                onClick={() => enterPRDiffReview(
                                  { number: pr.number, title: pr.title, head: pr.head?.ref, base: pr.base?.ref },
                                  [f],
                                )}
                                className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 hover:bg-amber-100"
                              >diff</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setChatInput(`Please merge PR #${pr.number}: ${pr.title}`)
                            setRightTab('chat')
                          }}
                          className="flex-1 rounded bg-green-50 px-2 py-1 text-[11px] font-medium text-green-600 hover:bg-green-100"
                        >✅ Approve & Merge</button>
                        <button
                          onClick={() => {
                            const ref = `@pr #${pr.number}: ${pr.title}\n${pr.head?.ref} → ${pr.base?.ref}`
                            setChatInput(ref)
                            setRightTab('chat')
                          }}
                          className="flex-1 rounded bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-600 hover:bg-indigo-100"
                        >📎 Reference in Chat</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Right-click context menu */}
      {ctxMenu && (
        <ContextMenu
          items={buildContextMenuItems(ctxMenu.node)}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
