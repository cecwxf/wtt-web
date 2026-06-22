type InitialPromptInput = {
  projectName: string
  topicId: string
  userPrompt: string
  connectorContext?: string
}

type VisualFeedbackInput = {
  topicId: string
  previewUrl: string
  note: string
  device: 'desktop' | 'mobile'
  rect: {
    xPct: number
    yPct: number
    widthPct: number
    heightPct: number
  }
  viewport: {
    width: number
    height: number
  }
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
    '4. 当前 Studio 默认以 Preview URL 作为可分享预览产物，不需要单独发布流程。',
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

export function buildVisualFeedbackPrompt({ topicId, previewUrl, note, device, rect, viewport, connectorContext }: VisualFeedbackInput) {
  const workspace = studioWorkspace(topicId)
  const rectJson = JSON.stringify({
    xPct: Number(rect.xPct.toFixed(2)),
    yPct: Number(rect.yPct.toFixed(2)),
    widthPct: Number(rect.widthPct.toFixed(2)),
    heightPct: Number(rect.heightPct.toFixed(2)),
  })
  return [
    '[WTT_STUDIO_VISUAL_FEEDBACK]',
    `workspace=${workspace}`,
    `preview_url=${previewUrl}`,
    `device=${device}`,
    `viewport=${viewport.width}x${viewport.height}`,
    `selection_rect_percent=${rectJson}`,
    '[/WTT_STUDIO_VISUAL_FEEDBACK]',
    '',
    '用户在 Preview 页面中圈选了一个区域，并要求你基于该区域继续修改网站。',
    '请按下面流程处理：',
    `1. 只修改现有项目目录 ${workspace}，不要重建到其他目录。`,
    '2. 用浏览器/Playwright/DOM 检查 preview_url 中对应区域。选区坐标是相对当前 iframe viewport 的百分比。',
    '3. 结合用户反馈定位相关组件、样式、文案、布局或交互，然后修改源码。',
    '4. 保持或重启 dev server，并返回最新 Cloud Agent Preview URL：[Cloud Agent Preview](https://...)。',
    '5. 回复中简要说明修改了哪个区域、改了哪些文件。',
    connectorBlock(connectorContext),
    '',
    '用户反馈：',
    note.trim(),
  ].join('\n')
}
