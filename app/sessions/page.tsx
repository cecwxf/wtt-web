'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import {
  Bot,
  ArrowLeft,
  GitBranch,
  CloudOff,
  Combine,
  Download,
  FolderGit2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react'

import { ChatView, type ChatMessage, type ChatRunStatus } from '@/components/ui/chat-view'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { useI18n } from '@/lib/i18n-provider'
import styles from './sessions-local.module.css'

interface CliSessionRow {
  id: string
  agent_id: string
  adapter: 'codex' | 'claude-code'
  native_session_id: string
  title: string
  project_path: string
  host_name: string
  git_branch: string
  git_commit: string
  cli_version: string
  source_created_at?: string | null
  source_updated_at?: string | null
  import_status: 'catalogued' | 'importing' | 'ready' | 'error'
  run_status: 'idle' | 'queued' | 'running' | 'error'
  last_error: string
  message_count: number
  imported_event_count: number
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_tokens: number
    cache_write_tokens: number
    reasoning_tokens: number
    total_tokens: number
    source: string
  }
  agent_online?: boolean
}

interface CliSessionEvent {
  id: string
  role: 'user' | 'assistant' | 'system'
  kind: 'message' | 'tool' | 'status' | 'error' | string
  content: string
  source_created_at?: string | null
  created_at?: string | null
}

interface CliSessionListResponse {
  items: CliSessionRow[]
  total: number
}

interface CliSessionDetailResponse {
  session: CliSessionRow
  events: CliSessionEvent[]
  event_total: number
}

interface FusionCreateResponse {
  accepted: boolean
  fusion: { id: string; status: string }
  target_session: CliSessionRow
}

interface RuntimeOption {
  value: string
  model: string
  label: string
  description?: string
  reasoning_efforts?: Array<{ value: string; label: string; description?: string }>
  default_reasoning_effort?: string
}

interface CliSessionRuntime {
  adapter: 'codex' | 'claude-code'
  access_levels: Array<'read-only' | 'workspace-write' | 'full-access'>
  commands: Array<{ name: string; description: string }>
  models: { current?: { model?: string }; options: RuntimeOption[] }
  workspaces: Array<{ path: string; name: string }>
}

interface CreateSessionResponse {
  session: CliSessionRow
}

interface SessionWorkspaceGroup {
  key: string
  host: string
  path: string
  name: string
  sessions: CliSessionRow[]
}

function authHeaders(token?: string, json = false): Record<string, string> {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  }
}

async function readJson<T>(url: string, token?: string): Promise<T> {
  const response = await fetch(url, { headers: authHeaders(token), cache: 'no-store' })
  if (!response.ok) throw new Error(await responseText(response))
  return response.json() as Promise<T>
}

async function responseText(response: Response) {
  try {
    const body = await response.json()
    return String(body?.detail || body?.message || `Request failed (${response.status})`)
  } catch {
    return `Request failed (${response.status})`
  }
}

function relativeTime(value?: string | null, zh = true) {
  if (!value) return zh ? '未知时间' : 'Unknown time'
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return value
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return zh ? '刚刚' : 'Just now'
  if (minutes < 60) return zh ? `${minutes} 分钟前` : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return zh ? `${hours} 小时前` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  return zh ? `${days} 天前` : `${days}d ago`
}

function projectName(pathValue: string) {
  const clean = pathValue.replace(/[\\/]+$/, '')
  return clean.split(/[\\/]/).filter(Boolean).pop() || 'Unknown project'
}

