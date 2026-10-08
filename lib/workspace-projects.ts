export interface ProjectParticipant {
  participant_id: string; label: string; host_id: string; host_name: string; adapter: string; profile_id: string; transport_agent_id: string
}
export interface ProjectSession {
  session_id: string; topic_id: string; name: string; participants: ProjectParticipant[]
}
export interface WorkspaceProject {
  workspace_id: string; name: string; root_id: string; host_id: string; access: 'read-only' | 'workspace-write'; root_revoked: boolean; sessions: ProjectSession[]
}
export interface ProjectRoot { root_id: string; name: string; host_id: string; host_name: string; access: string }

export class WorkspaceProjectsApi {
  constructor(private readonly token: string) {}
  async request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`/api/wtt/workspaces${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      const value = await response.json().catch(() => null)
      throw new Error(typeof value?.detail === 'string' ? value.detail : `Workspace request failed (${response.status})`)
    }
    return response.json()
  }
  list(offset = 0) { return this.request<{ workspaces: WorkspaceProject[]; next_offset: number | null }>(`?offset=${offset}`) }
  roots() { return this.request<{ roots: ProjectRoot[] }>('/roots') }
  create(body: { workspace_id: string; name: string; root_id: string }) { return this.request<WorkspaceProject>('', body) }
  createSession(workspaceId: string, body: { session_id: string; name: string; participants: Array<{ host_id: string; profile_id: string; label: string }> }) {
    return this.request<ProjectSession>(`/${encodeURIComponent(workspaceId)}/sessions`, body)
  }
}
