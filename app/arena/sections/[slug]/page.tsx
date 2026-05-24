import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { PremiumGate } from '@/components/billing/premium-gate'
import { listChallenges } from '@/lib/arena/store'
import { challengesForSection, childSections, getArenaSection, isPremiumArenaSection, sectionStats } from '@/lib/arena/sections'
import { c9Universities, doubleFirstClassUniversities, project211Universities, project985Universities, strongNon985211ByProvince, universityFactProfiles } from '@/lib/arena/gaokao-knowledge'

function difficultyTone(difficulty: string) {
  if (difficulty === 'easy') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
  if (difficulty === 'medium') return 'border-yellow-400/20 bg-yellow-400/10 text-yellow-300'
  return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
}

function typeLabel(type: string) {
  if (type === 'qa') return 'Coach'
  if (type === 'project') return 'Project'
  return 'Judge'
}

export default function ArenaSectionPage({ params }: { params: { slug: string } }) {
  const section = getArenaSection(params.slug)
  if (!section) notFound()

  const challenges = listChallenges()
  const children = childSections(section.slug)
  const rows = challengesForSection(challenges, section.slug)
  const stats = sectionStats(challenges, section.slug)
  const isGaokaoVolunteer = section.slug === 'gaokao-volunteer'
  const isPremiumSection = isPremiumArenaSection(section.slug)
  const maybeGate = (content: ReactNode) => (
    isPremiumSection
      ? <PremiumGate>{content}</PremiumGate>
      : <>{content}</>
  )

  return (
    <main className="min-h-screen bg-[#151515] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/3 top-[-18rem] h-[34rem] w-[34rem] rounded-full bg-[#3ce8e2]/10 blur-3xl" />
        <div className="absolute bottom-[-16rem] right-[-12rem] h-[32rem] w-[32rem] rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <section className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <nav className="mb-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/arena" className="bg-gradient-to-r from-[#3ce8e2] to-[#00b3b3] bg-clip-text text-2xl font-black text-transparent">WTT Arena</Link>
            <span className="text-gray-700">/</span>
            <span className="text-sm font-bold text-gray-400">{section.titleZh}</span>
          </div>
          <Link href="/arena" className="rounded-md border border-gray-800 bg-[#1e1e1e] px-4 py-2 text-sm font-bold text-gray-300 hover:border-[#3ce8e2] hover:text-[#3ce8e2]">返回板块</Link>
        </nav>

        <header className="mb-10 overflow-hidden rounded-3xl border border-gray-800 bg-[#1b1b1b] p-8">
          <div className={`mb-6 h-1.5 w-28 rounded-full bg-gradient-to-r ${section.accent}`} />
          <p className="text-xs font-black uppercase tracking-[0.26em] text-[#3ce8e2]">{section.eyebrow}</p>
          <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-white md:text-6xl">{section.titleZh}</h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-400">{section.descriptionZh}</p>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-sm">
              <div className="rounded-xl border border-gray-800 bg-[#151515] p-4"><p className="text-2xl font-black text-white">{isGaokaoVolunteer ? 'Ask' : stats.total}</p><p className="text-gray-500">{isGaokaoVolunteer ? '咨询' : '题目'}</p></div>
              <div className="rounded-xl border border-gray-800 bg-[#151515] p-4"><p className="text-2xl font-black text-emerald-300">{isGaokaoVolunteer ? c9Universities.length : stats.easy}</p><p className="text-gray-500">{isGaokaoVolunteer ? 'C9' : 'Easy'}</p></div>
              <div className="rounded-xl border border-gray-800 bg-[#151515] p-4"><p className="text-2xl font-black text-yellow-300">{isGaokaoVolunteer ? project985Universities.length : stats.medium}</p><p className="text-gray-500">{isGaokaoVolunteer ? '985' : 'Medium'}</p></div>
              <div className="rounded-xl border border-gray-800 bg-[#151515] p-4"><p className="text-2xl font-black text-rose-300">{isGaokaoVolunteer ? project211Universities.length : stats.hard}</p><p className="text-gray-500">{isGaokaoVolunteer ? '211' : 'Hard'}</p></div>
            </div>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          {maybeGate(isGaokaoVolunteer ? (
            <section className="space-y-6">
              <div className="rounded-xl border border-blue-400/20 bg-[#1e1e1e] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-black text-white">高考志愿咨询入口</h2>
                    <p className="mt-2 text-sm leading-6 text-gray-400">这里不是刷题 Problem。进入后只保留 Ask 咨询，Agent 会读取本地院校知识库和当前咨询上下文。</p>
                  </div>
                  {rows[0] && (
                    <Link href={`/arena/challenges/${rows[0].slug}`} className="rounded-md bg-[#3ce8e2] px-4 py-2 text-sm font-black text-black hover:opacity-90">开始咨询 →</Link>
                  )}
                </div>
              </div>

              {[
                ['C9 联盟', c9Universities],
                ['985 工程高校', project985Universities],
                ['211 工程高校', project211Universities],
                ['第二轮双一流建设高校（本地名单）', doubleFirstClassUniversities],
              ].map(([title, list]) => (
                <div key={title as string} className="rounded-xl border border-gray-800 bg-[#1e1e1e] p-5">
                  <h2 className="font-black text-white">{title as string} <span className="text-sm text-gray-500">({(list as string[]).length})</span></h2>
                  <div className="mt-4 flex max-h-44 flex-wrap gap-2 overflow-y-auto pr-1">
                    {(list as string[]).map((name) => <span key={name} className="rounded-md border border-gray-800 bg-[#151515] px-2.5 py-1 text-xs text-gray-300">{name}</span>)}
                  </div>
                </div>
              ))}

              <div className="rounded-xl border border-gray-800 bg-[#1e1e1e] p-5">
                <h2 className="font-black text-white">各省非 985/211 强势大学</h2>
                <p className="mt-2 text-sm leading-6 text-gray-400">用于冲稳保补充判断，不代表一定优于 985/211；专业强度、城市机会和就业路径要一起看。</p>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {strongNon985211ByProvince.map((group) => (
                    <div key={group.province} className="rounded-lg border border-gray-800 bg-[#151515] p-4">
                      <h3 className="font-bold text-[#3ce8e2]">{group.province}</h3>
                      <div className="mt-3 space-y-2 text-sm text-gray-300">
                        {group.universities.map((item) => (
                          <p key={item.name}><span className="font-bold text-white">{item.name}</span>：{item.strengths.join(' / ')}</p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-800 bg-[#1e1e1e] p-5">
                <h2 className="font-black text-white">已索引院校事实包</h2>
                <p className="mt-2 text-sm leading-6 text-gray-400">经费、就业、师资、分数线只引用有来源的字段；缺失字段会让 Agent 标为“待核验”。</p>
                <div className="mt-4 grid gap-3">
                  {universityFactProfiles.map((item) => (
                    <div key={item.name} className="rounded-lg border border-gray-800 bg-[#151515] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-black text-white">{item.name}</h3>
                        {item.tiers.map((tier) => <span key={tier} className="rounded-full border border-blue-400/20 bg-blue-400/10 px-2 py-0.5 text-[11px] font-bold text-blue-200">{tier}</span>)}
                      </div>
                      <p className="mt-2 text-sm text-gray-400">强项：{item.strengths.join('、')}</p>
                      <div className="mt-3 grid gap-2 text-xs leading-5 text-gray-400 md:grid-cols-2">
                        <p>经费：{item.budget?.fact || '待核验预算/决算公开'}</p>
                        <p>就业：{item.employment?.fact || '待核验就业质量报告'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : children.length > 0 ? (
            <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {children.map((child) => {
                const childStats = sectionStats(challenges, child.slug)
                return (
                  <Link key={child.slug} href={child.href} className="group overflow-hidden rounded-2xl border border-gray-800 bg-[#1b1b1b] p-6 transition hover:-translate-y-1 hover:border-[#3ce8e2]/40 hover:bg-[#202020]">
                    <div className={`mb-5 h-1.5 w-24 rounded-full bg-gradient-to-r ${child.accent}`} />
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">{child.eyebrow}</p>
                    <h3 className="mt-3 text-2xl font-black text-white group-hover:text-[#3ce8e2]">{child.titleZh}</h3>
                    <p className="mt-4 min-h-[72px] text-sm leading-6 text-gray-400">{child.descriptionZh}</p>
                    <div className="mt-6 grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="rounded-lg border border-gray-800 bg-[#151515] p-3"><p className="text-lg font-black text-white">{childStats.total}</p><p className="text-gray-500">题</p></div>
                      <div className="rounded-lg border border-gray-800 bg-[#151515] p-3"><p className="text-lg font-black text-emerald-300">{childStats.easy}</p><p className="text-gray-500">Easy</p></div>
                      <div className="rounded-lg border border-gray-800 bg-[#151515] p-3"><p className="text-lg font-black text-yellow-300">{childStats.medium}</p><p className="text-gray-500">Med</p></div>
                      <div className="rounded-lg border border-gray-800 bg-[#151515] p-3"><p className="text-lg font-black text-rose-300">{childStats.hard}</p><p className="text-gray-500">Hard</p></div>
                    </div>
                    <div className="mt-6 text-right text-sm font-black text-[#3ce8e2]">进入 →</div>
                  </Link>
                )
              })}
            </section>
          ) : (
            <section className="overflow-hidden rounded-xl border border-gray-800 bg-[#1e1e1e]">
              <div className="grid grid-cols-[1fr_120px_120px_120px] border-b border-gray-800 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <span>Problem</span>
                <span>Type</span>
                <span>Difficulty</span>
                <span className="text-right">Action</span>
              </div>
              {rows.map((challenge, index) => (
                <Link key={challenge.id} href={`/arena/challenges/${challenge.slug}`} className="group grid grid-cols-[1fr_120px_120px_120px] items-center border-b border-gray-800/70 px-5 py-4 transition-colors last:border-b-0 hover:bg-[#252525]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-gray-500">{String(index + 1).padStart(2, '0')}</span>
                      <h3 className="truncate text-base font-bold text-white group-hover:text-[#3ce8e2]">{challenge.title}</h3>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 pl-9">
                      {challenge.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded bg-[#151515] px-2 py-0.5 text-xs text-gray-400">{tag}</span>)}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-300">{typeLabel(challenge.challenge_type)}</span>
                  <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${difficultyTone(challenge.difficulty)}`}>{challenge.difficulty}</span>
                  <span className="text-right text-sm font-semibold text-[#3ce8e2]">进入 →</span>
                </Link>
              ))}
            </section>
          ))}

          <aside className="space-y-4">
            <div className="rounded-xl border border-gray-800 bg-[#1e1e1e] p-5">
              <h2 className="font-black text-white">来源参考</h2>
              <p className="mt-2 text-sm leading-6 text-gray-400">题面按 WTT Arena 口径重写，板块选题参考以下公开来源方向。</p>
              <div className="mt-4 space-y-2">
                {section.sources.map((source) => (
                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-gray-800 bg-[#151515] px-3 py-2 text-sm text-gray-300 hover:border-[#3ce8e2] hover:text-[#3ce8e2]">
                    {source.label} ↗
                  </a>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-[#1e1e1e] p-5">
              <h2 className="font-black text-white">使用方式</h2>
              <ul className="mt-3 space-y-3 text-sm leading-6 text-gray-400">
                <li>• Judge 题：进入后可用 Python/C/C++ 提交给 Agent Runner。</li>
                <li>• Coach 题：进入后直接用右侧 Arena Coach 做苏格拉底、答题点评或 Ask 问答。</li>
                <li>• 白板会根据 Agent 回答同步生成图表、公式和解题结构。</li>
                <li>• 隐藏测试和上下文注入仍保持脱敏。</li>
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
