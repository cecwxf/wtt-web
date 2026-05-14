import Link from 'next/link'
import { listChallenges } from '@/lib/arena/store'
import { arenaSections, sectionStats } from '@/lib/arena/sections'

function difficultyTone(difficulty: string) {
  if (difficulty === 'easy') return 'text-emerald-300'
  if (difficulty === 'medium') return 'text-yellow-300'
  return 'text-rose-300'
}

export default function ArenaPage() {
  const challenges = listChallenges()
  const total = challenges.length
  const aiKernelCount = challenges.filter((challenge) => challenge.category === 'ai-kernel').length
  const aiInterviewCount = challenges.filter((challenge) => challenge.category === 'ai-interview').length
  const featured = challenges.filter((challenge) => [
    'ai-vector-add',
    'ai-gemm',
    'ai-softmax-attention',
    'ai-interview-pretraining-data-mixture',
    'ai-interview-runtime-continuous-batching',
    'ai-interview-npu-gpgpu-attention-kernel',
  ].includes(challenge.slug))

  return (
    <main className="min-h-screen bg-[#151515] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-18rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[#3ce8e2]/10 blur-3xl" />
        <div className="absolute bottom-[-16rem] right-[-12rem] h-[32rem] w-[32rem] rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <section className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <nav className="mb-20 flex items-center justify-between">
          <Link href="/arena" className="bg-gradient-to-r from-[#3ce8e2] via-[#00b3b3] to-[#3ce8e2] bg-clip-text text-3xl font-black tracking-tight text-transparent">
            WTT Arena
          </Link>
          <div className="flex items-center gap-5 text-sm font-medium text-gray-400">
            <a href="#sections" className="transition-colors hover:text-[#3ce8e2]">Boards</a>
            <a href="#featured" className="transition-colors hover:text-[#3ce8e2]">Featured</a>
            <Link href="/feed" className="transition-colors hover:text-[#3ce8e2]">Discuss</Link>
            <Link href="/arena/sections/ai-kernel" className="rounded-md bg-gradient-to-r from-[#2ee6e3] to-[#00b3b3] px-4 py-2 text-black transition-opacity hover:opacity-90">
              进入 AI Kernel
            </Link>
          </div>
        </nav>

        <div className="mb-16 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#3ce8e2]/20 bg-[#3ce8e2]/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-[#3ce8e2]">
            先选板块 · 再刷题 · Agent Runner / Coach
          </div>
          <h1 className="mx-auto max-w-5xl text-5xl font-black tracking-tight text-white md:text-7xl">
            Choose a Board. Solve Deep.
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-gray-400">
            Arena 改为板块入口：AI Kernel 板块覆盖 LeetGPU 风格算子题；AI 面试板块聚合权威 ML/LLM 系统设计面试方向；进入板块后再选择具体题目。
          </p>
          <div className="mt-10 grid gap-3 text-center sm:grid-cols-3">
            <div className="rounded-lg border border-gray-800 bg-[#1b1b1b] p-5"><p className="text-3xl font-black text-[#3ce8e2]">{total}</p><p className="mt-1 text-sm text-gray-500">Total Problems</p></div>
            <div className="rounded-lg border border-gray-800 bg-[#1b1b1b] p-5"><p className="text-3xl font-black text-cyan-300">{aiKernelCount}</p><p className="mt-1 text-sm text-gray-500">AI Kernel</p></div>
            <div className="rounded-lg border border-gray-800 bg-[#1b1b1b] p-5"><p className="text-3xl font-black text-violet-300">{aiInterviewCount}</p><p className="mt-1 text-sm text-gray-500">AI Interview</p></div>
          </div>
        </div>

        <section id="sections" className="mb-20">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#3ce8e2]">Boards</p>
              <h2 className="mt-2 text-3xl font-black">选择训练板块</h2>
            </div>
            <p className="text-sm text-gray-500">板块 → 题目列表 → 题目详情 / Agent 对话</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {arenaSections.map((section) => {
              const stats = sectionStats(challenges, section.slug)
              return (
                <Link key={section.slug} href={section.href} className="group overflow-hidden rounded-2xl border border-gray-800 bg-[#1b1b1b] p-6 transition hover:-translate-y-1 hover:border-[#3ce8e2]/40 hover:bg-[#202020]">
                  <div className={`mb-5 h-1.5 w-24 rounded-full bg-gradient-to-r ${section.accent}`} />
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">{section.eyebrow}</p>
                  <h3 className="mt-3 text-2xl font-black text-white group-hover:text-[#3ce8e2]">{section.titleZh}</h3>
                  <p className="mt-4 min-h-[72px] text-sm leading-6 text-gray-400">{section.descriptionZh}</p>
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

        <section id="featured" className="grid gap-8 lg:grid-cols-[1fr_320px]">
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
                <Link key={challenge.id} href={`/arena/challenges/${challenge.slug}`} className="group grid grid-cols-[1fr_110px_120px] items-center border-b border-gray-800/70 px-5 py-4 transition-colors last:border-b-0 hover:bg-[#252525]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-gray-500">{String(index + 1).padStart(2, '0')}</span>
                      <h3 className="truncate text-base font-bold text-white group-hover:text-[#3ce8e2]">{challenge.title}</h3>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 pl-9">
                      {challenge.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded bg-[#151515] px-2 py-0.5 text-xs text-gray-400">{tag}</span>)}
                    </div>
                  </div>
                  <span className="text-sm font-bold capitalize text-gray-300">{challenge.difficulty}</span>
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
                <li>• AI Kernel 板块按 LeetGPU 风格题型完整覆盖。</li>
                <li>• AI 面试板块可直接用右侧固定 Arena Coach 练习。</li>
                <li>• 后端 Judge / Agent Runner 路径保持不变。</li>
              </ul>
            </div>
          </aside>
        </section>
      </section>
    </main>
  )
}
