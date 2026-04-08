'use client'

import { useState, useEffect } from 'react'
import type { ScannedFile } from '@/lib/desktop'

// ── Types ──────────────────────────────────────────────
export interface FileNode {
  name: string
  path: string
  kind: 'file' | 'directory'
  children?: FileNode[]
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle
}

// ── File icons by extension (VSCode-style) ─────────────
export const fileIcon = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const base = name.toLowerCase()
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
    pdf: '📕', docx: '📘', csv: '📊', xlsx: '📊',
  }
  return iconMap[ext] || '📄'
}

// ── Convert flat ScannedFile[] → hierarchical FileNode[] tree ──
export function scannedToFileNodes(files: ScannedFile[]): FileNode[] {
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

// ── Compact single-child folder chains (like VSCode) ───
export function compactTree(nodes: FileNode[]): FileNode[] {
  return nodes.map(node => {
    if (node.kind !== 'directory' || !node.children?.length) return node
    let current = node
    const nameParts = [current.name]
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
    return { ...node, children: compactTree(node.children) }
  })
}

// ── Count files in tree ────────────────────────────────
export function countFiles(nodes: FileNode[]): number {
  let count = 0
  for (const n of nodes) {
    if (n.kind === 'file') count++
    if (n.children) count += countFiles(n.children)
  }
  return count
}

// ── FileTreeNode Component ─────────────────────────────
export function FileTreeNode({
  node, depth, selectedPath, onSelect, onContextMenu, onShare, forceExpanded, collapseSignal,
}: {
  node: FileNode
  depth: number
  selectedPath: string
  onSelect: (node: FileNode) => void
  onContextMenu?: (e: React.MouseEvent, node: FileNode) => void
  onShare?: (node: FileNode) => void
  forceExpanded?: Set<string>
  collapseSignal?: number
}) {
  const [expanded, setExpanded] = useState(depth < 1 || (forceExpanded?.has(node.path) ?? false))
  const isDir = node.kind === 'directory'
  const isSelected = node.path === selectedPath
  const containsSelected = isDir && selectedPath.startsWith(node.path + '/')

  useEffect(() => {
    if (forceExpanded?.has(node.path)) setExpanded(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceExpanded, node.path])

  useEffect(() => {
    if (collapseSignal && depth > 0) setExpanded(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseSignal])

  useEffect(() => {
    if (containsSelected && !expanded) setExpanded(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath])

  const childCount = isDir ? (node.children?.length ?? 0) : 0

  return (
    <div className="relative">
      {depth > 0 && (
        <div
          className="absolute top-0 bottom-0 border-l border-slate-200/80 dark:border-zinc-700/80"
          style={{ left: `${(depth - 1) * 16 + 11}px` }}
        />
      )}
      <div
        className={`group flex w-full cursor-pointer items-center gap-0 py-[1px] text-left text-[12px] transition-colors
          ${isSelected ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-medium' : containsSelected ? 'text-slate-700 dark:text-zinc-300' : 'text-slate-600 dark:text-zinc-400'}
          hover:bg-slate-500/10`}
        style={{ paddingLeft: `${depth * 16 + 4}px`, height: '22px' }}
        onClick={() => {
          if (isDir) setExpanded(!expanded)
          else onSelect(node)
        }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e, node) }}
      >
        <span className="flex w-4 shrink-0 items-center justify-center text-[9px] text-slate-400 dark:text-zinc-500">
          {isDir ? (expanded ? '▼' : '▶') : ''}
        </span>
        <span className="mr-1 flex w-4 shrink-0 items-center justify-center text-[12px]">
          {isDir ? (expanded ? '📂' : '📁') : fileIcon(node.name)}
        </span>
        <span className="truncate">{node.name}</span>
        {isDir && !expanded && childCount > 0 && (
          <span className="ml-1 text-[9px] text-slate-400 dark:text-zinc-500">{childCount}</span>
        )}
        {!isDir && onShare && (
          <button
            onClick={(e) => { e.stopPropagation(); onShare(node) }}
            className="ml-auto hidden shrink-0 rounded px-0.5 pr-1 text-[10px] text-slate-400 hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400 group-hover:inline-flex"
            title="Share to Agent"
          >⇨</button>
        )}
      </div>
      {isDir && expanded && node.children?.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath}
          onSelect={onSelect} onContextMenu={onContextMenu} onShare={onShare}
          forceExpanded={forceExpanded} collapseSignal={collapseSignal} />
      ))}
    </div>
  )
}

// ── FileTreePanel — self-contained left-side panel ─────
export function FileTreePanel({
  fileTree,
  projectRoot,
  selectedPath,
  onSelect,
  onShare,
  onClose,
  onImportFolder,
  title,
  width = 240,
}: {
  fileTree: FileNode[]
  projectRoot: string | null
  selectedPath: string
  onSelect: (node: FileNode) => void
  onShare?: (node: FileNode) => void
  onClose: () => void
  onImportFolder: () => void
  title?: string
  width?: number
}) {
  const [collapseSignal, setCollapseSignal] = useState(0)
  const folderName = projectRoot?.split(/[/\\]/).pop() || 'Project'
  const fileCount = countFiles(fileTree)

  if (fileTree.length === 0) {
    return (
      <div className="flex flex-col border-r border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900" style={{ width }}>
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-700 px-2 py-1.5">
          <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-300">{title || '📂 Files'}</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
          <span className="text-3xl">📂</span>
          <p className="text-[11px] text-slate-400 dark:text-zinc-500">No folder open</p>
          <button
            onClick={onImportFolder}
            className="rounded-md bg-indigo-500 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-indigo-600"
          >
            Import Folder
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col border-r border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900" style={{ width }}>
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-700 px-2 py-1.5">
        <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-300 truncate" title={projectRoot || undefined}>
          📂 {folderName}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setCollapseSignal(s => s + 1)}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-700" title="Collapse all"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          </button>
          <button
            onClick={onImportFolder}
            className="rounded p-0.5 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20" title="Change folder"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 4h3V1M11 8H8v3M1 4a5 5 0 018.5-2M11 8a5 5 0 01-8.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button
            onClick={onClose}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-700" title="Close"
          >×</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {fileTree.map(node => (
          <FileTreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onShare={onShare}
            collapseSignal={collapseSignal}
          />
        ))}
      </div>
      <div className="border-t border-slate-200 dark:border-zinc-700 px-2 py-1 text-[9px] text-slate-400 dark:text-zinc-500">
        {folderName} · {fileCount} files
      </div>
    </div>
  )
}
