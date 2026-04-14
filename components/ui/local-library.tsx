'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronDown, ChevronRight, FolderPlus, Library,
  Trash2, RefreshCw, Search, X, Loader2, Sparkles,
  Clock, FileText, Filter,
} from 'lucide-react'
import {
  isDesktop, getDesktopBridge, scanLocalFolder,
  listWorkspaces, addWorkspace, removeWorkspace,
  searchWorkspace, getRecentFiles, trackRecentFile,
} from '@/lib/desktop'
import type { ScannedFile, WorkspaceInfo, RecentFile, SearchMatch } from '@/lib/desktop'
import { useI18n } from '@/lib/i18n-provider'

// ── Types ──

type FileCategory = 'papers' | 'code' | 'documents' | 'data' | 'media' | 'other'

interface FileTreeNode {
  name: string
  path: string
  fullPath?: string
  isDirectory: boolean
  children?: FileTreeNode[]
  size?: number
  extension?: string
  isText?: boolean
  childFileCount?: number
  category?: FileCategory
}

// ── Category classification ──

const CATEGORY_MAP: Record<string, FileCategory> = {
  '.pdf': 'papers', '.bib': 'papers', '.tex': 'papers', '.latex': 'papers',
  '.py': 'code', '.js': 'code', '.jsx': 'code', '.ts': 'code', '.tsx': 'code',
  '.go': 'code', '.rs': 'code', '.java': 'code', '.kt': 'code',
  '.c': 'code', '.cpp': 'code', '.h': 'code', '.hpp': 'code',
  '.rb': 'code', '.php': 'code', '.swift': 'code', '.scala': 'code',
  '.sh': 'code', '.bash': 'code', '.sql': 'code', '.r': 'code',
  '.html': 'code', '.htm': 'code', '.css': 'code', '.scss': 'code', '.vue': 'code',
  '.md': 'documents', '.mdx': 'documents', '.txt': 'documents', '.rst': 'documents',
  '.docx': 'documents', '.doc': 'documents', '.pptx': 'documents', '.rtf': 'documents',
  '.csv': 'data', '.json': 'data', '.yaml': 'data', '.yml': 'data',
  '.xml': 'data', '.toml': 'data', '.xlsx': 'data', '.xls': 'data',
  '.png': 'media', '.jpg': 'media', '.jpeg': 'media', '.gif': 'media', '.svg': 'media',
  '.mp3': 'media', '.mp4': 'media', '.wav': 'media', '.webm': 'media', '.webp': 'media',
}

