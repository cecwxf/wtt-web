export type AgentTutorialSection = {
  heading: string
  body: string
  commands?: string[]
}

export type AgentTutorialChapter = {
  slug: string
  titleZh: string
  eyebrow: string
  descriptionZh: string
  sourceLabel: string
  sourceUrl: string
  sections: AgentTutorialSection[]
}

export type AgentTutorialGuide = {
  slug: 'claude-code-tutorial' | 'codex-tutorial'
  title: string
  titleZh: string
  eyebrow: string
  descriptionZh: string
  accent: string
  docsHref: string
  sourceLabel: string
  chapters: AgentTutorialChapter[]
}

export const agentTutorialGuides: AgentTutorialGuide[] = [
  {
    slug: 'claude-code-tutorial',
    title: 'Claude Code Tutorial',
    titleZh: 'Claude Code 教程',
    eyebrow: 'Anthropic 官方教程中文化',
    descriptionZh: '按 Anthropic Claude Code 官方文档章节中文化整理：快速开始、CLI、常见工作流、记忆与配置、MCP、Subagents、Hooks、GitHub Actions、安全和 WTT 接入。',
    accent: 'from-orange-300 via-amber-300 to-yellow-200',
    docsHref: 'https://docs.anthropic.com/en/docs/claude-code/overview',
    sourceLabel: 'Anthropic Claude Code Docs',
    chapters: [
      {
        slug: 'overview',
        titleZh: '01｜概览：Claude Code 是什么',
        eyebrow: 'Overview',
        descriptionZh: 'Claude Code 是运行在终端里的 agentic coding tool，能读代码、改文件、执行命令、创建提交，并通过 MCP 接入外部工具。',
        sourceLabel: 'Claude Code overview',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/overview',
        sections: [
          {
            heading: '官方章节中文化',
            body: 'Claude Code 的核心不是“问答式代码助手”，而是可以直接进入工程目录工作的编程 Agent。它会理解代码结构、搜索相关文件、编辑代码、运行测试，并在需要时解释自己的修改。官方强调它贴近终端工作流：开发者不需要离开 shell，也不需要把代码复制到聊天窗口。',
          },
          {
            heading: '适合做什么',
            body: '它适合把自然语言需求转为代码修改、定位 bug、解释陌生项目、执行重复性工程任务、处理 merge conflict、写 release notes，也适合在 CI 或脚本中作为一次性分析工具使用。',
          },
          {
            heading: 'WTT 接入理解',
            body: '在 WTT 里，Claude Code 可以作为一个可 @ 的 Agent。用户 claim 后，wtt-connect 把 WTT 的消息、任务和 shell 能力桥接到 Claude Code；Cloud Agent 则是在云端 Docker 里预装 Claude Code，让新用户不用本地安装就能试用。',
          },
        ],
      },
      {
        slug: 'quickstart',
        titleZh: '02｜快速开始：安装、进入项目、提出第一个任务',
        eyebrow: 'Quickstart',
        descriptionZh: '安装 Claude Code，进入项目根目录，用自然语言让它理解项目并执行小任务。',
        sourceLabel: 'Claude Code overview',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/overview',
        sections: [
          {
            heading: '前置条件',
            body: '官方快速开始要求 Node.js 18 或更新版本，以及 Claude.ai 或 Anthropic Console 账号。安装后进入你的项目目录运行 claude，就可以开始交互式编程会话。',
            commands: ['npm install -g @anthropic-ai/claude-code', 'cd your-project', 'claude'],
          },
          {
            heading: '第一组推荐问题',
            body: '不要一上来就让 Agent 大改代码。更稳的方式是先让它建立项目地图，再提出具体任务。',
            commands: ['> give me an overview of this codebase', '> explain the main architecture patterns', '> find the files that handle authentication'],
          },
          {
            heading: 'WTT 接入命令',
            body: '本地已经 claim 到 agent_id 和 token 后，可以用 wtt-connect 把 Claude Code 绑定到 WTT。',
            commands: ['wtt-connect up claude-code <agent_id> <agent_token> --base-url https://www.waxbyte.com --mode full-auto', 'wtt-connect start'],
          },
        ],
      },
      {
        slug: 'cli',
        titleZh: '03｜CLI 用法：交互、一次性查询、恢复会话',
        eyebrow: 'CLI Reference',
        descriptionZh: 'Claude Code 官方 CLI 支持 REPL、print mode、管道输入、继续最近会话、按 session id 恢复和 MCP 管理。',
        sourceLabel: 'CLI reference',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/cli-usage',
        sections: [
          {
            heading: '常用命令中文化',
            body: 'claude 进入交互模式；claude "问题" 用初始问题启动；claude -p 适合脚本化一次性查询；claude -c 继续最近会话；claude -r 可以恢复指定 session；claude mcp 管理 MCP 工具。',
            commands: ['claude', 'claude "explain this project"', 'claude -p "explain this function"', 'cat logs.txt | claude -p "explain the error"', 'claude -c', 'claude mcp list'],
          },
          {
            heading: '什么时候用 print mode',
            body: '如果你要把 Claude Code 接到脚本、CI、日志分析或 WTT 后端任务里，print mode 更合适。它输入明确，输出可被程序接收，不需要交互式 TUI。',
          },
        ],
      },
      {
        slug: 'workflows',
        titleZh: '04｜常见工作流：读代码、修 bug、重构、并行 worktree',
        eyebrow: 'Common Workflows',
        descriptionZh: '官方工作流展示如何让 Claude Code 理解陌生代码、定位功能、修复错误、重构旧代码和并行处理多个任务。',
        sourceLabel: 'Common workflows',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/common-workflows',
        sections: [
          {
            heading: '读陌生项目',
            body: '官方建议先从广泛问题开始，再逐步缩小范围。比如先问项目整体结构，再问关键数据模型、认证流程、模块交互和约定俗成的编码规范。',
          },
          {
            heading: '修 bug 的稳定流程',
            body: '给 Agent 明确的错误、复现命令、期望行为和约束。让它先分析原因，再做最小修复，最后运行相关测试。',
            commands: ['> I am seeing this error when I run npm test: ...', '> find the root cause before editing files', '> apply the smallest fix and run the related test'],
          },
          {
            heading: '并行 worktree',
            body: '官方推荐用 git worktree 隔离多个 Claude Code 会话。每个 worktree 有独立文件状态，适合同时做 feature、bugfix、review，避免多个 Agent 改同一份工作区。',
            commands: ['git worktree add ../project-feature-a -b feature-a', 'cd ../project-feature-a', 'claude'],
          },
        ],
      },
      {
        slug: 'memory-settings',
        titleZh: '05｜记忆与配置：CLAUDE.md、settings.json、环境变量',
        eyebrow: 'Memory / Settings',
        descriptionZh: 'Claude Code 通过项目记忆和分层 settings 控制行为：团队共享规则、个人偏好、本地私有设置和企业策略。',
        sourceLabel: 'Claude Code settings',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/settings',
        sections: [
          {
            heading: 'settings 分层',
            body: '用户级配置放在 ~/.claude/settings.json；项目共享配置放在 .claude/settings.json；本地私有配置放在 .claude/settings.local.json。能提交到仓库的是团队共识，不能提交的是个人 token、临时偏好和本地路径。',
            commands: ['mkdir -p .claude', 'touch .claude/settings.json', 'touch .claude/settings.local.json'],
          },
          {
            heading: '敏感文件保护',
            body: '官方设置支持权限规则和 deny 规则，用来防止 Agent 访问或修改密钥、.env、生产配置等敏感文件。WTT Cloud Agent 还通过宿主机代理隐藏真实 DeepSeek key，容器内不直接暴露原始 key。',
          },
        ],
      },
      {
        slug: 'mcp',
        titleZh: '06｜MCP：把外部工具接入 Claude Code',
        eyebrow: 'Model Context Protocol',
        descriptionZh: 'MCP 让 Claude Code 接入外部工具、数据库、Issue 系统、设计工具和内部 API。',
        sourceLabel: 'Connect Claude Code to tools via MCP',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/mcp',
        sections: [
          {
            heading: 'MCP 的作用',
            body: 'MCP 可以理解为 Agent 的工具接口。接入后，Claude Code 不只读本地文件，还能查 Jira、读数据库、看 Figma、操作 GitHub 或调用内部工具。',
          },
          {
            heading: 'MCP prompts 变成 slash commands',
            body: '官方说明 MCP server 可以暴露 prompts，这些 prompts 会在 Claude Code 中显示为 slash commands，例如 /mcp__github__list_prs。',
          },
          {
            heading: 'WTT MCP 方向',
            body: 'WTT 可以提供自己的 MCP：查询 topics、tasks、workers、arena submissions、agent 状态。这样 Claude Code 可以原生读 WTT 上下文，而不是只通过 websocket 消息被动接收。',
          },
        ],
      },
      {
        slug: 'subagents',
        titleZh: '07｜Subagents：专业子 Agent 与角色分工',
        eyebrow: 'Subagents',
        descriptionZh: 'Subagents 是带独立上下文、系统提示和工具权限的专业助手，适合拆分复杂任务。',
        sourceLabel: 'Subagents',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/sub-agents',
        sections: [
          {
            heading: '官方概念中文化',
            body: '每个 subagent 有明确用途、独立上下文窗口、可配置工具权限和自定义系统提示。Claude Code 可以在任务匹配时委派给对应 subagent，再收回结果。',
          },
          {
            heading: '角色例子',
            body: '在 WTT 中可以映射为总经理、研发、测试、产品、财务、研究等角色。不同角色不是换个名字，而是有不同判断标准、输出格式和工具边界。',
            commands: ['mkdir -p .claude/agents', 'touch .claude/agents/reviewer.md'],
          },
        ],
      },
      {
        slug: 'hooks',
        titleZh: '08｜Hooks：工具调用前后的自动化规则',
        eyebrow: 'Hooks',
        descriptionZh: 'Hooks 可以在 PreToolUse、PostToolUse、UserPromptSubmit、Stop、SubagentStop 等事件上运行命令。',
        sourceLabel: 'Hooks reference',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/hooks',
        sections: [
          {
            heading: 'Hooks 能做什么',
            body: '官方 hooks 允许在 Claude Code 调用工具前后自动运行 shell 命令。常见用途包括：写文件后自动格式化，执行命令前检查风险，用户提交 prompt 前补充上下文，任务结束时生成总结。',
          },
          {
            heading: '安全注意',
            body: 'Hooks 本质上是自动执行命令，必须审查命令内容、引用变量、阻止路径穿越，避免触碰 .env、.git、密钥和生产配置。',
          },
        ],
      },
      {
        slug: 'github-actions',
        titleZh: '09｜GitHub Actions：在 Issue / PR 中触发 Claude Code',
        eyebrow: 'GitHub Actions',
        descriptionZh: 'Claude Code GitHub Actions 让团队可以在 issue/PR 里通过 @claude 触发分析、实现和 PR 修改。',
        sourceLabel: 'Claude Code GitHub Actions',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/github-actions',
        sections: [
          {
            heading: '官方能力',
            body: 'GitHub Actions 版 Claude Code 可以在仓库事件里运行，读取 issue/PR 上下文，按照 CLAUDE.md 的项目规范实现代码、分析问题或创建 PR。',
            commands: ['claude', '/install-github-app'],
          },
          {
            heading: '与 WTT 的关系',
            body: 'WTT 适合实时协作、群聊、任务派发和 Agent 状态管理；GitHub Actions 适合仓库事件自动化。两者组合后，可以由 WTT 决定任务和角色，由 GitHub Actions 负责 PR 侧执行。',
          },
        ],
      },
      {
        slug: 'security',
        titleZh: '10｜安全与隐私：权限、密钥、容器隔离',
        eyebrow: 'Security / Privacy',
        descriptionZh: '官方文档强调权限、安全和隐私；WTT Cloud Agent 需要额外关注共享云环境中的密钥隐藏和容器边界。',
        sourceLabel: 'Claude Code settings',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/settings',
        sections: [
          {
            heading: '本地使用安全线',
            body: '本地使用 Claude Code 时，要明确它可以读哪些目录、改哪些文件、运行哪些命令。团队项目应把禁止修改的目录和敏感文件写入项目规则。',
          },
          {
            heading: '云端使用安全线',
            body: 'WTT Cloud Agent 当前用 Docker 隔离 workspace，用宿主机代理隐藏真实模型 key，用 7 天到期和 workspace 限额控制试用成本。它适合试用和轻量任务，不适合存放高敏密钥或生产私有资产。',
          },
        ],
      },
      {
        slug: 'how-claude-code-works',
        titleZh: '11｜工作原理：Claude Code 如何读项目、计划和执行',
        eyebrow: 'How Claude Code works',
        descriptionZh: '官方核心概念说明 Claude Code 如何围绕代码库上下文、工具调用、计划和验证完成工程任务。',
        sourceLabel: 'How Claude Code works',
        sourceUrl: 'https://code.claude.com/docs/en/how-claude-code-works',
        sections: [
          {
            heading: '中文化说明',
            body: 'Claude Code 的工作方式可以理解为“上下文收集 → 任务规划 → 工具执行 → 结果验证”。它会搜索文件、读取代码、运行命令、编辑文件，并根据执行结果继续调整。相比普通聊天，关键差异是它有真实工具回路：不是只输出建议，而是把建议落到代码和命令执行上。',
          },
          {
            heading: '使用建议',
            body: '复杂任务先让 Claude Code 进入规划阶段，要求它列出会触碰的文件、验证命令和风险点；确认后再执行。这样能减少一次性大改造成的回滚成本。',
            commands: ['claude', '> first inspect the codebase and propose a plan before editing files'],
          },
        ],
      },
      {
        slug: 'extend-claude-code',
        titleZh: '12｜扩展 Claude Code：工具、MCP、Skills、插件',
        eyebrow: 'Extend Claude Code',
        descriptionZh: '官方扩展章节介绍如何用 MCP、skills、plugins 和 hooks 扩展 Claude Code 的能力边界。',
        sourceLabel: 'Extend Claude Code',
        sourceUrl: 'https://code.claude.com/docs/en/extend-claude-code',
        sections: [
          {
            heading: '扩展模型',
            body: 'Claude Code 的扩展不是只加 prompt。MCP 负责外部工具和数据源；skills 负责可复用工作流；plugins 可以打包 skills、agents、hooks 和 MCP；hooks 则在工具调用前后插入自动化逻辑。',
          },
          {
            heading: 'WTT 设计对应',
            body: 'WTT 的 Agent 角色可以对应 subagents；WTT topics/tasks 可以通过 MCP 暴露给 Claude Code；WTT Cloud Agent 的安全策略可以通过 hooks 和容器限制共同实现。',
          },
        ],
      },
      {
        slug: 'claude-directory',
        titleZh: '13｜.claude 目录：项目级配置、agents、hooks、settings',
        eyebrow: '.claude Directory',
        descriptionZh: '官方文档把 .claude 目录作为项目配置入口，包含 settings、agents、hooks、commands 等团队共享内容。',
        sourceLabel: 'Explore the .claude directory',
        sourceUrl: 'https://code.claude.com/docs/en/claude-directory',
        sections: [
          {
            heading: '目录结构中文化',
            body: '.claude/settings.json 放团队共享设置；.claude/settings.local.json 放本地私有设置；.claude/agents 存项目级 subagents；.claude/hooks 存钩子脚本；项目根的 CLAUDE.md 存长期项目说明。',
            commands: ['mkdir -p .claude/agents .claude/hooks', 'touch .claude/settings.json CLAUDE.md'],
          },
          {
            heading: '版本控制建议',
            body: '能进仓库的是团队规则、角色定义和非敏感 hook；不能进仓库的是 token、本地路径、私有代理地址和临时调试配置。',
          },
        ],
      },
      {
        slug: 'context-window',
        titleZh: '14｜上下文窗口：如何控制 Claude 看什么',
        eyebrow: 'Context Window',
        descriptionZh: '官方上下文窗口章节解释 Claude Code 如何把文件、记忆、工具结果、对话历史放进模型上下文。',
        sourceLabel: 'Explore the context window',
        sourceUrl: 'https://code.claude.com/docs/en/context-window',
        sections: [
          {
            heading: '上下文不是越多越好',
            body: '把整个仓库都塞给模型会稀释重点。更好的做法是用 @ 引用关键文件、让 Agent 先搜索再读取、把长日志裁剪到关键错误段，并在 CLAUDE.md 中写清楚项目地图。',
          },
          {
            heading: 'WTT 中的上下文',
            body: 'WTT Feed、topic、task、workspace 都是上下文来源。后续应让 Agent 只拿当前 topic、当前任务和相关文件，避免把无关群聊历史全部注入。',
          },
        ],
      },
      {
        slug: 'prompt-caching',
        titleZh: '15｜Prompt Caching：长上下文的成本与速度优化',
        eyebrow: 'Prompt Caching',
        descriptionZh: '官方 Prompt Caching 说明如何复用稳定前缀上下文，降低重复长上下文调用的成本和延迟。',
        sourceLabel: 'Prompt caching',
        sourceUrl: 'https://code.claude.com/docs/en/prompt-caching',
        sections: [
          {
            heading: '中文化说明',
            body: '当 CLAUDE.md、项目结构说明、固定工具说明反复出现在会话前缀中时，缓存可以提升后续调用效率。对 Agent 应用来说，稳定系统提示和项目规则越清晰，越适合缓存。',
          },
          {
            heading: 'WTT 应用',
            body: 'WTT 可以把角色定义、项目规则、任务模板设计为稳定前缀，把用户消息和当前文件差异放在后部，从而减少重复成本。',
          },
        ],
      },
      {
        slug: 'permission-modes',
        titleZh: '16｜权限模式：什么时候允许自动执行',
        eyebrow: 'Permission Modes',
        descriptionZh: '官方权限模式章节说明 Claude Code 如何控制工具调用、命令执行和文件访问。',
        sourceLabel: 'Permission modes',
        sourceUrl: 'https://code.claude.com/docs/en/permission-modes',
        sections: [
          {
            heading: '权限分层',
            body: '权限模式的本质是把 Agent 能力分层：只读适合解释和审查；受控写入适合普通开发；跳过确认或全自动适合可信容器、CI 或明确授权的环境。',
          },
          {
            heading: 'root 环境提醒',
            body: 'Claude Code 官方会限制某些危险 root/sudo 场景。WTT Cloud Agent 通过非 root 用户运行容器内 Agent，避免 root 下 yolo 模式直接失败，也降低误操作风险。',
          },
        ],
      },
      {
        slug: 'manage-sessions',
        titleZh: '17｜会话管理：继续、恢复、分支和长期任务',
        eyebrow: 'Manage Sessions',
        descriptionZh: '官方会话管理说明如何继续最近会话、恢复历史会话和在长任务中保留上下文。',
        sourceLabel: 'Manage sessions',
        sourceUrl: 'https://code.claude.com/docs/en/manage-sessions',
        sections: [
          {
            heading: '继续和恢复',
            body: '短任务可以一次完成；长任务应保存会话。CLI 中常用 --continue 继续最近会话，--resume 选择历史会话。恢复会话比重新解释背景更可靠。',
            commands: ['claude --continue', 'claude --resume'],
          },
          {
            heading: 'WTT 会话模型',
            body: 'WTT topic 天然对应会话上下文。一个任务最好绑定固定 topic 和固定 agent_id，避免同一个 Agent 在不同业务上下文之间来回切换。',
          },
        ],
      },
      {
        slug: 'prompt-library',
        titleZh: '18｜Prompt Library：官方提示词模式中文化',
        eyebrow: 'Prompt Library',
        descriptionZh: '官方 Prompt Library 给出常见任务提示模式，适合整理成 WTT 任务模板。',
        sourceLabel: 'Prompt library',
        sourceUrl: 'https://code.claude.com/docs/en/prompt-library',
        sections: [
          {
            heading: '提示词不是越长越好',
            body: '有效提示通常包含目标、约束、上下文、验收标准和输出格式。对于工程任务，尤其要写清楚“先分析再修改”“运行哪些测试”“不要触碰哪些文件”。',
          },
          {
            heading: 'WTT 模板化',
            body: 'WTT 可以把 prompt library 变成按钮：解释代码、修复测试、代码审查、生成 PR 描述、安全检查、性能分析。按钮生成结构化 prompt，比用户随手输入更稳定。',
          },
        ],
      },
      {
        slug: 'best-practices',
        titleZh: '19｜最佳实践：让 Claude Code 稳定产出',
        eyebrow: 'Best Practices',
        descriptionZh: '官方最佳实践强调小步任务、明确验证、项目记忆、工具约束和人类审查。',
        sourceLabel: 'Best practices',
        sourceUrl: 'https://code.claude.com/docs/en/best-practices',
        sections: [
          {
            heading: '任务拆小',
            body: '把“重构整个系统”拆成“定位模块边界”“抽出 helper”“补测试”“替换调用点”。每一步都能验证，失败时也容易回退。',
          },
          {
            heading: '验收标准',
            body: '不要只说“帮我修一下”。要说明成功标准：哪个页面不报错、哪个测试通过、性能指标怎么变、是否需要兼容旧数据。',
          },
        ],
      },
      {
        slug: 'ide-web-desktop',
        titleZh: '20｜多平台入口：终端、VS Code、JetBrains、Web、Desktop',
        eyebrow: 'Platforms',
        descriptionZh: '官方平台章节说明 Claude Code 在终端、IDE、桌面 App、浏览器和 JetBrains 中的使用差异。',
        sourceLabel: 'Claude Code overview',
        sourceUrl: 'https://code.claude.com/docs/en/overview',
        sections: [
          {
            heading: '入口选择',
            body: '终端适合工程师直接操作；IDE 适合看 diff 和选区上下文；Web/Cloud 适合不依赖本机的长任务；Desktop 适合多会话和可视化 diff。',
          },
          {
            heading: 'WTT 入口',
            body: 'WTT 的 Feed 是协作入口，不替代 IDE 或终端。它把多个 Agent 的状态、角色和任务集中起来，让用户可以用聊天方式派活和跟踪。',
          },
        ],
      },
      {
        slug: 'sdk-devcontainer-troubleshooting',
        titleZh: '21｜SDK、Devcontainer 与排障',
        eyebrow: 'SDK / Devcontainer / Troubleshooting',
        descriptionZh: '官方 SDK、开发容器和排障文档适合进阶用户构建自定义 Agent、隔离环境和处理安装运行问题。',
        sourceLabel: 'Claude Code SDK overview',
        sourceUrl: 'https://docs.anthropic.com/en/docs/claude-code/sdk',
        sections: [
          {
            heading: 'SDK',
            body: 'Claude Code SDK 提供构建自定义 Agent 的基础组件，包括文件操作、代码执行、MCP、权限控制、会话管理和错误处理。适合把 Claude Code 能力嵌入自己的平台。',
          },
          {
            heading: 'Devcontainer',
            body: '开发容器适合隔离依赖和限制网络，但不能把它当成绝对安全边界。官方特别提醒，在危险跳过权限模式下，恶意项目仍可能泄露容器内可访问的凭据。',
          },
          {
            heading: '排障',
            body: '常见问题包括安装路径、Node 版本、shell 类型、权限配置、MCP server 启动失败、IDE 插件无法连接。WTT Cloud Agent 应把这些排障变成健康检查和日志提示。',
          },
        ],
      },
    ],
  },
  {
    slug: 'codex-tutorial',
    title: 'Codex Tutorial',
    titleZh: 'Codex 教程',
    eyebrow: 'OpenAI 官方教程中文化',
    descriptionZh: '按 OpenAI Codex CLI、Codex Cloud、Docs MCP 和 openai/codex 官方仓库文档中文化整理：安装登录、项目指令、沙箱审批、配置、MCP、云端任务和 WTT 接入。',
    accent: 'from-[#3ce8e2] via-cyan-300 to-blue-400',
    docsHref: 'https://help.openai.com/en/articles/11096431',
    sourceLabel: 'OpenAI Codex Docs',
    chapters: [
      {
        slug: 'overview',
        titleZh: '01｜概览：Codex CLI 与 Codex Cloud',
        eyebrow: 'Overview',
        descriptionZh: 'Codex 是 OpenAI 的编程 Agent 体系：CLI 在本地终端工作，Cloud 在云端沙箱中执行任务。',
        sourceLabel: 'OpenAI Codex CLI getting started',
        sourceUrl: 'https://help.openai.com/en/articles/11096431',
        sections: [
          {
            heading: '官方章节中文化',
            body: 'Codex CLI 是运行在终端里的开源编程 Agent，可以读取、修改和运行本地代码。Codex Cloud 则把任务放进云端沙箱环境执行。中文教程需要把“本地 CLI”和“云端任务”分开讲，避免用户混淆。',
          },
          {
            heading: 'WTT 里的定位',
            body: '本地 Codex 适合开发者把自己的机器接入 WTT；Cloud Agent 适合新用户一键试用，不需要先配置本地环境。',
          },
        ],
      },
      {
        slug: 'install-login',
        titleZh: '02｜安装与登录：npm 安装、ChatGPT 登录、API 账号',
        eyebrow: 'Install / Sign in',
        descriptionZh: '安装 Codex CLI，并通过 ChatGPT 登录或 API 相关方式完成身份配置。',
        sourceLabel: 'Codex CLI and Sign in with ChatGPT',
        sourceUrl: 'https://help.openai.com/en/articles/11381614-api-codex-cli-and-sign-in-with-chatgpt',
        sections: [
          {
            heading: '安装',
            body: '官方帮助文档给出的基础安装方式是 npm 全局安装。安装后可以通过 codex 命令进入交互，或直接给出任务。',
            commands: ['npm install -g @openai/codex', 'codex --help', 'codex "explain this repository"'],
          },
          {
            heading: '登录',
            body: 'Codex CLI 支持与 ChatGPT 身份连接。个人电脑上可以走交互登录；共享云容器中则应避免暴露长期个人凭据，最好使用 WTT 后端托管授权或短期 token。',
            commands: ['codex login'],
          },
        ],
      },
      {
        slug: 'cloud',
        titleZh: '03｜Codex Cloud：云端任务与沙箱环境',
        eyebrow: 'Codex Cloud',
        descriptionZh: '官方 Codex Cloud 会为任务准备云端 sandbox，加载代码和依赖后执行。',
        sourceLabel: 'Codex cloud',
        sourceUrl: 'https://platform.openai.com/docs/codex',
        sections: [
          {
            heading: '官方概念中文化',
            body: 'Codex Cloud 的核心是任务级云端执行：为任务创建隔离环境，把代码和依赖带进去，让 Agent 在沙箱内修改、运行和验证。',
          },
          {
            heading: '与 WTT Cloud Agent 的区别',
            body: 'WTT 现在是“用户 claim 一个 7 天容器”，容器里长期跑 wtt-connect；Codex Cloud 更像“每个任务一个沙箱”。WTT 后续可以从长期试用容器演进到任务级短生命周期容器。',
          },
        ],
      },
      {
        slug: 'agents-md',
        titleZh: '04｜AGENTS.md：给 Codex 的项目说明书',
        eyebrow: 'AGENTS.md',
        descriptionZh: 'AGENTS.md 用来告诉 Codex 项目结构、构建命令、测试命令、代码规范、边界和提交流程。',
        sourceLabel: 'openai/codex repository',
        sourceUrl: 'https://github.com/openai/codex',
        sections: [
          {
            heading: '为什么需要 AGENTS.md',
            body: '自然语言任务容易含糊，AGENTS.md 是项目级操作手册。它应告诉 Agent：如何安装依赖、如何跑测试、哪些目录不能动、代码风格是什么、完成后如何验证。',
          },
          {
            heading: 'WTT 推荐模板',
            body: 'WTT 项目可以为每个仓库生成 AGENTS.md，把构建命令、测试命令、部署边界和敏感文件规则写清楚，减少 Agent 误操作。',
            commands: ['cat > AGENTS.md', 'codex "read AGENTS.md and summarize how to work in this repo"'],
          },
        ],
      },
      {
        slug: 'sandbox-approvals',
        titleZh: '05｜Sandbox 与 Approval：安全执行边界',
        eyebrow: 'Sandbox / Approvals',
        descriptionZh: 'Codex 的沙箱和审批组合决定它能读什么、写什么、何时需要用户确认。',
        sourceLabel: 'Codex sandbox docs',
        sourceUrl: 'https://github.com/openai/codex/blob/main/docs/sandbox.md',
        sections: [
          {
            heading: '三种理解方式',
            body: '只读模式适合解释和分析；workspace-write 适合常规开发；更高权限或 full-auto 只适合可信环境。审批策略决定 Agent 在运行命令、联网、写文件时是否需要确认。',
          },
          {
            heading: 'WTT 使用建议',
            body: '本地 Agent 应尊重用户选择的审批模式；Cloud Agent 由于已经在 Docker 内隔离，可以默认更自动化，但仍要限制内存、CPU、workspace 和恶意操作。',
          },
        ],
      },
      {
        slug: 'config',
        titleZh: '06｜配置文件：模型、profile、MCP、默认策略',
        eyebrow: 'Configuration',
        descriptionZh: 'Codex 官方仓库文档提供 config.toml 配置方式，用于固定模型、审批、沙箱、profile 和 MCP。',
        sourceLabel: 'Codex config docs',
        sourceUrl: 'https://github.com/openai/codex/blob/main/docs/config.md',
        sections: [
          {
            heading: '配置文件的价值',
            body: '如果每次启动都手动传参数，很容易出错。把常用模式写进配置文件，可以区分个人开发、代码审查、CI、WTT Cloud Agent 等场景。',
            commands: ['mkdir -p ~/.codex', 'touch ~/.codex/config.toml'],
          },
          {
            heading: 'WTT profile 思路',
            body: 'WTT 可以生成 codex-local、codex-cloud-trial、codex-reviewer 三类 profile：本地保守、云端自动、审查只读。',
          },
        ],
      },
      {
        slug: 'mcp',
        titleZh: '07｜MCP：把 OpenAI 官方文档和外部工具接入 Codex',
        eyebrow: 'MCP',
        descriptionZh: 'OpenAI 官方提供 Docs MCP，Codex CLI 和 IDE 扩展可以连接 MCP 获取开发文档。',
        sourceLabel: 'OpenAI Docs MCP',
        sourceUrl: 'https://platform.openai.com/docs/docs-mcp',
        sections: [
          {
            heading: '官方 Docs MCP',
            body: 'OpenAI 提供只读开发者文档 MCP。它不会替你调用 OpenAI API，只负责把官方文档搜索和页面内容放进 Agent 上下文。',
            commands: ['codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp', 'codex mcp list'],
          },
          {
            heading: 'WTT MCP 方向',
            body: 'WTT 可以给 Codex 提供 topics、tasks、arena、workers 的 MCP 工具，让 Codex 不只执行代码，还能理解 WTT 里的任务上下文。',
          },
        ],
      },
      {
        slug: 'workflows',
        titleZh: '08｜常见工作流：解释、修复、测试、PR',
        eyebrow: 'Workflows',
        descriptionZh: 'Codex CLI 适合解释陌生仓库、实现小功能、修复测试、准备 PR 和做代码审查。',
        sourceLabel: 'OpenAI Codex CLI getting started',
        sourceUrl: 'https://help.openai.com/en/articles/11096431',
        sections: [
          {
            heading: '稳定工作方式',
            body: '先让 Codex 读项目说明，再让它定位文件，接着做小范围修改，最后运行测试。不要直接要求“大规模重构整个系统”。',
            commands: ['codex "summarize this repo and identify the test command"', 'codex "fix the failing login test and run it"', 'codex "review my git diff for regressions"'],
          },
          {
            heading: 'WTT 协作方式',
            body: 'Feed 里可以 @ Codex Agent 做“解释 / 修复 / 审查 / 写测试”。角色标签会让团队知道当前被 @ 的是研发、测试还是审查角色。',
          },
        ],
      },
      {
        slug: 'interactive-tui',
        titleZh: '09｜交互式 TUI：在终端里和 Codex 协作',
        eyebrow: 'Interactive CLI',
        descriptionZh: '官方 CLI 文档把 codex 交互式终端作为默认入口：读仓库、改文件、运行命令、展示差异。',
        sourceLabel: 'Codex CLI',
        sourceUrl: 'https://developers.openai.com/codex/cli',
        sections: [
          {
            heading: '中文化说明',
            body: '直接运行 codex 会进入交互式终端 UI。它适合边看边改：你提出任务，Codex 读项目并给出计划，随后根据权限模式编辑文件或请求确认。',
            commands: ['codex', 'codex "explain the request flow in this repo"'],
          },
          {
            heading: 'WTT 关系',
            body: '本地交互式 TUI 适合开发者自己使用；WTT Feed 更适合多人协作和远程调度。两者可以共存：本地 TUI 做深度开发，WTT 做派活和汇报。',
          },
        ],
      },
      {
        slug: 'model-reasoning',
        titleZh: '10｜模型与推理级别：如何选择 Codex 模型',
        eyebrow: 'Model / Reasoning',
        descriptionZh: '官方 CLI 支持在会话中切换模型和推理强度，用于在速度、成本和复杂度之间权衡。',
        sourceLabel: 'Codex CLI',
        sourceUrl: 'https://developers.openai.com/codex/cli',
        sections: [
          {
            heading: '选择模型的原则',
            body: '小改动、解释、格式化适合较快模型；跨模块重构、复杂 bug、架构判断适合更强模型和更高推理强度。不要把所有任务都用最高档，成本和延迟会不必要升高。',
          },
          {
            heading: 'WTT 角色映射',
            body: 'WTT 可以按角色默认模型：测试/资料整理用快模型，研发/架构/总经理角色用强模型，用户也可以在任务级别覆盖。',
          },
        ],
      },
      {
        slug: 'image-inputs-generation',
        titleZh: '11｜图像输入与图像生成：截图、设计稿、视觉任务',
        eyebrow: 'Images',
        descriptionZh: '官方 Codex CLI 支持图像输入，并在相关环境中支持图像生成或编辑。',
        sourceLabel: 'Codex CLI',
        sourceUrl: 'https://developers.openai.com/codex/cli',
        sections: [
          {
            heading: '图像输入',
            body: '图像输入适合前端任务：截图对比、设计稿还原、错误界面定位、视觉回归说明。把截图和代码上下文一起给 Codex，比只描述“按钮不对齐”更准确。',
          },
          {
            heading: 'WTT Arena 用法',
            body: 'Arena 可以把前端题、UI 题、图表题与截图结合，让 Agent 解释差异、提出 CSS 修改并运行浏览器验证。',
          },
        ],
      },
      {
        slug: 'code-review',
        titleZh: '12｜代码审查：提交前让另一个 Codex Agent 审一遍',
        eyebrow: 'Code Review',
        descriptionZh: '官方 CLI 包含本地代码审查工作流，用独立 Agent 检查 diff 中的风险。',
        sourceLabel: 'Codex CLI',
        sourceUrl: 'https://developers.openai.com/codex/cli',
        sections: [
          {
            heading: '审查重点',
            body: '代码审查不应只看风格。应优先找行为回归、数据兼容、鉴权问题、并发问题、错误处理、测试缺口和部署风险。',
            commands: ['codex "review my git diff for bugs, regressions, and missing tests"'],
          },
          {
            heading: 'WTT 审查角色',
            body: 'WTT 可以把 Codex Agent 设置成【测试】或【代码审查】角色，默认只读或低权限，避免审查 Agent 顺手改代码。',
          },
        ],
      },
      {
        slug: 'subagents',
        titleZh: '13｜Subagents：并行拆解复杂任务',
        eyebrow: 'Subagents',
        descriptionZh: '官方 Codex 支持使用 subagents 并行处理复杂任务，把探索、实现、验证拆开。',
        sourceLabel: 'Codex CLI',
        sourceUrl: 'https://developers.openai.com/codex/cli',
        sections: [
          {
            heading: '使用场景',
            body: '复杂任务可以拆成 explorer、worker、reviewer：探索者读代码，执行者改文件，审查者检查 diff。这样比一个 Agent 从头到尾包办更容易控制质量。',
          },
          {
            heading: 'WTT 多 Agent',
            body: 'WTT 的多 agent_id 更接近真实协作：每个 Agent 有独立身份、角色和 workspace，不需要在同一个进程里模拟所有角色。',
          },
        ],
      },
      {
        slug: 'web-search',
        titleZh: '14｜Web Search：查最新资料时如何控制来源',
        eyebrow: 'Web Search',
        descriptionZh: '官方 CLI 支持 Web Search，用于需要最新资料、官方 API、版本变化或外部上下文的任务。',
        sourceLabel: 'Codex CLI',
        sourceUrl: 'https://developers.openai.com/codex/cli',
        sections: [
          {
            heading: '什么时候必须搜索',
            body: '软件版本、官方 API、价格、法规、云产品能力、依赖库最新行为都可能变化。让 Codex 搜索时，应要求优先引用官方文档、README、release notes，而不是二手博客。',
          },
          {
            heading: 'WTT 教程策略',
            body: 'Arena 里的教程页面应该保留官方来源链接，并标注“中文化整理，不替代官方文档”。当官方文档更新时，可以由 Agent 定期比对章节变化。',
          },
        ],
      },
      {
        slug: 'cloud-tasks',
        titleZh: '15｜Codex Cloud Tasks：从 CLI 发起云端任务',
        eyebrow: 'Cloud Tasks',
        descriptionZh: '官方 CLI 支持发起 Codex Cloud 任务、选择环境，并把云端结果应用回本地。',
        sourceLabel: 'Codex CLI',
        sourceUrl: 'https://developers.openai.com/codex/cli',
        sections: [
          {
            heading: '任务级云沙箱',
            body: 'Cloud Tasks 的典型流程是：选择 repo 和环境，发起任务，等待云端 Agent 修改并验证，然后查看 diff、应用或继续迭代。',
          },
          {
            heading: 'WTT 演进方向',
            body: 'WTT 当前是“7 天 cloud agent 容器”，后续可以增加“每个任务一个临时容器”，任务完成后自动销毁，成本和隔离会比长期容器更好。',
          },
        ],
      },
      {
        slug: 'exec-scripting',
        titleZh: '16｜脚本化 Codex：exec、管道和自动化',
        eyebrow: 'Scripting',
        descriptionZh: '官方 CLI 支持通过 exec 和非交互模式把 Codex 放进脚本、CI 或批处理工作流。',
        sourceLabel: 'Codex CLI',
        sourceUrl: 'https://developers.openai.com/codex/cli',
        sections: [
          {
            heading: '脚本化原则',
            body: '脚本化任务要给清楚输入、成功标准和输出格式。适合日志分析、批量文案、CI 审查、变更摘要，不适合需要大量澄清的开放式产品决策。',
            commands: ['git diff --stat | codex exec "summarize this change for a PR description"', 'cat error.log | codex exec "identify likely root causes"'],
          },
          {
            heading: 'WTT 后台任务',
            body: 'WTT 后端可以把定时任务、到期清理、PR 摘要、Arena 题解生成做成脚本化 Codex 调用，但要严格记录输入输出和权限。',
          },
        ],
      },
      {
        slug: 'windows-setup',
        titleZh: '17｜Windows 设置：PowerShell、WSL2 与沙箱差异',
        eyebrow: 'Windows Setup',
        descriptionZh: '官方 CLI 文档说明 Codex 可在 macOS、Linux、Windows 使用；Windows 可原生 PowerShell 或 WSL2。',
        sourceLabel: 'Codex CLI',
        sourceUrl: 'https://developers.openai.com/codex/cli',
        sections: [
          {
            heading: 'Windows 两条路线',
            body: '原生 PowerShell 适合普通仓库操作；WSL2 更接近 Linux 环境，适合依赖 Linux 工具链、shell 脚本、Docker 或系统级依赖的项目。',
          },
          {
            heading: 'WTT 建议',
            body: '给小白用户优先推荐 Cloud Agent；给开发者用户推荐 macOS/Linux/WSL2 本地 Agent。Windows 原生环境要特别说明路径、shell 和执行策略差异。',
          },
        ],
      },
      {
        slug: 'open-source-changelog',
        titleZh: '18｜开源仓库与更新：版本、变更日志、能力成熟度',
        eyebrow: 'Open Source / Releases',
        descriptionZh: 'Codex CLI 开源并持续发布新版本，官方文档包含 changelog、feature maturity 和 open source 链接。',
        sourceLabel: 'Codex CLI',
        sourceUrl: 'https://developers.openai.com/codex/cli',
        sections: [
          {
            heading: '为什么要看更新',
            body: 'Codex CLI 的模型、MCP、沙箱、配置和 UI 都在快速迭代。教程页面不能假设永远不变，应保留官方文档链接，并定期检查 changelog。',
          },
          {
            heading: 'WTT 运维建议',
            body: 'Cloud Agent 镜像里的 Codex/Claude Code 版本应可控升级：先在测试容器验证，再滚动更新镜像，避免直接 latest 影响所有用户。',
          },
        ],
      },
      {
        slug: 'wtt-integration',
        titleZh: '19｜接入 WTT：本地 Codex 与云端 Codex Agent',
        eyebrow: 'WTT Integration',
        descriptionZh: '把官方 Codex 能力变成 WTT 可调度、可 @、可协作的 Agent。',
        sourceLabel: 'WTT integration pattern',
        sourceUrl: 'https://www.waxbyte.com',
        sections: [
          {
            heading: '本地接入',
            body: '用户在 WTT claim Codex Agent，拿到 agent_id 和 agent_token，然后在自己的机器上启动 wtt-connect。之后 Feed 里的消息会进入本地 Codex 工作区。',
            commands: ['wtt-connect up codex <agent_id> <agent_token> --base-url https://www.waxbyte.com --mode full-auto', 'wtt-connect start'],
          },
          {
            heading: '云端接入',
            body: '用户点击“试用云端agent”，后端 claim agent，cloud orchestrator 在 174.196 上创建 Docker 容器，容器内运行 wtt-connect 和对应 adapter。7 天后自动停止。',
          },
        ],
      },
    ],
  },
]

export function getAgentTutorialGuide(slug: string) {
  return agentTutorialGuides.find((guide) => guide.slug === slug) || null
}

export function getAgentTutorialChapter(slug: string) {
  for (const guide of agentTutorialGuides) {
    const chapter = guide.chapters.find((item) => `${guide.slug}-${item.slug}` === slug)
    if (chapter) return { guide, chapter }
  }
  return null
}
