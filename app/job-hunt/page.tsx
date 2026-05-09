'use client'

import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  MessageSquareText,
  Target,
  TrendingUp,
} from 'lucide-react'

type LifecycleStage =
  | 'visitor'
  | 'diagnosed'
  | 'resume_reviewed'
  | 'mock_interview_reviewed'
  | 'seven_day_user'
  | 'day7_reviewed'
  | 'upgrade_candidate'

type DayTaskStatus = 'locked' | 'todo' | 'doing' | 'blocked' | 'done'

type AnalyticsEvent = {
  eventName: string
  sourcePage: string
  lifecycleStage: LifecycleStage
  day?: number
  cta?: string
  createdAt: string
}

type SevenDayTask = {
  day: 1 | 2 | 3 | 4 | 5 | 6 | 7
  title: string
  description: string
  deliverable: string
  cta: string
  optional?: boolean
}

const sevenDayTasks: SevenDayTask[] = [
  {
    day: 1,
    title: '诊断与目标岗位',
    description: '确认求职阶段、目标岗位和 7 天优先级。',
    deliverable: '阶段判断 + 目标岗位 + 7 天优先级',
    cta: '完成求职诊断',
  },
  {
    day: 2,
    title: '简历主线',
    description: '拿到可修改、可投递的一版简历问题清单。',
    deliverable: '简历初评 + 三个最大修改问题',
    cta: '上传简历初评',
  },
  {
    day: 3,
    title: '项目表达',
    description: '把项目讲成背景、动作、难点、结果，而不是技术流水账。',
    deliverable: '项目讲述结构 + 面试追问题',
    cta: '梳理项目表达',
  },
  {
    day: 4,
    title: '模拟面试与复盘',
    description: '完成一次面试记录，并知道为什么没过、怎么改。',
    deliverable: '模拟面试记录 + 面后复盘报告',
    cta: '开始模拟面试',
  },
  {
    day: 5,
    title: 'AI/Agent 项目训练',
    description: '可选增强项，不阻塞默认 7 天链路。',
    deliverable: 'AI/Agent 差异化建议 + 可选训练任务',
    cta: '查看可选增强',
    optional: true,
  },
  {
    day: 6,
    title: '投递策略与短板修正',
    description: '形成本周投递计划，并补齐简历、项目、面试短板。',
    deliverable: '投递优先级 + 本周投递计划',
    cta: '生成投递计划',
  },
  {
    day: 7,
    title: '周复盘与升级判断',
    description: '判断 7 天后是否更敢投、更会讲项目、更接近面试机会。',
    deliverable: 'Day7 复盘 + 是否推荐 14 天升级',
    cta: '进入 Day7 复盘',
  },
]

const initialTaskStatus: Record<number, DayTaskStatus> = Object.fromEntries(
  sevenDayTasks.map((task) => [task.day, task.day === 1 ? 'todo' : 'locked']),
) as Record<number, DayTaskStatus>

function now() {
  return new Date().toISOString()
}

function statusLabel(status: DayTaskStatus) {
  switch (status) {
    case 'locked':
      return '未解锁'
    case 'todo':
      return '待开始'
    case 'doing':
      return '进行中'
    case 'blocked':
      return '卡住'
    case 'done':
      return '已完成'
  }
}

function nextStageAfterTask(day: number): LifecycleStage | null {
  if (day === 1) return 'diagnosed'
  if (day === 2) return 'resume_reviewed'
  if (day === 4) return 'mock_interview_reviewed'
  if (day === 7) return 'day7_reviewed'
  return null
}

