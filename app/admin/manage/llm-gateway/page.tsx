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
  sub2api_console_url: string
  has_sub2api_admin_key: boolean
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
  console?: {
    token_endpoint: string
    proxy_path: string
  }
  accounts: GatewayAccount[]
  groups: GatewayGroup[]
  model_mappings: GatewayMapping[]
  usage_30d: Array<{ provider: string; requests: number; total_tokens: number }>
}

const emptySettings: GatewaySettings = {
  enabled: false,
  upstream_mode: 'direct',
  sub2api_base_url: '',
  sub2api_console_url: '',
  has_sub2api_admin_key: false,
  fallback_mode: 'direct',
}

const emptyOverview: GatewayOverview = {
  settings: emptySettings,
  accounts: [],
  groups: [],
  model_mappings: [],
  usage_30d: [],
}

const providerLabels: Record<string, string> = {
  deepseek: 'DeepSeek',
  claude: 'Claude',
  gpt: 'GPT / Codex',
  mixed: 'Mixed',
}

export default function LlmGatewayAdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [overview, setOverview] = useState<GatewayOverview>(emptyOverview)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState<GatewaySettings>(emptySettings)
  const [adminKey, setAdminKey] = useState('')
  const [consoleUrl, setConsoleUrl] = useState('')
  const [showConsole, setShowConsole] = useState(false)
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

  const stats = useMemo(() => {
    const activeGroups = overview.groups.filter((item) => item.status === 'active')
    const activeMappings = overview.model_mappings.filter((item) => item.enabled)
    const requests = overview.usage_30d.reduce((sum, row) => sum + Number(row.requests || 0), 0)
    return {
      activeGroups: activeGroups.length,
      activeMappings: activeMappings.length,
      requests,
      configuredPlans: new Set(activeGroups.map((item) => item.provider_plan)).size,
    }
  }, [overview])

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
      const next = { ...emptyOverview, ...data, settings: { ...emptySettings, ...(data.settings || {}) } }
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
      const body: Record<string, unknown> = { ...settings }
      if (adminKey.trim()) body.sub2api_admin_key = adminKey.trim()
      const data = await api('/llm-proxy/admin/gateway/settings', {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      setSettings({ ...emptySettings, ...data.settings })
      setAdminKey('')
      setMessage('Gateway 设置已保存')
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
      setMessage(data.ok ? `Sub2API 健康检查通过：${data.status || 'ok'}` : `Sub2API 健康检查失败：${data.reason || data.status || 'unknown'}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '健康检查失败')
    } finally {
      setBusy(false)
    }
  }

  async function openConsole(mode: 'embed' | 'tab') {
    setBusy(true)
    try {
      const data = await api('/llm-proxy/admin/gateway/console-token', { method: 'POST' })
      setConsoleUrl(data.url)
      if (mode === 'tab') {
        window.open(data.url, '_blank', 'noopener,noreferrer')
      } else {
        setShowConsole(true)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '打开 Sub2API 控制台失败')
    } finally {
      setBusy(false)
    }
  }

  async function createAccount() {
    try {
      const credentials = account.credentials.trim() ? JSON.parse(account.credentials) : {}
      await api('/llm-proxy/admin/gateway/accounts', {
        method: 'POST',
        body: JSON.stringify({ ...account, credentials }),
      })
      setAccount({ name: '', provider: 'deepseek', account_type: 'api_key', credentials: '' })
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '新增账号失败')
    }
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
    <main className="min-h-screen overflow-hidden bg-[#ebe5d7] text-[#171713]">
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-[#d9a441]/30 blur-3xl" />
        <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-[#315d55]/25 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-[#8f4c2e]/20 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl space-y-6 p-5 md:p-8">
        <header className="overflow-hidden rounded-[2rem] border border-[#c9bda5] bg-[#fffaf0]/90 shadow-[0_24px_90px_rgba(63,47,27,0.12)] backdrop-blur">
          <div className="grid gap-6 p-6 md:grid-cols-[1.2fr_0.8fr] md:p-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.32em] text-[#8f4c2e]">WTT Admin Console</p>
              <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[0.95] tracking-[-0.05em] md:text-6xl">
                LLM Gateway
                <span className="block text-[#315d55]">Control Room</span>
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-[#665b4b]">
                用户和 sandbox 只看到 WTT 签发的 <span className="font-mono font-bold text-[#171713]">sk-wtt-...</span>。
                管理者在这里把 WTT Token 套餐路由到 Sub2API 的账号池、分组和模型映射。
              </p>
              {message && <div className="mt-5 rounded-2xl border border-[#d8c29a] bg-[#fff3d7] px-4 py-3 text-sm font-semibold text-[#6f461d]">{message}</div>}
            </div>

            <div className="rounded-[1.5rem] border border-[#d4c5aa] bg-[#171713] p-4 text-[#fffaf0]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-[#d9a441]">Native Sub2API</p>
                  <h2 className="mt-2 text-2xl font-black">原生后台入口</h2>
                </div>
                <StatusPill active={settings.enabled && settings.upstream_mode === 'sub2api'} />
              </div>
              <p className="mt-4 text-sm leading-6 text-[#cfc7b8]">
                先保存 Sub2API URL，再通过 WTT 管理员会话换取 15 分钟 console token。原生后台用于账号授权、分组、模型池和订阅账号配置。
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button onClick={() => void openConsole('embed')} disabled={busy} className="rounded-2xl bg-[#d9a441] px-4 py-3 text-sm font-black text-[#171713] transition hover:bg-[#e5b95c] disabled:opacity-50">
                  嵌入打开
                </button>
                <button onClick={() => void openConsole('tab')} disabled={busy} className="rounded-2xl border border-[#5d574b] px-4 py-3 text-sm font-black text-[#fffaf0] transition hover:bg-[#26231d] disabled:opacity-50">
                  新窗口打开
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <Metric label="Gateway" value={settings.enabled ? settings.upstream_mode : 'off'} tone={settings.enabled ? 'green' : 'amber'} />
          <Metric label="Active Groups" value={String(stats.activeGroups)} hint={`${stats.configuredPlans} plans`} />
          <Metric label="Model Routes" value={String(stats.activeMappings)} hint="enabled mappings" />
          <Metric label="30d Requests" value={String(stats.requests)} hint="proxy usage" />
        </section>

        <section className="rounded-[2rem] border border-[#c9bda5] bg-[#fffaf0]/85 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black tracking-[-0.02em]">当前路由链路</h2>
              <p className="mt-1 text-sm text-[#6f6658]">外部 agent 和 sandbox agent 使用同一种 WTT Proxy Key，区别只在 token 的套餐和模型权限。</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void load()} disabled={busy} className="control-button">刷新</button>
              <button onClick={() => void healthCheck()} disabled={busy} className="control-button primary-control">健康检查</button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <RouteBlock title="Agent" body="Claude Code / Codex" />
            <RouteBlock title="WTT Proxy Key" body="sk-wtt-..." />
            <RouteBlock title="WTT Gateway" body={settings.enabled ? settings.upstream_mode : 'direct'} />
            <RouteBlock title="Upstream" body={settings.upstream_mode === 'sub2api' ? 'Sub2API pool' : 'Direct proxy'} />
          </div>
        </section>

        {showConsole && consoleUrl && (
          <section className="overflow-hidden rounded-[2rem] border border-[#c9bda5] bg-[#11110f] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-[#2d2a23] px-5 py-4 text-[#fffaf0]">
              <div>
                <h2 className="font-black">Sub2API Native Console</h2>
                <p className="text-xs text-[#aaa193]">如果页面资源加载失败，需要将 Sub2API 前端 base path 配到 WTT console proxy 路径。</p>
              </div>
              <button onClick={() => setShowConsole(false)} className="rounded-full border border-[#4a453b] px-3 py-1 text-xs font-bold">收起</button>
            </div>
            <iframe src={consoleUrl} className="h-[72vh] w-full bg-white" title="Sub2API native console" />
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <Panel title="Gateway 基础设置" kicker="Step 1">
            <div className="grid gap-3">
              <label className="flex items-center justify-between gap-4 rounded-2xl border border-[#ded2bd] bg-white px-4 py-3 text-sm font-bold">
                启用 Sub2API upstream
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(event) => setSettings((prev) => ({ ...prev, enabled: event.target.checked }))}
                  className="h-5 w-5 accent-[#315d55]"
                />
              </label>
              <FieldLabel label="Upstream mode">
                <select value={settings.upstream_mode} onChange={(event) => setSettings((prev) => ({ ...prev, upstream_mode: event.target.value }))} className="field">
                  <option value="direct">direct</option>
                  <option value="sub2api">sub2api</option>
                </select>
              </FieldLabel>
              <FieldLabel label="Sub2API private base URL">
                <input value={settings.sub2api_base_url} onChange={(event) => setSettings((prev) => ({ ...prev, sub2api_base_url: event.target.value }))} placeholder="http://127.0.0.1:8080" className="field" />
              </FieldLabel>
              <FieldLabel label="Sub2API console URL 可选">
                <input value={settings.sub2api_console_url} onChange={(event) => setSettings((prev) => ({ ...prev, sub2api_console_url: event.target.value }))} placeholder="留空则使用 base URL" className="field" />
              </FieldLabel>
              <FieldLabel label={settings.has_sub2api_admin_key ? 'Admin key 已保存，可留空不改' : 'Sub2API admin key 可选'}>
                <input value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="只在需要代理注入 Authorization 时填写" className="field" />
              </FieldLabel>
              <FieldLabel label="Fallback">
                <select value={settings.fallback_mode} onChange={(event) => setSettings((prev) => ({ ...prev, fallback_mode: event.target.value }))} className="field">
                  <option value="direct">Sub2API 不可用时回退 direct</option>
                  <option value="off">不回退，直接失败</option>
                </select>
              </FieldLabel>
              <button onClick={() => void saveSettings()} disabled={busy} className="primary-action">保存 Gateway 设置</button>
            </div>
          </Panel>

          <Panel title="套餐到分组的映射" kicker="Step 2">
            <div className="grid gap-3 md:grid-cols-3">
              {(['deepseek', 'claude', 'gpt'] as const).map((plan) => {
                const active = overview.groups.find((item) => item.provider_plan === plan && item.status === 'active')
                return (
                  <div key={plan} className="rounded-3xl border border-[#dfd4bf] bg-white p-4">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8f4c2e]">{providerLabels[plan]}</p>
                    <div className="mt-3 text-lg font-black">{active?.name || '未配置'}</div>
                    <p className="mt-2 text-xs leading-5 text-[#6f6658]">
                      {active ? `key ${active.has_sub2api_key ? active.sub2api_key : 'missing'} · ${active.routing_policy}` : '创建分组后，WTT token 会按 provider_plan 命中这里。'}
                    </p>
                  </div>
                )
              })}
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <input value={group.name} onChange={(e) => setGroup((p) => ({ ...p, name: e.target.value }))} placeholder="WTT 分组名称，例如 DeepSeek ClaudeCode Pool" className="field" />
              <select value={group.provider_plan} onChange={(e) => setGroup((p) => ({ ...p, provider_plan: e.target.value }))} className="field">
                <option value="deepseek">DeepSeek</option>
                <option value="claude">Claude</option>
                <option value="gpt">GPT / Codex</option>
                <option value="mixed">Mixed</option>
              </select>
              <input value={group.sub2api_group_id} onChange={(e) => setGroup((p) => ({ ...p, sub2api_group_id: e.target.value }))} placeholder="Sub2API group id，可选" className="field" />
              <input value={group.sub2api_key} onChange={(e) => setGroup((p) => ({ ...p, sub2api_key: e.target.value }))} placeholder="Sub2API internal key" className="field" />
              <button onClick={() => void createGroup()} className="primary-action md:col-span-2">新增分组路由</button>
            </div>
          </Panel>
        </section>

        <details className="rounded-[2rem] border border-[#c9bda5] bg-[#fffaf0]/85 p-5 backdrop-blur" open>
          <summary className="cursor-pointer text-xl font-black tracking-[-0.02em]">高级配置：账号池、模型映射、运行数据</summary>
          <section className="mt-5 grid gap-4 lg:grid-cols-3">
            <Panel title="账号池镜像" kicker="Optional">
              <p className="mb-4 text-sm leading-6 text-[#6f6658]">这里保留 WTT 侧元数据；完整订阅账号授权建议进入原生 Sub2API 后台操作。</p>
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
                <button onClick={() => void createAccount()} className="primary-action">新增账号元数据</button>
              </div>
              <List>
                {overview.accounts.map((item) => (
                  <Row key={item.id} title={item.name} meta={`${item.provider} · ${item.account_type} · ${item.status} · ${item.credential_keys.join(', ') || 'no credentials'}`} onDelete={() => void remove(`/llm-proxy/admin/gateway/accounts/${item.id}`)} />
                ))}
              </List>
            </Panel>

            <Panel title="模型映射" kicker="Routing">
              <div className="space-y-2">
                <input value={mapping.public_model} onChange={(e) => setMapping((p) => ({ ...p, public_model: e.target.value }))} placeholder="WTT public model" className="field" />
                <input value={mapping.upstream_model} onChange={(e) => setMapping((p) => ({ ...p, upstream_model: e.target.value }))} placeholder="Sub2API/upstream model" className="field" />
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
                <button onClick={() => void createMapping()} className="primary-action">保存映射</button>
              </div>
              <List>
                {overview.model_mappings.map((item) => (
                  <Row key={item.id} title={`${item.public_model} -> ${item.upstream_model}`} meta={`${item.provider_plan} · ${item.adapter} · ${item.enabled ? 'enabled' : 'disabled'}`} onDelete={() => void remove(`/llm-proxy/admin/gateway/model-mappings/${item.id}`)} />
                ))}
              </List>
            </Panel>

            <Panel title="30 天用量" kicker="Telemetry">
              <List>
                {overview.usage_30d.length === 0 && <p className="text-sm text-[#6e6253]">暂无用量数据</p>}
                {overview.usage_30d.map((row) => (
                  <div key={row.provider || 'unknown'} className="rounded-2xl border border-[#eadfcb] bg-white p-3 text-sm">
                    <div className="font-black">{row.provider || 'unknown'}</div>
                    <div className="mt-1 text-xs text-[#786a59]">{row.requests} requests · {row.total_tokens} tokens</div>
                  </div>
                ))}
              </List>
              <List>
                {overview.groups.map((item) => (
                  <Row key={item.id} title={item.name} meta={`${item.provider_plan} · ${item.status} · key ${item.has_sub2api_key ? item.sub2api_key : 'missing'}`} onDelete={() => void remove(`/llm-proxy/admin/gateway/groups/${item.id}`)} />
                ))}
              </List>
            </Panel>
          </section>
        </details>
      </div>

      <style jsx global>{`
        .field {
          width: 100%;
          border-radius: 1rem;
          border: 1px solid #d8cdb8;
          background: #fffdfa;
          padding: 0.68rem 0.82rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        }
        .field:focus {
          border-color: #315d55;
          box-shadow: 0 0 0 4px rgba(49, 93, 85, 0.12);
        }
        .primary-action {
          width: 100%;
          border-radius: 1rem;
          background: #171713;
          color: white;
          padding: 0.72rem 1rem;
          font-size: 0.875rem;
          font-weight: 900;
          transition: transform 160ms ease, background 160ms ease;
        }
        .primary-action:hover {
          transform: translateY(-1px);
          background: #315d55;
        }
        .control-button {
          border-radius: 999px;
          border: 1px solid #c9bda5;
          background: #fffaf0;
          padding: 0.58rem 1rem;
          font-size: 0.875rem;
          font-weight: 800;
        }
        .primary-control {
          border-color: #315d55;
          background: #315d55;
          color: white;
        }
      `}</style>
    </main>
  )
}

function StatusPill({ active }: { active: boolean }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${active ? 'bg-[#d7f0dc] text-[#1e5631]' : 'bg-[#f6dfac] text-[#70480f]'}`}>{active ? 'ACTIVE' : 'DIRECT'}</span>
}

function Metric({ label, value, hint, tone = 'neutral' }: { label: string; value: string; hint?: string; tone?: 'neutral' | 'green' | 'amber' }) {
  const color = tone === 'green' ? 'text-[#315d55]' : tone === 'amber' ? 'text-[#8f4c2e]' : 'text-[#171713]'
  return (
    <div className="rounded-3xl border border-[#c9bda5] bg-[#fffaf0]/85 p-4 backdrop-blur">
      <div className="text-xs font-black uppercase tracking-[0.2em] text-[#8f806a]">{label}</div>
      <div className={`mt-2 truncate text-2xl font-black ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs font-semibold text-[#756957]">{hint}</div>}
    </div>
  )
}

function RouteBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="relative rounded-3xl border border-[#dfd4bf] bg-white p-4">
      <div className="text-xs font-black uppercase tracking-[0.2em] text-[#8f806a]">{title}</div>
      <div className="mt-3 min-h-10 text-lg font-black text-[#171713]">{body}</div>
      <div className="absolute -right-3 top-1/2 hidden h-px w-6 bg-[#a99b84] md:block" />
    </div>
  )
}

function Panel({ title, kicker, children }: { title: string; kicker?: string; children: ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-[#c9bda5] bg-[#fffaf0]/85 p-5 shadow-sm backdrop-blur">
      {kicker && <p className="text-xs font-black uppercase tracking-[0.24em] text-[#8f4c2e]">{kicker}</p>}
      <h2 className="mb-4 mt-1 text-xl font-black tracking-[-0.02em]">{title}</h2>
      {children}
    </section>
  )
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-[0.16em] text-[#7b6f5d]">{label}</span>
      {children}
    </label>
  )
}

function List({ children }: { children: ReactNode }) {
  return <div className="mt-4 max-h-80 space-y-2 overflow-auto pr-1">{children}</div>
}

function Row({ title, meta, onDelete }: { title: string; meta: string; onDelete: () => void }) {
  return (
    <div className="rounded-2xl border border-[#eadfcb] bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-black">{title}</div>
          <div className="mt-1 truncate text-xs text-[#786a59]">{meta}</div>
        </div>
        <button onClick={onDelete} className="rounded-full border border-red-200 px-2 py-1 text-xs font-black text-red-700 hover:bg-red-50">删除</button>
      </div>
    </div>
  )
}
