import type { Challenge } from './types'

export type ArenaSectionSlug = 'ai-kernel' | 'ai-interview' | 'coding-interview'

export type ArenaSection = {
  slug: ArenaSectionSlug
  title: string
  titleZh: string
  eyebrow: string
  description: string
  descriptionZh: string
  category: string
  accent: string
  href: string
  sources: Array<{ label: string; url: string }>
}

export const arenaSections: ArenaSection[] = [
  {
    slug: 'ai-kernel',
    title: 'AI Kernel',
    titleZh: 'AI Kernel 板块',
    eyebrow: 'GPU · CUDA/OpenCL · AI Operators',
    description: 'LeetGPU-style kernel drills: vector ops, GEMM, convolution, attention, quantization, MoE and model blocks. CPU-sim today, hardware runners later.',
    descriptionZh: '按 LeetGPU 题型完整铺开：向量、GEMM、卷积、Attention、量化、MoE 与模型块。当前 CPU-sim，后续切真实硬件 runner。',
    category: 'ai-kernel',
    accent: 'from-[#3ce8e2] to-[#00b3b3]',
    href: '/arena/sections/ai-kernel',
    sources: [
      { label: 'LeetGPU challenge map', url: 'https://github.com/AlphaGPU/leetgpu-challenges' },
      { label: 'Tensara GPU challenges', url: 'https://tensara.org/' },
    ],
  },
  {
    slug: 'ai-interview',
    title: 'AI Interview',
    titleZh: 'AI 面试板块',
    eyebrow: 'ML System Design · LLM · MLOps',
    description: 'Authority-inspired AI interview prompts covering ML system design, LLM/RAG, feature stores, online experiments, model serving and reliability.',
    descriptionZh: '聚合权威面试站点方向：机器学习系统设计、LLM/RAG、特征平台、在线实验、模型服务与稳定性。',
    category: 'ai-interview',
    accent: 'from-violet-300 to-fuchsia-500',
    href: '/arena/sections/ai-interview',
    sources: [
      { label: 'Interview Query ML system design', url: 'https://www.interviewquery.com/p/machine-learning-interview-questions' },
      { label: 'iGotAnOffer ML system design', url: 'https://igotanoffer.com/en/advice/machine-learning-system-design-interview' },
      { label: 'DataInterview ML system design', url: 'https://www.datainterview.com/blog/ml-system-design-interview-questions' },
      { label: 'Google Rules of ML', url: 'https://developers.google.com/machine-learning/guides/rules-of-ml' },
    ],
  },
  {
    slug: 'coding-interview',
    title: 'Coding Interview',
    titleZh: '编程面试板块',
    eyebrow: 'DSA · Online Judge · Agent Review',
    description: 'Classic coding interview drills with real judge feedback and Agent review.',
    descriptionZh: '经典算法面试题，保留真实判题与 Agent 复盘。',
    category: 'coding-interview',
    accent: 'from-amber-200 to-orange-500',
    href: '/arena/sections/coding-interview',
    sources: [
      { label: 'LeetCode problem patterns', url: 'https://leetcode.com/problemset/' },
    ],
  },
]

export function getArenaSection(slug: string) {
  return arenaSections.find((section) => section.slug === slug) || null
}

export function challengesForSection(challenges: Challenge[], slug: string) {
  const section = getArenaSection(slug)
  if (!section) return []
  return challenges.filter((challenge) => challenge.category === section.category)
}

export function sectionStats(challenges: Challenge[], slug: string) {
  const rows = challengesForSection(challenges, slug)
  return {
    total: rows.length,
    easy: rows.filter((challenge) => challenge.difficulty === 'easy').length,
    medium: rows.filter((challenge) => challenge.difficulty === 'medium').length,
    hard: rows.filter((challenge) => challenge.difficulty === 'hard').length,
  }
}
