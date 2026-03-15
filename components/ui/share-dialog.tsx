'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { X, Share2, UserPlus, Loader2, Trash2 } from 'lucide-react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

interface ClaimUser {
  user_id: string
  display_name: string
  avatar_url: string | null
  is_self: boolean
  is_primary: boolean
}

interface ShareInfo {
  user_id: string
  display_name: string
  shared_by: string
  created_at: string
}

interface ShareDialogProps {
  open: boolean
  onClose: () => void
  topicId: string
  agentId: string
  topicName?: string
}

export function ShareDialog({ open, onClose, topicId, agentId, topicName }: ShareDialogProps) {
  const { data: session } = useSession()
  const [claimUsers, setClaimUsers] = useState<ClaimUser[]>([])
  const [shares, setShares] = useState<ShareInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [sharingUserId, setSharingUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const token = session?.accessToken ?? ''

  const loadData = useCallback(async () => {
    if (!token || !agentId) return
    setLoading(true)
    setError(null)
    try {
      const [usersRes, sharesRes] = await Promise.all([
        fetch(`${CLIENT_WTT_API_BASE}/agents/${agentId}/claim-users`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${CLIENT_WTT_API_BASE}/topics/${topicId}/shares`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      if (usersRes.ok) {
        const data = await usersRes.json()
        setClaimUsers(data.users || [])
      }
      if (sharesRes.ok) {
        const data = await sharesRes.json()
        setShares(data || [])
      }
    } catch {
      setError('Failed to load sharing data')
    } finally {
      setLoading(false)
    }
  }, [token, agentId, topicId])

  useEffect(() => {
    if (open) loadData()
  }, [open, loadData])

  const handleShare = async (userId: string) => {
    setSharingUserId(userId)
    try {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/topics/${topicId}/share`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.detail || 'Failed to share')
        return
      }
      await loadData()
    } catch {
      setError('Network error')
    } finally {
      setSharingUserId(null)
    }
  }

  const handleUnshare = async (userId: string) => {
    setSharingUserId(userId)
    try {
      const res = await fetch(`${CLIENT_WTT_API_BASE}/topics/${topicId}/share/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.detail || 'Failed to revoke share')
        return
      }
      await loadData()
    } catch {
      setError('Network error')
    } finally {
      setSharingUserId(null)
    }
  }

  if (!open) return null

  const sharedUserIds = new Set(shares.map(s => s.user_id))
  const otherUsers = claimUsers.filter(u => !u.is_self)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Share Topic
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {topicName && (
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Share <span className="font-medium text-slate-700 dark:text-slate-200">&ldquo;{topicName}&rdquo;</span> with other users of this agent
            </p>
          )}

          {error && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : otherUsers.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              No other users have claimed this agent
            </div>
          ) : (
            <div className="space-y-2">
              {otherUsers.map(user => {
                const isShared = sharedUserIds.has(user.user_id)
                const isProcessing = sharingUserId === user.user_id

                return (
                  <div
                    key={user.user_id}
                    className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 transition hover:border-slate-200 dark:border-slate-700 dark:hover:border-slate-600"
                  >
                    <div className="flex items-center gap-3">
                      {user.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt={user.display_name}
                          className="h-8 w-8 rounded-full"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                          {user.display_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {user.display_name}
                        </p>
                        {user.is_primary && (
                          <span className="text-[10px] text-slate-400">primary</span>
                        )}
                      </div>
                    </div>

                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    ) : isShared ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-emerald-500">Shared</span>
                        <button
                          onClick={() => handleUnshare(user.user_id)}
                          className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                          title="Revoke access"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleShare(user.user_id)}
                        className="flex items-center gap-1 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/40"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Share
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <p className="text-[10px] text-slate-400">
            {claimUsers.length} user{claimUsers.length !== 1 ? 's' : ''} claim this agent (max 10)
          </p>
        </div>
      </div>
    </div>
  )
}