function formatTokenCount(value?: number) {
  const count = Number(value || 0)
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 1 : 2)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(count >= 100_000 ? 0 : 1)}K`
  return String(count)
}

function SessionPageInner() {
  const { data: authSession, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { locale, toggleLocale } = useI18n()
  const zh = locale === 'zh'
  const token = authSession?.accessToken
  const [query, setQuery] = useState('')
  const [adapterFilter, setAdapterFilter] = useState('')
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set())
  const [discovering, setDiscovering] = useState(false)
  const [actionError, setActionError] = useState('')
  const [eventLimit, setEventLimit] = useState(500)
  const [fusionMode, setFusionMode] = useState(false)
  const [fusionSourceIds, setFusionSourceIds] = useState<string[]>([])
  const [fusionOpen, setFusionOpen] = useState(false)
  const [fusionTarget, setFusionTarget] = useState('')
  const [fusionPath, setFusionPath] = useState('')
  const [fusionTitle, setFusionTitle] = useState('')
  const [fusionSubmitting, setFusionSubmitting] = useState(false)
  const [workspaceAccess, setWorkspaceAccess] = useState<'read-only' | 'workspace-write' | 'full-access'>('workspace-write')
  const [selectedModel, setSelectedModel] = useState('')
  const [reasoningEffort, setReasoningEffort] = useState('')
  const [newSessionOpen, setNewSessionOpen] = useState(false)
  const [newSessionAgent, setNewSessionAgent] = useState('')
  const [newSessionAdapter, setNewSessionAdapter] = useState<'codex' | 'claude-code'>('codex')
  const [newSessionPath, setNewSessionPath] = useState('')
  const [newSessionTitle, setNewSessionTitle] = useState('New Session')
  const [newSessionSubmitting, setNewSessionSubmitting] = useState(false)
  const importRequestedRef = useRef(new Set<string>())
  const selectedId = searchParams.get('sessionId') || ''

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?callbackUrl=%2Fsessions')
  }, [router, status])

  useEffect(() => {
    setLeftCollapsed(window.localStorage.getItem('wtt-local-left-collapsed') === '1')
    setRightCollapsed(window.localStorage.getItem('wtt-local-right-collapsed') === '1')
    try {
      const stored = JSON.parse(window.localStorage.getItem('wtt-local-workspaces') || '[]')
      if (Array.isArray(stored)) setExpandedWorkspaces(new Set(stored.map(String)))
    } catch {
      setExpandedWorkspaces(new Set())
    }
  }, [])

  const togglePanel = useCallback((side: 'left' | 'right') => {
    if (side === 'left') {
      setLeftCollapsed((current) => {
        window.localStorage.setItem('wtt-local-left-collapsed', current ? '0' : '1')
        return !current
      })
      return
    }
    setRightCollapsed((current) => {
      window.localStorage.setItem('wtt-local-right-collapsed', current ? '0' : '1')
      return !current
    })
  }, [])

  const setWorkspaceExpanded = useCallback((key: string, open: boolean) => {
    setExpandedWorkspaces((current) => {
      const next = new Set(current)
      if (open) next.add(key)
      else next.delete(key)
      window.localStorage.setItem('wtt-local-workspaces', JSON.stringify(Array.from(next)))
      return next
    })
  }, [])

  const listUrl = token
    ? `${CLIENT_WTT_API_BASE}/cli-sessions?limit=500${query ? `&q=${encodeURIComponent(query)}` : ''}${adapterFilter ? `&adapter=${encodeURIComponent(adapterFilter)}` : ''}`
    : null
  const { data: listData, error: listError, mutate: mutateList, isLoading: listLoading } = useSWR<CliSessionListResponse>(
    listUrl,
    (url: string) => readJson(url, token),
    { refreshInterval: discovering ? 2000 : 10_000, revalidateOnFocus: true },
  )

  const workspaceGroups = useMemo<SessionWorkspaceGroup[]>(() => {
    const groups = new Map<string, SessionWorkspaceGroup>()
    for (const row of listData?.items || []) {
      const host = row.host_name || row.agent_id
      const path = row.project_path || (zh ? '未知工作区' : 'Unknown workspace')
      const key = `${host}::${path}`
      const group = groups.get(key) || { key, host, path, name: projectName(path), sessions: [] }
      group.sessions.push(row)
      groups.set(key, group)
    }
    return Array.from(groups.values())
      .map((group) => ({ ...group, sessions: group.sessions.sort((a, b) => String(b.source_updated_at || '').localeCompare(String(a.source_updated_at || ''))) }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.host.localeCompare(b.host))
  }, [listData?.items, zh])

  useEffect(() => {
    if (!selectedId) return
    const selectedGroup = workspaceGroups.find((group) => group.sessions.some((session) => session.id === selectedId))
    if (selectedGroup) setWorkspaceExpanded(selectedGroup.key, true)
  }, [selectedId, setWorkspaceExpanded, workspaceGroups])

  const fusionSources = useMemo(() => (listData?.items || []).filter((row) => fusionSourceIds.includes(row.id)), [fusionSourceIds, listData?.items])
  const fusionTargets = useMemo(() => {
    const targets = new Map<string, CliSessionRow>()
    for (const row of listData?.items || []) {
      if (!row.agent_online) continue
      targets.set(`${row.agent_id}|${row.adapter}`, row)
    }
    return Array.from(targets.entries())
  }, [listData?.items])
  const sessionTargets = useMemo(() => {
    const targets = new Map<string, CliSessionRow>()
    for (const row of listData?.items || []) {
      if (row.agent_online) targets.set(`${row.agent_id}|${row.adapter}`, row)
    }
    return Array.from(targets.values())
  }, [listData?.items])

  useEffect(() => setEventLimit(500), [selectedId])

  const detailUrl = token && selectedId ? `${CLIENT_WTT_API_BASE}/cli-sessions/${encodeURIComponent(selectedId)}?event_limit=${eventLimit}` : null
  const { data: detail, error: detailError, mutate: mutateDetail } = useSWR<CliSessionDetailResponse>(
    detailUrl,
    (url: string) => readJson(url, token),
    {
      refreshInterval: (latest) => ['queued', 'running'].includes(latest?.session?.run_status || '') || latest?.session?.import_status === 'importing' ? 1000 : 5000,
      revalidateOnFocus: true,
    },
  )

  const runtimeUrl = token && selectedId && detail?.session.agent_online
    ? `${CLIENT_WTT_API_BASE}/cli-sessions/${encodeURIComponent(selectedId)}/runtime`
    : null
  const { data: runtime, error: runtimeError, isLoading: runtimeLoading } = useSWR<CliSessionRuntime>(
    runtimeUrl,
    (url: string) => readJson(url, token),
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  )
  const selectedModelOption = useMemo(
    () => runtime?.models.options.find((option) => option.value === selectedModel),
    [runtime?.models.options, selectedModel],
  )
  const workspaceOptions = useMemo(() => {
    const paths = new Set<string>()
    for (const item of runtime?.workspaces || []) if (item.path) paths.add(item.path)
    for (const item of listData?.items || []) if (item.project_path) paths.add(item.project_path)
    return Array.from(paths)
  }, [listData?.items, runtime?.workspaces])

  useEffect(() => {
    if (!runtime) return
    const model = runtime.models.current?.model || runtime.models.options[0]?.value || ''
    setSelectedModel(model)
    const option = runtime.models.options.find((item) => item.value === model)
    setReasoningEffort(option?.default_reasoning_effort || option?.reasoning_efforts?.[0]?.value || '')
  }, [runtime])

  useEffect(() => {
    if (!detail?.session || !token) return
    if (['queued', 'running'].includes(detail.session.run_status) || detail.session.native_session_id.startsWith('fusion-pending-') || detail.session.native_session_id.startsWith('draft-')) return
    const needsInitialSync = detail.session.import_status === 'catalogued'
      || (detail.session.import_status === 'ready' && !detail.session.usage?.source)
    if (!needsInitialSync) return
    if (importRequestedRef.current.has(detail.session.id)) return
    importRequestedRef.current.add(detail.session.id)
    void fetch(`${CLIENT_WTT_API_BASE}/cli-sessions/${encodeURIComponent(detail.session.id)}/import`, {
      method: 'POST',
      headers: authHeaders(token),
    }).then(async (response) => {
      if (!response.ok) throw new Error(await responseText(response))
      void mutateDetail()
      void mutateList()
    }).catch((error) => {
      importRequestedRef.current.delete(detail.session.id)
      setActionError(error instanceof Error ? error.message : String(error))
    })
  }, [detail?.session, mutateDetail, mutateList, token])

  const discover = useCallback(async () => {
    if (!token || discovering) return
    setDiscovering(true)
    setActionError('')
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/cli-sessions/discover`, {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({}),
      })
      if (!response.ok) throw new Error(await responseText(response))
      await new Promise((resolve) => window.setTimeout(resolve, 1200))
      await mutateList()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setDiscovering(false)
    }
  }, [discovering, mutateList, token])

  const importSelected = useCallback(async () => {
    if (!token || !selectedId) return
    setActionError('')
    importRequestedRef.current.add(selectedId)
    const response = await fetch(`${CLIENT_WTT_API_BASE}/cli-sessions/${encodeURIComponent(selectedId)}/import`, {
      method: 'POST',
      headers: authHeaders(token),
    })
    if (!response.ok) {
      importRequestedRef.current.delete(selectedId)
      const message = await responseText(response)
      setActionError(message)
      throw new Error(message)
    }
    await mutateDetail()
    await mutateList()
  }, [mutateDetail, mutateList, selectedId, token])

  const sendMessage = useCallback(async (content: string) => {
    if (!token || !selectedId) return
    setActionError('')
    const isCommand = content.trim().startsWith('/')
    const response = await fetch(`${CLIENT_WTT_API_BASE}/cli-sessions/${encodeURIComponent(selectedId)}/${isCommand ? 'commands' : 'messages'}`, {
      method: 'POST',
      headers: authHeaders(token, true),
      body: JSON.stringify({
        ...(isCommand ? { line: content } : { content }),
        workspace_access: workspaceAccess,
        model_config: {
          ...(selectedModel ? { model: selectedModel } : {}),
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        },
      }),
    })
    if (!response.ok) {
      const message = await responseText(response)
      setActionError(message)
      throw new Error(message)
    }
    const result = await response.json()
    if (result?.new_session?.id) {
      await mutateList()
      router.push(`/sessions?sessionId=${encodeURIComponent(result.new_session.id)}`)
      return
    }
    await mutateDetail()
    await mutateList()
  }, [mutateDetail, mutateList, reasoningEffort, router, selectedId, selectedModel, token, workspaceAccess])

  const openNewSession = useCallback(() => {
    const source = detail?.session || (listData?.items || []).find((row) => row.agent_online)
    if (!source) {
      setActionError(zh ? '没有在线的已绑定 Agent' : 'No online bound Agent is available')
      return
    }
    setNewSessionAgent(source.agent_id)
    setNewSessionAdapter(source.adapter)
    setNewSessionPath(source.project_path || runtime?.workspaces?.[0]?.path || '')
    setNewSessionTitle(zh ? '新会话' : 'New Session')
    setNewSessionOpen(true)
  }, [detail?.session, listData?.items, runtime?.workspaces, zh])

  const createSession = useCallback(async () => {
    if (!token || !newSessionAgent || !newSessionPath.trim() || newSessionSubmitting) return
    setNewSessionSubmitting(true)
    setActionError('')
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/cli-sessions/new`, {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({
          agent_id: newSessionAgent,
          adapter: newSessionAdapter,
          project_path: newSessionPath.trim(),
          title: newSessionTitle.trim() || 'New Session',
        }),
      })
      if (!response.ok) throw new Error(await responseText(response))
      const result = await response.json() as CreateSessionResponse
      setNewSessionOpen(false)
      await mutateList()
      router.push(`/sessions?sessionId=${encodeURIComponent(result.session.id)}`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setNewSessionSubmitting(false)
    }
  }, [mutateList, newSessionAdapter, newSessionAgent, newSessionPath, newSessionSubmitting, newSessionTitle, router, token])

  const toggleFusionSource = useCallback((sessionId: string) => {
    setFusionSourceIds((current) => current.includes(sessionId)
      ? current.filter((value) => value !== sessionId)
      : current.length < 8 ? [...current, sessionId] : current)
  }, [])

  const openFusionDialog = useCallback(() => {
    if (fusionSourceIds.length < 2) return
    const preferred = fusionSources.find((row) => row.agent_online) || fusionSources[0]
    const targetKey = preferred ? `${preferred.agent_id}|${preferred.adapter}` : fusionTargets[0]?.[0] || ''
    setFusionTarget(targetKey)
    setFusionPath(preferred?.project_path || '')
    setFusionTitle(zh ? `融合记忆 · ${fusionSources[0]?.title || 'CLI 会话'}` : `Fused memory · ${fusionSources[0]?.title || 'CLI session'}`)
    setFusionOpen(true)
  }, [fusionSourceIds.length, fusionSources, fusionTargets, zh])

  const createFusion = useCallback(async () => {
    if (!token || fusionSubmitting || fusionSourceIds.length < 2 || !fusionTarget || !fusionPath.trim()) return
    const [targetAgentId, targetAdapter] = fusionTarget.split('|')
    setFusionSubmitting(true)
    setActionError('')
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/cli-sessions/fusions`, {
        method: 'POST',
        headers: authHeaders(token, true),
        body: JSON.stringify({
          source_session_ids: fusionSourceIds,
          target_agent_id: targetAgentId,
          target_adapter: targetAdapter,
          project_path: fusionPath.trim(),
          title: fusionTitle.trim() || 'Fused CLI memory',
        }),
      })
      if (!response.ok) throw new Error(await responseText(response))
      const result = await response.json() as FusionCreateResponse
      setFusionOpen(false)
      setFusionMode(false)
      setFusionSourceIds([])
      await mutateList()
      router.push(`/sessions?sessionId=${encodeURIComponent(result.target_session.id)}`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setFusionSubmitting(false)
    }
  }, [fusionPath, fusionSourceIds, fusionSubmitting, fusionTarget, fusionTitle, mutateList, router, token])

  const chatMessages = useMemo<ChatMessage[]>(() => (detail?.events || [])
    .filter((event) => ['message', 'error'].includes(event.kind))
    .map((event) => ({
      message_id: event.id,
      sender_id: event.role === 'user' ? 'wtt-user' : detail?.session.agent_id || 'cli-agent',
      sender_display_name: event.role === 'user' ? (zh ? '你' : 'You') : detail?.session.adapter === 'codex' ? 'Codex' : 'Claude Code',
      sender_type: event.role === 'user' ? 'human' : 'agent',
      content: event.kind === 'error' ? `执行失败：${event.content}` : event.content,
      timestamp: event.source_created_at || event.created_at || new Date().toISOString(),
    })), [detail?.events, detail?.session.adapter, detail?.session.agent_id, zh])

  const runStatus = useMemo<ChatRunStatus | null>(() => {
    const current = detail?.session
    if (!current || !['queued', 'running'].includes(current.run_status)) return null
    const statusEvents = (detail?.events || []).filter((event) => event.kind === 'status').slice(-8)
    return {
      agentId: current.agent_id,
      agentName: current.adapter === 'codex' ? 'Codex' : 'Claude Code',
      adapter: current.adapter,
      statusKind: current.run_status,
      statusText: current.run_status === 'queued' ? (zh ? '等待原主机接收' : 'Waiting for source host') : (zh ? '正在继续原生 CLI 会话' : 'Continuing native CLI session'),
      startedAt: Date.now(),
      lines: statusEvents.map((event) => ({ id: event.id, text: event.content, kind: event.kind, ts: new Date(event.source_created_at || event.created_at || Date.now()).getTime() })),
    }
  }, [detail?.events, detail?.session, zh])

  if (status === 'loading' || status === 'unauthenticated') {
    return <div className="flex min-h-screen items-center justify-center bg-[#f5f4ef] dark:bg-zinc-950"><Loader2 className="h-6 w-6 animate-spin text-sky-600" /></div>
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brandLink} title={zh ? '返回 WTT 主页' : 'Back to WTT home'}>
          <span className={styles.brandMark}>W</span>
          <span className={styles.brandCopy}><strong>WTT Connect</strong><span>Local Session Fabric</span></span>
        </Link>
        <button type="button" className={`${styles.panelToggle} ${leftCollapsed ? styles.panelToggleActive : ''}`} onClick={() => togglePanel('left')}>
          {leftCollapsed ? '›' : '‹'} Sessions
        </button>
        <span className={styles.topbarSpacer} />
        <button type="button" className={`${styles.panelToggle} ${rightCollapsed ? styles.panelToggleActive : ''}`} onClick={() => togglePanel('right')}>
          Usage {rightCollapsed ? '‹' : '›'}
        </button>
        <Link href="/feed" className={`${styles.iconButton} ${styles.desktopOnly}`}>Feed</Link>
        <button type="button" onClick={toggleLocale} className={styles.iconButton}>{zh ? 'EN' : '中'}</button>
        <ThemeToggle />
        <button type="button" className={`${styles.iconButton} ${styles.desktopOnly}`} disabled={!detail} onClick={() => detail && downloadSession(detail)}>Session log下载</button>
      </header>

      <section className={`${styles.shell} ${leftCollapsed ? styles.leftCollapsed : ''} ${rightCollapsed ? styles.rightCollapsed : ''} ${selectedId ? styles.mobileSelected : ''}`}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHead}>
            <div><p className={styles.eyebrow}>Native history</p><h1 className={styles.sidebarTitle}>Sessions</h1></div>
            <button type="button" className={styles.iconButton} onClick={discover} disabled={discovering}>{discovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (zh ? '扫描' : 'Scan')}</button>
          </div>
          <button type="button" className={styles.newSessionButton} onClick={openNewSession}><Plus className="h-4 w-4" /> New Session</button>
          <nav className={styles.adapterFilter} aria-label="Agent harness">
            {[
              { value: '', mark: 'All', label: zh ? '全部' : 'All' },
              { value: 'codex', mark: 'Cx', label: 'Codex' },
              { value: 'claude-code', mark: 'Cl', label: 'Claude' },
            ].map((item) => <button key={item.value} type="button" className={adapterFilter === item.value ? styles.adapterActive : ''} onClick={() => setAdapterFilter(item.value)}><span>{item.mark}</span>{item.label}</button>)}
            <button type="button" disabled title={zh ? '远端 DSH Session 尚未启用' : 'Remote DSH sessions are not enabled'}><span>Ds</span>DSH</button>
          </nav>
          <label className={styles.search}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder={zh ? '标题、工作区、ID' : 'Title, workspace, ID'} /></label>
          <div className={styles.workspaceActions}><span>Workspaces</span><button type="button" className={styles.quietButton} onClick={openNewSession}>+ Workspace</button></div>
          <div className={styles.sessionActions}>
            <span>{listLoading ? (zh ? '读取中…' : 'Loading…') : `${listData?.total || 0} sessions`}</span>
            {!fusionMode ? <button type="button" className={styles.quietButton} onClick={() => setFusionMode(true)}>Merge memory</button> : <button type="button" className={styles.quietButton} onClick={() => { if (fusionSourceIds.length >= 2) openFusionDialog(); else { setFusionMode(false); setFusionSourceIds([]) } }}>{fusionSourceIds.length >= 2 ? `Merge (${fusionSourceIds.length})` : 'Cancel'}</button>}
          </div>
          <div className={styles.sessionList}>
            {(listError || actionError) && <p className={styles.errorText}>{actionError || listError?.message}</p>}
            {!listLoading && workspaceGroups.length === 0 && <p className={styles.emptyList}>{zh ? '尚未发现 CLI 会话。点击扫描读取已绑定主机的原生历史。' : 'No CLI sessions found. Scan bound hosts to read native history.'}</p>}
            {workspaceGroups.map((group, index) => {
              const open = Boolean(query) || expandedWorkspaces.has(group.key) || group.sessions.some((session) => session.id === selectedId) || (expandedWorkspaces.size === 0 && index === 0)
              return (
                <details key={group.key} className={styles.workspaceGroup} open={open} onToggle={(event) => setWorkspaceExpanded(group.key, event.currentTarget.open)}>
                  <summary className={styles.workspaceSummary} title={`${group.host} · ${group.path}`}>
                    <span className={styles.workspaceIcon}>W</span>
                    <span className={styles.workspaceLabel}><strong>{group.name}</strong><span>{group.host} · {group.path}</span></span>
                    <span className={styles.workspaceCount}>{group.sessions.length}</span>
                  </summary>
                  <div className={styles.workspaceSessions}>
                    {group.sessions.map((row) => (
                      <button type="button" key={row.id} className={`${styles.sessionRow} ${selectedId === row.id || fusionSourceIds.includes(row.id) ? styles.sessionRowActive : ''}`} onClick={() => fusionMode ? toggleFusionSource(row.id) : router.push(`/sessions?sessionId=${encodeURIComponent(row.id)}`)}>
                        {fusionMode ? <span className={styles.sessionSelect}>{fusionSourceIds.includes(row.id) ? '✓' : '□'}</span> : <span className={styles.sessionGlyph}>{row.adapter === 'codex' ? 'Cx' : 'Cl'}</span>}
                        <span className={styles.sessionCopy}><strong>{row.title || 'Untitled session'}</strong><span>{row.adapter} · {relativeTime(row.source_updated_at, zh)} · {formatTokenCount(row.usage?.total_tokens)} tok</span></span>
                      </button>
                    ))}
                  </div>
                </details>
              )
            })}
          </div>
        </aside>

        <section className={styles.conversation}>
          {!detail?.session ? (
            <div className={styles.emptyState}>
              <div className={styles.orbit} aria-hidden="true"><span /><span /><span /></div>
              <p className={styles.eyebrow}>One surface, native memory</p>
              <h2>{detailError?.message || (zh ? '从 CLI 停止的位置继续。' : 'Continue where the CLI stopped.')}</h2>
              <p>{zh ? '选择 Codex 或 Claude Code Session。WTT 读取原生历史，并把新对话写回同一个 Session。' : 'Select a Codex or Claude Code session. WTT reads native history and writes new turns back to the same session.'}</p>
            </div>
          ) : (
            <div className={styles.sessionView}>
              <header className={styles.sessionHeader}>
                <button type="button" onClick={() => router.push('/sessions')} className={`${styles.iconButton} lg:hidden`} title={zh ? '返回会话列表' : 'Back to sessions'}><ArrowLeft className="h-4 w-4" /></button>
                <div className={styles.sessionHeaderMain}>
                  <span className={styles.adapterBadge}>{detail.session.adapter} · {detail.session.agent_online ? (zh ? '在线' : 'online') : (zh ? '离线' : 'offline')}</span>
                  <h2>{detail.session.title || 'Untitled session'}</h2>
                  <p><FolderGit2 className="mr-1 inline h-3 w-3" />{detail.session.project_path || 'Unknown workspace'}{detail.session.git_branch ? <> · <GitBranch className="inline h-3 w-3" /> {detail.session.git_branch}</> : null}</p>
                </div>
                <div className={styles.sessionHeaderActions}>
                  <code className={styles.sessionId} title={detail.session.native_session_id}>{detail.session.native_session_id}</code>
                  {!detail.session.agent_online && <CloudOff className="h-4 w-4" />}
                  <button type="button" className={styles.iconButton} onClick={() => void importSelected()} disabled={!detail.session.agent_online || detail.session.import_status === 'importing'} title={zh ? '同步原生历史' : 'Sync native history'}><RefreshCw className={`h-3.5 w-3.5 ${detail.session.import_status === 'importing' ? 'animate-spin' : ''}`} /></button>
                  <button type="button" className={`${styles.iconButton} ${styles.desktopOnly}`} onClick={() => void sendMessage(zh ? '请总结当前会话的目标、关键决策、已完成工作、未解决问题和下一步行动。' : 'Summarize this session: goals, key decisions, completed work, unresolved issues, and next actions.')} disabled={!detail.session.agent_online || detail.session.run_status === 'running'}><Sparkles className="h-3.5 w-3.5" /></button>
                  <button type="button" className={`${styles.iconButton} ${styles.desktopOnly}`} onClick={() => downloadSession(detail)}><Download className="h-3.5 w-3.5" /></button>
                </div>
              </header>
              <div className={styles.conversationBody}>
                {detail.session.import_status === 'importing' && <div className={styles.notice}>{zh ? '正在从原主机按需导入历史记录…' : 'Importing history from the source host…'}</div>}
                <ChatView
                  topicName={detail.session.title}
                  messages={chatMessages}
                  currentAgentId={detail.session.agent_id}
                  onSendMessage={sendMessage}
                  onLoadOlder={async () => setEventLimit((value) => Math.min(value + 500, 5000))}
                  onExport={() => downloadSession(detail)}
                  hasOlder={(detail.event_total || 0) > (detail.events?.length || 0) && eventLimit < 5000}
                  loading={detail.session.import_status === 'importing'}
                  compactUi
                  hideHeader
                  wsConnected={Boolean(detail.session.agent_online)}
                  accessToken={token}
                  topicType="cli_session"
                  runStatus={runStatus}
                  currentAgentRuntime={{ adapter: detail.session.adapter, model: selectedModel || runtime?.models.current?.model, reasoning_effort: reasoningEffort }}
                  slashCommandOverrides={(runtime?.commands || []).map((command) => ({ cmd: command.name, desc: command.description }))}
                  composerAccessory={<div className={styles.runtimeAccessory}>
                    <label className={styles.control}><span>Access workspace</span><select value={workspaceAccess} onChange={(event) => setWorkspaceAccess(event.target.value as typeof workspaceAccess)}><option value="full-access">Full Access</option><option value="read-only">Read Only</option><option value="workspace-write">Workspace Write</option></select></label>
                    <label className={styles.control}><span>Model</span><select value={selectedModel} onChange={(event) => { const value = event.target.value; setSelectedModel(value); const option = runtime?.models.options.find((item) => item.value === value); setReasoningEffort(option?.default_reasoning_effort || option?.reasoning_efforts?.[0]?.value || '') }} disabled={!runtime?.models.options.length}><option value="">{runtimeLoading ? (zh ? '加载中…' : 'Loading…') : (zh ? '原生默认' : 'Native / default')}</option>{runtime?.models.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    <label className={styles.control}><span>Thinking</span><select value={reasoningEffort} onChange={(event) => setReasoningEffort(event.target.value)} disabled={!selectedModelOption?.reasoning_efforts?.length}><option value="">Default</option>{selectedModelOption?.reasoning_efforts?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    {runtimeError && <span className={styles.errorText} title={runtimeError.message}>{zh ? '运行配置不可用' : 'Runtime controls unavailable'}</span>}
                  </div>}
                  emptyState={<div className="text-center"><Bot className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-xs text-slate-500">{zh ? '该会话暂时没有可展示的用户/Agent消息' : 'No visible user or agent messages in this session'}</p></div>}
                />
              </div>
            </div>
          )}
        </section>

        <aside className={styles.inspector}>
          <p className={styles.eyebrow}>Remote telemetry</p>
          <h2>Usage</h2>
          <div className={styles.usageGrid}>
            <div className={styles.usageCell}><strong>{formatTokenCount(detail?.session.usage?.total_tokens)}</strong><span>Total</span></div>
            <div className={styles.usageCell}><strong>{formatTokenCount(detail?.session.usage?.input_tokens)}</strong><span>Input</span></div>
            <div className={styles.usageCell}><strong>{formatTokenCount(detail?.session.usage?.output_tokens)}</strong><span>Output</span></div>
            <div className={styles.usageCell}><strong>{formatTokenCount((detail?.session.usage?.cache_read_tokens || 0) + (detail?.session.usage?.cache_write_tokens || 0))}</strong><span>Cache</span></div>
          </div>
          <section className={styles.inspectorSection}>
            <h3>Session integrity</h3>
            <dl className={styles.metaList}>
              <div><dt>Source</dt><dd>Native CLI logs</dd></div>
              <div><dt>Host</dt><dd>{detail?.session.host_name || detail?.session.agent_id || '—'}</dd></div>
              <div><dt>Adapter</dt><dd>{detail?.session.adapter || '—'}</dd></div>
              <div><dt>Runtime</dt><dd className={detail?.session.agent_online ? styles.online : styles.offline}>{detail?.session.agent_online ? 'Online' : 'Offline'}</dd></div>
              <div><dt>Storage</dt><dd>Read only until you send</dd></div>
            </dl>
          </section>
          <section className={styles.inspectorSection}>
            <h3>Memory fusion</h3>
            <p>{zh ? '在左栏选择 2 到 8 个 Session。融合会保留完整源历史，并创建一个新的原生目标 Session。' : 'Select two to eight sessions in the left rail. Fusion preserves source archives and creates one new native target session.'}</p>
            <button type="button" className={styles.quietButton} onClick={() => setFusionMode(true)}>{zh ? '选择 Session' : 'Select sessions'}</button>
          </section>
        </aside>
      </section>
      {newSessionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target && !newSessionSubmitting) setNewSessionOpen(false) }}>
          <div className="w-full max-w-md rounded-3xl border border-white/70 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-black">{zh ? '新建 CLI Session' : 'New CLI Session'}</p><p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">{zh ? '选择已绑定主机、Agent 类型和工作目录。第一条消息会创建真实原生会话。' : 'Choose a bound host, adapter, and workspace. The first turn creates the native session.'}</p></div>
              <button onClick={() => setNewSessionOpen(false)} disabled={newSessionSubmitting} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-900"><X className="h-4 w-4" /></button>
            </div>
            <label className="mt-4 block text-[10px] font-black uppercase tracking-wider text-slate-500">Agent / Adapter
              <select value={`${newSessionAgent}|${newSessionAdapter}`} onChange={(event) => { const [agentId, adapter] = event.target.value.split('|'); const target = sessionTargets.find((item) => item.agent_id === agentId && item.adapter === adapter); setNewSessionAgent(agentId); setNewSessionAdapter(adapter as typeof newSessionAdapter); if (target?.project_path) setNewSessionPath(target.project_path) }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900">
                {sessionTargets.map((row) => <option key={`${row.agent_id}|${row.adapter}`} value={`${row.agent_id}|${row.adapter}`}>{row.host_name || row.agent_id} · {row.adapter}</option>)}
              </select>
            </label>
            <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-slate-500">{zh ? '标题' : 'Title'}<input value={newSessionTitle} onChange={(event) => setNewSessionTitle(event.target.value)} maxLength={500} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900" /></label>
            <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-slate-500">Workspace<input value={newSessionPath} onChange={(event) => setNewSessionPath(event.target.value)} list="cli-session-workspaces" maxLength={4000} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs outline-none focus:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900" /></label>
            <datalist id="cli-session-workspaces">{workspaceOptions.map((value) => <option key={value} value={value} />)}</datalist>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setNewSessionOpen(false)} disabled={newSessionSubmitting} className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-900">{zh ? '取消' : 'Cancel'}</button>
              <button onClick={() => void createSession()} disabled={newSessionSubmitting || !newSessionAgent || !newSessionPath.trim()} className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-sky-600/20 disabled:opacity-40">{newSessionSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{zh ? '创建' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
      {fusionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target && !fusionSubmitting) setFusionOpen(false) }}>
          <div className="w-full max-w-lg rounded-3xl border border-white/70 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-sm font-black">{zh ? '创建融合 CLI 会话' : 'Create fused CLI session'}</p><p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-zinc-400">{zh ? `将 ${fusionSourceIds.length} 个可见历史融合到一个全新的原生会话。源会话不会被修改。` : `Initialize one new native session from ${fusionSourceIds.length} visible histories. Source sessions remain unchanged.`}</p></div>
              <button onClick={() => setFusionOpen(false)} disabled={fusionSubmitting} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-900"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 max-h-28 space-y-1 overflow-y-auto rounded-2xl bg-slate-50 p-3 dark:bg-zinc-900/70">
              {fusionSources.map((row, index) => <p key={row.id} className="truncate text-[10px] font-semibold text-slate-600 dark:text-zinc-300"><span className="mr-2 text-cyan-600">{index + 1}</span>{row.adapter} · {row.title}</p>)}
            </div>
            <label className="mt-4 block text-[10px] font-black uppercase tracking-wider text-slate-500">{zh ? '目标 Agent / Adapter' : 'Target Agent / adapter'}
              <select value={fusionTarget} onChange={(event) => { setFusionTarget(event.target.value); const row = fusionTargets.find(([key]) => key === event.target.value)?.[1]; if (row?.project_path) setFusionPath(row.project_path) }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900">
                {fusionTargets.map(([key, row]) => <option key={key} value={key}>{row.host_name || row.agent_id} · {row.agent_id} · {row.adapter}</option>)}
              </select>
            </label>
            <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-slate-500">{zh ? '新会话标题' : 'New session title'}<input value={fusionTitle} onChange={(event) => setFusionTitle(event.target.value)} maxLength={500} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900" /></label>
            <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-slate-500">{zh ? '目标工作目录' : 'Target workspace'}<input value={fusionPath} onChange={(event) => setFusionPath(event.target.value)} maxLength={4000} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs outline-none focus:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900" /></label>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => setFusionOpen(false)} disabled={fusionSubmitting} className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-900">{zh ? '取消' : 'Cancel'}</button>
              <button onClick={() => void createFusion()} disabled={fusionSubmitting || !fusionTarget || !fusionPath.trim()} className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-sky-600/20 disabled:opacity-40">{fusionSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Combine className="h-4 w-4" />}{zh ? '创建新原生会话' : 'Create native session'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function downloadSession(detail: CliSessionDetailResponse) {
  const lines = [
    `# ${detail.session.title}`,
    '',
    `- Adapter: ${detail.session.adapter}`,
    `- Native session: ${detail.session.native_session_id}`,
    `- Host: ${detail.session.host_name || detail.session.agent_id}`,
    `- Project: ${detail.session.project_path}`,
    '',
    ...detail.events.filter((event) => ['message', 'error'].includes(event.kind)).flatMap((event) => [
      `## ${event.role === 'user' ? 'User' : event.role === 'assistant' ? 'Assistant' : 'System'}`,
      '',
      event.content,
      '',
    ]),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${detail.session.title.replace(/[^\w\u4e00-\u9fff-]+/g, '-').slice(0, 80) || 'cli-session'}.md`
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function CliSessionsPage() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}><SessionPageInner /></Suspense>
}
