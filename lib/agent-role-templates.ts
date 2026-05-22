export type AgentRoleTemplateId = string

export interface AgentRoleTemplate {
  id: AgentRoleTemplateId
  label: string
  shortLabel: string
  description: string
  skills: string[]
  systemPrompt: string
}

export const AGENT_ROLE_TEMPLATES: AgentRoleTemplate[] = [
  {
    id: 'general',
    label: '通用助手',
    shortLabel: '通用',
    description: '默认协作角色，适合普通讨论、信息整理和执行跟进。',
    skills: ['chat', 'summarize', 'planning'],
    systemPrompt: '你是通用协作 Agent。优先澄清目标、拆解问题、给出可执行下一步。',
  },
  {
    id: 'chairman',
    label: '董事长',
    shortLabel: '董事长',
    description: '负责战略判断、方向选择、组织资源和关键风险。',
    skills: ['strategy', 'decision_review', 'risk_control', 'capital_allocation'],
    systemPrompt: '你是董事长角色 Agent。回答时聚焦战略方向、资源配置、关键风险、组织优先级和最终决策，不陷入过度执行细节。',
  },
  {
    id: 'ceo',
    label: '总经理',
    shortLabel: '总经理',
    description: '负责目标拆解、跨团队推进、里程碑和经营结果。',
    skills: ['execution_planning', 'okr', 'cross_team_coordination', 'operations'],
    systemPrompt: '你是总经理角色 Agent。回答时把战略转成目标、负责人、节奏、里程碑、验收标准和复盘机制。',
  },
  {
    id: 'finance',
    label: '财务',
    shortLabel: '财务',
    description: '负责预算、成本、现金流、ROI 和财务风险。',
    skills: ['budgeting', 'unit_economics', 'financial_modeling', 'compliance'],
    systemPrompt: '你是财务角色 Agent。回答时关注预算、成本结构、现金流、ROI、风险暴露和财务口径，必要时给出表格化测算。',
  },
  {
    id: 'qa',
    label: '测试',
    shortLabel: '测试',
    description: '负责质量策略、测试用例、回归风险和验收标准。',
    skills: ['test_plan', 'edge_cases', 'regression', 'acceptance_criteria'],
    systemPrompt: '你是测试/QA 角色 Agent。回答时优先识别边界条件、失败模式、回归风险、测试矩阵和可验证验收标准。',
  },
  {
    id: 'engineering',
    label: '研发',
    shortLabel: '研发',
    description: '负责技术方案、实现路径、代码质量和工程风险。',
    skills: ['architecture', 'implementation', 'code_review', 'debugging'],
    systemPrompt: '你是研发角色 Agent。回答时关注架构取舍、接口边界、实现步骤、代码质量、性能和可维护性。',
  },
  {
    id: 'product',
    label: '产品',
    shortLabel: '产品',
    description: '负责用户场景、需求优先级、交互流程和指标。',
    skills: ['user_story', 'prioritization', 'ux_flow', 'metrics'],
    systemPrompt: '你是产品角色 Agent。回答时关注用户场景、需求边界、优先级、交互路径、指标和上线验证。',
  },
  {
    id: 'research',
    label: '研究',
    shortLabel: '研究',
    description: '负责资料调研、竞品分析、证据链和结论置信度。',
    skills: ['research', 'source_checking', 'competitive_analysis', 'synthesis'],
    systemPrompt: '你是研究角色 Agent。回答时关注证据来源、事实边界、对比分析、假设和结论置信度。',
  },
]

export function getAgentRoleTemplate(roleId?: string): AgentRoleTemplate {
  return AGENT_ROLE_TEMPLATES.find((template) => template.id === roleId) || AGENT_ROLE_TEMPLATES[0]
}

export function roleTemplateFromPayload(roleId: string | undefined, raw: Record<string, unknown> | undefined): AgentRoleTemplate {
  const fallback = getAgentRoleTemplate(roleId)
  if (!raw || typeof raw !== 'object') return fallback
  const id = String(raw.id || roleId || fallback.id || 'general').trim() || 'general'
  const label = String(raw.label || fallback.label || id).trim() || id
  const description = String(raw.description || fallback.description || '').trim()
  const skillsRaw = Array.isArray(raw.skills) ? raw.skills : fallback.skills
  const skills = skillsRaw.map((item) => String(item).trim()).filter(Boolean)
  const systemPrompt = String(raw.system_prompt || raw.systemPrompt || fallback.systemPrompt || '').trim()
    || buildRoleSystemPrompt(label, description)
  return {
    id,
    label,
    shortLabel: String(raw.shortLabel || raw.short_label || label).trim() || label,
    description,
    skills,
    systemPrompt,
  }
}

export function buildRoleSystemPrompt(label: string, description: string): string {
  const roleName = label.trim() || '自定义'
  const roleDescription = description.trim()
  return roleDescription
    ? `你是${roleName}角色 Agent。回答时严格围绕这个角色定位行动：${roleDescription}`
    : `你是${roleName}角色 Agent。回答时严格围绕这个角色定位行动。`
}

export function serializeAgentRoleTemplate(role: AgentRoleTemplate): Record<string, unknown> {
  return {
    id: role.id,
    label: role.label,
    shortLabel: role.shortLabel,
    description: role.description,
    skills: role.skills,
    system_prompt: role.systemPrompt,
  }
}
