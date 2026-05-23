import Link from 'next/link'
import { listChallenges } from '@/lib/arena/store'
import { rootArenaSections, sectionStats } from '@/lib/arena/sections'

function difficultyTone(difficulty: string) {
  if (difficulty === 'easy') return 'text-emerald-300'
  if (difficulty === 'medium') return 'text-yellow-300'
  return 'text-rose-300'
}

export default function ArenaPage() {
  const challenges = listChallenges()
  const sections = rootArenaSections()
  const total = challenges.length
  const technologyCount = sectionStats(challenges, 'technology').total
  const educationCount = sectionStats(challenges, 'education').total
  const featured = challenges.filter((challenge) => [
    'ai-vector-add',
    'ai-gemm',
    'ai-softmax-attention',
    'ai-interview-pretraining-data-mixture',
    'ai-interview-runtime-continuous-batching',
    'ai-interview-npu-gpgpu-attention-kernel',
    'education-primary-math-number-classic',
    'education-junior-physics-mechanics-classic',
    'education-senior-math-function-classic',
  ].includes(challenge.slug))

  return (
    <main className="min-h-[100dvh] bg-[#151515] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-18rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[#3ce8e2]/10 blur-3xl" />
        <div className="absolute bottom-[-16rem] right-[-12rem] h-[32rem] w-[32rem] rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <section className="relative mx-auto max-w-7xl px-3 py-6 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
        <nav className="mb-10 flex flex-wrap items-center justify-between gap-3 sm:mb-14 lg:mb-20">
          <Link href="/arena" className="bg-gradient-to-r from-[#3ce8e2] via-[#00b3b3] to-[#3ce8e2] bg-clip-text text-2xl font-black tracking-tight text-transparent sm:text-3xl">
            WTT Arena
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-400 sm:gap-4 lg:gap-5">
            <a href="#sections" className="hidden transition-colors hover:text-[#3ce8e2] sm:inline">Boards</a>
            <a href="#featured" className="hidden transition-colors hover:text-[#3ce8e2] sm:inline">Featured</a>
            <Link href="/feed" className="transition-colors hover:text-[#3ce8e2]">Discuss</Link>
            <Link href="/arena/sections/ai-kernel" className="rounded-md bg-gradient-to-r from-[#2ee6e3] to-[#00b3b3] px-3 py-2 text-xs font-black text-black transition-opacity hover:opacity-90 sm:px-4 sm:text-sm">
              进入 AI Kernel
            </Link>
          </div>
        </nav>

        <div className="mb-10 text-center sm:mb-12 lg:mb-16">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#3ce8e2]/20 bg-[#3ce8e2]/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#3ce8e2] sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.26em]">
            先选板块 · 再刷题 · Agent Runner / Coach
          </div>
          <h1 className="mx-auto max-w-5xl text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-7xl">
            Choose a Board. Solve Deep.
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-gray-400 sm:mt-6 lg:text-lg lg:leading-8">
            Arena 改为两级入口：技术板块统一收纳 AI Kernel、系统/硬件/芯片/固件/RTOS/编程训练；教育板块按小学、初中、高中拆分学科，进入后再选择具体题目。
          </p>
          <div className="mt-6 grid gap-3 text-center sm:mt-8 sm:grid-cols-3 lg:mt-10">
            <div className="rounded-lg border border-gray-800 bg-[#1b1b1b] p-4 lg:p-5"><p className="text-2xl font-black text-[#3ce8e2] sm:text-3xl">{total}</p><p className="mt-1 text-xs text-gray-500 sm:text-sm">Total Problems</p></div>
            <div className="rounded-lg border border-gray-800 bg-[#1b1b1b] p-4 lg:p-5"><p className="text-2xl font-black text-cyan-300 sm:text-3xl">{technologyCount}</p><p className="mt-1 text-xs text-gray-500 sm:text-sm">Technology</p></div>
            <div className="rounded-lg border border-gray-800 bg-[#1b1b1b] p-4 lg:p-5"><p className="text-2xl font-black text-amber-300 sm:text-3xl">{educationCount}</p><p className="mt-1 text-xs text-gray-500 sm:text-sm">Education</p></div>
          </div>
        </div>

        <section id="sections" className="mb-12 lg:mb-20">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#3ce8e2]">Boards</p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">选择训练板块</h2>
            </div>
            <p className="text-xs text-gray-500 sm:text-sm">板块 → 题目列表 → 题目详情 / Agent 对话</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-5">
            {sections.map((section) => {
              const stats = sectionStats(challenges, section.slug)
              return (
                <Link key={section.slug} href={section.href} className="group overflow-hidden rounded-2xl border border-gray-800 bg-[#1b1b1b] p-5 transition hover:-translate-y-1 hover:border-[#3ce8e2]/40 hover:bg-[#202020] lg:p-6">
                  <div className={`mb-5 h-1.5 w-24 rounded-full bg-gradient-to-r ${section.accent}`} />
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">{section.eyebrow}</p>
                  <h3 className="mt-3 text-2xl font-black text-white group-hover:text-[#3ce8e2]">{section.titleZh}</h3>
                  <p className="mt-4 min-h-[54px] text-sm leading-6 text-gray-400 lg:min-h-[72px]">{section.descriptionZh}</p>
                  <div className="mt-6 grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="rounded-lg border border-gray-800 bg-[#151515] p-3"><p className="text-lg font-black text-white">{stats.total}</p><p className="text-gray-500">题</p></div>
                    <div className="rounded-lg border border-gray-800 bg-[#151515] p-3"><p className={`text-lg font-black ${difficultyTone('easy')}`}>{stats.easy}</p><p className="text-gray-500">Easy</p></div>
                    <div className="rounded-lg border border-gray-800 bg-[#151515] p-3"><p className={`text-lg font-black ${difficultyTone('medium')}`}>{stats.medium}</p><p className="text-gray-500">Med</p></div>
                    <div className="rounded-lg border border-gray-800 bg-[#151515] p-3"><p className={`text-lg font-black ${difficultyTone('hard')}`}>{stats.hard}</p><p className="text-gray-500">Hard</p></div>
                  </div>
                  <div className="mt-6 flex items-center justify-between text-sm">
                    <span className="text-gray-500">Sources: {section.sources.slice(0, 2).map((item) => item.label).join(' / ')}</span>
                    <span className="font-black text-[#3ce8e2]">进入 →</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        <section id="featured" className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-8">
          <div>
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#3ce8e2]">Featured</p>
                <h2 className="mt-2 text-3xl font-black">推荐入口</h2>
              </div>
              <p className="text-sm text-gray-500">快速打开代表性题目</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e]">
              {featured.map((challenge, index) => (
                <Link key={challenge.id} href={`/arena/challenges/${challenge.slug}`} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-gray-800/70 px-4 py-3 transition-colors last:border-b-0 hover:bg-[#252525] md:grid-cols-[minmax(0,1fr)_90px_96px] lg:px-5 lg:py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-gray-500">{String(index + 1).padStart(2, '0')}</span>
                      <h3 className="truncate text-base font-bold text-white group-hover:text-[#3ce8e2]">{challenge.title}</h3>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 pl-9">
                      {challenge.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded bg-[#151515] px-2 py-0.5 text-xs text-gray-400">{tag}</span>)}
                    </div>
                  </div>
                  <span className="hidden text-sm font-bold capitalize text-gray-300 md:inline">{challenge.difficulty}</span>
                  <span className="text-right text-sm font-semibold text-[#3ce8e2]">Open →</span>
                </Link>
              ))}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-gray-800 bg-[#1e1e1e] p-5">
              <h3 className="font-bold text-white">Navigation</h3>
              <ul className="mt-3 space-y-3 text-sm text-gray-400">
                <li>• 首页只做板块选择，不再直接淹没在长题库里。</li>
                <li>• 技术板块收纳全部 IT/工程面试和 Kernel 训练。</li>
                <li>• 教育板块按学段、学科展开，每题都可用 Arena Coach 和白板。</li>
                <li>• 后端 Judge / Agent Runner 路径保持不变。</li>
              </ul>
            </div>
          </aside>
        </section>
      </section>
    </main>
  )
}