const CATEGORY_LABELS: Record<FileCategory, { label: string; emoji: string; color: string }> = {
  papers:    { label: 'Papers',    emoji: '📕', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  code:      { label: 'Code',      emoji: '⚡', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  documents: { label: 'Docs',      emoji: '📝', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  data:      { label: 'Data',      emoji: '📊', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  media:     { label: 'Media',     emoji: '🖼️', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  other:     { label: 'Other',     emoji: '📄', color: 'bg-slate-100 text-slate-600 dark:bg-zinc-700 dark:text-zinc-300' },
}

function classifyFile(ext?: string): FileCategory {
  if (!ext) return 'other'
  return CATEGORY_MAP[ext.toLowerCase()] ?? 'other'
}

// ── Helpers ──

function getFileIcon(ext?: string): string {
  if (!ext) return '📄'
  switch (ext.toLowerCase()) {
    case '.pdf': return '📕'
    case '.md': case '.mdx': case '.txt': case '.rst': return '📝'
    case '.py': return '🐍'
    case '.js': case '.jsx': case '.ts': case '.tsx': return '⚡'
    case '.go': return '🔵'
    case '.rs': return '🦀'
    case '.java': case '.kt': return '☕'
    case '.c': case '.cpp': case '.h': case '.hpp': return '⚙️'
    case '.json': case '.yaml': case '.yml': case '.toml': return '📋'
    case '.html': case '.htm': case '.css': case '.scss': return '🌐'
    case '.csv': case '.xlsx': return '📊'
    case '.docx': case '.doc': return '📘'
    case '.pptx': return '📙'
    case '.sql': return '🗃️'
    case '.sh': case '.bash': return '💻'
    default: return '📄'
  }
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function countFiles(node: FileTreeNode): number {
  if (!node.isDirectory) return 1
  return (node.children ?? []).reduce((acc, c) => acc + countFiles(c), 0)
}

function buildFileTree(files: ScannedFile[]): FileTreeNode[] {
  const root: { children: FileTreeNode[] } = { children: [] }

  for (const file of files) {
    const parts = file.relativePath.split('/')
    let current: { children: FileTreeNode[] } = root

    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join('/')
      let child = current.children.find(c => c.name === parts[i] && c.isDirectory)
      if (!child) {
        child = { name: parts[i], path: dirPath, isDirectory: true, children: [] }
        current.children.push(child)
      }
      current = child as { children: FileTreeNode[] }
    }

    const category = classifyFile(file.extension)
    current.children.push({
      name: file.name,
      path: file.relativePath,
      fullPath: file.path,
      isDirectory: false,
      size: file.size,
      extension: file.extension,
      isText: file.isText,
      category,
    })
  }

  const annotateAndSort = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const node of nodes) {
      if (node.children) {
        annotateAndSort(node.children)
        node.childFileCount = countFiles(node)
      }
    }
  }
  annotateAndSort(root.children)
  return root.children
}

function matchesFilter(node: FileTreeNode, q: string, categoryFilter: FileCategory | null): boolean {
  const matchesName = !q || node.name.toLowerCase().includes(q.toLowerCase())
  const matchesCat = !categoryFilter || node.category === categoryFilter
  if (node.isDirectory) {
    if (node.children) return node.children.some(c => matchesFilter(c, q, categoryFilter))
    return false
  }
  return matchesName && matchesCat
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ── Category badge ──

function CategoryBadge({ category }: { category?: FileCategory }) {
  if (!category || category === 'other') return null
  const info = CATEGORY_LABELS[category]
  return (
    <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-medium leading-tight ${info.color}`}>
      {info.label}
    </span>
  )
}

// ── Recursive file tree view ──

function FileTreeView({ nodes, expandedDirs, toggleDir, onFileClick, onAnalyze, depth = 0, searchQuery, categoryFilter }: {
  nodes: FileTreeNode[]
  expandedDirs: Set<string>
  toggleDir: (path: string) => void
  onFileClick: (node: FileTreeNode) => void
  onAnalyze?: (node: FileTreeNode) => void
  depth?: number
  searchQuery: string
  categoryFilter: FileCategory | null
}) {
  const filtered = (searchQuery || categoryFilter)
    ? nodes.filter(n => matchesFilter(n, searchQuery, categoryFilter))
    : nodes

  if (filtered.length === 0) return null

  return (
    <div style={{ paddingLeft: depth > 0 ? 10 : 0 }}>
      {filtered.map(node => {
        if (node.isDirectory) {
          const isOpen = expandedDirs.has(node.path)
          return (
            <div key={node.path}>
              <button
                onClick={() => toggleDir(node.path)}
                className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700"
              >
                {isOpen
                  ? <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
                  : <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />}
                <span className="shrink-0">📁</span>
                <span className="truncate">{node.name}</span>
                {node.childFileCount != null && (
                  <span className="ml-auto text-[10px] text-slate-400 dark:text-zinc-500">{node.childFileCount}</span>
                )}
              </button>
              {isOpen && node.children && (
                <FileTreeView
                  nodes={node.children}
                  expandedDirs={expandedDirs}
                  toggleDir={toggleDir}
                  onFileClick={onFileClick}
                  onAnalyze={onAnalyze}
                  depth={depth + 1}
                  searchQuery={searchQuery}
                  categoryFilter={categoryFilter}
                />
              )}
            </div>
          )
        }

        return (
          <div key={node.path} className="group/file flex items-center">
            <button
              onClick={() => onFileClick(node)}
              className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-xs text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 hover:text-slate-800 dark:hover:text-zinc-200"
              title={node.fullPath ?? node.path}
            >
              <span className="w-3 shrink-0" />
              <span className="shrink-0">{getFileIcon(node.extension)}</span>
              <span className="truncate">{node.name}</span>
              <CategoryBadge category={node.category} />
              <span className="ml-auto whitespace-nowrap text-[10px] text-slate-400 dark:text-zinc-500">
                {formatFileSize(node.size)}
              </span>
            </button>
            {onAnalyze && (
              <button
                onClick={() => onAnalyze(node)}
                className="hidden shrink-0 rounded p-0.5 text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 group-hover/file:block"
                title="Analyze with Agent"
              >
                <Sparkles className="h-3 w-3" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Content search results ──

function SearchResults({ results, onResultClick }: {
  results: SearchMatch[]
  onResultClick: (r: SearchMatch) => void
}) {
  if (results.length === 0) return null
  return (
    <div className="mt-1 space-y-0.5">
      {results.map((r, i) => (
        <button
          key={`${r.filePath}-${r.lineNumber}-${i}`}
          onClick={() => onResultClick(r)}
          className="flex w-full items-start gap-1 rounded px-1 py-0.5 text-left text-[11px] hover:bg-slate-100 dark:hover:bg-zinc-700"
        >
          <span className="shrink-0 text-indigo-500 dark:text-indigo-400">L{r.lineNumber}</span>
          <span className="truncate text-slate-600 dark:text-zinc-300">{r.relativePath}</span>
          <span className="ml-1 truncate text-slate-400 dark:text-zinc-500">{r.lineContent.trim()}</span>
        </button>
      ))}
    </div>
  )
}

// ── Main component ──

interface LocalLibraryProps {
  onFileSelect?: (filePath: string, workspacePath: string) => void
}

export function LocalLibrary({ onFileSelect }: LocalLibraryProps) {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(false)
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [expandedWs, setExpandedWs] = useState<Set<string>>(new Set())
  const [fileTrees, setFileTrees] = useState<Record<string, FileTreeNode[]>>({})
  const [scanning, setScanning] = useState<Set<string>>(new Set())
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [searchMode, setSearchMode] = useState<'name' | 'content'>('name')
  const [contentResults, setContentResults] = useState<SearchMatch[]>([])
  const [contentSearching, setContentSearching] = useState(false)
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([])
  const [showRecent, setShowRecent] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<FileCategory | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isDesktop()) return
    listWorkspaces().then(setWorkspaces)
    getRecentFiles().then(setRecentFiles)
  }, [])

  // Content search with debounce
  useEffect(() => {
    if (searchMode !== 'content' || !searchQuery.trim() || workspaces.length === 0) {
      setContentResults([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setContentSearching(true)
      try {
        const allResults: SearchMatch[] = []
        for (const ws of workspaces) {
          const matches = await searchWorkspace(ws.path, searchQuery, 20)
          allResults.push(...matches)
        }
        setContentResults(allResults.slice(0, 50))
      } finally {
        setContentSearching(false)
      }
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery, searchMode, workspaces])

  const handleAdd = useCallback(async () => {
    const ws = await addWorkspace()
    if (ws) {
      setWorkspaces(prev => {
        if (prev.some(w => w.path === ws.path)) return prev
        return [...prev, ws]
      })
    }
  }, [])

  const handleRemove = useCallback(async (wsPath: string) => {
    await removeWorkspace(wsPath)
    setWorkspaces(prev => prev.filter(w => w.path !== wsPath))
    setFileTrees(prev => {
      const next = { ...prev }
      delete next[wsPath]
      return next
    })
    setExpandedWs(prev => { const n = new Set(prev); n.delete(wsPath); return n })
  }, [])

  const doScan = useCallback(async (wsPath: string) => {
    setScanning(prev => new Set(prev).add(wsPath))
    try {
      const result = await scanLocalFolder(wsPath, { includeBinary: true })
      if (result) {
        const tree = buildFileTree(result.files)
        setFileTrees(prev => ({ ...prev, [wsPath]: tree }))
        const bridge = getDesktopBridge()
        bridge?.workspace?.updateMeta(wsPath, {
          fileCount: result.files.length,
          lastScanAt: new Date().toISOString(),
        })
        setWorkspaces(prev => prev.map(w =>
          w.path === wsPath
            ? { ...w, fileCount: result.files.length, lastScanAt: new Date().toISOString() }
            : w
        ))
      }
    } catch (err) {
      console.error('[LocalLibrary] Scan error:', err)
    } finally {
      setScanning(prev => { const n = new Set(prev); n.delete(wsPath); return n })
    }
  }, [])

  const handleToggleWorkspace = useCallback(async (wsPath: string) => {
    const willExpand = !expandedWs.has(wsPath)
    setExpandedWs(prev => {
      const next = new Set(prev)
      if (next.has(wsPath)) next.delete(wsPath)
      else next.add(wsPath)
      return next
    })
    if (willExpand && !fileTrees[wsPath]) {
      doScan(wsPath)
    }
  }, [expandedWs, fileTrees, doScan])

  const handleRescan = useCallback((wsPath: string, e: React.MouseEvent) => {
    e.stopPropagation()
    doScan(wsPath)
  }, [doScan])

  const toggleDir = useCallback((dirPath: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(dirPath)) next.delete(dirPath)
      else next.add(dirPath)
      return next
    })
  }, [])

  const handleFileClick = useCallback((node: FileTreeNode) => {
    if (node.fullPath) {
      const ws = workspaces.find(w => node.fullPath!.startsWith(w.path))
      trackRecentFile({
        path: node.fullPath,
        name: node.name,
        workspacePath: ws?.path ?? '',
        extension: node.extension ?? '',
      })
      getRecentFiles().then(setRecentFiles)
      if (onFileSelect) onFileSelect(node.fullPath, ws?.path ?? '')
    }
  }, [workspaces, onFileSelect])

  const handleRecentFileClick = useCallback((rf: RecentFile) => {
    trackRecentFile({ path: rf.path, name: rf.name, workspacePath: rf.workspacePath, extension: rf.extension })
    if (onFileSelect) onFileSelect(rf.path, rf.workspacePath)
  }, [onFileSelect])

  const handleAnalyzeFile = useCallback((node: FileTreeNode) => {
    if (!node.fullPath) return
    window.dispatchEvent(new CustomEvent('wtt:analyze-files', {
      detail: { files: [{ path: node.fullPath, name: node.name }] }
    }))
  }, [])

  const handleAnalyzeRecent = useCallback((rf: RecentFile) => {
    window.dispatchEvent(new CustomEvent('wtt:analyze-files', {
      detail: { files: [{ path: rf.path, name: rf.name }] }
    }))
  }, [])

  const handleContentResultClick = useCallback((r: SearchMatch) => {
    if (onFileSelect) {
      const ws = workspaces.find(w => r.filePath.startsWith(w.path))
      onFileSelect(r.filePath, ws?.path ?? '')
    }
  }, [workspaces, onFileSelect])

  if (!isDesktop()) return null

  const activeCategories = new Set<FileCategory>()
  for (const tree of Object.values(fileTrees)) {
    const collectCats = (nodes: FileTreeNode[]) => {
      for (const n of nodes) {
        if (n.category) activeCategories.add(n.category)
        if (n.children) collectCats(n.children)
      }
    }
    collectCats(tree)
  }

  return (
    <div className="border-b border-slate-200 dark:border-zinc-700">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-zinc-800"
      >
        {collapsed
          ? <ChevronRight className="h-3 w-3" />
          : <ChevronDown className="h-3 w-3" />}
        <Library className="h-3.5 w-3.5" />
        <span>{t('desktop.localLibrary')}</span>
        <span className="ml-auto flex items-center gap-1">
          {!collapsed && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setShowFilters(!showFilters) }}
                className={`rounded p-0.5 hover:bg-slate-200 dark:hover:bg-zinc-600 ${categoryFilter ? 'text-indigo-500' : ''}`}
                title={t('desktop.filterByType')}
              >
                <Filter className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowSearch(!showSearch); if (showSearch) { setSearchQuery(''); setContentResults([]) } }}
                className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-zinc-600"
                title={t('desktop.searchFiles')}
              >
                <Search className="h-3 w-3" />
              </button>
            </>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleAdd() }}
            className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-zinc-600"
            title={t('desktop.addFolder')}
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </span>
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="max-h-[40vh] overflow-y-auto px-2 pb-2">
          {/* Category filter chips */}
          {showFilters && activeCategories.size > 0 && (
            <div className="mb-1 flex flex-wrap gap-1">
              {Array.from(activeCategories).sort().map(cat => {
                const info = CATEGORY_LABELS[cat]
                const isActive = categoryFilter === cat
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(isActive ? null : cat)}
                    className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                      isActive ? info.color + ' ring-1 ring-current' : 'bg-slate-100 text-slate-500 dark:bg-zinc-700 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-600'
                    }`}
                  >
                    <span>{info.emoji}</span>
                    <span>{info.label}</span>
                  </button>
                )
              })}
              {categoryFilter && (
                <button
                  onClick={() => setCategoryFilter(null)}
                  className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                >
                  <X className="h-2.5 w-2.5" /> Clear
                </button>
              )}
            </div>
          )}

          {/* Search bar */}
          {showSearch && (
            <div className="mb-1">
              <div className="flex items-center gap-1 rounded border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1">
                <Search className="h-3 w-3 shrink-0 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={searchMode === 'name' ? t('desktop.searchFiles') : t('desktop.searchContent')}
                  className="flex-1 bg-transparent text-xs outline-none text-slate-700 dark:text-zinc-200 placeholder:text-slate-400"
                  autoFocus
                />
                {contentSearching && <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />}
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setContentResults([]) }}>
                    <X className="h-3 w-3 text-slate-400 hover:text-slate-600" />
                  </button>
                )}
              </div>
              <div className="mt-0.5 flex gap-1">
                <button
                  onClick={() => { setSearchMode('name'); setContentResults([]) }}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    searchMode === 'name'
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-zinc-700 dark:text-zinc-400'
                  }`}
                >
                  {t('desktop.byName')}
                </button>
                <button
                  onClick={() => setSearchMode('content')}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    searchMode === 'content'
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-zinc-700 dark:text-zinc-400'
                  }`}
                >
                  <FileText className="mr-0.5 inline h-2.5 w-2.5" />
                  {t('desktop.byContent')}
                </button>
              </div>
            </div>
          )}

          {/* Content search results */}
          {searchMode === 'content' && contentResults.length > 0 && (
            <SearchResults results={contentResults} onResultClick={handleContentResultClick} />
          )}

          {/* Recent files */}
          {showRecent && recentFiles.length > 0 && !searchQuery && (
            <div className="mb-1">
              <button
                onClick={() => setShowRecent(!showRecent)}
                className="mb-0.5 flex w-full items-center gap-1 text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase"
              >
                <Clock className="h-2.5 w-2.5" />
                {t('desktop.recentFiles')}
              </button>
              <div className="space-y-0">
                {recentFiles.slice(0, 5).map(rf => (
                  <div key={rf.path} className="group/recent flex items-center">
                    <button
                      onClick={() => handleRecentFileClick(rf)}
                      className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700"
                      title={rf.path}
                    >
                      <span className="shrink-0">{getFileIcon(rf.extension)}</span>
                      <span className="truncate">{rf.name}</span>
                      <span className="ml-auto text-[9px] text-slate-400 dark:text-zinc-500">{timeAgo(rf.accessedAt)}</span>
                    </button>
                    <button
                      onClick={() => handleAnalyzeRecent(rf)}
                      className="hidden shrink-0 rounded p-0.5 text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 group-hover/recent:block"
                      title="Analyze"
                    >
                      <Sparkles className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Workspace list */}
          {workspaces.length === 0 ? (
            <p className="px-1 py-3 text-center text-[11px] text-slate-400 dark:text-zinc-500">
              {t('desktop.noFolders')}
            </p>
          ) : (
            workspaces.map(ws => {
              const isExpanded = expandedWs.has(ws.path)
              const isScanning = scanning.has(ws.path)
              const tree = fileTrees[ws.path]

              return (
                <div key={ws.path} className="mb-0.5">
                  {/* Workspace row */}
                  <div className="group flex items-center gap-1 rounded px-1 py-1 hover:bg-slate-100 dark:hover:bg-zinc-800">
                    <button
                      onClick={() => handleToggleWorkspace(ws.path)}
                      className="flex min-w-0 flex-1 items-center gap-1 text-left"
                    >
                      {isExpanded
                        ? <ChevronDown className="h-3 w-3 shrink-0 text-slate-500" />
                        : <ChevronRight className="h-3 w-3 shrink-0 text-slate-500" />}
                      <span className="shrink-0">📂</span>
                      <span className="truncate text-xs font-medium text-slate-700 dark:text-zinc-200">
                        {ws.name}
                      </span>
                      {ws.fileCount > 0 && (
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                          {ws.fileCount}
                        </span>
                      )}
                      {isScanning && <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />}
                    </button>
                    <div className="hidden items-center gap-0.5 group-hover:flex">
                      <button
                        onClick={(e) => handleRescan(ws.path, e)}
                        className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-zinc-600"
                        title="Rescan"
                      >
                        <RefreshCw className="h-3 w-3 text-slate-400" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemove(ws.path) }}
                        className="rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30"
                        title={t('desktop.removeFolder')}
                      >
                        <Trash2 className="h-3 w-3 text-slate-400 hover:text-red-500" />
                      </button>
                    </div>
                  </div>

                  {/* File tree */}
                  {isExpanded && tree && (
                    <div className="ml-2">
                      <FileTreeView
                        nodes={tree}
                        expandedDirs={expandedDirs}
                        toggleDir={toggleDir}
                        onFileClick={handleFileClick}
                        onAnalyze={handleAnalyzeFile}
                        searchQuery={searchMode === 'name' ? searchQuery : ''}
                        categoryFilter={categoryFilter}
                      />
                    </div>
                  )}
                  {isExpanded && isScanning && !tree && (
                    <div className="ml-6 flex items-center gap-1 py-1">
                      <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                      <span className="text-[11px] text-slate-400">{t('desktop.scanning')}</span>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
