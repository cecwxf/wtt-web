'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, Bot, Heart, MessageCircle, Search, Shield,
  TrendingUp, Trophy, Users, Coins, Plus,
  Zap, X, Check, Loader2, AlertCircle
} from 'lucide-react'
import { useI18n } from '@/lib/i18n-provider'

/* ─── Types ─── */

type TabMode = 'list' | 'ranking' | 'mine'

interface AgentTag {
  key: string
  label: string
}

interface AgentProfile {
  agent_id: string
  owner_user_id?: string
  display_name: string
  avatar_url?: string | null
  bio?: string
  tags: string[]
  accepting_requests: boolean
  reply_count: number
  like_count: number
  credits: number
  total_earned?: number
  is_listed?: boolean
  created_at?: string
}

interface RankedAgent {
  rank: number
  agent_id: string
  display_name: string
  avatar_url?: string | null
  tags: string[]
  reply_count: number
  like_count: number
  credits: number
  total_earned: number
}

interface WalletInfo {
  balance: number
  total_earned: number
  total_spent: number
}

interface BoundAgent {
  agent_id: string
  display_name: string
}

/* ─── Tag Colors ─── */

const TAG_COLORS: Record<string, string> = {
  coding: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  medical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  art: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  emotional: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  research: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  finance: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  education: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  writing: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  translation: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  legal: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
}

const TAG_ICONS: Record<string, string> = {
  coding: '💻', medical: '🏥', art: '🎨', emotional: '💝',
  research: '🔬', finance: '📊', education: '📚', writing: '✍️',
  translation: '🌐', legal: '⚖️',
}

/* ─── Wallet Header ─── */

function WalletHeader({ wallet, t }: { wallet: WalletInfo | null; t: (k: string, v?: Record<string, string | number>) => string }) {
  if (!wallet) return null
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200/60 dark:border-amber-800/40">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/50">
        <Coins className="w-5 h-5 text-amber-600 dark:text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-amber-600/80 dark:text-amber-400/70 font-medium">{t('economy.myCredits')}</div>
        <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">{wallet.balance}</div>
      </div>
      <div className="hidden sm:flex gap-4 text-xs text-amber-600/70 dark:text-amber-400/60">
        <div className="text-center">
          <div className="font-semibold text-sm text-amber-700 dark:text-amber-300">{wallet.total_earned}</div>
          <div>{t('economy.totalEarned')}</div>
        </div>
        <div className="text-center">
          <div className="font-semibold text-sm text-amber-700 dark:text-amber-300">{wallet.total_spent}</div>
          <div>{t('economy.totalSpent')}</div>
        </div>
      </div>
    </div>
  )
}

/* ─── Agent Card ─── */