export default function JobHuntPage() {
  const [stage, setStage] = useState<LifecycleStage>('visitor')
  const [selectedPain, setSelectedPain] = useState('简历没人看')
  const [taskStatus, setTaskStatus] = useState<Record<number, DayTaskStatus>>(initialTaskStatus)
  const [events, setEvents] = useState<AnalyticsEvent[]>([
    { eventName: 'home_page_viewed', sourcePage: 'job_hunt_home', lifecycleStage: 'visitor', createdAt: now() },
  ])

  const completedDays = useMemo(
    () => sevenDayTasks.filter((task) => taskStatus[task.day] === 'done').length,
    [taskStatus],
  )
  const currentDay = Math.min(completedDays + 1, 7)
  const readyForDay7 = completedDays >= 7
  const upgradeCandidate = stage === 'upgrade_candidate'

  function track(eventName: string, sourcePage: string, cta?: string, day?: number) {
    setEvents((prev) => [
      {
        eventName,
        sourcePage,
        lifecycleStage: stage,
        cta,
        day,
        createdAt: now(),
      },
      ...prev,
    ])
  }

  function startDiagnosis() {
    track('home_cta_clicked', 'job_hunt_home', '开始求职诊断')
    setStage('diagnosed')
    track('diagnosis_completed', 'diagnosis', selectedPain)
    setTaskStatus((prev) => ({ ...prev, 1: 'done', 2: prev[2] === 'locked' ? 'todo' : prev[2] }))
  }

  function completeTask(day: number) {
    const nextStage = nextStageAfterTask(day)
    setTaskStatus((prev) => ({
      ...prev,
      [day]: 'done',
      [day + 1]: day < 7 && prev[day + 1] === 'locked' ? 'todo' : prev[day + 1],
    }))
    if (day === 5) {
      track('seven_day_day5_optional_clicked', 'seven_day_plan', '可选增强', day)
    }
    track('seven_day_task_completed', 'seven_day_plan', `Day${day} 完成`, day)
    if (nextStage) {
      setStage(nextStage)
    }
  }

  function markDoing(day: number) {
    setTaskStatus((prev) => ({ ...prev, [day]: 'doing' }))
    track('seven_day_task_started', 'seven_day_plan', `Day${day} 开始`, day)
  }

  function completeResumeReview() {
    setStage('resume_reviewed')
    setTaskStatus((prev) => ({ ...prev, 2: 'done', 3: prev[3] === 'locked' ? 'todo' : prev[3] }))
    track('resume_review_completed', 'resume_review', '完成简历初评', 2)
  }

  function completeMockInterview() {
    setStage('mock_interview_reviewed')
    setTaskStatus((prev) => ({ ...prev, 4: 'done', 5: prev[5] === 'locked' ? 'todo' : prev[5] }))
    track('post_interview_review_generated', 'mock_interview', '生成面后复盘', 4)
  }

  function buySevenDayPlan() {
    setStage('seven_day_user')
    track('seven_day_purchased', 'seven_day_plan', '购买 7 天陪跑')
  }

  function generateDay7Review() {
    setStage('upgrade_candidate')
    track('day7_review_completed', 'day7_review', '生成 Day7 复盘', 7)
    track('day7_upgrade_recommended', 'day7_review', '推荐 14 天升级', 7)
  }

  return (
    <main className="min-h-screen bg-[#efeae2] text-slate-900">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white/90 px-5 py-4 shadow-sm">
          <Link href="/" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
            ← WTT
          </Link>
          <div className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            P0：7 天短闭环 MVP
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">软件开发求职上岸助手</p>
            <h1 className="max-w-3xl text-3xl font-bold leading-tight text-slate-950 sm:text-5xl">
              7 天内更敢投、更会讲项目、更接近面试机会
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
              第一版只跑短闭环：诊断 → 简历初评 → 模拟面试复盘 → 7 天陪跑 → Day7 复盘。14 天只在 Day7 后作为升级判断出现。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={startDiagnosis}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
              >
                开始求职诊断 <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={completeResumeReview}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                上传简历初评
              </button>
              <button
                type="button"
                onClick={completeMockInterview}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                预约模拟面试
              </button>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <BarChart3 className="h-4 w-4 text-indigo-600" /> 当前状态
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Lifecycle</p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{stage}</p>
            </div>
            <div className="mt-4 rounded-2xl bg-indigo-50 p-4">
              <p className="text-xs text-indigo-700">7 天进度</p>
              <p className="mt-1 text-2xl font-bold text-indigo-900">{completedDays}/7</p>
              <p className="mt-1 text-sm text-indigo-800">当前推进到 Day{currentDay}</p>
            </div>
            <button
              type="button"
              onClick={buySevenDayPlan}
              className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              进入 7 天陪跑
            </button>
          </aside>
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-3">
          {['简历没人看', '项目讲不清', '面试不过'].map((pain) => (
            <button
              key={pain}
              type="button"
              onClick={() => {
                setSelectedPain(pain)
                track('home_pain_point_selected', 'job_hunt_home', pain)
              }}
              className={`rounded-3xl border p-5 text-left transition ${
                selectedPain === pain ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <p className="text-sm font-semibold text-slate-900">{pain}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">选择后进入对应 P0 路径，不扩成题库、社区或岗位推荐。</p>
            </button>
          ))}
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <Card icon={<Target className="h-5 w-5" />} title="求职诊断">
            <p className="text-sm leading-6 text-slate-600">目标岗位：前端 / 后端 / AI 应用开发；当前卡点：{selectedPain}。</p>
            <ResultLine label="输出" value="阶段判断、核心短板、7 天优先级" />
            <ActionButton onClick={startDiagnosis}>完成诊断</ActionButton>
          </Card>

          <Card icon={<FileText className="h-5 w-5" />} title="简历初评">
            <p className="text-sm leading-6 text-slate-600">围绕岗位匹配、项目表达、技术可信度、结果量化输出问题清单。</p>
            <ResultLine label="输出" value="三个最大修改问题 + 下一步 CTA" />
            <ActionButton onClick={completeResumeReview}>标记简历初评完成</ActionButton>
          </Card>

          <Card icon={<MessageSquareText className="h-5 w-5" />} title="模拟面试 + 面后复盘">
            <p className="text-sm leading-6 text-slate-600">记录问题、回答、追问和表现备注，复盘为什么没过、怎么改。</p>
            <ResultLine label="输出" value="项目表达、技术短板、沟通表现、修正计划" />
            <ActionButton onClick={completeMockInterview}>生成面后复盘</ActionButton>
          </Card>

          <Card icon={<Briefcase className="h-5 w-5" />} title="Day7 复盘">
            <p className="text-sm leading-6 text-slate-600">汇总 7 天产出，判断继续投递、补短板，还是推荐 14 天升级。</p>
            <ResultLine label="约束" value="14 天只在 Day7 后出现，不进 P0 主入口" />
            <ActionButton disabled={!readyForDay7} onClick={generateDay7Review}>
              {readyForDay7 ? '生成 Day7 复盘' : '完成 Day1-Day7 后生成'}
            </ActionButton>
          </Card>
        </section>

        <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-950">7 天陪跑任务线</h2>
              <p className="mt-1 text-sm text-slate-600">每天都有任务、产出物、完成状态；Day5 是可选增强，不阻塞 Day6。</p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Day{currentDay}</div>
          </div>
          <div className="grid gap-3">
            {sevenDayTasks.map((task) => {
              const status = taskStatus[task.day]
              return (
                <div key={task.day} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-700">Day{task.day}</span>
                      <h3 className="font-semibold text-slate-950">{task.title}</h3>
                      {task.optional ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">可选增强</span> : null}
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">{statusLabel(status)}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{task.description}</p>
                    <p className="mt-1 text-sm text-slate-800"><span className="font-semibold">产出：</span>{task.deliverable}</p>
                  </div>
                  <div className="mt-4 flex gap-2 sm:mt-0">
                    <button
                      type="button"
                      disabled={status === 'locked' || status === 'done'}
                      onClick={() => markDoing(task.day)}
                      className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      开始
                    </button>
                    <button
                      type="button"
                      disabled={status === 'locked' || status === 'done'}
                      onClick={() => completeTask(task.day)}
                      className="rounded-2xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      完成
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Card icon={<TrendingUp className="h-5 w-5" />} title="Day7 结论">
            <div className="space-y-3 text-sm leading-6 text-slate-700">
              <p><span className="font-semibold">更敢投：</span>{completedDays >= 6 ? '已有投递计划与简历状态反馈。' : '需要先完成 Day6 投递策略。'}</p>
              <p><span className="font-semibold">更会讲项目：</span>{completedDays >= 4 ? '已有项目表达与面试复盘。' : '需要先完成项目表达和模拟面试。'}</p>
              <p><span className="font-semibold">更接近面试机会：</span>{completedDays >= 7 ? '可进入 Day7 复盘，判断是否升级。' : '继续完成每日任务。'}</p>
              {upgradeCandidate ? (
                <div className="rounded-2xl bg-indigo-50 p-4 text-indigo-900">
                  推荐 14 天升级：用户已完成短闭环，适合继续放大成果；不升级时也给出自助行动计划。
                </div>
              ) : null}
            </div>
          </Card>

          <Card icon={<ClipboardCheck className="h-5 w-5" />} title="P0 埋点流">
            <div className="max-h-72 overflow-auto rounded-2xl bg-slate-950 p-4 font-mono text-xs text-slate-100">
              {events.map((event, index) => (
                <div key={`${event.createdAt}-${index}`} className="mb-2 border-b border-slate-800 pb-2 last:border-0">
                  <span className="text-indigo-300">{event.eventName}</span>
                  <span className="text-slate-500"> · {event.sourcePage}</span>
                  {event.cta ? <span className="text-slate-400"> · {event.cta}</span> : null}
                  {event.day ? <span className="text-slate-400"> · Day{event.day}</span> : null}
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </main>
  )
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-950">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  )
}

function ResultLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
      <span className="font-semibold text-slate-950">{label}：</span>{value}
    </div>
  )
}

function ActionButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <CheckCircle2 className="h-4 w-4" />
      {children}
    </button>
  )
}
