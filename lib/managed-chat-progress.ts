import { useCallback, useState } from 'react'

export type ManagedExecutionSummary = {
  agent_id: string
  state: string
  created_at: string
  updated_at: string
}

export function managedProgressFinished(
  progress: { agentId: string; startedAt: number } | null | undefined,
  rows: ManagedExecutionSummary[],
): boolean {
  if (!progress) return false
  const matching = rows.filter(row => row.agent_id === progress.agentId
    && Math.abs(Date.parse(row.created_at) - progress.startedAt) <= 2000)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
  return Boolean(matching && Date.parse(matching.updated_at) >= progress.startedAt - 2000
    && ['succeeded', 'failed', 'cancelled', 'interrupted'].includes(matching.state))
}

export function useManagedChatProgress(
  topicId: string | undefined,
  accessToken: string | undefined,
  progress: { agentId: string; startedAt: number } | null | undefined,
) {
  const scope = `${topicId || ''}:${accessToken || ''}`
  const [snapshot, setSnapshot] = useState<{ scope: string; rows: ManagedExecutionSummary[] }>({ scope: '', rows: [] })
  const onSnapshot = useCallback((rows: ManagedExecutionSummary[]) => {
    setSnapshot({ scope, rows })
  }, [scope])
  const finished = snapshot.scope === scope && managedProgressFinished(progress, snapshot.rows)
  return { showProgress: Boolean(progress) && !finished, onSnapshot }
}
