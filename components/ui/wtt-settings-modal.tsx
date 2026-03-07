'use client'

import { useSession } from 'next-auth/react'
import { Bot, Bell, Brush, KeyRound, Lock, RefreshCw, User, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

type SettingsPage = 'profile' | 'binding' | 'notifications' | 'poll' | 'privacy' | 'appearance' | 'api' | 'about'

interface AgentOption {
  id: string
  agent_id: string
  display_name: string
  is_primary: boolean
}

interface ManagerDelegation {
  id: string
  manager_agent_id: string
  target_agent_id: string
  can_publish: boolean
  can_p2p: boolean
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
  { key: 'poll', label: 'Poll 配置', icon: RefreshCw },
  { key: 'privacy', label: '隐私与安全', icon: Lock },
  { key: 'appearance', label: '外观', icon: Brush },
  { key: 'api', label: 'API 与 MCP', icon: KeyRound },
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
  const [pollSeconds, setPollSeconds] = useState(5)
  const [claimCode, setClaimCode] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState('')
  const [claimSuccess, setClaimSuccess] = useState('')

  const [managerAgentId, setManagerAgentId] = useState('')
  const [targetAgentId, setTargetAgentId] = useState('')
  const [delegations, setDelegations] = useState<ManagerDelegation[]>([])
  const [managerMsg, setManagerMsg] = useState('')

  useEffect(() => {
    if (!open) return
    if (!managerAgentId && agents.length > 0) {
      setManagerAgentId(agents[0].agent_id)
      setTargetAgentId(agents[1]?.agent_id || agents[0].agent_id)
    }
  }, [open, agents, managerAgentId])

  const loadDelegations = async (managerId: string) => {
    if (!managerId) {
      setDelegations([])
      return
    }
    try {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/manager/delegations?manager_agent_id=${encodeURIComponent(managerId)}`)
      if (!r.ok) {
        setDelegations([])
        return
      }
      const rows = await r.json()
      setDelegations(Array.isArray(rows) ? rows : [])
    } catch {
      setDelegations([])
    }
  }

  useEffect(() => {
    if (!open || activePage !== 'binding') return
    if (!managerAgentId) return
    loadDelegations(managerAgentId)
  }, [open, activePage, managerAgentId])

  const grantManager = async () => {
    if (!managerAgentId || !targetAgentId) {
      setManagerMsg('请选择管家和被代理 Agent')
      return
    }
    const r = await fetch(`${CLIENT_WTT_API_BASE}/manager/delegations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manager_agent_id: managerAgentId,
        target_agent_id: targetAgentId,
        can_publish: true,
        can_p2p: true,
      }),
    })
    if (!r.ok) {
      setManagerMsg(`授权失败: ${await r.text()}`)
      return
    }
    setManagerMsg('授权成功：管家可代理该 Agent 全部功能')
    loadDelegations(managerAgentId)
  }

  const grantManagerForAll = async () => {
    if (!managerAgentId) {
      setManagerMsg('请先选择管家 Agent')
      return
    }

    const targets = agents.filter((a) => a.agent_id !== managerAgentId)
    if (targets.length === 0) {
      setManagerMsg('没有可授权的其他 Agent')
      return
    }

    let ok = 0
    let fail = 0
    for (const t of targets) {
      const r = await fetch(`${CLIENT_WTT_API_BASE}/manager/delegations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manager_agent_id: managerAgentId,
          target_agent_id: t.agent_id,
          can_publish: true,
          can_p2p: true,
        }),
      })
      if (r.ok) ok += 1
      else fail += 1
    }

    setManagerMsg(`批量授权完成：成功 ${ok}，失败 ${fail}`)
    loadDelegations(managerAgentId)
  }

  const removeManager = async (targetId: string) => {
    const r = await fetch(
      `${CLIENT_WTT_API_BASE}/manager/delegations?manager_agent_id=${encodeURIComponent(managerAgentId)}&target_agent_id=${encodeURIComponent(targetId)}`,
      { method: 'DELETE' }
    )
    if (!r.ok) {
      setManagerMsg(`移除失败: ${await r.text()}`)
      return
    }
    setManagerMsg('已移除授权')
    loadDelegations(managerAgentId)
  }

  const handleClaim = async () => {
    const code = claimCode.trim()
    if (!code) {
      setClaimError('Please enter claim code')
      return
    }

    const token = session?.accessToken as string | undefined
    if (!token) {
      setClaimError('Session expired, please login again')
      return
    }

    setClaiming(true)
    setClaimError('')
    setClaimSuccess('')
    try {
      const response = await fetch(`${CLIENT_WTT_API_BASE}/agents/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setClaimError(data.detail ?? 'Failed to claim agent')
        return
      }

      setClaimCode('')
      setClaimSuccess('Agent claimed successfully')
      onBindingChanged?.()
    } catch {
      setClaimError('Network error')
    } finally {
      setClaiming(false)
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
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Profile</p>
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-500">Display Name</span>
                  <input
                    defaultValue={selectedAgent?.display_name ?? 'WTT User'}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
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
            </div>
          )}

          {activePage === 'binding' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">OpenClaw 绑定</p>
                <p className="mt-1 text-sm text-slate-400">输入 Agent 端生成的 Claim Code 直接绑定。</p>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={claimCode}
                    onChange={(e) => setClaimCode(e.target.value)}
                    placeholder="WTT-CLAIM-XXXXXX"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleClaim}
                    disabled={claiming || !claimCode.trim()}
                    className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {claiming ? 'Claiming...' : 'Claim'}
                  </button>
                </div>

                {claimError && <p className="mt-2 text-sm text-red-500">{claimError}</p>}
                {claimSuccess && <p className="mt-2 text-sm text-emerald-600">{claimSuccess}</p>}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">绑定状态</p>
                <p className="mt-1 text-sm text-slate-400">已绑定 Agent 数量：{agents.length}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">Agent 管家（简化模式）</p>
                <p className="mt-1 text-sm text-slate-400">1) 选择一个管家 Agent 2) 授权代理某个 Agent 全部功能（发布 + P2P）</p>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    value={managerAgentId}
                    onChange={(e) => setManagerAgentId(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  >
                    {agents.map((a) => (
                      <option key={`m-${a.agent_id}`} value={a.agent_id}>{a.display_name} ({a.agent_id})</option>
                    ))}
                  </select>
                  <select
                    value={targetAgentId}
                    onChange={(e) => setTargetAgentId(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  >
                    {agents.map((a) => (
                      <option key={`t-${a.agent_id}`} value={a.agent_id}>{a.display_name} ({a.agent_id})</option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={grantManager}
                    className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
                  >
                    授权管家
                  </button>
                  <button
                    onClick={grantManagerForAll}
                    className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
                  >
                    设为全部 Agent 管家
                  </button>
                  <button
                    onClick={() => loadDelegations(managerAgentId)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 hover:text-slate-900"
                  >
                    刷新
                  </button>
                </div>

                {managerMsg && <p className="mt-2 text-sm text-indigo-500">{managerMsg}</p>}

                <div className="mt-3 space-y-2">
                  {delegations.length === 0 && <p className="text-xs text-slate-400">暂无授权</p>}
                  {delegations.map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
                      <div className="text-xs text-slate-600">{d.manager_agent_id} → {d.target_agent_id}（全功能）</div>
                      <button onClick={() => removeManager(d.target_agent_id)} className="rounded bg-red-600/20 px-2 py-1 text-xs text-red-600">
                        取消
                      </button>
                    </div>
                  ))}
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

          {activePage === 'poll' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">轮询间隔（秒）</p>
              <div className="mt-3 flex items-center gap-4">
                <input
                  type="range"
                  min={3}
                  max={30}
                  value={pollSeconds}
                  onChange={(e) => setPollSeconds(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <span className="w-12 text-right text-sm font-semibold text-slate-800">{pollSeconds}s</span>
              </div>
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

          {activePage === 'api' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">MCP Config Snippet</p>
                <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-3 text-xs text-emerald-600">{`{\n  "mcpServers": {\n    "wtt": {\n      "command": "python3",\n      "args": ["/path/to/mcp_server/server.py"],\n      "env": { "WTT_API_URL": "${process.env.NEXT_PUBLIC_WTT_API_URL || 'http://localhost:8000'}" }\n    }\n  }\n}`}</pre>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
                推荐在 Agent 管理页复制每个 Agent 的 API Key 进行调用。
              </div>
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
