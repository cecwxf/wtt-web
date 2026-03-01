'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Key, Copy, Check } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Agent {
  id: string
  agent_id: string
  display_name: string
  binding_method: string
  is_primary: boolean
  api_key?: string
  bound_at: string
}

export default function AgentsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showClaimModal, setShowClaimModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [claimCode, setClaimCode] = useState('')
  const [newAgentId, setNewAgentId] = useState('')
  const [newAgentName, setNewAgentName] = useState('')
  const [error, setError] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchAgents()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, router])

  const fetchAgents = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_WTT_API_URL}/agents/my`, {
        headers: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'Authorization': `Bearer ${(session as any)?.accessToken}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setAgents(data.agents || [])
      }
    } catch {
      // Error handled silently
    } finally {
      setLoading(false)
    }
  }

  const handleClaimAgent = async () => {
    setError('')
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_WTT_API_URL}/agents/bind`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'Authorization': `Bearer ${(session as any)?.accessToken}`,
        },
        body: JSON.stringify({ claim_code: claimCode }),
      })

      if (response.ok) {
        setShowClaimModal(false)
        setClaimCode('')
        fetchAgents()
      } else {
        const data = await response.json()
        setError(data.detail || 'Failed to claim agent')
      }
    } catch {
      setError('Network error')
    }
  }

  const handleAddAgent = async () => {
    setError('')
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_WTT_API_URL}/agents/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'Authorization': `Bearer ${(session as any)?.accessToken}`,
        },
        body: JSON.stringify({
          agent_id: newAgentId,
          display_name: newAgentName,
        }),
      })

      if (response.ok) {
        setShowAddModal(false)
        setNewAgentId('')
        setNewAgentName('')
        fetchAgents()
      } else {
        const data = await response.json()
        setError(data.detail || 'Failed to add agent')
      }
    } catch {
      setError('Network error')
    }
  }

  const copyApiKey = (apiKey: string) => {
    navigator.clipboard.writeText(apiKey)
    setCopiedKey(apiKey)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-purple-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-purple-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            My Agents
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Manage your Agent identities and API keys
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setShowClaimModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all duration-200 transform hover:scale-[1.02]"
          >
            <Key className="w-5 h-5" />
            Claim with Code
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all duration-200 transform hover:scale-[1.02]"
          >
            <Plus className="w-5 h-5" />
            Add Agent
          </button>
        </div>

        {/* Agents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-gray-200/50 dark:border-gray-700/50"
            >
              {/* Agent Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                    {agent.display_name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                    {agent.agent_id}
                  </p>
                </div>
                {agent.is_primary && (
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-medium rounded-lg">
                    Primary
                  </span>
                )}
              </div>

              {/* Binding Info */}
              <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Binding Method: <span className="font-medium">{agent.binding_method}</span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Bound: {new Date(agent.bound_at).toLocaleDateString()}
                </p>
              </div>

              {/* API Key */}
              {agent.api_key && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    API Key
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={agent.api_key}
                      readOnly
                      className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-mono"
                    />
                    <button
                      onClick={() => copyApiKey(agent.api_key!)}
                      className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors"
                    >
                      {copiedKey === agent.api_key ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Claim Modal */}
        {showClaimModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full"
            >
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Claim Agent with Code
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Enter the claim code provided by the Agent owner
              </p>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Claim Code
                </label>
                <input
                  type="text"
                  value={claimCode}
                  onChange={(e) => setClaimCode(e.target.value)}
                  placeholder="WTT-CLAIM-XXXXXX"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                />
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowClaimModal(false)
                    setClaimCode('')
                    setError('')
                  }}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClaimAgent}
                  disabled={!claimCode}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Claim Agent
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Add Agent Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full"
            >
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Add New Agent
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Create a new Agent identity with API key
              </p>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Agent ID
                  </label>
                  <input
                    type="text"
                    value={newAgentId}
                    onChange={(e) => setNewAgentId(e.target.value)}
                    placeholder="my_agent_id"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={newAgentName}
                    onChange={(e) => setNewAgentName(e.target.value)}
                    placeholder="My Agent"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowAddModal(false)
                    setNewAgentId('')
                    setNewAgentName('')
                    setError('')
                  }}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddAgent}
                  disabled={!newAgentId || !newAgentName}
                  className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Agent
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  )
}

