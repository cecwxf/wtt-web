import Link from 'next/link'
import { listChallenges } from '@/lib/arena/store'

function difficultyTone(difficulty: string) {
  if (difficulty === 'easy') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
  if (difficulty === 'medium') return 'border-yellow-400/20 bg-yellow-400/10 text-yellow-300'
  return 'border-rose-400/20 bg-rose-400/10 text-rose-300'
}

function difficultyLabel(difficulty: string) {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
}

export default function ArenaPage() {
  const challenges = listChallenges()
  const easyCount = challenges.filter((challenge) => challenge.difficulty === 'easy').length
  const mediumCount = challenges.filter((challenge) => challenge.difficulty === 'medium').length
  const hardCount = challenges.filter((challenge) => challenge.difficulty === 'hard').length
  const aiKernelCount = challenges.filter((challenge) => challenge.category === 'ai-kernel').length
  const allTags = Array.from(new Set(challenges.flatMap((challenge) => challenge.tags))).slice(0, 10)

  return (
    <main className="min-h-screen bg-[#151515] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-18rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[#3ce8e2]/10 blur-3xl" />
        <div className="absolute bottom-[-16rem] right-[-12rem] h-[32rem] w-[32rem] rounded-full bg-[#00b3b3]/10 blur-3xl" />
      </div>

      <section className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <nav className="mb-20 flex items-center justify-between">
          <Link href="/arena" className="bg-gradient-to-r from-[#3ce8e2] via-[#00b3b3] to-[#3ce8e2] bg-clip-text text-3xl font-black tracking-tight text-transparent">
            WTT Arena
          </Link>
          <div className="flex items-center gap-5 text-sm font-medium text-gray-400">
            <a href="#challenges" className="transition-colors hover:text-[#3ce8e2]">Challenges</a>
            <a href="#leaderboard" className="transition-colors hover:text-[#3ce8e2]">Leaderboard</a>
            <Link href="/feed" className="transition-colors hover:text-[#3ce8e2]">Discuss</Link>
            <Link href="/arena/challenges/ai-vector-add" className="rounded-md bg-gradient-to-r from-[#2ee6e3] to-[#00b3b3] px-4 py-2 text-black transition-opacity hover:opacity-90">
              Start Solving
            </Link>
          </div>
        </nav>

        <div className="mb-20 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#3ce8e2]/20 bg-[#3ce8e2]/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-[#3ce8e2]">
            AI Kernels · CPU-sim Judge · Agent Runner
          </div>
          <h1 className="mx-auto max-w-5xl text-5xl font-black tracking-tight text-white md:text-7xl">
            Code. Judge. Level Up.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-400">
            面向 AI 工程与 GPU 编程学习的真实运行打榜平台：先用 CPU-sim 跑 CUDA/OpenCL 风格算子，后续接入真实硬件 runner。
          </p>
          <div className="mt-10 flex justify-center gap-4">
            <Link href="#challenges" className="rounded-md bg-gradient-to-r from-[#2ee6e3] to-[#00b3b3] px-6 py-3 text-sm font-bold text-black transition-opacity hover:opacity-90">
              Browse Challenges
            </Link>
            <Link href="/arena/challenges/ai-vector-add" className="rounded-md border border-gray-800 bg-[#1e1e1e] px-6 py-3 text-sm font-bold text-white transition-colors hover:border-[#3ce8e2] hover:bg-[#252525]">
              Open Playground
            </Link>
          </div>
        </div>

        <div className="mb-20 overflow-hidden rounded-lg border border-gray-800 bg-[#1b1b1b] shadow-2xl shadow-black/30 transition-colors hover:border-[#3ce8e2]/30">
          <div className="flex items-center justify-between border-b border-gray-800 bg-[#181818] px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500/80" />
              <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
              <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
            </div>
            <span className="text-xs font-mono text-gray-500">arena.wtt.dev / python</span>
          </div>
          <div className="grid gap-0 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="border-b border-gray-800 p-6 lg:border-b-0 lg:border-r">
              <div className="mb-4 flex items-center gap-2 overflow-x-auto text-sm">
                <span className="rounded-md bg-blue-500/5 px-3 py-1.5 font-medium text-blue-300/70">Submissions</span>
                <span className="rounded-md bg-yellow-500/5 px-3 py-1.5 font-medium text-yellow-300/70">Leaderboard</span>
                <span className="rounded-md bg-green-500/5 px-3 py-1.5 font-medium text-green-300/70">Tutor</span>
                <span className="rounded-md bg-purple-500/5 px-3 py-1.5 font-medium text-purple-300/70">Discuss</span>
              </div>
              <h2 className="text-2xl font-bold">AI Kernel Board</h2>
              <p className="mt-3 text-sm leading-6 text-gray-400">Vector ops, matmul, convolution, attention, quantization, MoE and model blocks. Hidden tests stay private; the judge is the source of truth.</p>
              <div className="mt-6 grid grid-cols-4 gap-3 text-center text-sm">
                <div className="rounded-md border border-gray-800 bg-[#202020] p-4"><p className="text-2xl font-black text-[#3ce8e2]">{aiKernelCount}</p><p className="mt-1 text-gray-500">AI Kernels</p></div>
                <div className="rounded-md border border-gray-800 bg-[#202020] p-4"><p className="text-2xl font-black text-emerald-300">{easyCount}</p><p className="mt-1 text-gray-500">Easy</p></div>
                <div className="rounded-md border border-gray-800 bg-[#202020] p-4"><p className="text-2xl font-black text-yellow-300">{mediumCount}</p><p className="mt-1 text-gray-500">Medium</p></div>
                <div className="rounded-md border border-gray-800 bg-[#202020] p-4"><p className="text-2xl font-black text-rose-300">{hardCount}</p><p className="mt-1 text-gray-500">Hard</p></div>
              </div>
            </div>
            <div className="bg-[#101010] p-6 font-mono text-sm leading-7 text-gray-300">
              <p><span className="text-purple-300">def</span> <span className="text-[#3ce8e2]">ai_vector_add</span>(payload):</p>
              <p className="pl-6 text-gray-500"># CPU-sim today, hardware runner tomorrow</p>
              <p className="pl-6"><span className="text-purple-300">return</span> [v + i <span className="text-purple-300">for</span> i, v <span className="text-purple-300">in</span> enumerate(payload[<span className="text-emerald-300">&apos;values&apos;</span>])]</p>
              <div className="mt-8 rounded-md border border-[#3ce8e2]/20 bg-[#3ce8e2]/5 p-4 font-sans text-sm text-[#bffffd]">
                Accepted · 100/100 · Tutor review unlocked
              </div>
            </div>
          </div>
        </div>

        <section id="challenges" className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#3ce8e2]">Challenges</p>
                <h2 className="mt-2 text-3xl font-black">训练题库</h2>
              </div>
              <p className="text-sm text-gray-500">CPU-sim 真实运行 · 后端持久化 · 隐藏测试脱敏</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-800 bg-[#1e1e1e]">
              <div className="grid grid-cols-[1fr_110px_120px] border-b border-gray-800 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <span>Problem</span>
                <span>Difficulty</span>
                <span className="text-right">Action</span>
              </div>
              {challenges.map((challenge, index) => (
                <Link
                  key={challenge.id}
                  href={`/arena/challenges/${challenge.slug}`}
                  className="group grid grid-cols-[1fr_110px_120px] items-center border-b border-gray-800/70 px-5 py-4 transition-colors last:border-b-0 hover:bg-[#252525]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-gray-500">{String(index + 1).padStart(2, '0')}</span>
                      <h3 className="truncate text-base font-bold text-white group-hover:text-[#3ce8e2]">{challenge.title}</h3>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 pl-9">
                      {challenge.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded bg-[#151515] px-2 py-0.5 text-xs text-gray-400">{tag}</span>)}
                    </div>
                  </div>
                  <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${difficultyTone(challenge.difficulty)}`}>{difficultyLabel(challenge.difficulty)}</span>
                  <span className="text-right text-sm font-semibold text-[#3ce8e2]">Solve →</span>
                </Link>
              ))}
            </div>
          </div>

          <aside id="leaderboard" className="space-y-4">
            <div className="rounded-lg border border-gray-800 bg-[#1e1e1e] p-5">
              <h3 className="font-bold text-white">Track</h3>
              <p className="mt-2 text-sm leading-6 text-gray-400">从 AI/GPU kernel 开始：CUDA/OpenCL 风格接口先在 CPU 上验算，未来同一题目可派发到真实硬件。</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {allTags.map((tag) => <span key={tag} className="rounded-md border border-gray-800 bg-[#151515] px-2.5 py-1 text-xs text-gray-400">#{tag}</span>)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-800 bg-[#1e1e1e] p-5">
              <h3 className="font-bold text-white">Rules</h3>
              <ul className="mt-3 space-y-3 text-sm text-gray-400">
                <li>• 最终分数只看真实 Judge。</li>
                <li>• Agent 可作为隔离 runner 执行代码。</li>
                <li>• 隐藏测试不会暴露输入输出。</li>
                <li>• 通过记录写入 WTT 后端数据库。</li>
              </ul>
            </div>
          </aside>
        </section>
      </section>
    </main>
  )
}
