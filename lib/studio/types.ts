export type StudioTopic = {
  id?: string
  topic_id?: string
  name?: string
  description?: string | null
  created_at?: string | null
  updated_at?: string | null
  last_activity_at?: string | null
  latest_message_content?: string | null
  last_message_content?: string | null
}

export type StudioMessage = {
  message_id?: string
  id?: string
  topic_id?: string
  sender_id?: string
  sender_type?: string
  sender_display_name?: string | null
  content?: string
  timestamp?: string
  created_at?: string
  metadata?: Record<string, unknown> | null
}

export type StudioProjectLinks = {
  previewUrl?: string
  publishedUrl?: string
  githubRepoUrl?: string
  commitUrl?: string
}

export type StudioProject = StudioProjectLinks & {
  topicId: string
  topicName: string
  title: string
  description?: string
  createdAt?: string
  updatedAt?: string
  lastMessage?: string
}

export type StudioCloudAgent = {
  has_cloud_agent?: boolean
  agent_id?: string
  status?: string
  provider?: string
  sandbox_name?: string
  sandbox_id?: string
  agent_type?: string
  model_id?: string
}

export type StudioBilling = {
  entitlement?: {
    plan?: string
    status?: string
    expires_at?: string
    limits?: Record<string, unknown>
  }
  plan?: string
  active_plan?: string
  cloud_agent_usage?: Record<string, unknown>
}

export type StudioConnectorCatalogItem = {
  id: string
  name: string
  description: string
  scope: 'user' | 'project' | string
  required: string[]
  optional: string[]
  agent_notes?: string
}

export type StudioConnector = {
  id: string
  provider: string
  name: string
  status: 'active' | 'disabled' | string
  scope: string
  project_topic_id: string
  metadata?: Record<string, unknown>
  configured_env_keys: string[]
  missing_required_env_keys: string[]
  has_credentials: boolean
  created_at?: string
  updated_at?: string
}

export type StudioConnectorPromptContext = {
  items: StudioConnector[]
  active_providers: string[]
  prompt_context: string
}
