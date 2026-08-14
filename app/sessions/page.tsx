'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import {
  Bot,
  ArrowLeft,
  Boxes,
  GitBranch,
  ChevronRight,
  Clock3,
  CloudOff,
  Code2,
  Combine,
  Download,
  FolderGit2,
  Home,
  Loader2,
  MessageSquareText,
  MonitorUp,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  X,
  Zap,
} from 'lucide-react'

import { ChatView, type ChatMessage, type ChatRunStatus } from '@/components/ui/chat-view'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { useI18n } from '@/lib/i18n-provider'

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
  const [hostFilter, setHostFilter] = useState('')
  const [adapterFilter, setAdapterFilter] = useState('')
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

  const listUrl = token
    ? `${CLIENT_WTT_API_BASE}/cli-sessions?limit=500${query ? `&q=${encodeURIComponent(query)}` : ''}${adapterFilter ? `&adapter=${encodeURIComponent(adapterFilter)}` : ''}`
    : null
  const { data: listData, error: listError, mutate: mutateList, isLoading: listLoading } = useSWR<CliSessionListResponse>(
    listUrl,
    (url: string) => readJson(url, token),
    { refreshInterval: discovering ? 2000 : 10_000, revalidateOnFocus: true },
  )

  const visibleSessions = useMemo(() => {
    const rows = listData?.items || []
    if (!hostFilter) return rows
    return rows.filter((row) => (row.host_name || row.agent_id) === hostFilter)
  }, [hostFilter, listData?.items])

  const hosts = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; total: number; online: number; projects: Set<string> }>()
    for (const row of listData?.items || []) {
      const key = row.host_name || row.agent_id
      const group = groups.get(key) || { key, label: row.host_name || row.agent_id, total: 0, online: 0, projects: new Set<string>() }
      group.total += 1
      if (row.agent_online) group.online += 1
      group.projects.add(projectName(row.project_path))
      groups.set(key, group)
    }
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [listData?.items])

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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_34%),linear-gradient(135deg,#f7f6f1,#edf4f7)] text-slate-900 dark:bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_34%),linear-gradient(135deg,#09090b,#111827)] dark:text-zinc-100">
      <header className="flex h-14 items-center justify-between border-b border-white/70 bg-white/75 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/75">
        <div className="flex items-center gap-3">
          <Link href="/" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-zinc-800 dark:hover:text-white" title={zh ? '主页' : 'Home'}><Home className="h-4 w-4" /></Link>
          <div className="h-6 w-px bg-slate-200 dark:bg-zinc-800" />
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-sky-600 p-2 text-white shadow-lg shadow-sky-600/20"><TerminalSquare className="h-4 w-4" /></div>
            <div>
              <h1 className="text-sm font-black tracking-tight">CLI Sessions</h1>
              <p className="text-[10px] font-medium text-slate-500 dark:text-zinc-400">Codex · Claude Code</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/feed" className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">Feed</Link>
          <button onClick={toggleLocale} className="rounded-xl px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800">{zh ? 'EN' : '中'}</button>
          <ThemeToggle />
        </div>
      </header>

      <section className="grid h-[calc(100vh-3.5rem)] grid-cols-1 overflow-hidden lg:grid-cols-[220px_330px_minmax(0,1fr)]">
        <aside className="hidden overflow-y-auto border-r border-white/80 bg-white/55 p-3 backdrop-blur-lg dark:border-white/10 dark:bg-zinc-950/45 lg:block">
          <button
            onClick={discover}
            disabled={discovering}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-3 py-3 text-xs font-black text-white shadow-lg transition hover:-translate-y-0.5 disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950"
          >
            {discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <MonitorUp className="h-4 w-4" />}
            {zh ? '扫描已绑定主机' : 'Scan bound hosts'}
          </button>
          <button onClick={() => setHostFilter('')} className={`mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-bold ${!hostFilter ? 'bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200' : 'text-slate-600 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-900'}`}>
            <span className="flex items-center gap-2"><Boxes className="h-4 w-4" />{zh ? '全部会话' : 'All sessions'}</span>
            <span>{listData?.total || 0}</span>
          </button>
          <p className="mb-2 mt-5 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{zh ? '主机 / 项目' : 'Hosts / projects'}</p>
          <div className="space-y-1">
            {hosts.map((host, index) => (
              <button key={host.key} onClick={() => setHostFilter(host.key)} className={`w-full rounded-2xl border px-3 py-3 text-left transition ${hostFilter === host.key ? 'border-sky-300 bg-white shadow-sm dark:border-sky-500/60 dark:bg-zinc-900' : 'border-transparent hover:border-slate-200 hover:bg-white/70 dark:hover:border-zinc-800 dark:hover:bg-zinc-900/70'}`}>
                <div className="flex items-center gap-2">
                  <div className={`h-7 w-1 rounded-full ${['bg-sky-400', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400'][index % 4]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black">{host.label}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500 dark:text-zinc-400">{host.online ? zh ? '在线' : 'Online' : zh ? '离线' : 'Offline'} · {host.total} sessions</p>
                  </div>
                </div>
                <p className="mt-2 truncate pl-3 text-[10px] text-slate-400">{Array.from(host.projects).slice(0, 3).join(' · ')}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className={`${selectedId ? 'hidden lg:block' : 'block'} overflow-y-auto border-r border-white/80 bg-[#f8fafb]/80 p-3 dark:border-white/10 dark:bg-zinc-950/65`}>
          <div className="mb-3 flex gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-900">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={zh ? '搜索会话、项目、ID' : 'Search sessions, projects, IDs'} className="w-full bg-transparent py-2.5 text-xs outline-none" />
            </label>
            <button onClick={() => void mutateList()} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 hover:text-sky-600 dark:border-zinc-800 dark:bg-zinc-900"><RefreshCw className="h-4 w-4" /></button>
            <button onClick={openNewSession} className="rounded-xl bg-sky-600 p-2.5 text-white shadow-sm hover:bg-sky-700" title={zh ? '新建 CLI Session' : 'New CLI Session'}><Plus className="h-4 w-4" /></button>
          </div>
          <div className="mb-3 flex gap-1 rounded-xl bg-slate-200/60 p-1 dark:bg-zinc-900">
            {[['', zh ? '全部' : 'All'], ['codex', 'Codex'], ['claude-code', 'Claude']].map(([value, label]) => (
              <button key={value} onClick={() => setAdapterFilter(value)} className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-black ${adapterFilter === value ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-slate-500'}`}>{label}</button>
            ))}
          </div>
          <div className="mb-3 flex items-center gap-2">
            {!fusionMode ? (
              <button onClick={() => setFusionMode(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-black text-sky-800 hover:bg-sky-100 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200"><Combine className="h-3.5 w-3.5" />{zh ? '融合 CLI 记忆' : 'Fuse CLI memory'}</button>
            ) : (
              <>
                <button onClick={openFusionDialog} disabled={fusionSourceIds.length < 2} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40"><Combine className="h-3.5 w-3.5" />{zh ? `融合所选 (${fusionSourceIds.length}/8)` : `Fuse selected (${fusionSourceIds.length}/8)`}</button>
                <button onClick={() => { setFusionMode(false); setFusionSourceIds([]) }} className="rounded-xl border border-slate-200 p-2 text-slate-500 dark:border-zinc-800"><X className="h-3.5 w-3.5" /></button>
              </>
            )}
          </div>
          {(listError || actionError) && <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">{actionError || listError?.message}</p>}
          {listLoading && <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-sky-600" /></div>}
          {!listLoading && !visibleSessions.length && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-7 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
              <TerminalSquare className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-xs font-black">{zh ? '尚未发现CLI会话' : 'No CLI sessions discovered'}</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">{zh ? '点击扫描后，在线主机上的wtt-connect会读取本地Codex和Claude Code会话目录。' : 'Scan to let wtt-connect read local Codex and Claude Code session catalogs on online hosts.'}</p>
            </div>
          )}
          <div className="space-y-2">
            {visibleSessions.map((row) => (
              <button key={row.id} onClick={() => fusionMode ? toggleFusionSource(row.id) : router.push(`/sessions?sessionId=${encodeURIComponent(row.id)}`)} className={`group w-full rounded-2xl border p-3 text-left transition ${fusionSourceIds.includes(row.id) ? 'border-cyan-400 bg-cyan-50 shadow-[0_8px_24px_rgba(6,182,212,0.13)] dark:border-cyan-500 dark:bg-cyan-950/25' : selectedId === row.id ? 'border-sky-300 bg-white shadow-[0_8px_30px_rgba(14,165,233,0.12)] dark:border-sky-500/60 dark:bg-zinc-900' : 'border-transparent bg-white/55 hover:border-slate-200 hover:bg-white dark:bg-zinc-900/35 dark:hover:border-zinc-700 dark:hover:bg-zinc-900'}`}>
                <div className="flex items-start gap-3">
                  {fusionMode && <span className={`mt-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[9px] font-black ${fusionSourceIds.includes(row.id) ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-slate-300 text-transparent dark:border-zinc-600'}`}>✓</span>}
                  <div className={`mt-0.5 rounded-xl p-2 ${row.adapter === 'codex' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300'}`}>{row.adapter === 'codex' ? <Code2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}</div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs font-black leading-5">{row.title}</p>
                    <p className="mt-1 truncate text-[10px] font-semibold text-slate-500 dark:text-zinc-400">{projectName(row.project_path)}{row.git_branch ? ` · ${row.git_branch}` : ''}</p>
                  </div>
                  <ChevronRight className="mt-2 h-3.5 w-3.5 text-slate-300 transition group-hover:translate-x-0.5" />
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{relativeTime(row.source_updated_at, zh)}</span>
                  <span className="ml-auto mr-3 flex items-center gap-1 font-bold text-amber-600 dark:text-amber-300"><Zap className="h-3 w-3" />{formatTokenCount(row.usage?.total_tokens)}</span>
                  <span className={`flex items-center gap-1 font-bold ${row.agent_online ? 'text-emerald-600' : 'text-slate-400'}`}><span className={`h-1.5 w-1.5 rounded-full ${row.agent_online ? 'bg-emerald-500' : 'bg-slate-300'}`} />{row.agent_online ? (zh ? '可继续' : 'Resumable') : (zh ? '离线' : 'Offline')}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className={`${selectedId ? 'block' : 'hidden lg:block'} min-w-0 bg-white/85 dark:bg-zinc-950/90`}>
          {!detail?.session ? (
            <div className="flex h-full items-center justify-center p-8 text-center">
              <div><MessageSquareText className="mx-auto h-10 w-10 text-slate-200 dark:text-zinc-800" /><p className="mt-3 text-sm font-black">{detailError?.message || (zh ? '选择一个CLI会话' : 'Select a CLI session')}</p></div>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-2 dark:border-zinc-900">
                <button onClick={() => router.push('/sessions')} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-zinc-900" title={zh ? '返回会话列表' : 'Back to sessions'}><ArrowLeft className="h-4 w-4" /></button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 dark:text-zinc-400">
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 uppercase dark:bg-zinc-900">{detail.session.adapter}</span>
                    <span className="truncate">{detail.session.host_name || detail.session.agent_id}</span>
                    {!detail.session.agent_online && <CloudOff className="h-3 w-3 text-rose-400" />}
                  </div>
                  <div className="mt-1 flex items-center gap-3 truncate text-[10px] text-slate-400">
                    <span className="flex items-center gap-1 truncate"><FolderGit2 className="h-3 w-3" />{detail.session.project_path || 'Unknown project'}</span>
                    {detail.session.git_branch && <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" />{detail.session.git_branch}</span>}
                  </div>
                </div>
                <button onClick={() => void importSelected()} disabled={!detail.session.agent_online || detail.session.import_status === 'importing'} className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-700 disabled:opacity-40 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300" title={zh ? '从原生 CLI 会话同步历史及 Token 用量' : 'Sync history and Token usage from the native CLI session'}><RefreshCw className={`h-3.5 w-3.5 ${detail.session.import_status === 'importing' ? 'animate-spin' : ''}`} />{zh ? '同步' : 'Sync'}</button>
                <button onClick={() => void sendMessage(zh ? '请总结当前会话的目标、关键决策、已完成工作、未解决问题和下一步行动。' : 'Summarize this session: goals, key decisions, completed work, unresolved issues, and next actions.')} disabled={!detail.session.agent_online || detail.session.run_status === 'running'} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black text-slate-600 hover:border-sky-300 hover:text-sky-700 disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-300"><Sparkles className="h-3.5 w-3.5" />{zh ? '总结' : 'Summarize'}</button>
                <button onClick={() => downloadSession(detail)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-sky-700 dark:border-zinc-800"><Download className="h-3.5 w-3.5" /></button>
              </div>
              {detail.session.usage?.total_tokens > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-amber-100 bg-amber-50/70 px-4 py-1.5 text-[10px] font-bold text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-200">
                  <span className="flex items-center gap-1"><Zap className="h-3 w-3" />Token {formatTokenCount(detail.session.usage.total_tokens)}</span>
                  <span>{zh ? '输入' : 'Input'} {formatTokenCount(detail.session.usage.input_tokens)}</span>
                  <span>{zh ? '输出' : 'Output'} {formatTokenCount(detail.session.usage.output_tokens)}</span>
                  <span>{zh ? '缓存' : 'Cache'} {formatTokenCount(detail.session.usage.cache_read_tokens + detail.session.usage.cache_write_tokens)}</span>
                  {detail.session.usage.reasoning_tokens > 0 && <span>{zh ? '推理' : 'Reasoning'} {formatTokenCount(detail.session.usage.reasoning_tokens)}</span>}
                </div>
              )}
              {detail.session.import_status === 'importing' && <div className="flex items-center gap-2 border-b border-sky-100 bg-sky-50 px-4 py-2 text-[11px] font-bold text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300"><Loader2 className="h-3.5 w-3.5 animate-spin" />{zh ? '正在从原主机按需导入历史记录' : 'Importing history from the source host'}</div>}
              <div className="flex min-h-10 flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-1.5 text-[10px] dark:border-zinc-900 dark:bg-zinc-950">
                <span className="flex items-center gap-1 font-black text-slate-500 dark:text-zinc-400"><ShieldCheck className="h-3.5 w-3.5" />{zh ? '工作区权限' : 'Workspace access'}</span>
                <select value={workspaceAccess} onChange={(event) => setWorkspaceAccess(event.target.value as typeof workspaceAccess)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-bold outline-none dark:border-zinc-800 dark:bg-zinc-900">
                  <option value="read-only">Read Only</option>
                  <option value="workspace-write">Workspace Write</option>
                  <option value="full-access">Full Access</option>
                </select>
                <select value={selectedModel} onChange={(event) => { const value = event.target.value; setSelectedModel(value); const option = runtime?.models.options.find((item) => item.value === value); setReasoningEffort(option?.default_reasoning_effort || option?.reasoning_efforts?.[0]?.value || '') }} disabled={!runtime?.models.options.length} className="min-w-32 max-w-56 rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-bold outline-none disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900">
                  {!runtime?.models.options.length && <option value="">{runtimeLoading ? (zh ? '加载模型…' : 'Loading models…') : (zh ? '原生默认模型' : 'Native default')}</option>}
                  {runtime?.models.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <select value={reasoningEffort} onChange={(event) => setReasoningEffort(event.target.value)} disabled={!selectedModelOption?.reasoning_efforts?.length} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-bold outline-none disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900">
                  {!selectedModelOption?.reasoning_efforts?.length && <option value="">{zh ? '默认推理' : 'Default reasoning'}</option>}
                  {selectedModelOption?.reasoning_efforts?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                {runtimeError && <span className="truncate text-rose-500" title={runtimeError.message}>{zh ? '运行配置加载失败' : 'Runtime controls unavailable'}</span>}
              </div>
              <div className="min-h-0 flex-1">
                <ChatView
                  topicName={detail.session.title}
                  messages={chatMessages}
                  currentAgentId={detail.session.agent_id}
                  onSendMessage={sendMessage}
                  onLoadOlder={async () => setEventLimit((value) => Math.min(value + 500, 5000))}
                  hasOlder={(detail.event_total || 0) > (detail.events?.length || 0) && eventLimit < 5000}
                  loading={detail.session.import_status === 'importing'}
                  compactUi
                  wsConnected={Boolean(detail.session.agent_online)}
                  accessToken={token}
                  topicType="cli_session"
                  runStatus={runStatus}
                  currentAgentRuntime={{ adapter: detail.session.adapter, model: selectedModel || runtime?.models.current?.model, reasoning_effort: reasoningEffort }}
                  slashCommandOverrides={(runtime?.commands || []).map((command) => ({ cmd: command.name, desc: command.description }))}
                  emptyState={<div className="text-center"><Bot className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-xs text-slate-500">{zh ? '该会话暂时没有可展示的用户/Agent消息' : 'No visible user or agent messages in this session'}</p></div>}
                />
              </div>
            </div>
          )}
        </section>
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
