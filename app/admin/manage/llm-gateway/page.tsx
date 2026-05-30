'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { CLIENT_WTT_API_BASE } from '@/lib/api/base-url'

type GatewaySettings = {
  enabled: boolean
  upstream_mode: string
  sub2api_base_url: string
  fallback_mode: string
}

type GatewayAccount = {
  id: string
  provider: string
  account_type: string
  name: string
  status: string
  priority: number
  has_credentials: boolean
  credential_keys: string[]
}

type GatewayGroup = {
  id: string
  name: string
  provider_plan: string
  sub2api_group_id: string
  routing_policy: string
  status: string
  has_sub2api_key: boolean
  sub2api_key: string
}

type GatewayMapping = {
  id: string
  public_model: string
  upstream_model: string
  provider_plan: string
  adapter: string
  enabled: boolean
}

type GatewayOverview = {
  settings: GatewaySettings
  accounts: GatewayAccount[]
  groups: GatewayGroup[]
  model_mappings: GatewayMapping[]
  usage_30d: Array<{ provider: string; requests: number; total_tokens: number }>
}

const emptyOverview: GatewayOverview = {
  settings: { enabled: false, upstream_mode: 'direct', sub2api_base_url: '', fallback_mode: 'direct' },
  accounts: [],
  groups: [],
  model_mappings: [],
  usage_30d: [],
}

