'use client'

import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { wttApi } from '@/lib/api/wtt-client'
import type { Topic } from '@/lib/api/wtt-client'

interface SearchBarProps {
  onSelectTopic?: (topicId: string) => void
  placeholder?: string
}

export function SearchBar({ onSelectTopic, placeholder = 'Search topics...' }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Topic[]>([])
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

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
    const searchTopics = async () => {
      if (!query.trim()) {
        setResults([])
        setShowResults(false)
        return
      }

      setLoading(true)
      try {
        const topics = await wttApi.searchTopics(query.trim())
        setResults(topics)
        setShowResults(true)
      } catch (error) {
        console.error('Search failed:', error)
        setResults([])
      } finally {
        setLoading(false)
      }
    }

    const debounceTimer = setTimeout(searchTopics, 300)
    return () => clearTimeout(debounceTimer)
  }, [query])

  const handleSelectTopic = (topicId: string) => {
    setShowResults(false)
    setQuery('')
    onSelectTopic?.(topicId)
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    setShowResults(false)
  }

  return (
    <div ref={searchRef} className="relative flex-1 max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-full border border-slate-200 bg-slate-50 px-10 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-500"
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
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-indigo-500" />
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              No topics found for &quot;{query}&quot;
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="py-2">
              {results.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => handleSelectTopic(topic.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-100"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-600">
                    <span className="text-xs font-semibold">
                      {topic.type === 'broadcast' ? '📢' : topic.type === 'p2p' ? '🔒' : '💬'}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{topic.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-400">{topic.description}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-600">
                        {topic.type}
                      </span>
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-400">
                        {topic.join_method}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
