'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Activity, Database, HardDrive, RefreshCw, Server, Users } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

type MetricsPayload = {
  generated_at?: string
  system?: {
    cpu_count?: number
    load_average?: { '1m'?: number; '5m'?: number; '15m'?: number }
    memory?: {
      total_bytes?: number
      used_bytes?: number
      available_bytes?: number
      swap_total_bytes?: number
      swap_used_bytes?: number
    }
    disk_root?: {
      total_bytes?: number
      used_bytes?: number
      free_bytes?: number
      used_percent?: number
    }
  }
  database?: {
    size_bytes?: number
    connections?: Record<string, number>
    tables?: Record<string, number | null>
  }
  wtt?: {
    topics?: { total?: number; active?: number; public?: number; private?: number }
    tasks_by_status?: Record<string, number>
    messages?: { total?: number; last_24h?: number }
  }
}

const formatBytes = (value?: number) => {
  if (!value || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

const formatNumber = (value?: number | null) => new Intl.NumberFormat().format(value || 0)

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string
  value: string
  hint: string
  icon: typeof Activity
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{title}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">{hint}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-teal-200">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </article>
  )
}

export default function AdminMetricsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const token = (session as { accessToken?: string } | null)?.accessToken
  const connections = metrics?.database?.connections || {}
  const tables = metrics?.database?.tables || {}
  const taskEntries = Object.entries(metrics?.wtt?.tasks_by_status || {})
  const connectionEntries = Object.entries(connections)
  const tableEntries = Object.entries(tables)

  const memoryPercent = useMemo(() => {
    const total = metrics?.system?.memory?.total_bytes || 0
    const used = metrics?.system?.memory?.used_bytes || 0
    return total ? Math.round((used / total) * 100) : 0
  }, [metrics])

  const loadMetrics = async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/manager/admin/metrics`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.detail || `Metrics request failed: ${response.status}`)
      }
      setMetrics(await response.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Metrics request failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [router, status])

  useEffect(() => {
    loadMetrics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <main className="min-h-screen bg-[#f4f1e8] px-5 py-8 text-slate-950">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-slate-200 bg-white/80 px-5 py-4 shadow-sm">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">WTT Admin Metrics</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">运行指标与容量视图</h1>
            <p className="mt-1 text-sm text-slate-500">
              仅 saiph / 管理员可访问。生成时间：{metrics?.generated_at || '-'}
            </p>
          </div>
          <button
            type="button"
            onClick={loadMetrics}
            disabled={loading || !token}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </header>

        {error && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="CPU Load"
            value={`${(metrics?.system?.load_average?.['1m'] || 0).toFixed(2)} / ${metrics?.system?.cpu_count || '-'}`}
            hint={`5m ${(metrics?.system?.load_average?.['5m'] || 0).toFixed(2)} · 15m ${(metrics?.system?.load_average?.['15m'] || 0).toFixed(2)}`}
            icon={Server}
          />
          <StatCard
            title="Memory"
            value={`${memoryPercent}%`}
            hint={`${formatBytes(metrics?.system?.memory?.used_bytes)} used · ${formatBytes(metrics?.system?.memory?.available_bytes)} available`}
            icon={Activity}
          />
          <StatCard
            title="Disk /"
            value={`${metrics?.system?.disk_root?.used_percent || 0}%`}
            hint={`${formatBytes(metrics?.system?.disk_root?.used_bytes)} used · ${formatBytes(metrics?.system?.disk_root?.free_bytes)} free`}
            icon={HardDrive}
          />
          <StatCard
            title="Database"
            value={formatBytes(metrics?.database?.size_bytes)}
            hint={connectionEntries.map(([k, v]) => `${k}: ${v}`).join(' · ') || 'connections unavailable'}
            icon={Database}
          />
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-teal-700" />
              <h2 className="text-lg font-black">WTT 数据概况</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricRow label="Topics" value={`${formatNumber(metrics?.wtt?.topics?.active)} active / ${formatNumber(metrics?.wtt?.topics?.total)} total`} />
              <MetricRow label="Public / Private" value={`${formatNumber(metrics?.wtt?.topics?.public)} / ${formatNumber(metrics?.wtt?.topics?.private)}`} />
              <MetricRow label="Messages" value={formatNumber(metrics?.wtt?.messages?.total)} />
              <MetricRow label="Messages 24h" value={formatNumber(metrics?.wtt?.messages?.last_24h)} />
            </div>
            <div className="mt-5">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Tasks by status</p>
              <div className="flex flex-wrap gap-2">
                {taskEntries.length ? taskEntries.map(([statusName, count]) => (
                  <span key={statusName} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">
                    {statusName}: {count}
                  </span>
                )) : <span className="text-sm text-slate-400">No task metrics</span>}
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Database className="h-5 w-5 text-indigo-700" />
              <h2 className="text-lg font-black">数据库表计数</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {tableEntries.map(([name, count]) => (
                <MetricRow key={name} label={name} value={count === null ? '-' : formatNumber(count)} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs font-bold text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-900">{value}</p>
    </div>
  )
}
