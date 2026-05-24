import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import { listChallenges } from '@/lib/arena/store'
import { challengesForSection, childSections, getArenaSection, sectionStats } from '@/lib/arena/sections'
import { getAgentTutorialChapter, getAgentTutorialGuide, type AgentTutorialSection } from '@/lib/arena/agent-tutorials'
import { c9Universities, doubleFirstClassUniversities, project211Universities, project985Universities, strongNon985211ByProvince, universityFactProfiles } from '@/lib/arena/gaokao-knowledge'
import { normalizeMarkdownMath } from '@/lib/markdown-math'

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

function tutorialSectionMarkdown(section: AgentTutorialSection) {
  const commands = section.commands?.length
    ? `\n\n\`\`\`bash\n${section.commands.join('\n')}\n\`\`\``
    : ''
  return `${section.body}${commands}`
}

function TutorialMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="max-w-none text-[15px] leading-8 text-gray-300 [&_.katex-display]:my-5 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_a]:text-[#3ce8e2] [&_a]:underline [&_blockquote]:my-5 [&_blockquote]:border-l-4 [&_blockquote]:border-[#3ce8e2]/50 [&_blockquote]:bg-[#3ce8e2]/5 [&_blockquote]:px-4 [&_blockquote]:py-2 [&_code]:rounded [&_code]:bg-black/40 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-cyan-100 [&_h1]:mt-8 [&_h1]:text-3xl [&_h1]:font-black [&_h1]:text-white [&_h2]:mt-7 [&_h2]:text-2xl [&_h2]:font-black [&_h2]:text-white [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-white [&_hr]:my-8 [&_hr]:border-gray-800 [&_img]:my-6 [&_img]:max-w-full [&_img]:rounded-xl [&_img]:border [&_img]:border-gray-800 [&_li]:ml-5 [&_li]:list-disc [&_ol>li]:list-decimal [&_p]:my-3 [&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-gray-800 [&_pre]:bg-black/60 [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-800 [&_td]:p-3 [&_th]:border [&_th]:border-gray-800 [&_th]:bg-gray-900 [&_th]:p-3 [&_th]:text-left">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
        {normalizeMarkdownMath(markdown)}
      </ReactMarkdown>
    </div>
  )
}

