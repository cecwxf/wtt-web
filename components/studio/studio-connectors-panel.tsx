'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, KeyRound, Loader2, PlugZap, Trash2, X } from 'lucide-react'
import {
  deleteStudioConnector,
  fetchStudioConnectorCatalog,
  fetchStudioConnectors,
  upsertStudioConnector,
} from '@/lib/studio/api'
import type { StudioConnector, StudioConnectorCatalogItem } from '@/lib/studio/types'

type StudioConnectorsPanelProps = {
  open: boolean
  token: string
  projectTopicId?: string
  onClose: () => void
}

const providerLabels: Record<string, string> = {
  github: 'GitHub',
  supabase: 'Supabase',
  vercel: 'Vercel',
  cloudflare: 'Cloudflare',
  stripe: 'Stripe',
  figma: 'Figma',
}

export function StudioConnectorsPanel({ open, token, projectTopicId = '', onClose }: StudioConnectorsPanelProps) {
  const [catalog, setCatalog] = useState<StudioConnectorCatalogItem[]>([])
  const [connectors, setConnectors] = useState<StudioConnector[]>([])
  const [provider, setProvider] = useState('github')
  const [status, setStatus] = useState('active')
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const selectedSpec = useMemo(
    () => catalog.find((item) => item.id === provider) || catalog[0],
    [catalog, provider],
  )

  const fields = useMemo(() => {
    if (!selectedSpec) return []
    return [...(selectedSpec.required || []), ...(selectedSpec.optional || [])]
  }, [selectedSpec])

  async function load() {
    if (!open || !token) return
    setLoading(true)
    setError('')
    try {
      const [catalogData, connectorData] = await Promise.all([
        fetchStudioConnectorCatalog(),
        fetchStudioConnectors(projectTopicId, token),
      ])
      setCatalog(catalogData.items || [])
      setConnectors(connectorData.items || [])
      if (catalogData.items?.[0]?.id && !provider) setProvider(catalogData.items[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connectors')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token, projectTopicId])

  useEffect(() => {
    setCredentials({})
    setMessage('')
    setError('')
  }, [provider])

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedSpec || saving) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const cleanCredentials = Object.fromEntries(
        Object.entries(credentials).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value),
      )
      await upsertStudioConnector(
        {
          provider,
          project_topic_id: projectTopicId,
          name: selectedSpec.name,
          status,
          credentials: cleanCredentials,
          metadata: { scope: projectTopicId ? 'project' : 'user' },
        },
        token,
      )
      setCredentials({})
      setMessage(`${selectedSpec.name} connector saved.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save connector')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(connector: StudioConnector) {
    setError('')
    setMessage('')
    try {
      await deleteStudioConnector(connector.id, token)
      setMessage(`${connector.name} connector removed.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete connector')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#101820] text-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1 text-xs font-semibold text-cyan-100">
              <PlugZap className="h-3.5 w-3.5" />
              Studio Connectors
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Connect external services</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
              保存 GitHub、Supabase、Vercel、Cloudflare、Stripe、Figma 等凭据。密钥加密保存在 WTT 后端，前端只显示配置状态；Cloud Agent 需要时通过 agent-context 接口临时获取 env。
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[1fr_1.05fr]">
          <section className="min-h-0 overflow-y-auto border-r border-white/10 p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Configured</p>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-cyan-100" />}
            </div>
            <div className="space-y-3">
              {connectors.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-slate-400">
                  No connectors yet. Add GitHub first for code persistence, then Supabase/Vercel for real apps.
                </div>
              )}
              {connectors.map((connector) => (
                <div key={connector.id} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-semibold text-white">
                        {connector.name || providerLabels[connector.provider] || connector.provider}
                        {connector.status === 'active' && !connector.missing_required_env_keys.length && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                        )}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {connector.project_topic_id ? 'Project scoped' : 'User scoped'} · {connector.status}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(connector)}
                      className="rounded-full border border-white/10 p-2 text-slate-400 hover:border-red-200/30 hover:bg-red-400/10 hover:text-red-100"
                      aria-label={`Delete ${connector.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {connector.configured_env_keys.map((key) => (
                      <span key={key} className="rounded-full bg-emerald-300/10 px-2 py-1 text-[11px] font-semibold text-emerald-100">
                        {key}
                      </span>
                    ))}
                    {connector.missing_required_env_keys.map((key) => (
                      <span key={key} className="rounded-full bg-amber-300/10 px-2 py-1 text-[11px] font-semibold text-amber-100">
                        missing {key}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="min-h-0 overflow-y-auto p-5">
            <form onSubmit={handleSave} className="rounded-3xl border border-white/10 bg-white/[0.045] p-5">
              <div className="flex items-center gap-3">
                <span className="rounded-2xl bg-cyan-200/10 p-3 text-cyan-100">
                  <KeyRound className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-lg font-semibold text-white">Add or update connector</p>
                  <p className="text-xs text-slate-500">Leaving secret fields blank keeps existing saved credentials.</p>
                </div>
              </div>

              <label className="mt-5 block text-sm font-semibold text-slate-200">
                Provider
                <select
                  value={provider}
                  onChange={(event) => setProvider(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0b1117] px-4 py-3 text-sm text-white outline-none focus:border-cyan-200/60"
                >
                  {catalog.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>

              {selectedSpec && (
                <div className="mt-4 rounded-2xl border border-cyan-200/10 bg-cyan-200/[0.04] p-4">
                  <p className="text-sm font-semibold text-cyan-50">{selectedSpec.name}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{selectedSpec.description}</p>
                </div>
              )}

              <label className="mt-4 block text-sm font-semibold text-slate-200">
                Status
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0b1117] px-4 py-3 text-sm text-white outline-none focus:border-cyan-200/60"
                >
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>

              <div className="mt-4 grid gap-3">
                {fields.map((field) => {
                  const required = selectedSpec?.required?.includes(field)
                  return (
                    <label key={field} className="block text-sm font-semibold text-slate-200">
                      {field} {required ? <span className="text-cyan-200">*</span> : <span className="text-slate-500">(optional)</span>}
                      <input
                        type={field.includes('TOKEN') || field.includes('KEY') || field.includes('SECRET') ? 'password' : 'text'}
                        value={credentials[field] || ''}
                        onChange={(event) => setCredentials((prev) => ({ ...prev, [field]: event.target.value }))}
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0b1117] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-200/60"
                        placeholder={required ? 'Required' : 'Optional'}
                        autoComplete="off"
                      />
                    </label>
                  )
                })}
              </div>

              {message && <p className="mt-4 rounded-xl border border-emerald-200/20 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">{message}</p>}
              {error && <p className="mt-4 rounded-xl border border-red-200/20 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p>}

              <button
                type="submit"
                disabled={saving || !selectedSpec}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Save connector
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  )
}
