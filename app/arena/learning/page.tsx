'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight, BookOpenCheck, Brain, CalendarClock, CheckCircle2, ChevronDown, RefreshCw, Sparkles } from 'lucide-react'
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
  return Object.entries(profile?.concept_mastery || {}).sort((a, b) => b[1] - a[1]).slice(0, 8)
}

function itemLabel(item: ArenaLearningItem) {
  const structured = item.structured || {}
  return String(structured.title || item.title || item.skill_id || item.item_type || '学习记录')
}

function itemQuestion(item: ArenaLearningItem) {
  return String(item.structured?.question || item.content || '')
}

function itemAnswer(item: ArenaLearningItem) {
  return String(item.structured?.coach_answer || item.answer || '')
}

function itemAgentSummary(item: ArenaLearningItem) {
  const structured = item.structured || {}
  return String(
    structured.summary
      || structured.final_answer
      || structured.coach_answer
      || item.answer
      || ''
  )
}

function toTextList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry || '').trim()).filter(Boolean)
  const text = String(value || '').trim()
  return text ? [text] : []
}

function statusText(status?: string) {
  if (status === 'mastered') return '已掌握'
  if (status === 'reviewing') return '复习中'
  return '新记录'
}

function normalizedText(value: unknown) {
  return String(value || '').trim()
}

function itemDomain(item: ArenaLearningItem) {
  const metadata = item.source_metadata || {}
  const type = item.item_type || ''
  const skill = item.skill_id || ''
  const domain = normalizedText(metadata.flow_domain || metadata.domain)
  if (domain === 'interview' || type.includes('interview') || skill.includes('interview')) return '面试项目'
  if (domain === 'education' || ['mistake', 'photo_question', 'daily_review'].includes(type) || skill.startsWith('education')) return '教育学科项目'
  return '通用沉淀'
}

function itemSubcategory(item: ArenaLearningItem) {
  const metadata = item.source_metadata || {}
  const structured = item.structured || {}
  const candidates = [
    metadata.stage,
    metadata.subject,
    metadata.sub_subject,
    metadata.category,
    structured.stage,
    structured.subject,
    structured.sub_subject,
    item.stage,
    item.subject,
    item.knowledge_points?.[0],
    structured.knowledge_points?.[0],
    item.skill_id,
    item.item_type,
  ]
  const picked = candidates.map(normalizedText).find(Boolean)
  if (!picked) return itemDomain(item) === '面试项目' ? '综合面试' : '自动归类'
  return picked
}

