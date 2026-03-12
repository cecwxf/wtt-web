/* DAG topological analysis for Pipeline IDE */

export interface DAGNode {
  id: string
  status: string
  runner_agent_id?: string
}

export interface DAGEdge {
  task_id: string           // downstream
  depends_on_task_id: string // upstream
}

export interface DAGLevel {
  level: number
  nodeIds: string[]
}

export interface AgentWorkload {
  agent_id: string
  tasks: { id: string; title?: string; status: string; level: number }[]
}

export interface DAGAnalysis {
  topoOrder: string[]
  levels: DAGLevel[]
  nodeLevel: Map<string, number>
  hasCycle: boolean
  criticalPath: Set<string>
  parallelGroups: string[][]       // groups of node ids at same level
  agentWorkload: Map<string, AgentWorkload>
  maxLevel: number
}

/**
 * Kahn's BFS topological sort with level assignment.
 * Same-level nodes have no mutual dependency → can run in parallel.
 */
export function analyzeDAG(
  nodes: DAGNode[],
  edges: DAGEdge[],
  titleMap?: Map<string, string>,
): DAGAnalysis {
  const nodeIds = new Set(nodes.map(n => n.id))
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()    // upstream → downstream[]
  const revAdj = new Map<string, string[]>() // downstream → upstream[]

  nodes.forEach(n => {
    inDegree.set(n.id, 0)
    adj.set(n.id, [])
    revAdj.set(n.id, [])
  })

  const validEdges = edges.filter(
    e => nodeIds.has(e.task_id) && nodeIds.has(e.depends_on_task_id)
  )

  validEdges.forEach(e => {
    adj.get(e.depends_on_task_id)!.push(e.task_id)
    revAdj.get(e.task_id)!.push(e.depends_on_task_id)
    inDegree.set(e.task_id, (inDegree.get(e.task_id) || 0) + 1)
  })

  // BFS topological sort + level assignment
  const nodeLevel = new Map<string, number>()
  const queue: string[] = []
  nodes.forEach(n => {
    if (inDegree.get(n.id) === 0) {
      queue.push(n.id)
      nodeLevel.set(n.id, 0)
    }
  })

  const topoOrder: string[] = []
  let qi = 0
  while (qi < queue.length) {
    const cur = queue[qi++]
    topoOrder.push(cur)
    for (const next of adj.get(cur) || []) {
      const newLevel = Math.max(nodeLevel.get(next) || 0, nodeLevel.get(cur)! + 1)
      nodeLevel.set(next, newLevel)
      inDegree.set(next, inDegree.get(next)! - 1)
      if (inDegree.get(next) === 0) queue.push(next)
    }
  }

  const hasCycle = topoOrder.length < nodes.length
  // assign remaining (cycle) nodes a level = -1
  if (hasCycle) {
    nodes.forEach(n => {
      if (!nodeLevel.has(n.id)) nodeLevel.set(n.id, -1)
    })
  }

  // group by level
  const levelMap = new Map<number, string[]>()
  nodeLevel.forEach((lv, id) => {
    if (!levelMap.has(lv)) levelMap.set(lv, [])
    levelMap.get(lv)!.push(id)
  })
  const levels: DAGLevel[] = Array.from(levelMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([level, nodeIds]) => ({ level, nodeIds }))

  const maxLevel = levels.length > 0 ? levels[levels.length - 1].level : 0

  // parallel groups: same-level groups with >1 node
  const parallelGroups = levels
    .filter(l => l.nodeIds.length > 1 && l.level >= 0)
    .map(l => l.nodeIds)

  // critical path: longest path via DP
  const dist = new Map<string, number>()
  nodes.forEach(n => dist.set(n.id, 0))
  for (const nid of topoOrder) {
    for (const nxt of adj.get(nid) || []) {
      dist.set(nxt, Math.max(dist.get(nxt) || 0, (dist.get(nid) || 0) + 1))
    }
  }

  const criticalPath = new Set<string>()
  if (topoOrder.length > 0) {
    let maxDist = 0
    dist.forEach(d => { if (d > maxDist) maxDist = d })
    // trace back from max-dist leaf
    const endNodes = Array.from(dist.entries()).filter(([, d]) => d === maxDist).map(([id]) => id)
    const stack = [...endNodes]
    while (stack.length > 0) {
      const cur = stack.pop()!
      if (criticalPath.has(cur)) continue
      criticalPath.add(cur)
      for (const up of revAdj.get(cur) || []) {
        if ((dist.get(up) || 0) === (dist.get(cur) || 0) - 1) {
          stack.push(up)
        }
      }
    }
    // also add level-0 roots on critical path
    if (maxDist === 0 && endNodes.length > 0) {
      endNodes.forEach(id => criticalPath.add(id))
    }
  }

  // agent workload
  const agentWorkload = new Map<string, AgentWorkload>()
  nodes.forEach(n => {
    const agent = n.runner_agent_id || 'unassigned'
    if (!agentWorkload.has(agent)) {
      agentWorkload.set(agent, { agent_id: agent, tasks: [] })
    }
    agentWorkload.get(agent)!.tasks.push({
      id: n.id,
      title: titleMap?.get(n.id),
      status: n.status,
      level: nodeLevel.get(n.id) ?? -1,
    })
  })

  return {
    topoOrder,
    levels,
    nodeLevel,
    hasCycle,
    criticalPath,
    parallelGroups,
    agentWorkload,
    maxLevel,
  }
}

/** Assign distinct colors to agents */
const AGENT_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
]

export function agentColor(agentId: string, agentList: string[]): string {
  const idx = agentList.indexOf(agentId)
  return AGENT_COLORS[idx >= 0 ? idx % AGENT_COLORS.length : 0]
}

export function agentBgColor(agentId: string, agentList: string[]): string {
  const hex = agentColor(agentId, agentList)
  return hex + '18' // ~10% opacity
}
