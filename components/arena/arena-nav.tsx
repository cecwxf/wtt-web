'use client'

import Link from 'next/link'
import { Home } from 'lucide-react'
import type { ReactNode } from 'react'
import { ThemeToggle } from '@/components/ui/theme-toggle'

type ArenaNavProps = {
  title?: string
  subtitle?: string
  right?: ReactNode
}

export function ArenaNav({ title = 'WTT 终生学习', subtitle, right }: ArenaNavProps) {
  return (
    <nav className="mb-10 flex flex-wrap items-center justify-between gap-3 sm:mb-12">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-[#3ce8e2] hover:text-[#008b8b] dark:border-gray-800 dark:bg-[#1e1e1e] dark:text-gray-200 dark:hover:border-[#3ce8e2] dark:hover:text-[#3ce8e2]"
          aria-label="Home"
          title="Home"
        >
          <Home className="h-5 w-5" />
        </Link>
        <Link
          href="/arena"
          className="truncate bg-gradient-to-r from-[#009f9f] via-[#00b3b3] to-[#2ee6e3] bg-clip-text text-2xl font-black tracking-tight text-transparent sm:text-3xl"
        >
          {title}
        </Link>
        {subtitle && (
          <>
            <span className="hidden text-slate-300 dark:text-gray-700 sm:inline">/</span>
            <span className="hidden truncate text-sm font-bold text-slate-500 dark:text-gray-400 sm:inline">{subtitle}</span>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {right}
        <ThemeToggle className="h-10 w-10 rounded-2xl bg-white dark:bg-[#1e1e1e]" />
      </div>
    </nav>
  )
}