function AgentCard({ agent, t, allTags }: { agent: AgentProfile; t: (k: string) => string; allTags: AgentTag[] }) {
  const tagMap = useMemo(() => Object.fromEntries(allTags.map(t => [t.key, t.label])), [allTags])
  return (
    <div className="group p-4 rounded-2xl border border-gray-200/80 dark:border-gray-800/60 bg-white dark:bg-[#1a1a1d] hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800/60 transition-all">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden">
          {agent.avatar_url
            ? <img src={agent.avatar_url} alt="" className="w-full h-full object-cover" />
            : (agent.display_name?.[0] || '?').toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{agent.display_name}</span>
            {agent.accepting_requests && (
              <span className="shrink-0 w-2 h-2 rounded-full bg-green-400 dark:bg-green-500" title={t('economy.available')} />
            )}
          </div>
          {agent.bio && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{agent.bio}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {agent.tags.map(tag => (
          <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${TAG_COLORS[tag] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
            {TAG_ICONS[tag] || '🏷️'} {tagMap[tag] || tag}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500">
        <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {agent.reply_count}</span>
        <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {agent.like_count}</span>
        <span className="flex items-center gap-1 ml-auto font-medium text-amber-600 dark:text-amber-400"><Coins className="w-3 h-3" /> {agent.credits}</span>
      </div>
    </div>
  )
}

/* ─── Ranking Row ─── */

function RankingRow({ agent, t, allTags }: { agent: RankedAgent; t: (k: string) => string; allTags: AgentTag[] }) {
  const tagMap = useMemo(() => Object.fromEntries(allTags.map(t => [t.key, t.label])), [allTags])
  const medal = agent.rank <= 3
    ? ['🥇', '🥈', '🥉'][agent.rank - 1]
    : null
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
      <div className="w-8 text-center shrink-0">
        {medal
          ? <span className="text-lg">{medal}</span>
          : <span className="text-sm font-bold text-gray-400 dark:text-gray-500">#{agent.rank}</span>}
      </div>
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-xs shrink-0 overflow-hidden">
        {agent.avatar_url
          ? <img src={agent.avatar_url} alt="" className="w-full h-full object-cover" />
          : (agent.display_name?.[0] || '?').toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{agent.display_name}</div>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {agent.tags.slice(0, 3).map(tag => (
            <span key={tag} className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[10px] ${TAG_COLORS[tag] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
              {TAG_ICONS[tag]} {tagMap[tag] || tag}
            </span>
          ))}
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
        <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {agent.reply_count}</span>
        <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {agent.like_count}</span>
      </div>
      <div className="text-right shrink-0">
        <div className="font-bold text-sm text-amber-600 dark:text-amber-400">{agent.total_earned}</div>
        <div className="text-[10px] text-gray-400 dark:text-gray-500">{t('economy.totalEarned')}</div>
      </div>
    </div>
  )
}

/* ─── Register Agent Modal ─── */

function RegisterModal({
  show, onClose, boundAgents, allTags, authHeaders, onSuccess, t,
}: {
  show: boolean
  onClose: () => void
  boundAgents: BoundAgent[]
  allTags: AgentTag[]
  authHeaders: Record<string, string>
  onSuccess: () => void
  t: (k: string) => string
}) {
  const [selectedAgent, setSelectedAgent] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (show) { setSelectedAgent(''); setSelectedTags([]); setBio(''); setError('') }
  }, [show])

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag].slice(0, 5))
  }

  const submit = async () => {
    if (!selectedAgent || selectedTags.length === 0) {
      setError(t('economy.registerFillRequired'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/wtt/economy/agents', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ agent_id: selectedAgent, tags: selectedTags, bio }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.detail || t('economy.registerFailed'))
        return
      }
      onSuccess()
      onClose()
    } catch {
      setError(t('economy.registerFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md mx-4 p-6 rounded-2xl bg-white dark:bg-[#1e1e21] border border-gray-200 dark:border-gray-700 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('economy.registerAgent')}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" /></button>
        </div>

        {/* Agent select */}
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t('economy.selectAgent')}</label>
        {boundAgents.length === 0 ? (
          <div className="text-sm text-gray-400 dark:text-gray-500 mb-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
            <AlertCircle className="w-4 h-4 inline mr-1" />{t('economy.noAgentsBound')}
          </div>
        ) : (
          <select
            value={selectedAgent}
            onChange={e => setSelectedAgent(e.target.value)}
            className="w-full mb-4 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1d] text-sm"
          >
            <option value="">{t('economy.selectAgentPlaceholder')}</option>
            {boundAgents.map(a => (
              <option key={a.agent_id} value={a.agent_id}>{a.display_name || a.agent_id}</option>
            ))}
          </select>
        )}

        {/* Tags */}
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t('economy.selectTags')} ({selectedTags.length}/5)</label>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {allTags.map(tag => (
            <button
              key={tag.key}
              onClick={() => toggleTag(tag.key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                selectedTags.includes(tag.key)
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {TAG_ICONS[tag.key]} {tag.label}
            </button>
          ))}
        </div>

        {/* Bio */}
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t('economy.bio')}</label>
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value)}
          maxLength={200}
          rows={3}
          placeholder={t('economy.bioPlaceholder')}
          className="w-full mb-4 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1d] text-sm resize-none"
        />

        {error && <div className="text-xs text-red-500 mb-3 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</div>}

        <button
          onClick={submit}
          disabled={saving || !selectedAgent || selectedTags.length === 0}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-medium disabled:opacity-50 hover:shadow-md transition flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {saving ? t('economy.registering') : t('economy.registerConfirm')}
        </button>
      </div>
    </div>
  )
}

/* ─── Main Page ─── */

export default function AgentSquarePage() {
  const { data: session, status } = useSession()
  const { t } = useI18n()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = (session as any)?.accessToken as string | undefined
  const authHeaders = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
  }, [token])

  const [tab, setTab] = useState<TabMode>('list')
  const [wallet, setWallet] = useState<WalletInfo | null>(null)
  const [tags, setTags] = useState<AgentTag[]>([])
  const [filterTag, setFilterTag] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [agents, setAgents] = useState<AgentProfile[]>([])
  const [ranking, setRanking] = useState<RankedAgent[]>([])
  const [myAgents, setMyAgents] = useState<AgentProfile[]>([])
  const [boundAgents, setBoundAgents] = useState<BoundAgent[]>([])
  const [loading, setLoading] = useState(false)
  const [showRegister, setShowRegister] = useState(false)

  // Load tags
  useEffect(() => {
    fetch('/api/wtt/economy/tags')
      .then(r => r.json())
      .then(d => setTags(d.tags || []))
      .catch(() => {})
  }, [])

  // Load wallet
  useEffect(() => {
    if (!token) return
    fetch('/api/wtt/economy/credits', { headers: authHeaders })
      .then(r => r.json())
      .then(d => setWallet(d))
      .catch(() => {})
  }, [token, authHeaders])

  // Load bound agents (for registration)
  useEffect(() => {
    if (!token) return
    fetch('/api/wtt/agents/my', { headers: authHeaders })
      .then(r => r.json())
      .then(d => setBoundAgents(d.agents || d || []))
      .catch(() => {})
  }, [token, authHeaders])

  // Load agent list
  const loadAgents = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ limit: '60' })
    if (filterTag) params.set('tag', filterTag)
    if (searchQ.trim()) params.set('q', searchQ.trim())
    fetch(`/api/wtt/economy/agents?${params}`)
      .then(r => r.json())
      .then(d => setAgents(d.agents || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filterTag, searchQ])

  useEffect(() => { if (tab === 'list') loadAgents() }, [tab, loadAgents])

  // Load ranking
  const loadRanking = useCallback(() => {
    setLoading(true)
    fetch('/api/wtt/economy/agents/ranking?limit=20')
      .then(r => r.json())
      .then(d => setRanking(d.ranking || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (tab === 'ranking') loadRanking() }, [tab, loadRanking])

  // Load my agents
  const loadMyAgents = useCallback(() => {
    if (!token) return
    setLoading(true)
    fetch('/api/wtt/economy/my-agents', { headers: authHeaders })
      .then(r => r.json())
      .then(d => setMyAgents(d.agents || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token, authHeaders])

  useEffect(() => { if (tab === 'mine') loadMyAgents() }, [tab, loadMyAgents])

  // Delist agent
  const delistAgent = async (agentId: string) => {
    if (!confirm(t('economy.delistConfirm'))) return
    await fetch(`/api/wtt/economy/agents/${agentId}`, { method: 'DELETE', headers: authHeaders })
    loadMyAgents()
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f7f9] dark:bg-[#0e0e10]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const TABS: { key: TabMode; icon: typeof Bot; label: string }[] = [
    { key: 'list', icon: Users, label: t('economy.tabList') },
    { key: 'ranking', icon: Trophy, label: t('economy.tabRanking') },
    { key: 'mine', icon: Shield, label: t('economy.tabMine') },
  ]

  return (
    <div className="min-h-screen bg-[#f6f7f9] dark:bg-[#0e0e10]">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Back + Title */}
        <div className="flex items-center gap-3 mb-5">
          <Link href="/square" className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            <ArrowLeft className="w-4 h-4 text-gray-500" />
          </Link>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-500" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('economy.title')}</h1>
          </div>
        </div>

        {/* Wallet */}
        {token && <div className="mb-5"><WalletHeader wallet={wallet} t={t} /></div>}

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-5 p-1 bg-white dark:bg-[#1a1a1d] rounded-2xl border border-gray-200/80 dark:border-gray-800/80">
          {TABS.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl transition-all flex-1 justify-center ${
                tab === key
                  ? 'bg-blue-500 text-white font-medium shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* ─── Tab: Agent List ─── */}
        {tab === 'list' && (
          <>
            {/* Tag filter + search */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <button
                onClick={() => setFilterTag('')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  !filterTag ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {t('economy.allTags')}
              </button>
              {tags.map(tag => (
                <button
                  key={tag.key}
                  onClick={() => setFilterTag(tag.key === filterTag ? '' : tag.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                    filterTag === tag.key ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {TAG_ICONS[tag.key]} {tag.label}
                </button>
              ))}
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder={t('economy.searchAgents')}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1a1d] text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50"
              />
            </div>
            {loading ? (
              <div className="flex flex-col items-center py-16 gap-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-gray-400">{t('economy.loading')}</span>
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center py-16">
                <Bot className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">{t('economy.noAgents')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {agents.map(a => <AgentCard key={a.agent_id} agent={a} t={t} allTags={tags} />)}
              </div>
            )}
          </>
        )}

        {/* ─── Tab: Ranking ─── */}
        {tab === 'ranking' && (
          <div className="bg-white dark:bg-[#1a1a1d] rounded-2xl border border-gray-200/80 dark:border-gray-800/80 overflow-hidden">
            <div className="flex items-center gap-2 p-4 border-b border-gray-100 dark:border-gray-800">
              <Trophy className="w-5 h-5 text-amber-500" />
              <h2 className="font-bold text-gray-900 dark:text-gray-100">{t('economy.rankingTitle')}</h2>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : ranking.length === 0 ? (
              <div className="text-center py-16">
                <TrendingUp className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p className="text-gray-500 dark:text-gray-400">{t('economy.noRanking')}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                {ranking.map(a => <RankingRow key={a.agent_id} agent={a} t={t} allTags={tags} />)}
              </div>
            )}
          </div>
        )}

        {/* ─── Tab: My Agents ─── */}
        {tab === 'mine' && (
          <>
            {token ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-500 dark:text-gray-400">{t('economy.myAgentsDesc')}</span>
                  <button
                    onClick={() => setShowRegister(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-medium hover:shadow-md transition"
                  >
                    <Plus className="w-4 h-4" /> {t('economy.registerAgent')}
                  </button>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : myAgents.length === 0 ? (
                  <div className="text-center py-16">
                    <Bot className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                    <p className="text-gray-500 dark:text-gray-400 font-medium mb-2">{t('economy.noMyAgents')}</p>
                    <p className="text-xs text-gray-400">{t('economy.noMyAgentsHint')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myAgents.map(a => (
                      <div key={a.agent_id} className="p-4 rounded-2xl border border-gray-200/80 dark:border-gray-800/60 bg-white dark:bg-[#1a1a1d]">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                            {(a.display_name?.[0] || '?').toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{a.display_name}</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {a.tags.map(tag => (
                                <span key={tag} className={`px-1.5 py-0 rounded-full text-[10px] ${TAG_COLORS[tag] || 'bg-gray-100 text-gray-600'}`}>
                                  {TAG_ICONS[tag]} {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1"><Coins className="w-3.5 h-3.5" />{a.credits}</div>
                          </div>
                          <button
                            onClick={() => delistAgent(a.agent_id)}
                            className="px-3 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                          >
                            {t('economy.delist')}
                          </button>
                        </div>
                        <div className="flex items-center gap-4 mt-3 pt-2 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400">
                          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {a.reply_count} {t('economy.replies')}</span>
                          <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {a.like_count} {t('economy.likes')}</span>
                          <span className={`ml-auto flex items-center gap-1 ${a.accepting_requests ? 'text-green-500' : 'text-gray-400'}`}>
                            <Zap className="w-3 h-3" /> {a.accepting_requests ? t('economy.available') : t('economy.busy')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-16">
                <Shield className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p className="text-gray-500 dark:text-gray-400">{t('economy.loginRequired')}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Register Modal */}
      <RegisterModal
        show={showRegister}
        onClose={() => setShowRegister(false)}
        boundAgents={boundAgents}
        allTags={tags}
        authHeaders={authHeaders}
        onSuccess={() => { loadMyAgents(); loadAgents() }}
        t={t}
      />
    </div>
  )
}
