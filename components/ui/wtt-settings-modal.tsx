'use client'

import { useSession } from 'next-auth/react'
import { Bot, Bell, Brush, ClipboardCopy, Lock, User, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

type SettingsPage = 'profile' | 'binding' | 'notifications' | 'poll' | 'privacy' | 'appearance' | 'api' | 'about'

interface AgentOption {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
  invite_code?: string
  invite_status?: 'active' | 'none'
}

interface WttSettingsModalProps {
  open: boolean
  onClose: () => void
  activePage: SettingsPage
  onPageChange: (page: SettingsPage) => void
  agents: AgentOption[]
  selectedAgentId: string
  onBindingChanged?: () => void
}

const PAGE_ITEMS: Array<{ key: SettingsPage; label: string; icon: typeof User }> = [
  { key: 'profile', label: '我的资料', icon: User },
  { key: 'binding', label: 'Agent 绑定', icon: Bot },
  { key: 'notifications', label: '通知设置', icon: Bell },
  { key: 'privacy', label: '隐私与安全', icon: Lock },
  { key: 'appearance', label: '外观', icon: Brush },
  { key: 'about', label: '关于 WTT', icon: Bot },
]

export function WttSettingsModal({
  open,
  onClose,
  activePage,
  onPageChange,
  agents,
  selectedAgentId,
  onBindingChanged,
}: WttSettingsModalProps) {
  const { data: session } = useSession()
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.agent_id === selectedAgentId),
    [agents, selectedAgentId]
  )
  const [messageNotify, setMessageNotify] = useState(true)
  const [agentAlert, setAgentAlert] = useState(true)
  const [soundOn, setSoundOn] = useState(false)
  const [provisionDisplayName, setProvisionDisplayName] = useState('')
  const [provisioning, setProvisioning] = useState(false)
  const [provisionError, setProvisionError] = useState('')
  const [provisionSuccess, setProvisionSuccess] = useState('')
  const [provisioned, setProvisioned] = useState<{ agent_id: string; agent_token: string; api_key?: string } | null>(null)

  const [existingAgentId, setExistingAgentId] = useState('')
  const [existingAgentToken, setExistingAgentToken] = useState('')
  const [existingDisplayName, setExistingDisplayName] = useState('')
  const [claimingExisting, setClaimingExisting] = useState(false)
  const [claimExistingError, setClaimExistingError] = useState('')
  const [claimExistingSuccess, setClaimExistingSuccess] = useState('')

  // Reset agent token
  const [resettingToken, setResettingToken] = useState<string | null>(null)
  const [agentTokens, setAgentTokens] = useState<Record<string, string>>({})

  const handleResetToken = async (agentId: string) => {
    const token = session?.accessToken as string | undefined
    if (!token) return
    const ok = confirm('重置 Agent Token 后，旧 token 立即失效。\n你需要将新 token 更新到 openclaw.json 中。\n确定继续？')
    if (!ok) return
    setResettingToken(agentId)
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/agents/${encodeURIComponent(agentId)}/reset-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) {
        const data = await response.json().catch(() => ({}))
        if (data.agent_token) {
          setAgentTokens((prev) => ({ ...prev, [agentId]: data.agent_token }))
        }
      } else {
        const err = await response.json().catch(() => ({ detail: 'Failed' }))
        alert(err.detail || 'Failed to reset token')
      }
    } catch {
      alert('Network error')
    } finally {
      setResettingToken(null)
    }
  }

  const handleProvisionAgent = async () => {
    const token = session?.accessToken as string | undefined
    if (!token) {
      setProvisionError('Session expired, please login again')
      return
    }

    setProvisioning(true)
    setProvisionError('')
    setProvisionSuccess('')
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/agents/provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          display_name: provisionDisplayName.trim() || undefined,
          platform: 'openclaw',
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setProvisionError(data.detail ?? 'Failed to create agent')
        return
      }

      setProvisioned({
        agent_id: data.agent_id,
        agent_token: data.agent_token,
        api_key: data.api_key,
      })
      setProvisionSuccess('Agent created and bound successfully')
      setProvisionDisplayName('')
      onBindingChanged?.()
    } catch {
      setProvisionError('Network error')
    } finally {
      setProvisioning(false)
    }
  }

  const handleClaimExisting = async () => {
    const token = session?.accessToken as string | undefined
    if (!token) {
      setClaimExistingError('Session expired, please login again')
      return
    }

    if (!existingAgentId.trim() || !existingAgentToken.trim()) {
      setClaimExistingError('agent_id 和 agent_token 都不能为空')
      return
    }

    setClaimingExisting(true)
    setClaimExistingError('')
    setClaimExistingSuccess('')

    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/agents/claim-existing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          agent_id: existingAgentId.trim(),
          agent_token: existingAgentToken.trim(),
          display_name: existingDisplayName.trim() || undefined,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setClaimExistingError(data.detail ?? 'Failed to claim existing agent')
        return
      }

      setClaimExistingSuccess('Existing agent claimed successfully')
      setExistingAgentId('')
      setExistingAgentToken('')
      setExistingDisplayName('')
      onBindingChanged?.()
    } catch {
      setClaimExistingError('Network error')
    } finally {
      setClaimingExisting(false)
    }
  }

  const handleCopy = async (text: string, okText = 'Copied!') => {
    try {
      await navigator.clipboard.writeText(text)
      alert(okText)
    } catch {
      alert('Copy failed')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-[86vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-50 md:block">
          <div className="border-b border-slate-200 px-4 py-5">
            <p className="text-sm font-semibold text-slate-800">WTT 设置中心</p>
            <p className="mt-1 text-xs text-slate-400">对齐 `wtt-client-v2` 的设置结构</p>
          </div>
          <nav className="p-2">
            {PAGE_ITEMS.map((item) => {
              const Icon = item.icon
              const active = activePage === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => onPageChange(item.key)}
                  className={`mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    active ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-white/60 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </aside>

        <section className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">
                {PAGE_ITEMS.find((item) => item.key === activePage)?.label ?? '设置'}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                当前 Agent：{selectedAgent?.display_name ?? '未选择'} ({selectedAgentId || 'n/a'})
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-500 transition hover:text-slate-900"
              aria-label="Close settings"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 md:hidden">
            <select
              value={activePage}
              onChange={(e) => onPageChange(e.target.value as SettingsPage)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500"
            >
              {PAGE_ITEMS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          {activePage === 'profile' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-3 text-xs uppercase tracking-wide text-slate-400">Account</p>
                {session?.user?.image && (
                  <div className="mb-3 flex items-center gap-3">
                    <img src={session.user.image} alt="avatar" className="h-14 w-14 rounded-full border-2 border-indigo-200" />
                    <div>
                      <p className="text-base font-semibold text-slate-800">{session.user.name || 'WTT User'}</p>
                      {session.user.email && <p className="text-xs text-slate-400">{session.user.email}</p>}
                    </div>
                  </div>
                )}
                {!session?.user?.image && (
                  <div className="mb-3">
                    <p className="text-base font-semibold text-slate-800">{session?.user?.name || 'WTT User'}</p>
                    {session?.user?.email && <p className="text-xs text-slate-400">{session.user.email}</p>}
                  </div>
                )}
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-500">Display Name</span>
                  <input
                    defaultValue={session?.user?.name || 'WTT User'}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                </label>
                <label className="mt-3 block">
                  <span className="mb-2 block text-sm text-slate-500">Email</span>
                  <input
                    defaultValue={session?.user?.email || ''}
                    disabled
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500 outline-none"
                  />
                </label>
                <label className="mt-3 block">
                  <span className="mb-2 block text-sm text-slate-500">Bio</span>
                  <textarea
                    rows={3}
                    placeholder="介绍你关注的话题方向..."
                    className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                </label>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Linked Agent</p>
                <p className="text-sm text-slate-600">
                  {selectedAgent ? `${selectedAgent.display_name} (${selectedAgentId})` : '未绑定 Agent'}
                </p>
              </div>
            </div>
          )}

          {activePage === 'binding' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">🚀 Claim Agent（New）</p>
                <p className="mt-1 text-xs text-slate-500">新 agent 不在 WTT 体系时，直接一键生成 agent_id + agent_token 并绑定到当前登录用户。</p>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={provisionDisplayName}
                    onChange={(e) => setProvisionDisplayName(e.target.value)}
                    placeholder="Agent 显示名（可选）"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleProvisionAgent}
                    disabled={provisioning}
                    className="shrink-0 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {provisioning ? '处理中...' : 'Claim New Agent'}
                  </button>
                </div>

                {provisionError && <p className="mt-2 text-sm text-red-500">{provisionError}</p>}
                {provisionSuccess && <p className="mt-2 text-sm text-emerald-600">{provisionSuccess}</p>}

                {provisioned && (
                  <div className="mt-3 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs font-semibold text-emerald-700">请立即保存以下凭据（token 仅展示一次）</p>
                    <div className="grid gap-2">
                      <div className="rounded border border-emerald-200 bg-white p-2">
                        <p className="text-[11px] text-slate-500">agent_id</p>
                        <code className="text-xs text-slate-800">{provisioned.agent_id}</code>
                      </div>
                      <div className="rounded border border-emerald-200 bg-white p-2">
                        <p className="text-[11px] text-slate-500">agent_token</p>
                        <code className="text-xs text-slate-800 break-all">{provisioned.agent_token}</code>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleCopy(provisioned.agent_id, 'agent_id copied')}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Copy agent_id
                      </button>
                      <button
                        onClick={() => handleCopy(provisioned.agent_token, 'agent_token copied')}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Copy agent_token
                      </button>
                      <button
                        onClick={() => handleCopy(JSON.stringify({
                          channels: {
                            wtt: {
                              accounts: {
                                default: {
                                  enabled: true,
                                  cloudUrl: CLIENT_WTT_API_BASE,
                                  agentId: provisioned.agent_id,
                                  token: provisioned.agent_token,
                                  slashCompat: true,
                                  slashCompatWttPrefixOnly: true,
                                  slashBypassMentionGate: true,
                                  taskExecutorScope: 'pipeline_only',
                                },
                              },
                            },
                          },
                        }, null, 2), 'openclaw.json snippet copied')}
                        className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100"
                      >
                        Copy openclaw.json snippet
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">🔐 Claim Agent（Existing）</p>
                <p className="mt-1 text-xs text-slate-500">已注册过的 agent，输入 agent_id + agent_token 重新绑定。仅 owner 可继续使用。</p>

                <div className="mt-3 space-y-2">
                  <input
                    value={existingAgentId}
                    onChange={(e) => setExistingAgentId(e.target.value)}
                    placeholder="agent_id"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                  <input
                    value={existingAgentToken}
                    onChange={(e) => setExistingAgentToken(e.target.value)}
                    placeholder="agent_token"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                  <input
                    value={existingDisplayName}
                    onChange={(e) => setExistingDisplayName(e.target.value)}
                    placeholder="显示名称（可选）"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleClaimExisting}
                    disabled={claimingExisting || !existingAgentId.trim() || !existingAgentToken.trim()}
                    className="w-full rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {claimingExisting ? '处理中...' : 'Claim Existing Agent'}
                  </button>
                </div>

                {claimExistingError && <p className="mt-2 text-sm text-red-500">{claimExistingError}</p>}
                {claimExistingSuccess && <p className="mt-2 text-sm text-emerald-600">{claimExistingSuccess}</p>}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">已绑定 Agent（{agents.length}）</p>
                <p className="mt-1 text-xs text-slate-400">可在此重置 token（旧 token 会立刻失效）。</p>

                <div className="mt-3 space-y-2">
                  {agents.map((agent) => (
                    <div key={agent.agent_id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="truncate text-sm font-medium text-slate-800">{agent.display_name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{agent.agent_id}</p>

                      {agentTokens[agent.agent_id] ? (
                        <div className="mt-2 flex items-center gap-2">
                          <code className="flex-1 truncate rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 font-mono border border-amber-200">{agentTokens[agent.agent_id]}</code>
                          <button
                            onClick={() => handleCopy(agentTokens[agent.agent_id], 'Token copied')}
                            className="shrink-0 rounded border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-amber-600"
                            title="复制 Token"
                          >
                            <ClipboardCopy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleResetToken(agent.agent_id)}
                          disabled={resettingToken === agent.agent_id}
                          className="mt-2 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                        >
                          {resettingToken === agent.agent_id ? '重置中...' : '🔑 重置 Agent Token'}
                        </button>
                      )}
                    </div>
                  ))}
                  {agents.length === 0 && (
                    <p className="py-4 text-center text-sm text-slate-400">暂无绑定的 Agent</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activePage === 'notifications' && (
            <div className="space-y-3">
              <ToggleRow label="消息提醒" hint="新消息到达时显示通知" enabled={messageNotify} onToggle={setMessageNotify} />
              <ToggleRow label="Agent 状态提醒" hint="Agent 离线/恢复时通知" enabled={agentAlert} onToggle={setAgentAlert} />
              <ToggleRow label="提示音" hint="播放提示音" enabled={soundOn} onToggle={setSoundOn} />
            </div>
          )}

          {activePage === 'privacy' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">会话与令牌</p>
                <p className="mt-1 text-sm text-slate-400">建议定期更新 API Key，并在共享设备上退出登录。</p>
              </div>
              <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4">
                <p className="text-sm text-red-600">高风险操作建议在 Agent 页面执行，避免误解绑主 Agent。</p>
              </div>
            </div>
          )}

          {activePage === 'appearance' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {['Light (Active)', 'Warm Neutral', 'Cool Blue'].map((theme, i) => (
                <button
                  key={theme}
                  className={`rounded-xl border px-3 py-8 text-sm transition ${i === 0 ? 'border-indigo-300 bg-indigo-50 text-indigo-600 font-medium' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300'}`}
                >
                  {theme}
                </button>
              ))}
            </div>
          )}

          {activePage === 'about' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">WTT Client v2 Style</p>
                <p className="mt-1 text-sm text-slate-400">当前界面已按你提供的 `wtt-client-v2.html` 风格重构。</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
                Need help? 提交 issue 或继续让我细化到逐像素对齐。
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  enabled,
  onToggle,
}: {
  label: string
  hint: string
  enabled: boolean
  onToggle: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      </div>
      <button
        onClick={() => onToggle(!enabled)}
        className={`relative h-6 w-11 rounded-full border transition ${enabled ? 'border-indigo-300 bg-indigo-100' : 'border-slate-200 bg-white'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full transition ${enabled ? 'left-[22px] bg-indigo-500' : 'left-0.5 bg-[#62768a]'}`}
        />
      </button>
    </div>
  )
}
