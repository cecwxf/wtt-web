'use client'

import { useSession } from 'next-auth/react'
import { Bot, Bell, Brush, ClipboardCopy, Lock, User, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'
import { useI18n } from '@/lib/i18n-provider'

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

const PAGE_ITEMS: Array<{ key: SettingsPage; labelKey: string; icon: typeof User }> = [
  { key: 'profile', labelKey: 'settings.profile', icon: User },
  { key: 'binding', labelKey: 'settings.binding', icon: Bot },
  { key: 'notifications', labelKey: 'settings.notifications', icon: Bell },
  { key: 'privacy', labelKey: 'settings.privacy', icon: Lock },
  { key: 'appearance', labelKey: 'settings.appearance', icon: Brush },
  { key: 'about', labelKey: 'settings.about', icon: Bot },
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
  const { t } = useI18n()
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
  const [pluginCommandCreds, setPluginCommandCreds] = useState<{ agent_id: string; agent_token: string } | null>(null)

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
    const ok = confirm(t('settings.resetTokenConfirm'))
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
        alert(err.detail || t('settings.resetTokenFailed'))
      }
    } catch {
      alert(t('settings.networkError'))
    } finally {
      setResettingToken(null)
    }
  }

  const handleProvisionAgent = async () => {
    const token = session?.accessToken as string | undefined
    if (!token) {
      setProvisionError(t('settings.sessionExpired'))
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
        setProvisionError(data.detail ?? t('settings.failedCreateAgent'))
        return
      }

      setProvisioned({
        agent_id: data.agent_id,
        agent_token: data.agent_token,
        api_key: data.api_key,
      })
      setPluginCommandCreds({
        agent_id: data.agent_id,
        agent_token: data.agent_token,
      })
      setProvisionSuccess(t('settings.claimNewSuccess'))
      setProvisionDisplayName('')
      onBindingChanged?.()
    } catch {
      setProvisionError(t('settings.networkError'))
    } finally {
      setProvisioning(false)
    }
  }

  const handleClaimExisting = async () => {
    const token = session?.accessToken as string | undefined
    if (!token) {
      setClaimExistingError(t('settings.sessionExpired'))
      return
    }

    if (!existingAgentId.trim() || !existingAgentToken.trim()) {
      setClaimExistingError(t('settings.claimEmpty'))
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
        setClaimExistingError(data.detail ?? t('settings.failedClaimExisting'))
        return
      }

      setPluginCommandCreds({
        agent_id: data.agent_id || existingAgentId.trim(),
        agent_token: data.agent_token || existingAgentToken.trim(),
      })
      setClaimExistingSuccess(t('settings.claimExistingSuccess'))
      setExistingAgentId('')
      setExistingAgentToken('')
      setExistingDisplayName('')
      onBindingChanged?.()
    } catch {
      setClaimExistingError(t('settings.networkError'))
    } finally {
      setClaimingExisting(false)
    }
  }

  const handleCopy = async (text: string, okText = t('settings.copyOk')) => {
    try {
      await navigator.clipboard.writeText(text)
      alert(okText)
    } catch {
      alert(t('settings.copyFail'))
    }
  }

  const buildPluginCommand = (agentId: string, agentToken: string) => {
    const payload = JSON.stringify({ WTT_AGENT_ID: agentId, WTT_AGENT_TOKEN: agentToken })
    return [
      "python3 - <<'PY'",
      'from pathlib import Path',
      'import json',
      'import re',
      `updates = json.loads(${JSON.stringify(payload)})`,
      "env_path = Path.home() / '.openclaw' / 'workspace' / 'skills' / 'wtt-skill' / '.env'",
      'env_path.parent.mkdir(parents=True, exist_ok=True)',
      "text = env_path.read_text(encoding='utf-8') if env_path.exists() else ''",
      'for key, value in updates.items():',
      "    pattern = rf'^{key}=.*$'",
      '    if re.search(pattern, text, flags=re.MULTILINE):',
      "        text = re.sub(pattern, f'{key}={value}', text, flags=re.MULTILINE)",
      '    else:',
      "        if text and not text.endswith('\\n'):",
      "            text += '\\n'",
      "        text += f'{key}={value}\\n'",
      "env_path.write_text(text, encoding='utf-8')",
      "print(f'updated {env_path}')",
      'PY',
      'bash ~/.openclaw/workspace/skills/wtt-skill/scripts/status_autopoll.sh',
    ].join('\n')
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
            <p className="text-sm font-semibold text-slate-800">{t('settings.center')}</p>
            <p className="mt-1 text-xs text-slate-400">{t('settings.structHint')}</p>
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
                  {t(item.labelKey)}
                </button>
              )
            })}
          </nav>
        </aside>

        <section className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">
                {t(PAGE_ITEMS.find((item) => item.key === activePage)?.labelKey || 'settings.titleFallback')}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {selectedAgent
                  ? t('settings.currentAgent', { name: selectedAgent.display_name, id: selectedAgentId || 'n/a' })
                  : t('settings.currentAgentNone')}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-500 transition hover:text-slate-900"
              aria-label={t('common.close')}
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
                  {t(item.labelKey)}
                </option>
              ))}
            </select>
          </div>

          {activePage === 'profile' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-3 text-xs uppercase tracking-wide text-slate-400">{t('settings.account')}</p>
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
                  <span className="mb-2 block text-sm text-slate-500">{t('settings.displayName')}</span>
                  <input
                    defaultValue={session?.user?.name || 'WTT User'}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                </label>
                <label className="mt-3 block">
                  <span className="mb-2 block text-sm text-slate-500">{t('settings.email')}</span>
                  <input
                    defaultValue={session?.user?.email || ''}
                    disabled
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500 outline-none"
                  />
                </label>
                <label className="mt-3 block">
                  <span className="mb-2 block text-sm text-slate-500">{t('settings.bio')}</span>
                  <textarea
                    rows={3}
                    placeholder={t('settings.bioPlaceholder')}
                    className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                </label>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">{t('settings.linkedAgent')}</p>
                <p className="text-sm text-slate-600">
                  {selectedAgent ? `${selectedAgent.display_name} (${selectedAgentId})` : t('settings.noBoundAgent')}
                </p>
              </div>
            </div>
          )}

          {activePage === 'binding' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">{t('settings.claimNew')}</p>
                <p className="mt-1 text-xs text-slate-500">{t('settings.claimNewDesc')}</p>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={provisionDisplayName}
                    onChange={(e) => setProvisionDisplayName(e.target.value)}
                    placeholder={t('settings.agentDisplayOptional')}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleProvisionAgent}
                    disabled={provisioning}
                    className="shrink-0 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {provisioning ? t('settings.processing') : t('settings.claimNewBtn')}
                  </button>
                </div>

                {provisionError && <p className="mt-2 text-sm text-red-500">{provisionError}</p>}
                {provisionSuccess && <p className="mt-2 text-sm text-emerald-600">{provisionSuccess}</p>}

                {provisioned && (
                  <div className="mt-3 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs font-semibold text-emerald-700">{t('settings.saveCred')}</p>
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
                        {t('settings.copyAgentId')}
                      </button>
                      <button
                        onClick={() => handleCopy(provisioned.agent_token, 'agent_token copied')}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        {t('settings.copyAgentToken')}
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
                        {t('settings.copySnippet')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">{t('settings.claimExisting')}</p>
                <p className="mt-1 text-xs text-slate-500">{t('settings.claimExistingDesc')}</p>

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
                    placeholder={t('settings.displayNameOptional')}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleClaimExisting}
                    disabled={claimingExisting || !existingAgentId.trim() || !existingAgentToken.trim()}
                    className="w-full rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {claimingExisting ? t('settings.processing') : t('settings.claimExistingBtn')}
                  </button>
                </div>

                {claimExistingError && <p className="mt-2 text-sm text-red-500">{claimExistingError}</p>}
                {claimExistingSuccess && <p className="mt-2 text-sm text-emerald-600">{claimExistingSuccess}</p>}
              </div>

              {pluginCommandCreds && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                  <p className="text-sm font-semibold text-indigo-800">{t('settings.pluginCmdTitle')}</p>
                  <p className="mt-1 text-xs text-indigo-600">{t('settings.pluginCmdDesc')}</p>
                  <pre className="mt-3 max-h-56 overflow-auto rounded-lg border border-indigo-200 bg-white p-3 text-[11px] leading-5 text-slate-700">
                    {buildPluginCommand(pluginCommandCreds.agent_id, pluginCommandCreds.agent_token)}
                  </pre>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => handleCopy(buildPluginCommand(pluginCommandCreds.agent_id, pluginCommandCreds.agent_token), t('settings.pluginCmdCopied'))}
                      className="rounded border border-indigo-200 bg-white px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100"
                    >
                      {t('settings.copyPluginCmd')}
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">{t('settings.boundAgents', { count: agents.length })}</p>
                <p className="mt-1 text-xs text-slate-400">{t('settings.boundAgentsDesc')}</p>

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
                            title={t('settings.copyAgentToken')}
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
                          {resettingToken === agent.agent_id ? t('settings.resetting') : t('settings.resetToken')}
                        </button>
                      )}
                    </div>
                  ))}
                  {agents.length === 0 && (
                    <p className="py-4 text-center text-sm text-slate-400">{t('settings.noAgents')}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activePage === 'notifications' && (
            <div className="space-y-3">
              <ToggleRow label={t('settings.notifyMessage')} hint={t('settings.notifyMessageHint')} enabled={messageNotify} onToggle={setMessageNotify} />
              <ToggleRow label={t('settings.notifyAgent')} hint={t('settings.notifyAgentHint')} enabled={agentAlert} onToggle={setAgentAlert} />
              <ToggleRow label={t('settings.sound')} hint={t('settings.soundHint')} enabled={soundOn} onToggle={setSoundOn} />
            </div>
          )}

          {activePage === 'privacy' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">{t('settings.sessionToken')}</p>
                <p className="mt-1 text-sm text-slate-400">{t('settings.sessionTokenHint')}</p>
              </div>
              <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4">
                <p className="text-sm text-red-600">{t('settings.riskHint')}</p>
              </div>
            </div>
          )}

          {activePage === 'appearance' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[t('settings.themeLight'), t('settings.themeWarm'), t('settings.themeCool')].map((theme, i) => (
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
                <p className="text-sm font-semibold text-slate-800">{t('settings.aboutTitle')}</p>
                <p className="mt-1 text-sm text-slate-400">{t('settings.aboutDesc')}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
                {t('settings.aboutHelp')}
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