function groupLearningItems(items: ArenaLearningItem[]) {
  const domainMap = new Map<string, Map<string, ArenaLearningItem[]>>()
  for (const item of items) {
    const domain = itemDomain(item)
    const sub = itemSubcategory(item)
    if (!domainMap.has(domain)) domainMap.set(domain, new Map())
    const subMap = domainMap.get(domain)!
    subMap.set(sub, [...(subMap.get(sub) || []), item])
  }
  const preferred = ['教育学科项目', '面试项目', '通用沉淀']
  return Array.from(domainMap.entries()).sort((a, b) => {
    const ai = preferred.indexOf(a[0])
    const bi = preferred.indexOf(b[0])
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
}

export default function ArenaLearningDashboardPage() {
  const { data: session, status } = useSession()
  const token = session?.accessToken as string | undefined
  const [state, setState] = useState<DashboardState>({ profile: null, items: [], schedules: [] })
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string>('')
  const [busyItemId, setBusyItemId] = useState<string>('')
  const [notice, setNotice] = useState('')

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
        fetch(`${CLIENT_WTT_API_BASE}/arena/learning/items?limit=100`, { headers, cache: 'no-store' }),
        fetch(`${CLIENT_WTT_API_BASE}/arena/learning/review-schedule?limit=100`, { headers, cache: 'no-store' }),
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

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function updateItem(itemId: string, path: string, body: Record<string, unknown> = {}) {
    if (!token) return
    setBusyItemId(itemId)
    setNotice('')
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(await response.text())
      await refresh()
      setNotice('学习档案已更新。')
    } catch (error) {
      setNotice(`操作失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusyItemId('')
    }
  }

  const mastery = topMastery(state.profile)
  const dueNow = state.schedules.filter((item) => {
    if (!item.due_at) return true
    return new Date(item.due_at).getTime() <= Date.now() + 24 * 60 * 60 * 1000
  })
  const groupedItems = groupLearningItems(state.items)

  return (
    <main className="min-h-[100dvh] bg-[#f7f5f0] px-3 py-6 text-slate-950 dark:bg-[#151515] dark:text-white sm:px-5 lg:px-8">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-12rem] top-[-16rem] h-[34rem] w-[34rem] rounded-full bg-[#3ce8e2]/15 blur-3xl" />
        <div className="absolute bottom-[-18rem] right-[-12rem] h-[36rem] w-[36rem] rounded-full bg-amber-300/20 blur-3xl dark:bg-violet-500/10" />
      </div>

      <div className="relative mx-auto max-w-7xl">
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
          <div className="space-y-5">
            <section className="grid gap-4 md:grid-cols-4">
              <StatCard icon={<Brain className="h-6 w-6" />} label="薄弱知识点" value={state.profile?.weak_concepts?.length || 0} tone="teal" />
              <StatCard icon={<Sparkles className="h-6 w-6" />} label="学习/面试沉淀" value={state.items.length} tone="amber" />
              <StatCard icon={<CalendarClock className="h-6 w-6" />} label="24 小时内待复习" value={dueNow.length} tone="rose" />
              <StatCard icon={<CheckCircle2 className="h-6 w-6" />} label="已掌握" value={state.items.filter((item) => item.status === 'mastered').length} tone="emerald" />
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1e1e1e]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#008f8f] dark:text-[#3ce8e2]">Learning Profile</p>
                  <h1 className="mt-2 text-3xl font-black">错题、面试和知识沉淀</h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-gray-400">每条记录都保留题目、Agent 讲解、错因、知识点、同类题和复习状态，跨端登录后可继续查看。</p>
                </div>
                <Link href="/arena" className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black text-[#008f8f] hover:border-[#3ce8e2] dark:border-gray-800 dark:bg-[#111] dark:text-[#3ce8e2]">
                  继续练习 <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {groupedItems.length ? groupedItems.map(([domain, subMap]) => (
                  <div key={domain} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-800 dark:bg-[#111]">
                    <p className="text-sm font-black text-slate-800 dark:text-gray-100">{domain}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{Array.from(subMap.values()).flat().length} 条沉淀 · {subMap.size} 个子类</p>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-gray-800 dark:bg-[#111] dark:text-gray-400">
                    Agent 会在对话后自动归类学科、子学科、知识点和面试方向。
                  </div>
                )}
              </div>
              {notice && <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-gray-800 dark:bg-[#111] dark:text-gray-300">{notice}</p>}
            </section>

            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-3">
                {state.items.length === 0 && (
                  <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-gray-800 dark:bg-[#1e1e1e] dark:text-gray-400">还没有对应记录。进入教育或面试 Flow，和 Arena Coach 对话后可以保存到学习档案。</p>
                )}
                {groupedItems.map(([domain, subMap]) => (
                  <section key={domain} className="space-y-3 rounded-[2rem] border border-slate-200 bg-white/70 p-3 dark:border-gray-800 dark:bg-[#171717]">
                    <div className="flex items-center justify-between px-2 py-1">
                      <h2 className="text-xl font-black text-slate-950 dark:text-white">{domain}</h2>
                      <span className="rounded-full bg-[#3ce8e2]/15 px-2.5 py-1 text-xs font-black text-[#008f8f] dark:text-[#3ce8e2]">{Array.from(subMap.values()).flat().length} 条</span>
                    </div>
                    {Array.from(subMap.entries()).map(([subcategory, items]) => (
                      <div key={`${domain}:${subcategory}`} className="space-y-2 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-3 dark:border-gray-800 dark:bg-[#111]">
                        <div className="flex items-center justify-between gap-3 px-1">
                          <h3 className="truncate text-sm font-black text-slate-700 dark:text-gray-200">{subcategory}</h3>
                          <span className="shrink-0 text-xs font-bold text-slate-400">{items.length} 条</span>
                        </div>
                        {items.map((item) => (
                          <LearningItemCard
                            key={item.id}
                            item={item}
                            expanded={expandedId === item.id}
                            busy={busyItemId === item.id}
                            dueAt={state.schedules.find((schedule) => schedule.learning_item_id === item.id)?.due_at}
                            onToggle={() => setExpandedId((current) => current === item.id ? '' : item.id)}
                            onReview={(rating) => updateItem(item.id, `/arena/learning/items/${encodeURIComponent(item.id)}/review`, { rating })}
                            onSimilar={() => updateItem(item.id, `/arena/learning/items/${encodeURIComponent(item.id)}/generate-similar`)}
                          />
                        ))}
                      </div>
                    ))}
                  </section>
                ))}
              </div>

              <aside className="space-y-4">
                <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1e1e1e]">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#008f8f] dark:text-[#3ce8e2]">Mastery</p>
                  <h2 className="mt-2 text-xl font-black">知识点掌握</h2>
                  <div className="mt-5 space-y-3">
                    {mastery.length === 0 && <p className="text-sm leading-6 text-slate-500 dark:text-gray-400">暂无掌握度数据。</p>}
                    {mastery.map(([name, value]) => (
                      <div key={name}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                          <span className="truncate text-slate-600 dark:text-gray-300">{name}</span>
                          <span className="font-black text-slate-500 dark:text-gray-400">{Math.round(value * 100)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-[#111]">
                          <div className="h-full rounded-full bg-gradient-to-r from-[#3ce8e2] to-emerald-400" style={{ width: `${Math.max(6, Math.min(100, value * 100))}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1e1e1e]">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-600 dark:text-amber-300">Next Review</p>
                  <h2 className="mt-2 text-xl font-black">最近复习</h2>
                  <div className="mt-4 space-y-2 text-sm text-slate-600 dark:text-gray-300">
                    {state.schedules.slice(0, 6).map((schedule) => (
                      <button
                        key={schedule.id}
                        type="button"
                        onClick={() => setExpandedId(schedule.learning_item_id)}
                        className="block w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-[#3ce8e2] dark:border-gray-800 dark:bg-[#111]"
                      >
                        <span className="block truncate font-bold">{schedule.item_title || schedule.item_type}</span>
                        <span className="text-xs text-slate-500 dark:text-gray-400">{formatDate(schedule.due_at)}</span>
                      </button>
                    ))}
                    {state.schedules.length === 0 && <p>暂无复习计划。</p>}
                  </div>
                </section>
              </aside>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}

function StatCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: 'teal' | 'amber' | 'rose' | 'emerald' }) {
  const colors = {
    teal: 'text-[#008f8f] dark:text-[#3ce8e2]',
    amber: 'text-amber-500',
    rose: 'text-rose-500',
    emerald: 'text-emerald-500',
  }
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1e1e1e]">
      <div className={colors[tone]}>{icon}</div>
      <p className="mt-4 text-3xl font-black">{value}</p>
      <p className="text-sm text-slate-500 dark:text-gray-400">{label}</p>
    </article>
  )
}