export default function LlmGatewayAdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [overview, setOverview] = useState<GatewayOverview>(emptyOverview)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState<GatewaySettings>(emptyOverview.settings)
  const [account, setAccount] = useState({ name: '', provider: 'deepseek', account_type: 'api_key', credentials: '' })
  const [group, setGroup] = useState({ name: '', provider_plan: 'deepseek', sub2api_group_id: '', sub2api_key: '' })
  const [mapping, setMapping] = useState({ public_model: '', upstream_model: '', provider_plan: 'deepseek', adapter: 'both' })

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [router, status])

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${session?.accessToken ?? ''}`,
      'Content-Type': 'application/json',
    }),
    [session?.accessToken]
  )

  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch(`${CLIENT_WTT_API_BASE}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers || {}) },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.detail || `HTTP ${response.status}`)
    return data
  }

  async function load() {
    if (!session?.accessToken) return
    setBusy(true)
    setMessage('')
    try {
      const data = await api('/llm-proxy/admin/gateway')
      const next = { ...emptyOverview, ...data }
      setOverview(next)
      setSettings(next.settings)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载失败')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken])

  async function saveSettings() {
    setBusy(true)
    try {
      const data = await api('/llm-proxy/admin/gateway/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      })
      setSettings(data.settings)
      setMessage('设置已保存')
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function healthCheck() {
    setBusy(true)
    try {
      const data = await api('/llm-proxy/admin/gateway/health', { method: 'POST' })
      setMessage(data.ok ? `sub2api 健康检查通过：${data.status || 'ok'}` : `sub2api 健康检查失败：${data.reason || data.status || 'unknown'}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '健康检查失败')
    } finally {
      setBusy(false)
    }
  }

  async function createAccount() {
    const credentials = account.credentials.trim() ? JSON.parse(account.credentials) : {}
    await api('/llm-proxy/admin/gateway/accounts', {
      method: 'POST',
      body: JSON.stringify({ ...account, credentials }),
    })
    setAccount({ name: '', provider: 'deepseek', account_type: 'api_key', credentials: '' })
    await load()
  }

  async function createGroup() {
    await api('/llm-proxy/admin/gateway/groups', {
      method: 'POST',
      body: JSON.stringify(group),
    })
    setGroup({ name: '', provider_plan: 'deepseek', sub2api_group_id: '', sub2api_key: '' })
    await load()
  }

  async function createMapping() {
    await api('/llm-proxy/admin/gateway/model-mappings', {
      method: 'POST',
      body: JSON.stringify({ ...mapping, enabled: true }),
    })
    setMapping({ public_model: '', upstream_model: '', provider_plan: 'deepseek', adapter: 'both' })
    await load()
  }

  async function remove(path: string) {
    if (!confirm('确认删除？')) return
    await api(path, { method: 'DELETE' })
    await load()
  }

  return (
    <main className="min-h-screen bg-[#f5f2ea] text-[#17130d]">
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <header className="rounded-3xl border border-[#d8cdb8] bg-[#fffaf0] p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#9b6b2f]">Admin / LLM Gateway</p>
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-black">Sub2API Gateway 管理</h1>
              <p className="mt-2 max-w-3xl text-sm text-[#6e6253]">
                WTT 继续签发 <span className="font-mono">sk-wtt-...</span> 给 agent 使用；此页只配置服务器端 sub2api 上游、账号池、分组和模型映射。
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void load()} disabled={busy} className="rounded-full border border-[#cbbda5] px-4 py-2 text-sm font-semibold">刷新</button>
              <button onClick={() => void healthCheck()} disabled={busy} className="rounded-full bg-[#1e5631] px-4 py-2 text-sm font-semibold text-white">健康检查</button>
            </div>
          </div>
          {message && <div className="mt-4 rounded-2xl bg-[#efe5d2] px-4 py-3 text-sm text-[#5f4527]">{message}</div>}
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-[#d8cdb8] bg-white p-5">
            <h2 className="text-lg font-black">Gateway Settings</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-2xl border border-[#e5dac7] p-3 text-sm">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(event) => setSettings((prev) => ({ ...prev, enabled: event.target.checked }))}
                />
                启用 sub2api upstream
              </label>
              <select
                value={settings.upstream_mode}
                onChange={(event) => setSettings((prev) => ({ ...prev, upstream_mode: event.target.value }))}
                className="rounded-2xl border border-[#d8cdb8] px-3 py-2 text-sm"
              >
                <option value="direct">direct</option>
                <option value="sub2api">sub2api</option>
              </select>
              <input
                value={settings.sub2api_base_url}
                onChange={(event) => setSettings((prev) => ({ ...prev, sub2api_base_url: event.target.value }))}
                placeholder="http://127.0.0.1:8080"
                className="rounded-2xl border border-[#d8cdb8] px-3 py-2 text-sm md:col-span-2"
              />
              <select
                value={settings.fallback_mode}
                onChange={(event) => setSettings((prev) => ({ ...prev, fallback_mode: event.target.value }))}
                className="rounded-2xl border border-[#d8cdb8] px-3 py-2 text-sm"
              >
                <option value="direct">sub2api 未配置时回退 direct</option>
                <option value="off">不回退</option>
              </select>
              <button onClick={() => void saveSettings()} disabled={busy} className="rounded-2xl bg-[#17130d] px-4 py-2 text-sm font-semibold text-white">保存设置</button>
            </div>
          </div>

          <div className="rounded-3xl border border-[#d8cdb8] bg-white p-5">
            <h2 className="text-lg font-black">30 天用量</h2>
            <div className="mt-4 space-y-2">
              {overview.usage_30d.length === 0 && <p className="text-sm text-[#6e6253]">暂无用量数据</p>}
              {overview.usage_30d.map((row) => (
                <div key={row.provider || 'unknown'} className="flex justify-between rounded-2xl bg-[#f7f1e6] px-4 py-3 text-sm">
                  <span>{row.provider || 'unknown'}</span>
                  <span>{row.requests} requests · {row.total_tokens} tokens</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Panel title="账号池">
            <div className="space-y-2">
              <input value={account.name} onChange={(e) => setAccount((p) => ({ ...p, name: e.target.value }))} placeholder="账号名称" className="field" />
              <div className="grid grid-cols-2 gap-2">
                <select value={account.provider} onChange={(e) => setAccount((p) => ({ ...p, provider: e.target.value }))} className="field">
                  <option value="deepseek">DeepSeek</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Gemini</option>
                  <option value="sub2api">Sub2API</option>
                </select>
                <select value={account.account_type} onChange={(e) => setAccount((p) => ({ ...p, account_type: e.target.value }))} className="field">
                  <option value="api_key">API Key</option>
                  <option value="subscription">订阅账号</option>
                  <option value="oauth">OAuth</option>
                </select>
              </div>
              <textarea value={account.credentials} onChange={(e) => setAccount((p) => ({ ...p, credentials: e.target.value }))} placeholder='{"api_key":"..."}' className="field min-h-24 font-mono" />
              <button onClick={() => void createAccount()} className="primary">新增账号</button>
            </div>
            <List>
              {overview.accounts.map((item) => (
                <Row key={item.id} title={item.name} meta={`${item.provider} · ${item.account_type} · ${item.status} · ${item.credential_keys.join(', ') || 'no credentials'}`} onDelete={() => void remove(`/llm-proxy/admin/gateway/accounts/${item.id}`)} />
              ))}
            </List>
          </Panel>

          <Panel title="分组 / 套餐路由">
            <div className="space-y-2">
              <input value={group.name} onChange={(e) => setGroup((p) => ({ ...p, name: e.target.value }))} placeholder="分组名称" className="field" />
              <select value={group.provider_plan} onChange={(e) => setGroup((p) => ({ ...p, provider_plan: e.target.value }))} className="field">
                <option value="deepseek">DeepSeek</option>
                <option value="claude">Claude</option>
                <option value="gpt">GPT / Codex</option>
                <option value="mixed">Mixed</option>
              </select>
              <input value={group.sub2api_group_id} onChange={(e) => setGroup((p) => ({ ...p, sub2api_group_id: e.target.value }))} placeholder="sub2api group id，可选" className="field" />
              <input value={group.sub2api_key} onChange={(e) => setGroup((p) => ({ ...p, sub2api_key: e.target.value }))} placeholder="sub2api internal key" className="field" />
              <button onClick={() => void createGroup()} className="primary">新增分组</button>
            </div>
            <List>
              {overview.groups.map((item) => (
                <Row key={item.id} title={item.name} meta={`${item.provider_plan} · ${item.status} · key ${item.has_sub2api_key ? item.sub2api_key : 'missing'}`} onDelete={() => void remove(`/llm-proxy/admin/gateway/groups/${item.id}`)} />
              ))}
            </List>
          </Panel>

          <Panel title="模型映射">
            <div className="space-y-2">
              <input value={mapping.public_model} onChange={(e) => setMapping((p) => ({ ...p, public_model: e.target.value }))} placeholder="WTT public model" className="field" />
              <input value={mapping.upstream_model} onChange={(e) => setMapping((p) => ({ ...p, upstream_model: e.target.value }))} placeholder="sub2api/upstream model" className="field" />
              <div className="grid grid-cols-2 gap-2">
                <select value={mapping.provider_plan} onChange={(e) => setMapping((p) => ({ ...p, provider_plan: e.target.value }))} className="field">
                  <option value="deepseek">DeepSeek</option>
                  <option value="claude">Claude</option>
                  <option value="gpt">GPT / Codex</option>
                  <option value="mixed">Mixed</option>
                </select>
                <select value={mapping.adapter} onChange={(e) => setMapping((p) => ({ ...p, adapter: e.target.value }))} className="field">
                  <option value="both">both</option>
                  <option value="claude-code">claude-code</option>
                  <option value="codex">codex</option>
                </select>
              </div>
              <button onClick={() => void createMapping()} className="primary">保存映射</button>
            </div>
            <List>
              {overview.model_mappings.map((item) => (
                <Row key={item.id} title={`${item.public_model} -> ${item.upstream_model}`} meta={`${item.provider_plan} · ${item.adapter} · ${item.enabled ? 'enabled' : 'disabled'}`} onDelete={() => void remove(`/llm-proxy/admin/gateway/model-mappings/${item.id}`)} />
              ))}
            </List>
          </Panel>
        </section>
        <style jsx global>{`
          .field {
            width: 100%;
            border-radius: 1rem;
            border: 1px solid #d8cdb8;
            padding: 0.55rem 0.75rem;
            font-size: 0.875rem;
            outline: none;
            background: #fffdfa;
          }
          .field:focus {
            border-color: #9b6b2f;
            box-shadow: 0 0 0 3px rgba(155, 107, 47, 0.12);
          }
          .primary {
            width: 100%;
            border-radius: 1rem;
            background: #17130d;
            color: white;
            padding: 0.6rem 0.9rem;
            font-size: 0.875rem;
            font-weight: 700;
          }
        `}</style>
      </div>
    </main>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-[#d8cdb8] bg-white p-5">
      <h2 className="mb-4 text-lg font-black">{title}</h2>
      {children}
    </section>
  )
}

function List({ children }: { children: ReactNode }) {
  return <div className="mt-4 max-h-80 space-y-2 overflow-auto">{children}</div>
}

function Row({ title, meta, onDelete }: { title: string; meta: string; onDelete: () => void }) {
  return (
    <div className="rounded-2xl border border-[#eadfcb] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{title}</div>
          <div className="mt-1 truncate text-xs text-[#786a59]">{meta}</div>
        </div>
        <button onClick={onDelete} className="rounded-full border border-red-200 px-2 py-1 text-xs font-semibold text-red-700">删除</button>
      </div>
    </div>
  )
}
