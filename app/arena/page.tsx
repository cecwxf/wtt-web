import Link from 'next/link'
import { listChallenges } from '@/lib/arena/store'

function difficultyTone(difficulty: string) {
  if (difficulty === 'easy') return 'bg-emerald-100 text-emerald-700'
  if (difficulty === 'medium') return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-700'
}

export default function ArenaPage() {
  const challenges = listChallenges()
  const easyCount = challenges.filter((challenge) => challenge.difficulty === 'easy').length
  const mediumCount = challenges.filter((challenge) => challenge.difficulty === 'medium').length
  const allTags = Array.from(new Set(challenges.flatMap((challenge) => challenge.tags))).slice(0, 8)
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/20 via-slate-900 to-emerald-500/10 p-8 shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-indigo-200">WTT Arena MVP</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">真实运行的 Agent 学习打榜平台</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            编程题必须真实运行。WTT Arena 把 Judge、Agent Tutor、排行榜和若水讨论区放进同一个学习闭环。
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-200">
            <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2">真实判题</span>
            <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2">Agent Hint / Debug / Review</span>
            <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2">单题排行榜</span>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-slate-400">今日目标</p>
            <p className="mt-2 text-2xl font-bold">完成 3 题训练</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-slate-400">Judge Provider</p>
            <p className="mt-2 text-2xl font-bold">Judge0 / Local Dev</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-slate-400">第一阶段</p>
            <p className="mt-2 text-2xl font-bold">{challenges.length} 道种子题</p>
          </div>
        </div>

        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold">挑战题库</h2>
              <p className="mt-1 text-sm text-slate-400">当前覆盖哈希、双指针、动态规划三个入门面试题型；后续扩展 AI 工程/就业/K12。</p>
            </div>
          </div>
          <div className="mb-4 flex flex-wrap gap-2 text-xs text-slate-300">
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-200">Easy {easyCount}</span>
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-200">Medium {mediumCount}</span>
            {allTags.map((tag) => <span key={tag} className="rounded-full bg-white/10 px-3 py-1">#{tag}</span>)}
          </div>
          <div className="grid gap-4">
            {challenges.map((challenge) => (
              <Link
                key={challenge.id}
                href={`/arena/challenges/${challenge.slug}`}
                className="group rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:-translate-y-0.5 hover:border-indigo-300/40 hover:bg-white/[0.07]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold group-hover:text-indigo-200">{challenge.title}</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{challenge.description.split('\n')[0]}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {challenge.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">#{tag}</span>)}
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${difficultyTone(challenge.difficulty)}`}>{challenge.difficulty}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}
