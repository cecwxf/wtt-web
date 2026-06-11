'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Brain, CalendarClock, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react'
import { ArenaNav } from '@/components/arena/arena-nav'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import type { ArenaLearningItem, ArenaReviewSchedule, ArenaUserProfile } from '@/lib/arena/types'

type DashboardState = {
  profile: ArenaUserProfile | null
  items: ArenaLearningItem[]
  schedules: ArenaReviewSchedule[]
}

function formatDate(value?: string | null) {
  if (!value) return '待定'
  try {
    return new Date(value).toLocaleDateString()
  } catch {
    return value
  }
}

function topMastery(profile: ArenaUserProfile | null) {
  const entries = Object.entries(profile?.concept_mastery || {})
  return entries.sort((a, b) => b[1] - a[1]).slice(0, 8)
}

export default function ArenaLearningDashboardPage() {
  const { data: session, status } = useSession()
  const token = session?.accessToken as string | undefined
  const [state, setState] = useState<DashboardState>({ profile: null, items: [], schedules: [] })
  const [loading, setLoading] = useState(false)

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token])

  const refresh = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [profileRes, itemsRes, schedulesRes] = await Promise.all([
        fetch(`${CLIENT_WTT_API_BASE}/arena/profile/me`, { headers, cache: 'no-store' }),
        fetch(`${CLIENT_WTT_API_BASE}/arena/learning/items?limit=50`, { headers, cache: 'no-store' }),
        fetch(`${CLIENT_WTT_API_BASE}/arena/learning/review-schedule?limit=50`, { headers, cache: 'no-store' }),
      ])
      const [profileData, itemsData, schedulesData] = await Promise.all([
        profileRes.ok ? profileRes.json() : Promise.resolve({}),
        itemsRes.ok ? itemsRes.json() : Promise.resolve({}),
        schedulesRes.ok ? schedulesRes.json() : Promise.resolve({}),
      ])
      setState({
        profile: profileData.profile || null,
        items: Array.isArray(itemsData.items) ? itemsData.items : [],
        schedules: Array.isArray(schedulesData.schedules) ? schedulesData.schedules : [],
      })
    } finally {
      setLoading(false)
    }
  }, [headers, token])

  async function markReview(scheduleId: string, rating: 'again' | 'good' | 'easy') {
    if (!token) return
    const response = await fetch(`${CLIENT_WTT_API_BASE}/arena/learning/review-schedule/${encodeURIComponent(scheduleId)}/review`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rating }),
    })
    if (response.ok) await refresh()
  }

  useEffect(() => {
    void refresh()
  }, [refresh])

  const mastery = topMastery(state.profile)
  const dueNow = state.schedules.filter((item) => {
    if (!item.due_at) return true
    return new Date(item.due_at).getTime() <= Date.now() + 24 * 60 * 60 * 1000
  })

  return (
    <main className="min-h-[100dvh] bg-[#f7f5f0] px-3 py-6 text-slate-950 dark:bg-[#151515] dark:text-white sm:px-5 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <ArenaNav
          subtitle="学习档案"
          right={(
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm transition hover:border-[#3ce8e2] hover:text-[#008b8b] dark:border-gray-800 dark:bg-[#1e1e1e] dark:text-gray-200"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          )}
        />

        {status === 'unauthenticated' ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-[#1e1e1e]">
            <p className="text-lg font-black">请先登录查看学习档案</p>
            <Link href="/login" className="mt-4 inline-flex rounded-2xl bg-[#3ce8e2] px-5 py-3 text-sm font-black text-black">去登录</Link>
          </section>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1e1e1e]">
                  <Brain className="h-6 w-6 text-[#008f8f] dark:text-[#3ce8e2]" />
                  <p className="mt-4 text-3xl font-black">{state.profile?.weak_concepts?.length || 0}</p>
                  <p className="text-sm text-slate-500 dark:text-gray-400">薄弱知识点</p>
                </article>
                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1e1e1e]">
                  <Sparkles className="h-6 w-6 text-amber-500" />
                  <p className="mt-4 text-3xl font-black">{state.items.length}</p>
                  <p className="text-sm text-slate-500 dark:text-gray-400">学习/面试沉淀</p>
                </article>
                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1e1e1e]">
                  <CalendarClock className="h-6 w-6 text-rose-500" />
                  <p className="mt-4 text-3xl font-black">{dueNow.length}</p>
                  <p className="text-sm text-slate-500 dark:text-gray-400">24 小时内待复习</p>
                </article>
              </div>

              <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1e1e1e]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#008f8f] dark:text-[#3ce8e2]">Recent Learning Items</p>
                    <h2 className="mt-2 text-2xl font-black">最近沉淀</h2>
                  </div>
                  <Link href="/arena" className="inline-flex items-center gap-1 text-sm font-black text-[#008f8f] dark:text-[#3ce8e2]">继续学习 <ArrowRight className="h-4 w-4" /></Link>
                </div>
                <div className="mt-5 space-y-3">
                  {state.items.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500 dark:border-gray-800 dark:text-gray-400">还没有沉淀记录。进入教育或面试题目，和 Arena Coach 对话后会自动生成。</p>}
                  {state.items.slice(0, 12).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-[#151515]">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black">{item.title || item.skill_id || item.item_type}</p>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500 dark:text-gray-400">{item.content}</p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-500 dark:bg-[#222] dark:text-gray-300">{item.skill_id || item.item_type}</span>
                      </div>
                      {!!item.knowledge_points?.length && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.knowledge_points.slice(0, 5).map((point) => (
                            <span key={point} className="rounded-md bg-white px-2 py-1 text-xs text-slate-500 dark:bg-[#222] dark:text-gray-300">{point}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <aside className="space-y-5">
              <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1e1e1e]">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-600 dark:text-amber-300">Review Queue</p>
                <h2 className="mt-2 text-2xl font-black">复习队列</h2>
                <div className="mt-5 space-y-3">
                  {state.schedules.length === 0 && <p className="text-sm leading-6 text-slate-500 dark:text-gray-400">暂无复习计划。</p>}
                  {state.schedules.slice(0, 10).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-800 dark:bg-[#151515]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black">{item.item_title || item.skill_id || item.item_type}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">下次：{formatDate(item.due_at)}</p>
                        </div>
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => markReview(item.id, 'again')} className="rounded-full border border-rose-200 px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-400/20 dark:text-rose-200">再练</button>
                        <button onClick={() => markReview(item.id, 'good')} className="rounded-full border border-emerald-200 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-400/20 dark:text-emerald-200">已掌握</button>
                        <button onClick={() => markReview(item.id, 'easy')} className="rounded-full border border-cyan-200 px-2 py-1 text-xs font-bold text-cyan-700 hover:bg-cyan-50 dark:border-cyan-400/20 dark:text-cyan-200">太简单</button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1e1e1e]">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#008f8f] dark:text-[#3ce8e2]">Mastery</p>
                <h2 className="mt-2 text-2xl font-black">掌握度</h2>
                <div className="mt-5 space-y-3">
                  {mastery.length === 0 && <p className="text-sm leading-6 text-slate-500 dark:text-gray-400">暂无掌握度数据。</p>}
                  {mastery.map(([name, value]) => (
                    <div key={name}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="truncate text-slate-600 dark:text-gray-300">{name}</span>
                        <span className="font-black text-slate-500 dark:text-gray-400">{Math.round(value * 100)}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-[#111]">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#3ce8e2] to-emerald-400" style={{ width: `${Math.max(6, Math.min(100, value * 100))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}
