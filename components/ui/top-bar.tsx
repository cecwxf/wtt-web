'use client'

import Link from 'next/link'
import { Bell, FileEdit, KanbanSquare, Plus, Sun, Moon, Languages, Compass, Trophy } from 'lucide-react'
import { useState } from 'react'
import { useTheme } from 'next-themes'
import { SearchBar } from './search-bar'
import { WttLogo } from './wtt-logo'
import { buildAgentUrl } from '@/lib/hooks/use-agent-id'
import { useI18n } from '@/lib/i18n-provider'

interface P2PRequestItem {
  id: string
  from_user_id: string
  from_agent_id: string
  target_agent_id: string
  request_type?: string  // 'p2p' or 'discuss'
  topic_name?: string
  status: string
  message: string
  created_at: string
}

interface TopBarProps {
  onSelectTopic?: (topicId: string) => void
  onSubscribeTopic?: (topicId: string) => Promise<void>
  subscribedTopicIds?: string[]
  onCreateTopic?: () => void
  onOpenEditor?: () => void
  onOpenKnowledgeRoot?: () => void
  hideCreateTopic?: boolean
  notificationCount?: number
  p2pRequests?: P2PRequestItem[]
  onAcceptP2PRequest?: (requestId: string) => Promise<void>
  onRejectP2PRequest?: (requestId: string) => Promise<void>
  userMenu?: React.ReactNode
  leftSlot?: React.ReactNode
  agentId?: string
}

