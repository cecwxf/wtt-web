'use client'

import { Search, X, MessageSquare, KanbanSquare } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { wttApi } from '@/lib/api/wtt-client'
import type { Topic } from '@/lib/api/wtt-client'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { buildAgentUrl } from '@/lib/hooks/use-agent-id'

interface TaskResult {
  id: string
  title: string
  status: string
  priority: string
  owner_agent_id?: string
}

interface SearchBarProps {
  onSelectTopic?: (topicId: string) => void
  onSubscribeTopic?: (topicId: string) => Promise<void>
  subscribedTopicIds?: string[]
  placeholder?: string
  agentId?: string
}

export function SearchBar({ onSelectTopic, onSubscribeTopic, subscribedTopicIds = [], placeholder = 'Search topics, tasks...', agentId = '' }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [topics, setTopics] = useState<Topic[]>([])
  const [tasks, setTasks] = useState<TaskResult[]>([])
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const doSearch = async () => {
      const q = query.trim()
      if (!q) {
        setTopics([])
        setTasks([])
        setShowResults(false)
        return
      }

      setLoading(true)
      try {
        const [topicResults, taskResults] = await Promise.allSettled([
          wttApi.searchTopics(q),
          searchTasks(q),
        ])

        setTopics(topicResults.status === 'fulfilled' ? topicResults.value : [])
        setTasks(taskResults.status === 'fulfilled' ? taskResults.value : [])
        setShowResults(true)
      } catch {
        setTopics([])
        setTasks([])
      } finally {
        setLoading(false)
      }
    }

    const debounceTimer = setTimeout(doSearch, 300)
    return () => clearTimeout(debounceTimer)
  }, [query])

  const [subscribingId, setSubscribingId] = useState<string | null>(null)
  const subscribedSet = new Set(subscribedTopicIds)

  const handleSelectTopic = (topicId: string) => {
    if (subscribedSet.has(topicId)) {
      setShowResults(false)
      setQuery('')
      onSelectTopic?.(topicId)
    }
  }

  const handleSubscribeTopic = async (e: React.MouseEvent, topicId: string) => {
    e.stopPropagation()
    if (!onSubscribeTopic) return
    setSubscribingId(topicId)
    try {
      await onSubscribeTopic(topicId)
      setShowResults(false)
      setQuery('')
      onSelectTopic?.(topicId)
    } catch {
      // error handled by caller
    } finally {
      setSubscribingId(null)
    }
  }

  const handleSelectTask = (taskId: string) => {
    setShowResults(false)
    setQuery('')
    router.push(buildAgentUrl('/tasks', agentId, { highlight: taskId }))
  }

  const handleClear = () => {
    setQuery('')
    setTopics([])
    setTasks([])
    setShowResults(false)
  }

  const totalResults = topics.length + tasks.length

  const statusIcon = (status: string) => {
    switch (status) {
      case 'todo': return 'O'
      case 'doing': return '~'
      case 'review': return '?'
      case 'done': return 'V'
      case 'blocked': return 'X'
      default: return '?'
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'todo': return 'text-slate-500 bg-slate-100'
      case 'doing': return 'text-blue-600 bg-blue-50'
      case 'review': return 'text-amber-600 bg-amber-50'
      case 'done': return 'text-green-600 bg-green-50'
      case 'blocked': return 'text-red-600 bg-red-50'
      default: return 'text-slate-500 bg-slate-100'
    }
  }

  return (
    <div ref={searchRef} className="relative flex-1 max-w-lg">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-full border border-slate-200 dark:border-zinc-600 bg-slate-50 dark:bg-zinc-800 px-10 py-2 text-sm text-slate-800 dark:text-zinc-200 placeholder:text-slate-400 outline-none focus:border-indigo-500"
      />
      {query && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {showResults && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[480px] overflow-y-auto rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-indigo-500" />
            </div>
          )}

          {!loading && totalResults === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              No results for &quot;{query}&quot;
            </div>
          )}

          {!loading && topics.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Topics ({topics.length})
                </span>
              </div>
              {topics.map((topic) => {
                const isSub = subscribedSet.has(topic.id)
                return (
                <button
                  key={topic.id}
                  onClick={() => handleSelectTopic(topic.id)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-zinc-700 ${!isSub ? 'cursor-default' : ''}`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-xs">
                    {topic.type === 'broadcast' ? '📢' : topic.type === 'p2p' ? '🔒' : '💬'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-zinc-200">{topic.name}</p>
                    {topic.description && (
                      <p className="truncate text-xs text-slate-400">{topic.description}</p>
                    )}
                  </div>
                  {isSub ? (
                    <span className="shrink-0 rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-green-600">
                      Joined
                    </span>
                  ) : (
                    <button
                      onClick={(e) => handleSubscribeTopic(e, topic.id)}
                      disabled={subscribingId === topic.id}
                      className="shrink-0 rounded-md bg-indigo-500 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-50"
                    >
                      {subscribingId === topic.id ? '...' : topic.type === 'broadcast' ? 'Subscribe' : 'Join'}
                    </button>
                  )}
                </button>
                )
              })}
            </div>
          )}

          {!loading && tasks.length > 0 && (
            <div>
              {topics.length > 0 && <div className="mx-4 h-px bg-slate-100" />}
              <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                <KanbanSquare className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Tasks ({tasks.length})
                </span>
              </div>
              {tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => handleSelectTask(task.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50"
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${statusColor(task.status)}`}>
                    {statusIcon(task.status)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{task.title}</p>
                    <p className="text-xs text-slate-400">
                      {task.priority} · {task.status}
                      {task.owner_agent_id ? ` · ${task.owner_agent_id}` : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="h-1" />
        </div>
      )}
    </div>
  )
}

async function searchTasks(query: string): Promise<TaskResult[]> {
  const resp = await fetch(`${CLIENT_WTT_API_BASE}/tasks?limit=200`)
  if (!resp.ok) return []
  const allTasks: TaskResult[] = await resp.json()
  const q = query.toLowerCase()
  return allTasks.filter(
    (t) =>
      t.title?.toLowerCase().includes(q) ||
      t.id?.toLowerCase().includes(q) ||
      t.owner_agent_id?.toLowerCase().includes(q)
  ).slice(0, 10)
}
