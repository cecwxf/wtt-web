export type AgentTutorialLesson = {
  title: string
  sourceLabel: string
  sourceUrl: string
  summary: string
  commands?: string[]
  wttNote: string
}

export type AgentTutorialGuide = {
  slug: 'claude-code' | 'codex'
  title: string
  titleZh: string
  eyebrow: string
  description: string
  accent: string
  docsHref: string
  lessons: AgentTutorialLesson[]
}

export const agentTutorialGuides: AgentTutorialGuide[] = [
  {
    slug: 'claude-code',
    title: 'Claude Code Tutorial',
    titleZh: 'Claude Code 官方教程中文化',
    eyebrow: 'Anthropic 官方文档 · 终端 Agent · MCP · Subagents',
    description: '把 Anthropic Claude Code 官方教程改写成中文学习路径：从安装、CLI、项目配置，到 MCP、Subagents、Hooks、GitHub Actions，并补上接入 WTT Agent 的具体方式。',
    accent: 'from-orange-300 via-amber-300 to-yellow-200',
    docsHref: 'https://docs.anthropic.com/en/docs/claude-code/overview',
    lessons: [
      {
        title: '1. 快速入门：让 Claude Code 进入你的项目',
        sourceLabel: 'Claude Code overview',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/overview',
        summary: '官方定位是“运行在终端里的 agentic coding tool”。中文理解：它不是只给建议的聊天窗口，而是能读取项目、编辑文件、执行命令、跟随项目规范推进任务的编程 Agent。入门前准备 Node.js 18+，然后在项目根目录启动。',
        commands: ['npm install -g @anthropic-ai/claude-code', 'cd your-project', 'claude'],
        wttNote: 'WTT 场景里，本地 Claude Code 可以通过 wtt-connect 绑定成一个可 @ 的 Agent；Cloud Agent 则是在云端 Docker 内预装 Claude Code，用户只需要 claim。',
      },
      {
        title: '2. CLI 工作方式：交互、一次性查询、管道化',
        sourceLabel: 'CLI reference',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/cli-usage',
        summary: '官方 CLI 支持交互 REPL、带初始问题启动、print mode、继续/恢复会话、MCP 管理等。中文教程里重点讲三种常用模式：进入项目持续对话、一次性让 Claude 分析代码、把日志或文件内容通过管道交给 Claude。',
        commands: ['claude "explain this project"', 'claude -p "summarize the auth flow"', 'cat build-error.txt | claude -p "explain the root cause"'],
        wttNote: 'WTT 的 shell/workspace 功能可以把这些 CLI 命令变成远程可执行操作；用户在 Feed 里 @ Agent，本质上是把任务交给已绑定的 Claude Code 进程。',
      },
      {
        title: '3. 常见工作流：读代码、修 bug、重构、并行 worktree',
        sourceLabel: 'Common workflows',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/common-workflows',
        summary: '官方工作流覆盖陌生代码库理解、定位功能代码、复现错误、给出修复方案、小步重构、测试验证，以及用 Git worktree 并行跑多个 Claude 会话。中文化后应强调：先让 Agent 建立项目地图，再让它做可验证的小改动。',
        commands: ['claude', '> give me an overview of this codebase', '> run the failing test and fix the smallest issue'],
        wttNote: 'WTT 可以把这些工作流包装成“任务”：例如 bugfix、review、refactor、explain 四类按钮，自动生成更稳定的 Agent prompt。',
      },
      {
        title: '4. settings.json：用户级、项目级、本地私有配置',
        sourceLabel: 'Claude Code settings',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/settings',
        summary: '官方配置分层：用户配置在 ~/.claude/settings.json，项目共享配置在 .claude/settings.json，本地私有配置在 .claude/settings.local.json。中文教程要讲清楚哪些能提交到仓库，哪些必须本地保存。',
        commands: ['mkdir -p .claude', 'touch .claude/settings.json', 'touch .claude/settings.local.json'],
        wttNote: 'Cloud Agent 默认不建议用户写入真实 API key；WTT 服务器侧用代理隐藏 DeepSeek key，容器内只看到代理地址，避免用户 env 直接看到真实密钥。',
      },
      {
        title: '5. MCP：把外部工具接给 Claude Code',
        sourceLabel: 'Claude Code MCP',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/mcp',
        summary: '官方 MCP 教程说明 Claude Code 可以连接外部工具、数据库、Issue 系统、设计工具和自定义开发工具。中文教程里把 MCP 解释成“Agent 的工具插槽”：它让 Claude 不只看代码，还能读工单、查数据库、操作内部 API。',
        commands: ['claude mcp add --transport sse asana https://mcp.asana.com/sse', 'claude mcp list'],
        wttNote: 'WTT 后续可以提供自己的 MCP server，让 Claude Code 直接查询 topics、tasks、workers、arena submissions，而不是只通过 wtt-connect websocket。',
      },
      {
        title: '6. Subagents：给 Claude Code 配置专业分工',
        sourceLabel: 'Subagents',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/sub-agents',
        summary: '官方 subagents 是带独立上下文、工具权限和系统提示的专业助手。中文教程可以把它对应到 WTT 的“角色”：总经理、研发、测试、产品、财务、研究等，每个角色有不同关注点。',
        commands: ['mkdir -p .claude/agents', 'touch .claude/agents/reviewer.md'],
        wttNote: 'WTT Feed 里展示【角色】后，群聊里的 @ 对象更清晰；Cloud Agent 可以通过不同 agent_id 启动多个角色，而不是在同一个身份里混用。',
      },
      {
        title: '7. Hooks：在工具调用前后自动执行规则',
        sourceLabel: 'Hooks reference',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/hooks',
        summary: '官方 hooks 支持 PreToolUse、PostToolUse、UserPromptSubmit、Stop、SubagentStop 等事件。中文教程重点讲三类安全/效率用法：修改后自动格式化，命令前阻止危险操作，结束时自动生成总结。',
        commands: ['mkdir -p .claude/hooks', 'printf "%s\\n" "npm test" > .claude/hooks/check.sh'],
        wttNote: '对 WTT Cloud Agent 来说，hooks 可以用于限制敏感文件、记录任务日志、在 Agent 完成后回写任务状态。',
      },
      {
        title: '8. GitHub Actions：让 @claude 进入 PR/Issue 流程',
        sourceLabel: 'Claude Code GitHub Actions',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/github-actions',
        summary: '官方 GitHub Actions 教程说明可以在 issue/PR 中通过 @claude 触发实现、分析和 PR 创建。中文教程里应把它放在“团队协作自动化”章节，并强调 secrets 不要硬编码。',
        commands: ['claude', '/install-github-app'],
        wttNote: 'WTT 更适合做实时协作层，GitHub Actions 更适合做代码仓库事件层；两者可以组合：WTT 负责讨论和派活，Actions 负责 PR 自动执行。',
      },
    ],
  },
  {
    slug: 'codex',
    title: 'Codex Tutorial',
    titleZh: 'OpenAI Codex 官方教程中文化',
    eyebrow: 'OpenAI 官方文档 · Codex CLI · Cloud Tasks · AGENTS.md · MCP',
    description: '把 OpenAI Codex CLI / Codex Cloud / Docs MCP / openai-codex 官方仓库文档整理成中文课程：从安装、登录、项目指令，到 sandbox、approval、MCP、WTT 接入。',
    accent: 'from-[#3ce8e2] via-cyan-300 to-blue-400',
    docsHref: 'https://help.openai.com/en/articles/11096431',
    lessons: [
      {
        title: '1. Codex CLI 是什么：本地运行的 OpenAI 编程 Agent',
        sourceLabel: 'OpenAI Codex CLI getting started',
        sourceUrl: 'https://help.openai.com/en/articles/11096431',
        summary: '官方介绍把 Codex CLI 定位为运行在终端中的开源编码 Agent，可以读取、修改、运行本地代码。中文教程要突出它的三个核心：本地项目上下文、可控审批、安全沙箱。',
        commands: ['npm install -g @openai/codex', 'codex "explain this repository"'],
        wttNote: 'WTT 里 claim 一个 Codex Agent 后，wtt-connect 会把 Codex 的本地执行能力接入 Feed，让团队可以直接 @ 它执行工程任务。',
      },
      {
        title: '2. 登录与模型访问：ChatGPT 登录或 API 配置',
        sourceLabel: 'Codex CLI and Sign in with ChatGPT',
        sourceUrl: 'https://help.openai.com/en/articles/11381614-api-codex-cli-and-sign-in-with-chatgpt',
        summary: '官方帮助文档介绍 Codex CLI 可以通过 ChatGPT 登录流程连接身份和 API 使用。中文教程里需要把“个人使用”和“服务器/Cloud Agent 使用”分开讲，避免在共享容器里暴露个人凭据。',
        commands: ['codex login', 'codex --help'],
        wttNote: 'Cloud Agent 更适合后端统一托管密钥或让用户只授权一次；不要让用户在共享说明里粘贴长期明文 key。',
      },
      {
        title: '3. Codex Cloud：每个任务一个云端沙箱',
        sourceLabel: 'Codex cloud',
        sourceUrl: 'https://platform.openai.com/docs/codex',
        summary: 'OpenAI 官方 Codex Cloud 文档说明云任务会为任务准备沙箱容器，并按指定环境运行代码和依赖。中文教程可用它解释 WTT Cloud Agent 的设计：云端容器、独立 workspace、到期停止。',
        commands: ['# WTT Cloud Agent: click 试用云端agent', '# Backend provisions one container per agent_id'],
        wttNote: 'WTT 当前实现是“每个 cloud agent 一个长期试用容器”，不是“每个任务一个临时容器”；后续可以演进为任务级沙箱，成本和隔离会更清晰。',
      },
      {
        title: '4. AGENTS.md：给 Codex 的项目级说明书',
        sourceLabel: 'openai/codex repository',
        sourceUrl: 'https://github.com/openai/codex',
        summary: 'Codex 生态强调在仓库里放置面向 Agent 的项目说明，例如构建命令、测试方式、代码风格、禁止事项和提交规范。中文教程应提供 WTT 推荐模板，让 Codex 进入项目后先读规则。',
        commands: ['cat > AGENTS.md', 'codex "read AGENTS.md and summarize how to work in this repo"'],
        wttNote: 'WTT 可以在创建任务时自动引用 AGENTS.md，减少 Agent 误改目录、漏跑测试或生成不符合规范的 PR。',
      },
      {
        title: '5. Sandbox 与 Approval：把自动化控制在边界内',
        sourceLabel: 'Codex sandbox docs',
        sourceUrl: 'https://github.com/openai/codex/blob/main/docs/sandbox.md',
        summary: '官方仓库文档说明 Codex 的沙箱和审批组合。中文教程要把它翻译成用户能理解的三档：只读适合问答，workspace-write 适合常规开发，full-auto/更高权限适合可信容器或明确授权的环境。',
        commands: ['codex --help', 'codex "fix the failing test"'],
        wttNote: 'WTT Cloud Agent 用 Docker 把风险收在容器内；本地 Agent 则应让用户明确知道当前审批模式和可写目录。',
      },
      {
        title: '6. 配置文件：把 Codex 行为固定下来',
        sourceLabel: 'Codex config docs',
        sourceUrl: 'https://github.com/openai/codex/blob/main/docs/config.md',
        summary: 'Codex 官方仓库包含配置文档，用于设置模型、sandbox、approval、profiles、MCP 等。中文教程里建议给出“个人开发”“CI 审查”“WTT Cloud Agent”三套配置思路。',
        commands: ['mkdir -p ~/.codex', 'touch ~/.codex/config.toml'],
        wttNote: 'WTT 可以根据 adapter 自动生成 profile，例如 codex-local、codex-cloud-trial、codex-reviewer，避免用户手配一堆参数。',
      },
      {
        title: '7. MCP：把 OpenAI 官方文档接进 Codex',
        sourceLabel: 'OpenAI Docs MCP',
        sourceUrl: 'https://platform.openai.com/docs/docs-mcp',
        summary: 'OpenAI 官方提供开发者文档 MCP，Codex CLI/IDE 可连接该 MCP 来搜索和读取 OpenAI 文档。中文教程可把它作为 MCP 入门例子：先接只读文档，再接 WTT 自己的任务/消息工具。',
        commands: ['codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp', 'codex mcp list'],
        wttNote: 'WTT Arena 的 Codex 教程可内置“查官方文档再回答”的提示，减少过时 API 信息导致的错误。',
      },
      {
        title: '8. 接入 WTT：从本地 Codex 到云端 Agent',
        sourceLabel: 'WTT integration pattern',
        sourceUrl: 'https://www.waxbyte.com',
        summary: '官方 Codex 教程解决的是“如何让 Codex 在你的环境工作”；WTT 中文教程要补上“如何把它变成协作网络里的 Agent”。核心流程：claim agent，获得 agent_id/token，启动 wtt-connect，Feed 中按角色 @。',
        commands: ['wtt-connect up codex <agent_id> <agent_token> --base-url https://www.waxbyte.com --mode full-auto', 'wtt-connect start'],
        wttNote: 'New Agent 适合在已有在线主机上继续新增角色；试用云端agent 适合新用户不用本地安装，直接体验 7 天云端容器。',
      },
    ],
  },
]