function LearningItemCard({
  item,
  expanded,
  busy,
  dueAt,
  onToggle,
  onReview,
  onSimilar,
}: {
  item: ArenaLearningItem
  expanded: boolean
  busy: boolean
  dueAt?: string | null
  onToggle: () => void
  onReview: (rating: 'again' | 'hard' | 'good' | 'easy') => void
  onSimilar: () => void
}) {
  const structured = item.structured || {}
  const points = structured.knowledge_points?.length ? structured.knowledge_points : item.knowledge_points
  const mistakes = structured.mistake_reason?.length ? structured.mistake_reason : item.error_reasons
  const similar = Array.isArray(structured.similar_questions) ? structured.similar_questions : []
  const summary = itemAgentSummary(item)
  const coachAnswer = itemAnswer(item)
  const reviewPlan = String(structured.review_plan || structured.next_review || '').trim()
  const cautions = [
    ...toTextList(structured.cautions),
    ...toTextList(structured.attention_points),
    ...toTextList(structured.key_warnings),
    ...toTextList(structured.common_pitfalls),
  ]
  const sourceQuestion = itemQuestion(item)

  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1e1e1e]">
      <button type="button" onClick={onToggle} className="flex w-full items-start justify-between gap-4 p-5 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#3ce8e2]/15 px-2.5 py-1 text-xs font-black text-[#008f8f] dark:text-[#3ce8e2]">{statusText(item.status)}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500 dark:bg-[#111] dark:text-gray-400">{item.skill_id || item.item_type}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500 dark:bg-[#111] dark:text-gray-400">复习：{formatDate(dueAt)}</span>
          </div>
          <h2 className="mt-3 text-xl font-black text-slate-950 dark:text-white">{itemLabel(item)}</h2>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500 dark:text-gray-400">{summary || coachAnswer || '暂无 Agent 总结'}</p>
        </div>
        <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-slate-200 px-5 pb-5 pt-4 dark:border-gray-800">
          <div className="space-y-4">
            <DetailBlock
              title="Agent 总结"
              content={summary || coachAnswer}
              fallback="暂无 Agent 总结。后续保存学习档案时会优先沉淀讲解摘要。"
              featured
            />
            {coachAnswer && coachAnswer !== summary && (
              <DetailBlock title="相关讲解" content={coachAnswer} fallback="暂无讲解。" />
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <DetailList title="注意事项" items={cautions.length ? cautions : mistakes || []} fallback="暂无注意事项。" />
              <DetailList title="知识点" items={points || []} fallback="暂无知识点。" />
            </div>
          </div>

          {!!reviewPlan && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
              <p className="mb-1 text-xs font-black uppercase tracking-[0.18em]">复习建议</p>
              {reviewPlan}
            </div>
          )}

          {!!similar.length && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-[#151515]">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-gray-400">同类题</p>
              <div className="mt-3 space-y-3">
                {similar.map((entry, index) => {
                  const item = typeof entry === 'string' ? { title: `同类题 ${index + 1}`, prompt: entry } : entry
                  return (
                    <div key={`${item.title || index}`} className="rounded-xl bg-white p-3 text-sm leading-6 text-slate-700 dark:bg-[#111] dark:text-gray-300">
                      <p className="font-black">{item.title || `同类题 ${index + 1}`}</p>
                      <p className="mt-1 whitespace-pre-wrap text-slate-500 dark:text-gray-400">{item.prompt || ''}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {sourceQuestion && (
            <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-gray-800 dark:bg-[#151515] dark:text-gray-400">
              <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-gray-400">原始题目 / 来源</summary>
              <p className="mt-3 whitespace-pre-wrap leading-6">{sourceQuestion}</p>
            </details>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => onReview('again')} className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-black text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-400/20 dark:text-rose-200">再练</button>
            <button type="button" disabled={busy} onClick={() => onReview('good')} className="rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-400/20 dark:text-emerald-200">已掌握</button>
            <button type="button" disabled={busy} onClick={() => onReview('easy')} className="rounded-full border border-cyan-200 px-3 py-1.5 text-xs font-black text-cyan-700 hover:bg-cyan-50 disabled:opacity-50 dark:border-cyan-400/20 dark:text-cyan-200">太简单</button>
            <button type="button" disabled={busy} onClick={onSimilar} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:border-[#3ce8e2] disabled:opacity-50 dark:border-gray-800 dark:text-gray-200">
              <BookOpenCheck className="h-3.5 w-3.5" />
              生成同类题
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

function DetailBlock({ title, content, fallback, featured = false }: { title: string; content?: string; fallback: string; featured?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${featured ? 'border-[#3ce8e2]/30 bg-[#efffff] dark:border-[#3ce8e2]/20 dark:bg-[#101818]' : 'border-slate-200 bg-slate-50 dark:border-gray-800 dark:bg-[#151515]'}`}>
      <p className={`text-xs font-black uppercase tracking-[0.18em] ${featured ? 'text-[#008f8f] dark:text-[#3ce8e2]' : 'text-slate-500 dark:text-gray-400'}`}>{title}</p>
      <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${featured ? 'text-slate-800 dark:text-gray-100' : 'text-slate-700 dark:text-gray-300'}`}>{content || fallback}</p>
    </div>
  )
}

function DetailList({ title, items, fallback }: { title: string; items: string[]; fallback: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-[#151515]">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-gray-400">{title}</p>
      {items.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={item} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-[#111] dark:text-gray-300">{item}</span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-gray-400">{fallback}</p>
      )}
    </div>
  )
}