export default function ArenaSectionPage({ params }: { params: { slug: string } }) {
  const section = getArenaSection(params.slug)
  if (!section) notFound()

  const challenges = listChallenges()
  const children = childSections(section.slug)
  const rows = challengesForSection(challenges, section.slug)
  const stats = sectionStats(challenges, section.slug)
  const isGaokaoVolunteer = section.slug === 'gaokao-volunteer'
  const tutorialGuide = getAgentTutorialGuide(section.slug)
  const tutorialChapter = getAgentTutorialChapter(section.slug)
  const isTutorial = Boolean(tutorialGuide || tutorialChapter)

  return (
    <main className="min-h-[100dvh] bg-[#151515] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/3 top-[-18rem] h-[34rem] w-[34rem] rounded-full bg-[#3ce8e2]/10 blur-3xl" />
        <div className="absolute bottom-[-16rem] right-[-12rem] h-[32rem] w-[32rem] rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <section className={`relative mx-auto px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-8 ${isTutorial ? 'max-w-[1800px]' : 'max-w-7xl'}`}>
        <nav className={`flex flex-wrap items-center justify-between gap-3 ${isTutorial ? 'mb-5 lg:mb-6' : 'mb-8 lg:mb-12'}`}>
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link href="/arena" className="shrink-0 bg-gradient-to-r from-[#3ce8e2] to-[#00b3b3] bg-clip-text text-xl font-black text-transparent sm:text-2xl">WTT 终生学习</Link>
            <span className="text-gray-700">/</span>
            <span className="truncate text-sm font-bold text-gray-400">{section.titleZh}</span>
          </div>
          <Link href="/arena" className="rounded-md border border-gray-800 bg-[#1e1e1e] px-3 py-2 text-xs font-bold text-gray-300 hover:border-[#3ce8e2] hover:text-[#3ce8e2] sm:px-4 sm:text-sm">返回板块</Link>
        </nav>

        <header className={`overflow-hidden border border-gray-800 bg-[#1b1b1b] ${isTutorial ? 'mb-4 rounded-xl p-4 sm:mb-5 sm:p-5 lg:mb-6' : 'mb-6 rounded-2xl p-5 sm:mb-8 sm:p-6 lg:mb-10 lg:rounded-3xl lg:p-8'}`}>
          <div className={`mb-6 h-1.5 w-28 rounded-full bg-gradient-to-r ${section.accent}`} />
          <p className="text-xs font-black uppercase tracking-[0.26em] text-[#3ce8e2]">{section.eyebrow}</p>
          <div className={`mt-4 grid gap-5 ${isTutorial ? '' : 'lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end xl:grid-cols-[minmax(0,1fr)_360px]'}`}>
            <div>
              <h1 className={`font-black tracking-tight text-white ${isTutorial ? 'text-3xl sm:text-4xl lg:text-5xl' : 'text-3xl sm:text-4xl lg:text-5xl xl:text-6xl'}`}>{section.titleZh}</h1>
              <p className={`mt-3 text-base leading-7 text-gray-400 ${isTutorial ? 'max-w-6xl' : 'max-w-3xl lg:mt-5 lg:text-lg lg:leading-8'}`}>{section.descriptionZh}</p>
            </div>
            {!isTutorial && <div className="grid grid-cols-4 gap-2 text-center text-xs sm:text-sm">
              <div className="rounded-xl border border-gray-800 bg-[#151515] p-3 lg:p-4"><p className="text-xl font-black text-white lg:text-2xl">{tutorialGuide ? tutorialGuide.chapters.length : tutorialChapter ? tutorialChapter.chapter.sections.length : isGaokaoVolunteer ? 'Ask' : stats.total}</p><p className="text-gray-500">{tutorialGuide ? '章节' : tutorialChapter ? '小节' : isGaokaoVolunteer ? '咨询' : '题目'}</p></div>
              <div className="rounded-xl border border-gray-800 bg-[#151515] p-3 lg:p-4"><p className="text-xl font-black text-emerald-300 lg:text-2xl">{tutorialGuide || tutorialChapter ? '官方' : isGaokaoVolunteer ? c9Universities.length : stats.easy}</p><p className="text-gray-500">{tutorialGuide || tutorialChapter ? 'Docs' : isGaokaoVolunteer ? 'C9' : 'Easy'}</p></div>
              <div className="rounded-xl border border-gray-800 bg-[#151515] p-3 lg:p-4"><p className="text-xl font-black text-yellow-300 lg:text-2xl">{tutorialGuide || tutorialChapter ? '中文' : isGaokaoVolunteer ? project985Universities.length : stats.medium}</p><p className="text-gray-500">{tutorialGuide || tutorialChapter ? 'CN' : isGaokaoVolunteer ? '985' : 'Medium'}</p></div>
              <div className="rounded-xl border border-gray-800 bg-[#151515] p-3 lg:p-4"><p className="text-xl font-black text-rose-300 lg:text-2xl">{tutorialGuide || tutorialChapter ? '实践' : isGaokaoVolunteer ? project211Universities.length : stats.hard}</p><p className="text-gray-500">{tutorialGuide || tutorialChapter ? '命令' : isGaokaoVolunteer ? '211' : 'Hard'}</p></div>
            </div>}
          </div>
        </header>

        <div className={isTutorial ? 'block' : 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-8'}>
          {tutorialGuide ? (
            <article className="overflow-hidden rounded-2xl border border-gray-800 bg-[#1e1e1e]">
              <div className={`h-1.5 w-full bg-gradient-to-r ${tutorialGuide.accent}`} />
              <div className="border-b border-gray-800 bg-[#151515] p-4 sm:p-5 lg:p-6">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#3ce8e2]">{tutorialGuide.eyebrow}</p>
                <h2 className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">{tutorialGuide.titleZh}</h2>
                <p className="mt-3 max-w-6xl text-base leading-7 text-gray-400">{tutorialGuide.descriptionZh}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-gray-400">
                  <span className="rounded-full border border-gray-700 bg-[#1e1e1e] px-3 py-1">{tutorialGuide.chapters.length} 章</span>
                  <span className="rounded-full border border-gray-700 bg-[#1e1e1e] px-3 py-1">Markdown 渲染</span>
                  <span className="rounded-full border border-gray-700 bg-[#1e1e1e] px-3 py-1">支持公式 / 表格 / 图片</span>
                  <span className="rounded-full border border-gray-700 bg-[#1e1e1e] px-3 py-1">目录跳转</span>
                  <a href={tutorialGuide.docsHref} target="_blank" rel="noreferrer" className="rounded-full border border-[#3ce8e2]/30 bg-[#3ce8e2]/10 px-3 py-1 font-black text-[#3ce8e2] hover:border-[#3ce8e2]">官方文档 ↗</a>
                </div>
              </div>

              <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:p-6 xl:grid-cols-[300px_minmax(0,1fr)]">
                <nav className="rounded-xl border border-gray-800 bg-[#151515] p-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">目录</p>
                  <div className="mt-3 space-y-2">
                    {tutorialGuide.chapters.map((chapter, index) => (
                      <a key={chapter.slug} href={`#chapter-${chapter.slug}`} className="block rounded-lg px-2 py-1.5 text-sm leading-5 text-gray-400 hover:bg-[#1e1e1e] hover:text-[#3ce8e2]">
                        {String(index + 1).padStart(2, '0')} · {chapter.titleZh.replace(/^\d+｜/, '')}
                      </a>
                    ))}
                  </div>
                </nav>

                <div className="space-y-12">
                  {tutorialGuide.chapters.map((chapter, chapterIndex) => (
                    <section key={chapter.slug} id={`chapter-${chapter.slug}`} className="scroll-mt-8 border-b border-gray-800 pb-12 last:border-b-0 last:pb-0">
                      <div className="mb-6">
                        <p className="font-mono text-sm font-black text-[#3ce8e2]">{String(chapterIndex + 1).padStart(2, '0')} / {tutorialGuide.chapters.length}</p>
                        <h3 className="mt-2 text-2xl font-black leading-tight text-white sm:text-3xl">{chapter.titleZh}</h3>
                        <p className="mt-3 text-[15px] leading-8 text-gray-400">{chapter.descriptionZh}</p>
                        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
                          <span className="rounded-full border border-gray-700 bg-[#151515] px-3 py-1 text-gray-400">官方章节：{chapter.eyebrow}</span>
                          <a href={chapter.sourceUrl} target="_blank" rel="noreferrer" className="rounded-full border border-[#3ce8e2]/30 bg-[#3ce8e2]/10 px-3 py-1 font-black text-[#3ce8e2] hover:border-[#3ce8e2]">来源：{chapter.sourceLabel} ↗</a>
                          <Link href={`/arena/sections/${tutorialGuide.slug}-${chapter.slug}`} className="rounded-full border border-gray-700 bg-[#151515] px-3 py-1 text-gray-300 hover:border-[#3ce8e2] hover:text-[#3ce8e2]">单章阅读</Link>
                        </div>
                      </div>

                      <div className="space-y-9">
                        {chapter.sections.map((item, sectionIndex) => (
                          <section key={`${chapter.slug}-${item.heading}`} id={`chapter-${chapter.slug}-section-${sectionIndex + 1}`} className="scroll-mt-8">
                            <div className="mb-2 flex items-center gap-3">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#3ce8e2] text-xs font-black text-black">{sectionIndex + 1}</span>
                              <h4 className="text-xl font-black text-white">{item.heading}</h4>
                            </div>
                            <TutorialMarkdown markdown={tutorialSectionMarkdown(item)} />
                          </section>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-800 bg-[#151515] p-4 sm:p-5 lg:p-6">
                <div className="rounded-xl border border-[#3ce8e2]/20 bg-[#3ce8e2]/5 p-4 text-sm leading-6 text-gray-300">
                  本教程为官方文档的中文化学习整理，覆盖章节结构、关键概念、实践命令和使用边界。官方完整原文请以来源链接为准。
                </div>
              </div>
            </article>
          ) : tutorialChapter ? (
            <article className="overflow-hidden rounded-2xl border border-gray-800 bg-[#1e1e1e]">
              <div className={`h-1.5 w-full bg-gradient-to-r ${tutorialChapter.guide.accent}`} />
              <div className="border-b border-gray-800 bg-[#151515] p-4 sm:p-5 lg:p-6">
                <Link href={`/arena/sections/${tutorialChapter.guide.slug}`} className="text-xs font-black uppercase tracking-[0.22em] text-[#3ce8e2] hover:underline">
                  {tutorialChapter.guide.titleZh}
                </Link>
                <h2 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">{tutorialChapter.chapter.titleZh}</h2>
                <p className="mt-4 max-w-6xl text-base leading-8 text-gray-400">{tutorialChapter.chapter.descriptionZh}</p>
                <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-gray-400">
                  <span className="rounded-full border border-gray-700 bg-[#1e1e1e] px-3 py-1">官方章节：{tutorialChapter.chapter.eyebrow}</span>
                  <span className="rounded-full border border-gray-700 bg-[#1e1e1e] px-3 py-1">{tutorialChapter.chapter.sections.length} 个小节</span>
                  <span className="rounded-full border border-gray-700 bg-[#1e1e1e] px-3 py-1">Markdown 渲染</span>
                </div>
              </div>

              <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:p-6 xl:grid-cols-[280px_minmax(0,1fr)]">
                <nav className="rounded-xl border border-gray-800 bg-[#151515] p-4 lg:sticky lg:top-6 lg:self-start">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">目录</p>
                  <div className="mt-3 space-y-2">
                    {tutorialChapter.chapter.sections.map((item, index) => (
                      <a key={item.heading} href={`#section-${index + 1}`} className="block text-sm leading-5 text-gray-400 hover:text-[#3ce8e2]">
                        {index + 1}. {item.heading}
                      </a>
                    ))}
                  </div>
                </nav>

                <div className="space-y-9">
                  {tutorialChapter.chapter.sections.map((item, index) => (
                    <section key={item.heading} id={`section-${index + 1}`} className="scroll-mt-8 border-b border-gray-800 pb-9 last:border-b-0 last:pb-0">
                      <div className="mb-2 flex items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#3ce8e2] text-xs font-black text-black">{index + 1}</span>
                        <h3 className="text-xl font-black text-white">{item.heading}</h3>
                      </div>
                      <TutorialMarkdown markdown={tutorialSectionMarkdown(item)} />
                    </section>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-800 bg-[#151515] p-4 sm:p-5 lg:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#3ce8e2]/20 bg-[#3ce8e2]/5 p-4 text-sm">
                  <span className="font-semibold text-gray-300">本页为官方教程中文化整理，保留实践命令和来源链接，不是官方文档逐字复制。</span>
                  <a href={tutorialChapter.chapter.sourceUrl} target="_blank" rel="noreferrer" className="font-black text-[#3ce8e2] hover:underline">官方来源：{tutorialChapter.chapter.sourceLabel} →</a>
                </div>
              </div>
            </article>
          ) : isGaokaoVolunteer ? (
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
            <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {children.map((child) => {
                const childStats = sectionStats(challenges, child.slug)
                return (
                  <Link key={child.slug} href={child.href} className="group overflow-hidden rounded-2xl border border-gray-800 bg-[#1b1b1b] p-5 transition hover:-translate-y-1 hover:border-[#3ce8e2]/40 hover:bg-[#202020] lg:p-6">
                    <div className={`mb-5 h-1.5 w-24 rounded-full bg-gradient-to-r ${child.accent}`} />
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">{child.eyebrow}</p>
                    <h3 className="mt-3 text-2xl font-black text-white group-hover:text-[#3ce8e2]">{child.titleZh}</h3>
                    <p className="mt-4 min-h-[54px] text-sm leading-6 text-gray-400 lg:min-h-[72px]">{child.descriptionZh}</p>
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
              <div className="hidden grid-cols-[1fr_96px_96px_96px] border-b border-gray-800 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 md:grid xl:grid-cols-[1fr_120px_120px_120px] xl:px-5">
                <span>Problem</span>
                <span>Type</span>
                <span>Difficulty</span>
                <span className="text-right">Action</span>
              </div>
              {rows.map((challenge, index) => (
                <Link key={challenge.id} href={`/arena/challenges/${challenge.slug}`} className="group grid grid-cols-1 gap-3 border-b border-gray-800/70 px-4 py-4 transition-colors last:border-b-0 hover:bg-[#252525] md:grid-cols-[minmax(0,1fr)_96px_96px_96px] md:items-center xl:grid-cols-[minmax(0,1fr)_120px_120px_120px] xl:px-5">
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
                  <span className="text-sm font-semibold text-[#3ce8e2] md:text-right">进入 →</span>
                </Link>
              ))}
            </section>
          )}

          {!isTutorial && <aside className="space-y-4">
            <div className="rounded-xl border border-gray-800 bg-[#1e1e1e] p-5">
              <h2 className="font-black text-white">来源参考</h2>
              <p className="mt-2 text-sm leading-6 text-gray-400">题面按终生学习训练口径重写，板块选题参考以下公开来源方向。</p>
              <div className="mt-4 space-y-2">
                {section.sources.map((source) => (
                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-gray-800 bg-[#151515] px-3 py-2 text-sm text-gray-300 hover:border-[#3ce8e2] hover:text-[#3ce8e2]">
                    {source.label} ↗
                  </a>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-[#1e1e1e] p-5">
              <h2 className="font-black text-white">{tutorialGuide || tutorialChapter ? '教程说明' : '使用方式'}</h2>
              {tutorialGuide || tutorialChapter ? (
                <ul className="mt-3 space-y-3 text-sm leading-6 text-gray-400">
                  <li>• 与技术、教育、高考并列，作为一级学习板块。</li>
                  <li>• 每章按官方文档中文化改写，并附官方来源链接。</li>
                  <li>• 命令块保留可直接复制的最小操作路径。</li>
                  <li>• 安装和绑定章节会单独说明如何接入本地 Agent 和云端 Agent。</li>
                </ul>
              ) : (
                <ul className="mt-3 space-y-3 text-sm leading-6 text-gray-400">
                  <li>• Judge 题：进入后可用 Python/C/C++ 提交给 Agent Runner。</li>
                  <li>• Coach 题：进入后直接用右侧学习 Coach 做苏格拉底、答题点评或 Ask 问答。</li>
                  <li>• 白板会根据 Agent 回答同步生成图表、公式和解题结构。</li>
                  <li>• 隐藏测试和上下文注入仍保持脱敏。</li>
                </ul>
              )}
            </div>
          </aside>}
        </div>
      </section>
    </main>
  )
}
