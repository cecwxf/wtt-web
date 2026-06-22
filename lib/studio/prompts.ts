type InitialPromptInput = {
  projectName: string
  topicId: string
  userPrompt: string
  connectorContext?: string
}

export function studioWorkspace(topicId: string) {
  return `/home/wttagent/wtt-sites/${topicId}`
}

function connectorBlock(connectorContext?: string) {
  const clean = String(connectorContext || '').trim()
  return clean ? `\n\n${clean}` : ''
}

export function buildInitialStudioPrompt({ projectName, topicId, userPrompt, connectorContext }: InitialPromptInput) {
  const workspace = studioWorkspace(topicId)
  return [
    '[WTT_STUDIO_PROJECT]',
    `project_name=${projectName}`,
    `topic_id=${topicId}`,
    `workspace=${workspace}`,
    'stack=vite-react-tailwind',
    '[/WTT_STUDIO_PROJECT]',
    '',
    '你是 WTT Studio 的网站生成 Agent。请严格按下面规则工作：',
    `1. 所有项目代码必须放在 ${workspace}，不要污染用户其他目录。`,
    '2. 默认使用 Vite + React + Tailwind 或更轻量的静态 HTML/CSS/JS，优先保证可运行、可预览、可继续迭代。',
    '3. 如果用户要求可视化网页、动画、应用原型或站点，请启动 dev server 并生成 Cloud Agent Preview URL。Preview URL 必须以 Markdown 链接返回，格式为：[Cloud Agent Preview](https://...)。',
    '4. 如果用户要求发布，请执行构建/发布流程，并用 [PUBLISHED_SITE](https://...) 返回公开地址。',
    '5. 如果用户要求 GitHub，请创建或更新用户对应仓库，并用 [GITHUB_REPO](https://github.com/...) 与 [COMMIT](https://github.com/.../commit/...) 返回结果。',
    '6. 每次回复先给出关键结果，再列出改动文件、运行方式和下一步建议。',
    connectorBlock(connectorContext),
    '',
    '用户需求：',
    userPrompt.trim() || '创建一个高质量、可预览的网站首页。',
  ].join('\n')
}

export function buildFollowupStudioPrompt(topicId: string, userPrompt: string, connectorContext?: string) {
  const workspace = studioWorkspace(topicId)
  return [
    '[WTT_STUDIO_CONTINUE]',
    `workspace=${workspace}`,
    '[/WTT_STUDIO_CONTINUE]',
    '',
    `请在现有项目目录 ${workspace} 中继续迭代，不要重建到其他目录。`,
    '如果改动影响页面效果，请保持或重新生成 Cloud Agent Preview URL，并以 [Cloud Agent Preview](https://...) 返回。',
    connectorBlock(connectorContext),
    '',
    userPrompt.trim(),
  ].join('\n')
}

export function buildPublishPrompt(topicId: string, connectorContext?: string) {
  const workspace = studioWorkspace(topicId)
  return [
    '[WTT_STUDIO_PUBLISH]',
    `workspace=${workspace}`,
    '[/WTT_STUDIO_PUBLISH]',
    '',
    '请构建当前网站并发布为全球可访问 URL。发布成功后只用 Markdown 链接返回：',
    '[PUBLISHED_SITE](https://...)',
    connectorBlock(connectorContext),
  ].join('\n')
}

export function buildGithubPrompt(topicId: string, projectName: string, connectorContext?: string) {
  const workspace = studioWorkspace(topicId)
  return [
    '[WTT_STUDIO_GITHUB]',
    `project_name=${projectName}`,
    `workspace=${workspace}`,
    '[/WTT_STUDIO_GITHUB]',
    '',
    '请把当前网站代码提交到该登录用户的 GitHub 仓库。仓库名用项目名转换为安全的 kebab-case。',
    '完成后返回：',
    '[GITHUB_REPO](https://github.com/owner/repo)',
    '[COMMIT](https://github.com/owner/repo/commit/sha)',
    connectorBlock(connectorContext),
  ].join('\n')
}

export function buildPreviewPrompt(topicId: string, connectorContext?: string) {
  const workspace = studioWorkspace(topicId)
  return [
    '[WTT_STUDIO_PREVIEW]',
    `workspace=${workspace}`,
    '[/WTT_STUDIO_PREVIEW]',
    '',
    '请启动或重启当前项目的 dev server，并返回最新 Cloud Agent Preview URL：',
    '[Cloud Agent Preview](https://...)',
    connectorBlock(connectorContext),
  ].join('\n')
}
