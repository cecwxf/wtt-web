import type { DesktopHostBridge, DesktopHostState } from './desktop'

export interface AccountHost {
  host_id: string
  display_name: string
  environment: 'native' | 'wsl'
  platform: 'darwin' | 'linux' | 'win32'
  client_version: string
  status: 'online' | 'offline' | 'revoked'
  last_seen_at: string | null
  agents: Array<{ agent_id: string; profile_id: string; adapter: string; display_name: string }>
}

export class HostRequestError extends Error {
  constructor(readonly status: number) {
    super(`Host request failed (${status})`)
  }
}

export class DesktopHostsApi {
  constructor(private readonly token: string, private readonly fetcher: typeof fetch = (input, init) => fetch(input, init)) {}

  private async request(path: string, body?: unknown): Promise<unknown> {
    if (!this.token) throw new HostRequestError(401)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await this.fetcher(`/api/wtt${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: 'no-store', redirect: 'error', signal: controller.signal,
      })
      if (!response.ok) throw new HostRequestError(response.status)
      return await response.json()
    } finally {
      clearTimeout(timeout)
    }
  }

  async list(offset = 0): Promise<{ hosts: AccountHost[]; nextOffset: number | null }> {
    const data = await this.request(`/hosts/my?offset=${offset}&limit=50`) as {
      hosts?: AccountHost[]; next_offset?: number | null
    }
    if (!Array.isArray(data?.hosts) || data.hosts.some(host => !host.host_id || !Array.isArray(host.agents))) {
      throw new Error('Invalid host directory response')
    }
    return { hosts: data.hosts, nextOffset: typeof data.next_offset === 'number' && data.next_offset > offset ? data.next_offset : null }
  }

  async revoke(hostId: string): Promise<void> {
    await this.request(`/hosts/${encodeURIComponent(hostId)}/revoke`, {})
  }

  async authorize(bridge: DesktopHostBridge, isCurrent: () => boolean): Promise<DesktopHostState> {
    const identity = await this.request('/auth/me') as { user_id?: string }
    if (!identity?.user_id || typeof identity.user_id !== 'string') throw new Error('Invalid account identity')
    if (!isCurrent()) throw new Error('Authorization cancelled')
    if (bridge.resume) {
      const native = await bridge.resume(this.token)
      if (!isCurrent()) throw new Error('Authorization cancelled')
      if (native.userId !== identity.user_id) throw new Error('Host identity does not match account')
    }
    const start = await bridge.authorize(identity.user_id)
    if (!isCurrent()) throw new Error('Authorization cancelled')
    const grant = await this.request('/hosts/enrollments', start.request) as { enrollment_id?: string }
    if (!grant?.enrollment_id || typeof grant.enrollment_id !== 'string') throw new Error('Invalid host authorization receipt')
    if (!isCurrent()) throw new Error('Authorization cancelled')
    const state = await bridge.finishAuthorization({ transactionId: start.transactionId, enrollmentId: grant.enrollment_id })
    if (!isCurrent()) throw new Error('Authorization cancelled')
    if (state.userId !== identity.user_id || state.state !== 'registered') throw new Error('Host identity does not match account')
    return state
  }
}