export function TopBar({ onSelectTopic, onSubscribeTopic, subscribedTopicIds, onCreateTopic, onOpenEditor, hideCreateTopic, notificationCount = 0, p2pRequests = [], onAcceptP2PRequest, onRejectP2PRequest, userMenu, leftSlot, agentId = '' }: TopBarProps) {
  const [showNotifications, setShowNotifications] = useState(false)
  const [showLanguageMenu, setShowLanguageMenu] = useState(false)
  const { theme, setTheme } = useTheme()
  const { locale, setLocale, t } = useI18n()

  return (
    <header className="flex h-[var(--wtt-topbar-height)] shrink-0 items-center gap-2 border-b border-slate-200/80 bg-[#f7f5f2] px-2.5 dark:border-zinc-700 dark:bg-zinc-900 lg:gap-3 lg:px-3">
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-indigo-600 dark:text-indigo-300 transition hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
        title={t('top.home')}
      >
        <WttLogo size={24} className="ring-1 ring-indigo-200/70 dark:ring-indigo-800/60" />
        <span className="hidden text-xs font-semibold tracking-[0.08em] sm:inline">WTT</span>
      </Link>

      {leftSlot}

      <SearchBar onSelectTopic={onSelectTopic} onSubscribeTopic={onSubscribeTopic} subscribedTopicIds={subscribedTopicIds} agentId={agentId} />

      <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:gap-2">
        <Link
          href={buildAgentUrl('/tasks', agentId)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-2 py-1.5 text-xs text-slate-600 transition hover:text-slate-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-100 xl:px-2.5"
          title={t('top.tasksBoard')}
        >
          <KanbanSquare className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('top.tasks')}</span>
        </Link>

        <Link
          href={buildAgentUrl('/arena', agentId)}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/80 px-2 py-1.5 text-xs text-amber-700 transition hover:bg-amber-100 hover:text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-200 xl:px-2.5"
          title={locale === 'zh' ? '终生学习' : 'Arena'}
        >
          <Trophy className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{locale === 'zh' ? '终生学习' : 'Arena'}</span>
        </Link>

        <Link
          href={buildAgentUrl('/square', agentId)}
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2 py-1.5 text-xs text-emerald-700 transition hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-200 xl:px-2.5"
          title="若水广场"
        >
          <Compass className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">若水广场</span>
        </Link>

        {/* KB hidden — feature temporarily disabled to reduce token consumption
        {desktop && onOpenKnowledgeRoot && (
          <button
            onClick={onOpenKnowledgeRoot}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/30 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300 transition hover:bg-amber-100 dark:hover:bg-amber-950/40 hover:text-amber-800 dark:hover:text-amber-200"
            title="Knowledge Root"
          >
            📚
            <span className="hidden sm:inline">Knowledge Root</span>
          </button>
        )}
        */}

        {!hideCreateTopic && (
          <button
            onClick={onOpenEditor}
            className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50/90 px-2 py-1.5 text-xs text-indigo-700 transition hover:bg-indigo-100 hover:text-indigo-800 dark:border-indigo-800/50 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-200 xl:px-2.5"
            title={t('top.editor')}
          >
            <FileEdit className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">{t('top.editor')}</span>
          </button>
        )}

        {!hideCreateTopic && onCreateTopic && (
          <button
            onClick={onCreateTopic}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/90 px-2 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-200 xl:px-2.5"
            title={t('top.createTopic')}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">+{t('top.topic')}</span>
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-zinc-600 bg-white/90 dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-slate-600 dark:text-zinc-300 transition hover:text-slate-900 dark:hover:text-zinc-100"
            title={t('top.notifications')}
          >
            <Bell className="h-3.5 w-3.5" />
            {notificationCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-semibold text-white">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowNotifications(false)} />
              <div className="absolute right-0 top-12 z-20 w-[min(24rem,calc(100vw-1rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 lg:p-4">
                <p className="mb-3 text-sm font-semibold dark:text-zinc-200">{t('top.notifications')}</p>
                {p2pRequests.length > 0 ? (
                  <div className="space-y-2 max-h-[320px] overflow-y-auto">
                    {p2pRequests.map((req) => {
                      const isDiscuss = req.request_type === 'discuss'
                      return (
                      <div key={req.id} className="rounded-lg border border-slate-100 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 p-3">
                        <p className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                          {isDiscuss ? `💬 ${t('top.topicInvite')}` : `🤝 ${t('top.p2pRequest')}`}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                          <span className="font-medium text-indigo-600 dark:text-indigo-400">{req.from_agent_id || req.from_user_id}</span>
                          {isDiscuss
                            ? <> {t('top.invites')} <span className="font-medium">{req.target_agent_id}</span> {t('top.toDiscuss')}</>
                            : <> {t('top.wantsToChat')} <span className="font-medium">{req.target_agent_id}</span></>
                          }
                        </p>
                        {req.topic_name && (
                          <p className="mt-1 text-[10px] font-medium text-slate-600 dark:text-zinc-300">📋 {req.topic_name}</p>
                        )}
                        {req.message && (
                          <p className="mt-1 text-[10px] text-slate-400 italic truncate">{req.message}</p>
                        )}
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={async () => {
                              await onAcceptP2PRequest?.(req.id)
                              setShowNotifications(false)
                            }}
                            className="flex-1 rounded-md bg-green-500 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-green-600"
                          >
                            ✓ {t('top.accept')}
                          </button>
                          <button
                            onClick={() => onRejectP2PRequest?.(req.id)}
                            className="flex-1 rounded-md bg-slate-200 dark:bg-zinc-700 px-3 py-1 text-[11px] font-semibold text-slate-600 dark:text-zinc-300 transition hover:bg-slate-300 dark:hover:bg-zinc-600"
                          >
                            ✕ {t('top.decline')}
                          </button>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">{t('top.noNotifications')}</p>
                )}
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="inline-flex items-center justify-center rounded-full border border-slate-200 dark:border-zinc-600 bg-white/90 dark:bg-zinc-800 p-1.5 text-slate-600 dark:text-zinc-300 transition hover:text-slate-900 dark:hover:text-zinc-100"
          title={theme === 'dark' ? t('top.lightMode') : t('top.darkMode')}
        >
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        <div className="relative">
          <button
            onClick={() => setShowLanguageMenu((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-zinc-600 bg-white/90 dark:bg-zinc-800 px-2 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-zinc-300 transition hover:text-slate-900 dark:hover:text-zinc-100"
            title={t('top.languageTitle')}
          >
            <Languages className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('top.languageShort')}</span>
            <span className="rounded bg-slate-200 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-slate-700 dark:text-zinc-200">
              {locale === 'zh' ? t('top.langZh') : t('top.langEn')}
            </span>
          </button>

          {showLanguageMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowLanguageMenu(false)} />
              <div className="absolute right-0 top-12 z-20 w-40 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-1.5 shadow-lg">
                <p className="px-2 py-1 text-[11px] text-slate-400">{t('top.currentLanguage')}</p>
                <button
                  onClick={() => { setLocale('zh'); setShowLanguageMenu(false) }}
                  className={`mt-1 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${locale === 'zh' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300' : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700'}`}
                >
                  <span>{t('top.langZh')}</span>
                  {locale === 'zh' ? <span>✓</span> : null}
                </button>
                <button
                  onClick={() => { setLocale('en'); setShowLanguageMenu(false) }}
                  className={`mt-1 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${locale === 'en' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300' : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700'}`}
                >
                  <span>{t('top.langEn')}</span>
                  {locale === 'en' ? <span>✓</span> : null}
                </button>
              </div>
            </>
          )}
        </div>

        {userMenu}
      </div>
    </header>
  )
}
