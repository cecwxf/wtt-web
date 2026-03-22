'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type Locale = 'zh' | 'en'

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const STORAGE_KEY = 'wtt-web.locale'

const messages: Record<Locale, Record<string, string>> = {
  zh: {
    'common.close': '关闭',
    'common.cancel': '取消',
    'common.save': '保存',
    'common.loading': '加载中...',
    'common.add': '添加',
    'common.delete': '删除',

    'lang.switchTo': '切换为 English',
    'lang.button': '中',

    'top.home': '主页',
    'top.tasksBoard': '任务面板',
    'top.tasks': '任务',
    'top.pipelines': '流水线',
    'top.editor': '编辑器',
    'top.createTopic': '创建话题',
    'top.topic': '话题',
    'top.notifications': '通知',
    'top.noNotifications': '暂无新通知',
    'top.topicInvite': '话题邀请',
    'top.p2pRequest': 'P2P 聊天请求',
    'top.invites': '邀请',
    'top.toDiscuss': '一起讨论',
    'top.wantsToChat': '想要聊天',
    'top.accept': '接受',
    'top.decline': '拒绝',
    'top.lightMode': '切换浅色模式',
    'top.darkMode': '切换深色模式',

    'shell.profile': '个人资料',
    'shell.agentBinding': 'Agent 绑定',
    'shell.notifications': '通知设置',
    'shell.apiMcp': 'API 与 MCP',
    'shell.manageCleanup': '管理清理',
    'shell.logout': '退出登录',

    'settings.center': 'WTT 设置中心',
    'settings.structHint': '统一设置结构',
    'settings.profile': '我的资料',
    'settings.binding': 'Agent 绑定',
    'settings.notifications': '通知设置',
    'settings.privacy': '隐私与安全',
    'settings.appearance': '外观',
    'settings.about': '关于 WTT',
    'settings.titleFallback': '设置',
    'settings.currentAgent': '当前 Agent：{name} ({id})',
    'settings.currentAgentNone': '当前 Agent：未选择',
    'settings.account': '账号',
    'settings.displayName': '显示名称',
    'settings.email': '邮箱',
    'settings.bio': '简介',
    'settings.bioPlaceholder': '介绍你关注的话题方向...',
    'settings.linkedAgent': '已绑定 Agent',
    'settings.noBoundAgent': '未绑定 Agent',
    'settings.notifyMessage': '消息提醒',
    'settings.notifyMessageHint': '新消息到达时显示通知',
    'settings.notifyAgent': 'Agent 状态提醒',
    'settings.notifyAgentHint': 'Agent 离线/恢复时通知',
    'settings.sound': '提示音',
    'settings.soundHint': '播放提示音',
    'settings.sessionToken': '会话与令牌',
    'settings.sessionTokenHint': '建议定期更新 API Key，并在共享设备上退出登录。',
    'settings.riskHint': '高风险操作建议在 Agent 页面执行，避免误解绑主 Agent。',
    'settings.themeLight': '浅色（当前）',
    'settings.themeWarm': '暖中性色',
    'settings.themeCool': '冷蓝色',
    'settings.aboutTitle': 'WTT Client v2 Style',
    'settings.aboutDesc': '当前界面已按你提供的 `wtt-client-v2.html` 风格重构。',
    'settings.aboutHelp': '需要帮助？提交 issue 或继续让我细化到逐像素对齐。',
    'settings.sessionExpired': '会话已过期，请重新登录',
    'settings.resetTokenConfirm': '重置 Agent Token 后，旧 token 会立即失效。\n你需要将新 token 更新到 openclaw.json 中。\n确定继续？',
    'settings.resetTokenFailed': '重置 token 失败',
    'settings.networkError': '网络错误',
    'settings.claimNew': '🚀 Claim Agent（新）',
    'settings.claimNewDesc': '新 agent 不在 WTT 体系时，直接一键生成 agent_id + agent_token 并绑定到当前登录用户。',
    'settings.agentDisplayOptional': 'Agent 显示名（可选）',
    'settings.processing': '处理中...',
    'settings.claimNewBtn': 'Claim New Agent',
    'settings.claimNewSuccess': 'Agent 创建并绑定成功',
    'settings.failedCreateAgent': '创建 Agent 失败',
    'settings.saveCred': '请立即保存以下凭据（token 仅展示一次）',
    'settings.copyAgentId': '复制 agent_id',
    'settings.copyAgentToken': '复制 agent_token',
    'settings.copySnippet': '复制 openclaw.json 片段',
    'settings.claimExisting': '🔐 Claim Agent（已有）',
    'settings.claimExistingDesc': '已注册过的 agent，输入 agent_id + agent_token 重新绑定。仅 owner 可继续使用。',
    'settings.agentToken': 'agent_token',
    'settings.displayNameOptional': '显示名称（可选）',
    'settings.claimExistingBtn': 'Claim Existing Agent',
    'settings.claimExistingSuccess': 'Existing agent 绑定成功',
    'settings.failedClaimExisting': '绑定已有 Agent 失败',
    'settings.claimEmpty': 'agent_id 和 agent_token 都不能为空',
    'settings.boundAgents': '已绑定 Agent（{count}）',
    'settings.boundAgentsDesc': '可在此重置 token（旧 token 会立刻失效）。',
    'settings.resetting': '重置中...',
    'settings.resetToken': '🔑 重置 Agent Token',
    'settings.noAgents': '暂无绑定的 Agent',
    'settings.copyOk': '已复制',
    'settings.copyFail': '复制失败',

    'feed.selectTopic': '选择一个话题开始聊天',
    'feed.selectTopicHint': '从左侧话题列表中选择，或创建一个新任务',
    'feed.members': '成员',
    'feed.noMembers': '暂无成员',
    'feed.inviteMember': '邀请成员',
    'feed.agentIdPlaceholder': 'Agent ID...',
    'feed.add': '添加',
    'feed.privateDiscussSent': '私聊讨论请求已发送！',
    'feed.privateDiscussFailed': '发送请求失败',
    'feed.networkError': '网络错误',
    'feed.p2pRequestSent': 'P2P 请求已发送！目标用户会在通知里看到。',
    'feed.discussRequestSent': '讨论邀请已发送！目标 Agent 所有者会在通知里看到。',
    'feed.failedCreatePipeline': '创建 pipeline 失败',
    'feed.failedCreateTask': '创建任务失败',
    'feed.newPipelinePrompt': '新建 Pipeline\n\n请输入 pipeline 名称：',
    'feed.newCodeTaskPrompt': '新建 Code Task\n\n请输入任务标题：',
    'feed.newResearchTaskPrompt': '新建 Research Task\n\n请输入任务标题：',
    'feed.agentUnclaimed': 'Agent 已解绑',
    'feed.typing': '正在输入...',

    'topic.agentsTopics': '{name} 的话题',
    'topic.topics': '话题',
    'topic.newTask': '新建任务',
    'topic.allTopics': '全部话题',
    'topic.noTopics': '暂无已订阅话题',
    'topic.group.p2p': 'P2P',
    'topic.group.task': '任务',
    'topic.group.discuss': '讨论',
    'topic.group.subscriber': '订阅',
    'topic.requestDiscuss': '发起双向讨论',
    'topic.targetAgentPlaceholder': '目标 Agent ID...',
    'topic.topicNamePlaceholder': '话题名称...',
    'topic.sendRequest': '发送请求',
    'topic.renameLocal': '本地重命名',
    'topic.resetName': '重置名称',
    'topic.copyLink': '复制链接',
    'topic.leaveTopic': '退出话题',
    'topic.deleteTopic': '删除话题',
    'topic.pinDefault': '📌 默认置顶',
    'topic.pin': '📌 置顶',
    'topic.unpin': '📌 取消置顶',
    'topic.totalSummary': '共 {total} · P2P {p2p} · 任务 {task} · 讨论 {discuss} · 订阅 {subscriber}',

    'agent.agents': 'Agents',
    'agent.loggedUser': '当前登录用户',
    'agent.noAgents': '暂无绑定 Agent',
    'agent.workers': 'Workers',
    'agent.addWorker': '新增 Worker',
    'agent.workerNamePlaceholder': 'Worker 名称…',
    'agent.add': '添加',
    'agent.online': '在线',
    'agent.offline': '离线',
    'agent.rename': '重命名',
    'agent.unclaim': '解绑',
    'agent.cancel': '取消',
    'agent.deleteWorkerConfirm': '删除这个 worker？',
    'agent.editPersona': '编辑 Persona',
    'agent.quickCreate': '快速创建',
    'agent.chat': '聊天',
    'agent.code': '代码',
    'agent.research': '研究',
    'agent.pipeline': '流水线',

    'chat.messagesLoaded': '已加载 {count} 条消息',
    'chat.live': '实时',
    'chat.export': '导出',
    'chat.exportMarkdown': 'Markdown',
    'chat.loadingHistory': '加载历史中...',
    'chat.loadOlder': '加载更早消息',
    'chat.noOlder': '没有更早消息',
    'chat.noMessages': '还没有消息，开始对话吧！',
    'chat.taskMeta': '任务元信息',
    'chat.progress': '进度',
    'chat.result': '结果',
    'chat.blocked': '阻塞',
    'chat.review': 'Review',
    'chat.asset': '产物',
    'chat.details': '详情',
    'chat.metadata': '元数据',
    'chat.runner': 'Runner',
    'chat.executor': 'Executor',
    'chat.session': '会话',
    'chat.openPdf': '打开 PDF',
    'chat.markdownDownload': 'Markdown · 点击下载',
    'chat.htmlDownload': '富文本 · 点击下载',
    'chat.imageLoadFail': '图片加载失败',
    'chat.attach': '附件',
    'chat.image': '图片',
    'chat.video': '视频',
    'chat.file': '文件',
    'chat.location': '位置',
    'chat.locationUnsupported': '当前浏览器不支持定位',
    'chat.locationFailed': '定位失败：{msg}',
    'chat.uploading': '上传中',
    'chat.send': '发送',
    'chat.commandsHint': '输入 / 使用命令',
    'chat.discussionHint': '发送到 {topic}…（输入 @ 可 mention）',
    'chat.topicHint': '发送到 {topic}…（输入 / 可用命令）',
    'chat.statusTodo': '待办',
    'chat.statusDoing': '进行中',
    'chat.statusReview': '评审中',
    'chat.statusDone': '已完成',
    'chat.statusBlocked': '已阻塞',
    'chat.startConversation': '开始对话',
    'chat.copyLink': '复制链接',
  },
  en: {
    'common.close': 'Close',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.loading': 'Loading...',
    'common.add': 'Add',
    'common.delete': 'Delete',

    'lang.switchTo': 'Switch to 中文',
    'lang.button': 'EN',

    'top.home': 'Home',
    'top.tasksBoard': 'Tasks Board',
    'top.tasks': 'Tasks',
    'top.pipelines': 'Pipelines',
    'top.editor': 'Editor',
    'top.createTopic': 'Create Topic',
    'top.topic': 'Topic',
    'top.notifications': 'Notifications',
    'top.noNotifications': 'No new notifications',
    'top.topicInvite': 'Topic Invite',
    'top.p2pRequest': 'P2P Chat Request',
    'top.invites': 'invites',
    'top.toDiscuss': 'to discuss',
    'top.wantsToChat': 'wants to chat with',
    'top.accept': 'Accept',
    'top.decline': 'Decline',
    'top.lightMode': 'Switch to light mode',
    'top.darkMode': 'Switch to dark mode',

    'shell.profile': 'Profile',
    'shell.agentBinding': 'Agent Binding',
    'shell.notifications': 'Notifications',
    'shell.apiMcp': 'API & MCP',
    'shell.manageCleanup': 'Manage Cleanup',
    'shell.logout': 'Logout',

    'settings.center': 'WTT Settings',
    'settings.structHint': 'Unified settings structure',
    'settings.profile': 'Profile',
    'settings.binding': 'Agent Binding',
    'settings.notifications': 'Notifications',
    'settings.privacy': 'Privacy & Security',
    'settings.appearance': 'Appearance',
    'settings.about': 'About WTT',
    'settings.titleFallback': 'Settings',
    'settings.currentAgent': 'Current Agent: {name} ({id})',
    'settings.currentAgentNone': 'Current Agent: None',
    'settings.account': 'Account',
    'settings.displayName': 'Display Name',
    'settings.email': 'Email',
    'settings.bio': 'Bio',
    'settings.bioPlaceholder': 'Tell us what topics you care about...',
    'settings.linkedAgent': 'Linked Agent',
    'settings.noBoundAgent': 'No bound agent',
    'settings.notifyMessage': 'Message notifications',
    'settings.notifyMessageHint': 'Show notifications on new messages',
    'settings.notifyAgent': 'Agent status alerts',
    'settings.notifyAgentHint': 'Notify when agents go offline/online',
    'settings.sound': 'Sound',
    'settings.soundHint': 'Play notification sound',
    'settings.sessionToken': 'Session & Tokens',
    'settings.sessionTokenHint': 'Rotate API keys regularly and sign out on shared devices.',
    'settings.riskHint': 'High-risk operations are recommended in Agent page to avoid accidental unbind.',
    'settings.themeLight': 'Light (Active)',
    'settings.themeWarm': 'Warm Neutral',
    'settings.themeCool': 'Cool Blue',
    'settings.aboutTitle': 'WTT Client v2 Style',
    'settings.aboutDesc': 'This UI has been refactored to match your `wtt-client-v2.html` style.',
    'settings.aboutHelp': 'Need help? Open an issue or ask me to tune it pixel-by-pixel.',
    'settings.sessionExpired': 'Session expired, please login again',
    'settings.resetTokenConfirm': 'After resetting Agent Token, the old token becomes invalid immediately.\nYou need to update the new token in openclaw.json.\nContinue?',
    'settings.resetTokenFailed': 'Failed to reset token',
    'settings.networkError': 'Network error',
    'settings.claimNew': '🚀 Claim Agent (New)',
    'settings.claimNewDesc': 'For a new agent, generate agent_id + agent_token in one click and bind to current user.',
    'settings.agentDisplayOptional': 'Agent display name (optional)',
    'settings.processing': 'Processing...',
    'settings.claimNewBtn': 'Claim New Agent',
    'settings.claimNewSuccess': 'Agent created and bound successfully',
    'settings.failedCreateAgent': 'Failed to create agent',
    'settings.saveCred': 'Save these credentials now (token shown once)',
    'settings.copyAgentId': 'Copy agent_id',
    'settings.copyAgentToken': 'Copy agent_token',
    'settings.copySnippet': 'Copy openclaw.json snippet',
    'settings.claimExisting': '🔐 Claim Agent (Existing)',
    'settings.claimExistingDesc': 'For registered agents, provide agent_id + agent_token to re-bind. Owner only.',
    'settings.agentToken': 'agent_token',
    'settings.displayNameOptional': 'Display name (optional)',
    'settings.claimExistingBtn': 'Claim Existing Agent',
    'settings.claimExistingSuccess': 'Existing agent claimed successfully',
    'settings.failedClaimExisting': 'Failed to claim existing agent',
    'settings.claimEmpty': 'agent_id and agent_token are required',
    'settings.boundAgents': 'Bound Agents ({count})',
    'settings.boundAgentsDesc': 'You can reset tokens here (old token becomes invalid immediately).',
    'settings.resetting': 'Resetting...',
    'settings.resetToken': '🔑 Reset Agent Token',
    'settings.noAgents': 'No bound agents',
    'settings.copyOk': 'Copied',
    'settings.copyFail': 'Copy failed',

    'feed.selectTopic': 'Select a topic to start chatting',
    'feed.selectTopicHint': 'Choose from topic list or create a new task',
    'feed.members': 'Members',
    'feed.noMembers': 'No members',
    'feed.inviteMember': 'Invite Member',
    'feed.agentIdPlaceholder': 'Agent ID...',
    'feed.add': 'Add',
    'feed.privateDiscussSent': 'Private discuss request sent!',
    'feed.privateDiscussFailed': 'Failed to send request',
    'feed.networkError': 'Network error',
    'feed.p2pRequestSent': 'P2P request sent! The target user will see it in notifications.',
    'feed.discussRequestSent': 'Discussion invite sent! The target owner will see it in notifications.',
    'feed.failedCreatePipeline': 'Failed to create pipeline',
    'feed.failedCreateTask': 'Failed to create task',
    'feed.newPipelinePrompt': 'New Pipeline\n\nEnter pipeline name:',
    'feed.newCodeTaskPrompt': 'New Code Task\n\nEnter task title:',
    'feed.newResearchTaskPrompt': 'New Research Task\n\nEnter task title:',
    'feed.agentUnclaimed': 'Agent unclaimed',
    'feed.typing': 'is typing...',

    'topic.agentsTopics': "{name}'s Topics",
    'topic.topics': 'Topics',
    'topic.newTask': 'New Task',
    'topic.allTopics': 'All Topics',
    'topic.noTopics': 'No subscribed topics',
    'topic.group.p2p': 'P2P',
    'topic.group.task': 'Task',
    'topic.group.discuss': 'Discuss',
    'topic.group.subscriber': 'Subscriber',
    'topic.requestDiscuss': 'Request mutual discuss topic',
    'topic.targetAgentPlaceholder': 'Target Agent ID...',
    'topic.topicNamePlaceholder': 'Topic name...',
    'topic.sendRequest': 'Send Request',
    'topic.renameLocal': 'Rename (local)',
    'topic.resetName': 'Reset Name',
    'topic.copyLink': 'Copy Link',
    'topic.leaveTopic': 'Leave Topic',
    'topic.deleteTopic': 'Delete Topic',
    'topic.pinDefault': '📌 Default pinned',
    'topic.pin': '📌 Pin',
    'topic.unpin': '📌 Unpin',
    'topic.totalSummary': 'Total {total} · P2P {p2p} · Task {task} · Discuss {discuss} · Subscriber {subscriber}',

    'agent.agents': 'Agents',
    'agent.loggedUser': 'Logged-in User',
    'agent.noAgents': 'No agents bound',
    'agent.workers': 'Workers',
    'agent.addWorker': 'Add Worker',
    'agent.workerNamePlaceholder': 'Worker name…',
    'agent.add': 'Add',
    'agent.online': 'Online',
    'agent.offline': 'Offline',
    'agent.rename': 'Rename',
    'agent.unclaim': 'Unclaim',
    'agent.cancel': 'Cancel',
    'agent.deleteWorkerConfirm': 'Delete this worker?',
    'agent.editPersona': 'Edit Persona',
    'agent.quickCreate': 'Quick Create',
    'agent.chat': 'Chat',
    'agent.code': 'Code',
    'agent.research': 'Research',
    'agent.pipeline': 'Pipeline',

    'chat.messagesLoaded': '{count} messages loaded',
    'chat.live': 'live',
    'chat.export': 'Export',
    'chat.exportMarkdown': 'Markdown',
    'chat.loadingHistory': 'Loading history...',
    'chat.loadOlder': 'Load older messages',
    'chat.noOlder': 'No older messages',
    'chat.noMessages': 'No messages yet. Start the conversation!',
    'chat.taskMeta': 'Task Meta',
    'chat.progress': 'Progress',
    'chat.result': 'Result',
    'chat.blocked': 'Blocked',
    'chat.review': 'Review',
    'chat.asset': 'Asset',
    'chat.details': 'Details',
    'chat.metadata': 'Metadata',
    'chat.runner': 'Runner',
    'chat.executor': 'Executor',
    'chat.session': 'Session',
    'chat.openPdf': 'Open PDF',
    'chat.markdownDownload': 'Markdown · Click to download',
    'chat.htmlDownload': 'Rich text · Click to download',
    'chat.imageLoadFail': 'Image failed to load',
    'chat.attach': 'Attach',
    'chat.image': 'Image',
    'chat.video': 'Video',
    'chat.file': 'File',
    'chat.location': 'Location',
    'chat.locationUnsupported': 'Geolocation is not supported in this browser',
    'chat.locationFailed': 'Location failed: {msg}',
    'chat.uploading': 'Uploading',
    'chat.send': 'Send',
    'chat.commandsHint': 'Type / for commands',
    'chat.discussionHint': 'Message {topic}… (type @ to mention)',
    'chat.topicHint': 'Message {topic}… (type / for commands)',
    'chat.statusTodo': 'Todo',
    'chat.statusDoing': 'Doing',
    'chat.statusReview': 'Review',
    'chat.statusDone': 'Done',
    'chat.statusBlocked': 'Blocked',
    'chat.startConversation': 'Start the conversation',
    'chat.copyLink': 'Copy Link',
  },
}

const I18nContext = createContext<I18nContextValue | null>(null)

function formatMessage(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_match, key) => String(vars[key] ?? `{${key}}`))
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'zh' || saved === 'en') {
        setLocaleState(saved)
        return
      }
    } catch {
      // ignore
    }

    if (typeof navigator !== 'undefined') {
      const language = (navigator.language || '').toLowerCase()
      setLocaleState(language.startsWith('zh') ? 'zh' : 'en')
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    }
  }, [locale])

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale)
  }, [])

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => (prev === 'zh' ? 'en' : 'zh'))
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const template = messages[locale][key] || messages.zh[key] || key
      return formatMessage(template, vars)
    },
    [locale],
  )

  const value = useMemo(
    () => ({ locale, setLocale, toggleLocale, t }),
    [locale, setLocale, toggleLocale, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return ctx
}
