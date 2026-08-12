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
  Download,
  FolderGit2,
  Home,
  Loader2,
  MessageSquareText,
  MonitorUp,
  RefreshCw,
  Search,
  Sparkles,
  TerminalSquare,
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

  useEffect(() => {
    if (!detail?.session || !token) return
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
    const response = await fetch(`${CLIENT_WTT_API_BASE}/cli-sessions/${encodeURIComponent(selectedId)}/messages`, {
      method: 'POST',
      headers: authHeaders(token, true),
      body: JSON.stringify({ content }),
    })
    if (!response.ok) {
      const message = await responseText(response)
      setActionError(message)
      throw new Error(message)
    }
    await mutateDetail()
    await mutateList()
  }, [mutateDetail, mutateList, selectedId, token])

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
          </div>
          <div className="mb-3 flex gap-1 rounded-xl bg-slate-200/60 p-1 dark:bg-zinc-900">
            {[['', zh ? '全部' : 'All'], ['codex', 'Codex'], ['claude-code', 'Claude']].map(([value, label]) => (
              <button key={value} onClick={() => setAdapterFilter(value)} className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-black ${adapterFilter === value ? 'bg-white text-slate-900 shadow-sm dark:bg-zinc-800 dark:text-white' : 'text-slate-500'}`}>{label}</button>
            ))}
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
              <button key={row.id} onClick={() => router.push(`/sessions?sessionId=${encodeURIComponent(row.id)}`)} className={`group w-full rounded-2xl border p-3 text-left transition ${selectedId === row.id ? 'border-sky-300 bg-white shadow-[0_8px_30px_rgba(14,165,233,0.12)] dark:border-sky-500/60 dark:bg-zinc-900' : 'border-transparent bg-white/55 hover:border-slate-200 hover:bg-white dark:bg-zinc-900/35 dark:hover:border-zinc-700 dark:hover:bg-zinc-900'}`}>
                <div className="flex items-start gap-3">
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
                  emptyState={<div className="text-center"><Bot className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-xs text-slate-500">{zh ? '该会话暂时没有可展示的用户/Agent消息' : 'No visible user or agent messages in this session'}</p></div>}
                />
              </div>
            </div>
          )}
        </section>
      </section>
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
