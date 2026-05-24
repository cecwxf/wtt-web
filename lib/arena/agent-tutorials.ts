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
    descriptionZh: '按 Anthropic Claude Code 官方文档章节中文化整理：快速开始、CLI、常见工作流、记忆与配置、MCP、Subagents、Hooks、GitHub Actions、安全、会话和扩展。',
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
        descriptionZh: '官方文档强调权限、安全和隐私，重点关注工具权限、敏感文件、密钥保护、容器边界和人工审查。',
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
        descriptionZh: '官方 Prompt Library 给出常见任务提示模式，适合整理成可复用的工程提示词模板。',
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
    descriptionZh: '按 OpenAI Codex CLI、Codex Cloud、Docs MCP 和 openai/codex 官方仓库文档中文化整理：安装登录、项目指令、沙箱审批、配置、MCP、云端任务和代码审查。',
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

const detailedTutorialSections: Record<string, AgentTutorialSection[]> = {
  'claude-code-tutorial/overview': [
    {
      heading: '定位：终端里的编程 Agent',
      body: 'Claude Code 是一个运行在终端里的 agentic coding tool。它不是只给代码建议的聊天窗口，而是可以进入真实项目目录，读取文件、搜索代码、编辑文件、执行命令、查看错误，再根据结果继续迭代。官方教程把它放在开发者已有工作流里：shell、git、测试命令、CI、Issue、PR 和团队规范都可以成为它工作的上下文。',
    },
    {
      heading: '它能替你完成哪些工作',
      body: '典型任务包括：根据自然语言描述实现功能，阅读陌生代码库并解释架构，定位 bug 的根因，修复失败测试，整理 release notes，解决 lint 和类型错误，处理 merge conflict，或者在 CI 中做自动审查。更适合交给 Claude Code 的任务通常有清晰目标、可验证结果和明确边界。',
    },
    {
      heading: '和普通代码助手的区别',
      body: '普通代码助手常停留在建议层；Claude Code 的关键是工具回路。它会先收集上下文，再形成计划，然后调用读文件、写文件、运行命令等工具，最后根据测试、构建或命令输出修正方案。你仍然负责目标、权限和最终审查，但执行层可以交给 Agent 承担。',
    },
    {
      heading: '学习路线',
      body: '建议先掌握快速开始和 CLI，再学习常见工作流、项目记忆、设置与权限。等你能稳定让它完成小任务后，再进入 MCP、Subagents、Hooks、GitHub Actions 和 SDK 这些扩展章节。这样能避免一上来配置很多工具，却不知道如何控制任务质量。',
    },
  ],
  'claude-code-tutorial/quickstart': [
    {
      heading: '安装前准备',
      body: '官方快速开始要求 Node.js 18 或更新版本，并准备 Claude.ai 或 Anthropic Console 账号。安装时建议先确认 node 和 npm 来自同一套环境，避免系统 Node、nvm Node、容器 Node 混用导致命令路径不一致。',
      commands: ['node -v', 'npm -v', 'npm install -g @anthropic-ai/claude-code'],
    },
    {
      heading: '进入项目再启动',
      body: 'Claude Code 应在项目根目录启动。这样它能看到 package.json、README、CLAUDE.md、测试配置、源码目录和 git 状态。第一次进入项目时，不要马上要求大改代码，先让它解释项目结构和主要入口。',
      commands: ['cd your-project', 'claude', '> give me an overview of this codebase', '> identify the main build and test commands'],
    },
    {
      heading: '第一个安全任务',
      body: '首个任务建议选择低风险、可验证的小任务，例如解释某个模块、修复一个 lint warning、补一条测试，或者更新一段文档。你可以要求它先展示计划，再执行修改，完成后运行相关测试。',
      commands: ['> inspect the code first and propose a short plan', '> make the smallest change and run the related test'],
    },
    {
      heading: '绑定 WTT',
      body: '如果你已经在 WTT 里 claim 到 agent_id 和 agent_token，可以用 wtt-connect 把 Claude Code 绑定成可被 Feed 调度的 Agent。这个绑定说明只属于接入流程，日常 Claude Code 教程不需要每章都关联 WTT。',
      commands: ['wtt-connect up claude-code <agent_id> <agent_token> --base-url https://www.waxbyte.com --mode full-auto', 'wtt-connect start'],
    },
  ],
  'claude-code-tutorial/cli': [
    {
      heading: '交互式 REPL',
      body: '直接运行 claude 会进入交互式会话。这个模式适合连续对话：先让它读项目，再追问某个模块，随后要求修改代码和运行验证。交互式模式的价值在于上下文连续，适合复杂但需要人类逐步确认的任务。',
      commands: ['claude', 'claude "explain this project"'],
    },
    {
      heading: 'Print mode',
      body: 'claude -p 会执行一次查询并退出，适合脚本、管道和 CI。它不适合需要多轮澄清的任务，但适合摘要、日志分析、简单解释、生成固定格式输出等工作。',
      commands: ['claude -p "explain this function"', 'cat logs.txt | claude -p "summarize the error and likely cause"'],
    },
    {
      heading: '继续与恢复',
      body: '长任务不应每次重新开始。继续最近会话可以保留之前的工具结果、讨论背景和决策过程；按 session id 恢复则适合多个任务并行时精确回到某条历史线。',
      commands: ['claude -c', 'claude -c -p "check whether the previous fix is complete"', 'claude -r "<session-id>" "continue the refactor"'],
    },
    {
      heading: 'CLI 管理能力',
      body: 'Claude Code CLI 还包含更新、MCP 管理和配置入口。建议把常用命令纳入团队文档，让新人知道如何启动、如何继续会话、如何查看 MCP、如何更新版本。',
      commands: ['claude update', 'claude mcp list', 'claude mcp get <server-name>'],
    },
  ],
  'claude-code-tutorial/workflows': [
    {
      heading: '读陌生代码库',
      body: '官方常见工作流建议从宽问题开始，再逐步深入。先问项目整体结构、入口、数据流和测试命令，再让它定位某个功能的关键文件。这样比直接问“帮我改这个功能”更稳定，因为 Agent 会先形成项目地图。',
      commands: ['> explain the architecture of this repository', '> trace how a user login request flows through the system'],
    },
    {
      heading: '修复 bug',
      body: '给 Claude Code 的 bug 任务应该包含错误现象、复现步骤、实际输出、期望输出和约束。让它先找根因，再做最小修复，最后运行相关测试。不要只贴一大段日志然后说“修一下”。',
      commands: ['> reproduce this failure using npm test', '> identify the root cause before editing files', '> apply the smallest fix and run the failing test again'],
    },
    {
      heading: '重构旧代码',
      body: '重构要分阶段：先让它解释当前行为和依赖关系，再列出风险，然后拆成小提交。大型重构最好要求它保持外部行为不变，并在每一步运行测试或至少做类型检查。',
    },
    {
      heading: '并行任务和 worktree',
      body: '多个 Claude Code 会话同时修改同一个工作区很容易冲突。官方推荐使用 git worktree 为每个任务创建独立目录。每个目录有自己的分支和文件状态，适合并行做 feature、bugfix、review。',
      commands: ['git worktree add ../project-feature-a -b feature-a', 'cd ../project-feature-a', 'claude'],
    },
  ],
  'claude-code-tutorial/memory-settings': [
    {
      heading: 'CLAUDE.md 的作用',
      body: 'CLAUDE.md 是给 Agent 的项目说明书，适合写项目结构、常用命令、测试策略、编码规范、禁止修改的路径、部署注意事项和团队约定。它不是普通 README，而是面向 Agent 的工作指南。',
      commands: ['touch CLAUDE.md'],
    },
    {
      heading: 'settings.json 分层',
      body: '用户级设置位于 ~/.claude/settings.json，影响所有项目；项目共享设置位于 .claude/settings.json，适合提交到仓库；本地私有设置位于 .claude/settings.local.json，适合个人偏好和本地路径。',
      commands: ['mkdir -p .claude', 'touch .claude/settings.json', 'touch .claude/settings.local.json'],
    },
    {
      heading: '环境变量',
      body: '官方设置支持通过环境变量调整模型、认证、遥测、超时、MCP 和子 Agent 模型等行为。团队使用时应把敏感值放在本地私有配置、系统 secret 或运行环境中，而不是写进仓库。',
    },
    {
      heading: '权限与敏感文件',
      body: '建议用权限规则明确禁止读取或修改 .env、密钥文件、生产配置、证书、数据库备份等敏感资产。对于共享机器或云容器，要额外限制网络、文件系统、CPU、内存和可执行命令。',
    },
  ],
  'claude-code-tutorial/mcp': [
    {
      heading: 'MCP 是什么',
      body: 'Model Context Protocol 可以把外部工具和数据源暴露给 Claude Code。接入 MCP 后，Agent 不只依赖本地文件，还可以按权限访问设计稿、Issue、文档、数据库查询工具、内部 API 或 GitHub 工具。',
    },
    {
      heading: '添加和查看 MCP server',
      body: 'Claude Code CLI 提供 mcp 子命令用于管理 server。常见方式是通过命令行添加 stdio server，或引用 JSON 配置。添加后应先查看 server 是否启动正常，再让 Agent 使用。',
      commands: ['claude mcp list', 'claude mcp get <server-name>', 'claude mcp add-json weather-api \'{"type":"stdio","command":"/path/to/weather-cli"}\''],
    },
    {
      heading: 'MCP prompts 与 slash commands',
      body: 'MCP server 可以暴露 prompts，这些 prompts 在 Claude Code 中可变成 slash command。团队可以把固定流程做成命令，例如查最近 PR、生成发布说明、读取某个系统的错误摘要。',
    },
    {
      heading: '上下文控制',
      body: 'MCP 工具可能返回大量数据。实际使用时要控制查询范围、分页、字段和摘要方式，避免把无关结果塞满上下文窗口。工具输出越结构化，Agent 越容易可靠使用。',
    },
  ],
  'claude-code-tutorial/subagents': [
    {
      heading: 'Subagent 的定义',
      body: 'Subagent 是预配置的专业 AI 助手。它有自己的用途说明、系统提示、工具权限和独立上下文窗口。主会话可以把适合的任务委派给 subagent，再接收结果。',
    },
    {
      heading: '为什么独立上下文重要',
      body: '复杂任务中，主会话上下文容易被日志、文件内容和中间讨论填满。Subagent 使用独立上下文，可以专注处理某类任务，例如安全审查、测试修复、性能分析，而不污染主会话。',
    },
    {
      heading: '创建位置',
      body: '用户级 subagent 放在 ~/.claude/agents，适合跨项目使用；项目级 subagent 放在 .claude/agents，适合团队共享。每个 agent 文件通常包含 YAML frontmatter 和详细提示词。',
      commands: ['mkdir -p .claude/agents', 'touch .claude/agents/code-reviewer.md'],
    },
    {
      heading: '工具权限',
      body: '不要给所有 subagent 全部工具。代码审查 agent 可以只读；测试修复 agent 可以读写并运行测试；发布 agent 可能需要 GitHub 或 CI 工具。权限越贴近职责，风险越低。',
    },
  ],
  'claude-code-tutorial/hooks': [
    {
      heading: 'Hook 事件',
      body: 'Hooks 可以在工具调用前后和会话生命周期事件中运行命令。常见事件包括 PreToolUse、PostToolUse、Notification、UserPromptSubmit、Stop 和 SubagentStop。',
    },
    {
      heading: '典型用途',
      body: 'PostToolUse 可在写文件后自动格式化；PreToolUse 可拦截危险 shell 命令；UserPromptSubmit 可补充项目上下文或阻止敏感请求；Stop 可在任务结束时生成摘要或运行最终检查。',
    },
    {
      heading: '配置方式',
      body: 'Hook 通常写在 settings.json 中，按事件和 matcher 匹配工具。脚本可以使用 CLAUDE_PROJECT_DIR 定位项目内文件，避免当前工作目录变化导致路径错误。',
    },
    {
      heading: '安全边界',
      body: 'Hooks 是自动执行命令，风险不低。脚本要避免拼接未转义输入，避免读取密钥，避免自动提交或部署。团队共享 hook 前应像审查生产脚本一样审查它。',
    },
  ],
  'claude-code-tutorial/github-actions': [
    {
      heading: 'GitHub Actions 入口',
      body: 'Claude Code GitHub Actions 让团队能在 issue 或 PR 中触发 Agent。典型用法是在评论里 @claude，请它分析问题、实现修改、解释失败检查或更新 PR。',
    },
    {
      heading: '安装和授权',
      body: '官方流程通常从本地 Claude Code 中运行安装命令开始，完成 GitHub App 授权和 workflow 配置。API key 必须放在 GitHub Secrets 中，不应硬编码在 workflow 文件。',
      commands: ['claude', '/install-github-app'],
    },
    {
      heading: '控制执行范围',
      body: '在 Actions 中运行 Agent 时，要限制最大轮数、模型、工具、MCP 配置和触发条件。公开仓库尤其要注意来自 fork PR 的安全边界，避免不可信代码拿到 secret。',
    },
    {
      heading: '适合的任务',
      body: 'GitHub Actions 适合仓库事件驱动任务：根据 issue 创建 PR、修复 CI、回答代码审查问题、补测试、生成变更摘要。不适合需要大量产品澄清或访问私有业务系统的开放任务。',
    },
  ],
  'claude-code-tutorial/security': [
    {
      heading: '权限是第一层安全',
      body: 'Claude Code 能执行真实命令和修改真实文件，因此权限模式必须与任务风险匹配。解释代码可以只读；常规开发可以允许工作区写入；跳过确认只适合明确隔离且可信的环境。',
    },
    {
      heading: '密钥和隐私',
      body: '不要把 API key、数据库密码、生产证书、个人 token 放进项目上下文。敏感文件应加入 deny 规则或从工作区移除。团队应明确哪些目录 Agent 永远不能读写。',
    },
    {
      heading: '容器不是绝对安全边界',
      body: '开发容器可以隔离依赖和文件系统，但如果容器内有凭据，恶意项目仍可能读取并外传。安全设计应同时考虑网络出口、secret 注入方式、文件挂载和生命周期清理。',
    },
    {
      heading: '人类审查',
      body: 'Agent 修改完成后仍要审查 diff、运行测试、检查依赖变化和配置变化。对于鉴权、支付、权限、数据迁移、部署脚本等高风险代码，不应只依赖 Agent 自检。',
    },
  ],
  'claude-code-tutorial/how-claude-code-works': [
    {
      heading: '上下文收集',
      body: 'Claude Code 通常先通过文件搜索、目录浏览、读取关键文件和查看 git 状态来建立上下文。你可以通过明确指出文件、错误日志、测试命令和业务目标来减少它的探索成本。',
    },
    {
      heading: '计划与执行',
      body: '对复杂任务，Agent 会先形成计划，再用工具执行。好的计划应包含要修改的文件、验证方式、可能风险和回退路径。你可以要求它在编辑前先展示计划。',
      commands: ['> inspect the codebase and propose a plan before editing files'],
    },
    {
      heading: '工具结果反馈',
      body: '运行命令、测试失败、类型错误和 lint 输出都会进入下一轮推理。Agent 的优势在于能根据真实反馈调整方案，而不是一次性猜测答案。',
    },
    {
      heading: '控制粒度',
      body: '任务越大，越需要拆小。每轮让 Agent 完成一个可验证目标，例如“修复这个测试”“抽出这个 helper”“把这个 API 调用改成新格式”。小步迭代比一次性全改更可靠。',
    },
  ],
  'claude-code-tutorial/extend-claude-code': [
    {
      heading: '扩展方式总览',
      body: 'Claude Code 的扩展主要包括 MCP、subagents、hooks、slash commands、项目记忆和 SDK。它们解决的问题不同：MCP 接工具，subagents 拆角色，hooks 自动化流程，SDK 用于构建自定义 Agent 应用。',
    },
    {
      heading: '什么时候用 MCP',
      body: '当 Agent 需要访问本地文件以外的系统时，用 MCP 更合适。例如读设计文档、查工单、访问内部查询工具或调用受控 API。MCP 工具应提供清晰 schema 和有限权限。',
    },
    {
      heading: '什么时候用 hooks',
      body: '当你需要在 Agent 每次工具调用前后执行固定规则时，用 hooks。例如写文件后格式化、运行测试前检查环境、阻止危险命令。Hooks 更像自动化守卫，不是业务工具。',
    },
    {
      heading: '什么时候用 SDK',
      body: '当你要把 Claude Code 能力嵌入自己的产品或平台时，SDK 比 CLI 更合适。SDK 适合做定制权限、会话管理、工具编排、日志审计和多用户隔离。',
    },
  ],
  'claude-code-tutorial/claude-directory': [
    {
      heading: '.claude 目录的角色',
      body: '.claude 目录承载项目级 Claude Code 配置。它可以包含 settings、agents、hooks、commands 等内容。把这些放在项目内，是为了让团队成员和 Agent 共享同一套工作约定。',
    },
    {
      heading: '推荐结构',
      body: '常见结构包括 .claude/settings.json、.claude/settings.local.json、.claude/agents、.claude/hooks，以及根目录 CLAUDE.md。共享配置进仓库，本地私有配置进 gitignore。',
      commands: ['mkdir -p .claude/agents .claude/hooks', 'touch .claude/settings.json CLAUDE.md'],
    },
    {
      heading: '哪些内容应该提交',
      body: '可以提交团队规则、非敏感 hook、项目级 subagent、slash command 模板。不要提交 token、个人路径、私有代理地址、临时调试开关、真实生产密钥。',
    },
    {
      heading: '维护方式',
      body: '当项目构建命令、测试方式、目录结构变化时，应同步更新 CLAUDE.md 和 .claude 配置。否则 Agent 会按旧规则工作，导致错误建议或无效命令。',
    },
  ],
  'claude-code-tutorial/context-window': [
    {
      heading: '上下文窗口是什么',
      body: '上下文窗口是模型一次推理能看到的信息集合，包括系统提示、会话历史、文件片段、工具结果、MCP 返回内容和项目记忆。它决定 Agent 能基于哪些信息做判断。',
    },
    {
      heading: '不是越多越好',
      body: '把无关日志、全仓库文件和长讨论都塞进上下文，会稀释重点并增加成本。更好的方式是让 Agent 搜索相关文件，只读取关键片段，并让长日志先摘要再分析。',
    },
    {
      heading: '显式引用',
      body: '在任务中明确提到文件路径、函数名、错误信息和验收标准，可以显著降低 Agent 探索成本。对于前端问题，截图加具体文件路径通常比纯文字描述更有效。',
    },
    {
      heading: '上下文刷新',
      body: '长会话中，历史讨论可能变成噪音。完成一个阶段后，可以让 Agent 总结当前状态、剩余任务和关键约束，再开启新会话继续。',
    },
  ],
  'claude-code-tutorial/prompt-caching': [
    {
      heading: 'Prompt caching 的意义',
      body: '当固定项目说明、工具说明、长系统提示或稳定上下文在多次请求中重复出现时，缓存可以降低重复处理成本并提升响应速度。它适合长上下文、重复任务和团队标准化提示。',
    },
    {
      heading: '什么内容适合缓存',
      body: '适合缓存的是稳定前缀：项目规则、代码库地图、工具说明、角色说明和长期约束。不适合缓存的是当前用户问题、临时日志、实时命令输出和频繁变化的 diff。',
    },
    {
      heading: '如何设计提示',
      body: '把稳定规则放在前部，把当前任务和动态数据放在后部。这样缓存更容易命中，同时 Agent 仍能看到最新需求。',
    },
    {
      heading: '注意事项',
      body: '缓存优化不能代替上下文治理。过长、过旧或不准确的固定上下文仍会误导 Agent。应定期清理项目说明，避免把历史决策永久留在提示中。',
    },
  ],
  'claude-code-tutorial/permission-modes': [
    {
      heading: '权限模式的目标',
      body: '权限模式用于平衡效率和安全。读代码、解释架构时不需要写权限；修 bug 和补测试需要写工作区；自动执行命令或跳过确认只应在可信隔离环境中使用。',
    },
    {
      heading: '只读模式',
      body: '只读模式适合代码审查、需求分析、架构解释和风险评估。它能降低误改文件的风险，尤其适合让第二个 Agent 审查第一个 Agent 的修改。',
    },
    {
      heading: '自动执行模式',
      body: '自动执行能提高效率，但也会放大错误命令的影响。使用前应限制工作目录、敏感文件、网络访问和可执行命令，并确保任务有明确终止条件。',
    },
    {
      heading: 'root 环境限制',
      body: '出于安全原因，某些危险权限组合不能在 root/sudo 环境下使用。推荐使用普通用户运行 Claude Code，并通过容器或系统权限控制工作目录。',
    },
  ],
  'claude-code-tutorial/manage-sessions': [
    {
      heading: '为什么要管理会话',
      body: '长任务往往包含探索、计划、实现、验证和修正。会话保存了这些中间状态，能避免每次重新解释背景，也能保留之前工具调用结果。',
    },
    {
      heading: '继续最近会话',
      body: '如果刚刚中断任务，可以继续最近会话。适合继续修复上一步测试失败、完成未做完的 TODO 或让 Agent 总结刚才的改动。',
      commands: ['claude --continue', 'claude -c'],
    },
    {
      heading: '恢复指定会话',
      body: '当你同时处理多个任务时，需要按 session id 恢复指定会话。这样可以避免把 A 任务的上下文带到 B 任务里。',
      commands: ['claude --resume', 'claude -r "<session-id>" "continue the previous task"'],
    },
    {
      heading: '结束前总结',
      body: '长任务结束前，可以让 Agent 输出修改摘要、验证结果、剩余风险和后续建议。这个总结适合写进 PR 描述或交给下一个会话继续。',
    },
  ],
  'claude-code-tutorial/prompt-library': [
    {
      heading: '提示词结构',
      body: '高质量提示通常包含目标、上下文、约束、验收标准和输出格式。工程任务尤其要写清楚先分析还是直接修改、允许改哪些文件、需要运行哪些测试。',
    },
    {
      heading: '解释类提示',
      body: '解释代码时，可以要求 Agent 从入口、数据流、关键模块、异常路径和测试覆盖五个角度回答。这样比简单问“这段代码干嘛的”更完整。',
      commands: ['> explain this module: entry points, data flow, side effects, and tests'],
    },
    {
      heading: '修改类提示',
      body: '修改代码时，应要求先定位相关文件，列出计划，实施最小变更，最后验证。对高风险模块，可以要求不要自动提交，先展示 diff。',
      commands: ['> find the relevant files first, propose a plan, then make the smallest safe change'],
    },
    {
      heading: '审查类提示',
      body: '代码审查提示应优先关注行为回归、鉴权、数据兼容、错误处理、并发、性能和测试缺口。不要只让 Agent 检查格式。',
    },
  ],
  'claude-code-tutorial/best-practices': [
    {
      heading: '小步任务',
      body: '最佳实践的核心是把大目标拆成可验证的小任务。每一步只改变有限文件，运行有限测试，产出清晰 diff。这样失败时容易定位问题，也方便人类审查。',
    },
    {
      heading: '明确验收标准',
      body: '不要只说“优化一下”。要说明成功条件：哪个测试通过、哪个页面行为正确、接口兼容什么输入、性能指标如何衡量、哪些文件不能动。',
    },
    {
      heading: '让 Agent 先读再改',
      body: '陌生项目中，先让 Agent 阅读相关文件并总结理解，再允许修改。直接进入编辑容易触碰错误层级或忽略已有工具函数。',
    },
    {
      heading: '保持人工控制',
      body: 'Agent 可以执行大量工程动作，但最终责任仍在人。合并前应检查 diff、测试、依赖变更、配置变更和迁移脚本。对安全敏感代码必须做额外审查。',
    },
  ],
  'claude-code-tutorial/ide-web-desktop': [
    {
      heading: '终端入口',
      body: '终端适合直接操作仓库、运行命令、查看 git 状态和处理复杂工程任务。Claude Code 的核心体验首先围绕终端设计。',
    },
    {
      heading: 'IDE 入口',
      body: 'VS Code 和 JetBrains 入口适合结合编辑器上下文、选中文件、查看 diff 和跳转代码。对于前端和多文件修改，IDE 能让人工审查更直观。',
    },
    {
      heading: 'Web 与 Desktop',
      body: 'Web 或 Desktop 入口更适合管理多个会话、查看任务状态、处理可视化 diff 或进行不依赖本机环境的工作。具体能力会随官方产品迭代变化，应以官方页面为准。',
    },
    {
      heading: '如何选择',
      body: '本地开发优先终端或 IDE；远程长任务优先云端或 Web；团队自动化优先 GitHub Actions 或 SDK。入口不是互斥关系，可以按任务阶段切换。',
    },
  ],
  'claude-code-tutorial/sdk-devcontainer-troubleshooting': [
    {
      heading: 'SDK 用途',
      body: 'Claude Code SDK 适合构建自定义 Agent 应用，例如自动代码审查、内部开发平台、PR 助手、批处理工具和多用户任务系统。SDK 让你更细粒度地控制会话、工具、权限和日志。',
    },
    {
      heading: 'Devcontainer 用途',
      body: '开发容器适合隔离依赖、固定系统环境、减少本机差异。团队可以把 Node、Python、编译器、数据库客户端等依赖封装进容器，让 Agent 获得可重复环境。',
    },
    {
      heading: '常见排障方向',
      body: '安装失败先查 Node 版本和 npm 全局路径；命令找不到查 PATH；MCP 失败查 server 启动命令和日志；权限异常查 settings、shell 用户和工作目录；IDE 无法连接查插件版本和本地服务。',
    },
    {
      heading: '日志和复现',
      body: '排障时应保留最小复现步骤、命令输出、系统版本、Claude Code 版本、项目路径和相关配置。不要把完整密钥或 .env 贴给 Agent。',
    },
  ],
  'codex-tutorial/overview': [
    {
      heading: 'Codex 的两种形态',
      body: 'OpenAI Codex 既可以指本地 Codex CLI，也可以指云端 Codex 任务。CLI 运行在你的终端里，直接读写本地仓库；Cloud 运行在云端沙箱中，为单个任务准备隔离环境。学习时要先区分这两条路径。',
    },
    {
      heading: '本地 CLI 适合什么',
      body: 'Codex CLI 适合日常开发：解释仓库、定位 bug、修改代码、运行测试、生成 PR 描述、审查 diff。它使用你的本地文件系统和命令行工具，因此结果与真实开发环境更接近。',
    },
    {
      heading: '云端任务适合什么',
      body: 'Codex Cloud 适合把独立任务交给远程沙箱处理，例如修复某个 issue、实现小功能、跑测试或准备一个 PR。它减少本地环境依赖，但需要提前配置仓库、依赖安装和任务边界。',
    },
    {
      heading: '学习顺序',
      body: '建议先掌握安装登录、AGENTS.md、沙箱审批和配置文件，再学习 MCP、常见工作流、代码审查、subagents 和云端任务。这样能先建立安全边界，再扩大自动化能力。',
    },
  ],
  'codex-tutorial/install-login': [
    {
      heading: '安装 Codex CLI',
      body: '官方安装路径以 npm 全局安装为主。安装前先确认 Node 和 npm 版本，安装后用 help 命令验证二进制是否进入 PATH。',
      commands: ['node -v', 'npm -v', 'npm install -g @openai/codex', 'codex --help'],
    },
    {
      heading: '登录方式',
      body: 'Codex CLI 支持通过 ChatGPT 登录或 API 相关方式完成身份配置。个人电脑可以使用交互登录；共享服务器和容器环境应避免把长期个人凭据直接暴露给用户。',
      commands: ['codex login', 'codex "explain this repository"'],
    },
    {
      heading: '第一次运行',
      body: '第一次进入项目时，建议先让 Codex 读取 README、package.json、AGENTS.md 和测试配置，并总结项目结构。确认它理解项目后，再交给它执行小范围任务。',
      commands: ['cd your-project', 'codex', '> summarize this repo and identify build/test commands'],
    },
    {
      heading: '绑定 WTT',
      body: '如果要把本地 Codex 变成 WTT Feed 里可调度的 Agent，先在 WTT claim 得到 agent_id 和 agent_token，再用 wtt-connect 启动绑定。绑定属于接入流程，不影响 Codex 官方教程的主体学习。',
      commands: ['wtt-connect up codex <agent_id> <agent_token> --base-url https://www.waxbyte.com --mode full-auto', 'wtt-connect start'],
    },
  ],
  'codex-tutorial/cloud': [
    {
      heading: '任务级沙箱',
      body: 'Codex Cloud 的核心是为任务准备隔离的云端容器。任务开始时，系统把代码和依赖带入环境，Agent 在其中读取、修改、运行命令和验证结果。',
    },
    {
      heading: '环境配置',
      body: '云端任务是否成功，很大程度取决于环境是否可复现。仓库应明确依赖安装命令、构建命令、测试命令、需要的系统包和环境变量占位说明。',
    },
    {
      heading: '任务描述',
      body: '云端任务要比本地聊天更明确，因为它通常异步执行。描述里应包含目标、约束、验收标准、相关文件、不要修改的范围以及希望提交的结果形式。',
    },
    {
      heading: '结果检查',
      body: '云端 Agent 完成后，不应直接合并。需要查看 diff、测试结果、日志、依赖变化和潜在风险。对鉴权、支付、数据迁移等高风险变更，要额外人工审查。',
    },
  ],
  'codex-tutorial/agents-md': [
    {
      heading: 'AGENTS.md 是什么',
      body: 'AGENTS.md 是面向 Codex 的项目操作说明。它告诉 Agent 如何理解仓库、如何安装依赖、如何运行测试、哪些目录不能动、代码风格和 PR 规范是什么。',
    },
    {
      heading: '应该写什么',
      body: '建议包含项目结构、常用命令、测试策略、代码规范、生成文件规则、安全边界、提交要求和排障提示。内容要具体，不要只写抽象原则。',
    },
    {
      heading: '示例结构',
      body: '一个实用 AGENTS.md 可以分为：Project overview、Setup、Build and test、Coding conventions、Do not touch、Before final answer。每一段都服务于 Agent 的实际执行。',
      commands: ['touch AGENTS.md', 'codex "read AGENTS.md and summarize how to work in this repo"'],
    },
    {
      heading: '维护原则',
      body: 'AGENTS.md 需要随项目变化更新。测试命令、包管理器、目录结构、部署流程一旦变化，旧说明就会误导 Agent。它应该像 CI 配置一样被认真维护。',
    },
  ],
  'codex-tutorial/sandbox-approvals': [
    {
      heading: '沙箱的作用',
      body: 'Sandbox 决定 Codex 能访问和修改什么。只读适合解释和审查；workspace-write 适合常规开发；更高权限适合受控环境下的自动化任务。',
    },
    {
      heading: '审批策略',
      body: 'Approval 决定 Agent 什么时候需要请求用户确认。联网、写文件、运行潜在危险命令、访问工作区外路径等动作，都应根据风险设置审批。',
    },
    {
      heading: '常见组合',
      body: '学习和审查用只读加保守审批；日常开发用 workspace-write 加关键命令确认；CI 或隔离容器中可以更自动化，但要限制网络、资源和 secret。',
    },
    {
      heading: '安全实践',
      body: '不要把 full-auto 当成默认模式。先明确工作目录、敏感文件、网络出口和命令白名单，再提高自动化级别。权限越大，日志和审计越重要。',
    },
  ],
  'codex-tutorial/config': [
    {
      heading: 'config.toml 的价值',
      body: '配置文件让你把模型、推理强度、审批策略、沙箱模式、MCP server 和 profile 固定下来，避免每次启动都手动传一长串参数。',
      commands: ['mkdir -p ~/.codex', 'touch ~/.codex/config.toml'],
    },
    {
      heading: 'Profile',
      body: 'Profile 适合把不同场景分开：日常开发、只读审查、高权限自动化、教学演示、CI 摘要。切换 profile 比临时记参数更可靠。',
    },
    {
      heading: '模型和推理',
      body: '复杂任务使用更强模型和更高推理强度；简单解释、格式化、小修复可以用更快配置。配置文件应体现成本、速度和质量之间的取舍。',
    },
    {
      heading: 'MCP 配置',
      body: 'MCP server 可以写进配置文件，供 CLI 和 IDE 扩展共享。配置时要区分只读文档工具、内部系统工具和高风险执行工具。',
    },
  ],
  'codex-tutorial/mcp': [
    {
      heading: 'OpenAI Docs MCP',
      body: 'OpenAI 提供官方开发者文档 MCP。它是只读文档服务，用来搜索和读取 developers.openai.com 与 platform.openai.com 的相关文档，不会替你调用 API。',
      commands: ['codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp', 'codex mcp list'],
    },
    {
      heading: '为什么要接 Docs MCP',
      body: '模型知识可能落后，官方 API、参数和模型能力会变化。Docs MCP 能把最新官方文档拉进上下文，降低使用过期 API 的概率。',
    },
    {
      heading: '其他 MCP server',
      body: '除了官方文档，团队还可以接 GitHub、Issue 系统、数据库只读查询、设计文档和内部工具。关键是给每个工具明确权限和输出格式。',
    },
    {
      heading: '使用边界',
      body: 'MCP 工具越多，Agent 越容易迷失。建议按任务选择必要工具，避免一次性暴露所有内部系统。只读工具优先，高风险写工具要审批。',
    },
  ],
  'codex-tutorial/workflows': [
    {
      heading: '解释项目',
      body: '先让 Codex 阅读项目说明和配置，输出项目地图、入口文件、核心模块和测试命令。对陌生仓库，这一步能显著减少后续误改。',
      commands: ['codex "summarize this repo: architecture, entry points, test commands"'],
    },
    {
      heading: '修复测试',
      body: '给 Codex 明确失败命令和错误输出。要求它先复现，再定位根因，最后做最小修复并重新运行相关测试。',
      commands: ['codex "run the failing test, find the root cause, and apply the smallest fix"'],
    },
    {
      heading: '实现功能',
      body: '功能任务应包含用户故事、接口约束、边界条件、验收标准和不要修改的范围。要求 Codex 先列计划，必要时补测试，再改实现。',
    },
    {
      heading: '准备 PR',
      body: 'Codex 可以整理 diff、生成 PR 描述、列出测试结果和风险。PR 描述应区分做了什么、如何验证、影响范围和后续事项。',
      commands: ['git diff --stat', 'codex "write a PR summary with tests and risks based on this diff"'],
    },
  ],
  'codex-tutorial/interactive-tui': [
    {
      heading: '交互式入口',
      body: '直接运行 codex 会进入终端交互界面。这个模式适合边沟通边执行：你提出目标，Codex 读文件和计划，你确认后它修改并验证。',
      commands: ['codex', 'codex "explain the request flow in this repo"'],
    },
    {
      heading: '查看和确认',
      body: '交互式 TUI 的优势是能在任务过程中查看计划、命令、差异和输出。对于不确定任务，可以要求 Codex 每一步先解释再执行。',
    },
    {
      heading: '与 git 配合',
      body: '开始前查看 git status，确保工作区状态明确；结束后查看 diff 和测试结果。不要让 Agent 混入无关改动。',
      commands: ['git status --short', 'git diff --stat'],
    },
    {
      heading: '会话习惯',
      body: '每个会话最好只处理一个目标。任务变大时，把它拆成多个会话或分支，避免上下文混杂导致 Codex 修改不相关文件。',
    },
  ],
  'codex-tutorial/model-reasoning': [
    {
      heading: '选择模型',
      body: '模型选择应根据任务复杂度决定。解释小函数、改文案、修格式可以用更快模型；跨模块 bug、架构设计、安全审查和复杂重构需要更强模型。',
    },
    {
      heading: '推理强度',
      body: '更高推理强度适合需要多步分析的任务，但会增加延迟和成本。不要把所有任务都设成最高档，应该根据风险和价值调整。',
    },
    {
      heading: '任务分层',
      body: '可以把任务分为 quick、standard、deep 三类。quick 处理明确小改；standard 处理常规开发；deep 处理架构、根因分析和审查。',
    },
    {
      heading: '验证比模型更重要',
      body: '再强的模型也可能误判。工程任务最终要靠测试、类型检查、lint、运行结果和人类审查闭环。模型选择只是质量控制的一部分。',
    },
  ],
  'codex-tutorial/image-inputs-generation': [
    {
      heading: '图像输入场景',
      body: '图像输入适合前端和产品任务，例如截图对比、视觉 bug、设计稿还原、错误界面定位、图表解释。截图能提供纯文字难以描述的布局、颜色和状态信息。',
    },
    {
      heading: '如何描述截图任务',
      body: '不要只发图。应说明目标页面、期望效果、相关文件、要兼容的 viewport 和验收方式。让 Codex 结合截图和代码定位问题。',
    },
    {
      heading: '视觉验证',
      body: '修改 UI 后应打开页面截图验证，检查移动端、桌面端、文字溢出、交互状态和加载状态。视觉任务不能只靠 TypeScript 编译通过。',
    },
    {
      heading: '图像生成边界',
      body: '图像生成或编辑适合视觉素材、示意图和原型，但不应替代真实产品截图或真实数据验证。工程页面仍要以可运行 UI 为准。',
    },
  ],
  'codex-tutorial/code-review': [
    {
      heading: '审查目标',
      body: '代码审查首先找 bug、回归、数据兼容、鉴权漏洞、并发问题、异常处理和测试缺口，其次才是风格和命名。提示词应明确这个优先级。',
      commands: ['codex "review my git diff for bugs, regressions, security issues, and missing tests"'],
    },
    {
      heading: '输入范围',
      body: '给 Codex 审查时，最好提供 git diff、相关测试、业务目标和已知风险。没有背景的 diff 审查容易误判设计意图。',
    },
    {
      heading: '输出格式',
      body: '要求审查输出按严重程度排序，包含文件路径、原因、影响和建议。没有发现问题时，也要说明剩余风险和未运行的测试。',
    },
    {
      heading: '不要自动修',
      body: '审查 Agent 默认应只指出问题，不应顺手改代码。修复可以作为下一步任务交给开发 Agent 或人工处理。',
    },
  ],
  'codex-tutorial/subagents': [
    {
      heading: '为什么要用 subagents',
      body: '复杂任务可以拆给多个专业 Agent：explorer 读代码，worker 实现，reviewer 审查，tester 验证。分工能减少单一上下文过载。',
    },
    {
      heading: '适合并行的任务',
      body: '可以并行的是相互独立的问题，例如不同模块调查、不同平台验证、不同方案比较。不能并行的是会互相修改同一文件的实现任务。',
    },
    {
      heading: '任务边界',
      body: '每个 subagent 都需要清楚的输入、输出和文件边界。实现型 subagent 应明确可编辑路径，避免互相覆盖。',
    },
    {
      heading: '汇总结果',
      body: '主 Agent 应负责整合 subagent 结果，解决冲突，统一最终方案。不要把多个 subagent 的输出直接拼接成结论。',
    },
  ],
  'codex-tutorial/web-search': [
    {
      heading: '何时需要搜索',
      body: '当问题涉及最新版本、云服务能力、价格、法规、API 变更、依赖库行为或安全公告时，需要搜索。静态知识不足以保证准确。',
    },
    {
      heading: '优先来源',
      body: '技术任务应优先引用官方文档、README、release notes、标准文档和论文。二手博客可以辅助理解，但不应作为唯一依据。',
    },
    {
      heading: '控制搜索范围',
      body: '提示里可以明确域名、时间范围和来源类型。例如要求只看 official docs，或只查最近 30 天的 release notes。',
    },
    {
      heading: '引用和判断',
      body: '搜索结果需要比较发布日期、版本号和适用范围。官方文档不同页面之间也可能有新旧差异，应以最新、最具体的页面为准。',
    },
  ],
  'codex-tutorial/cloud-tasks': [
    {
      heading: '从 CLI 发起云端任务',
      body: 'Codex CLI 可以把任务交给云端执行。用户在本地描述任务，选择环境和仓库，云端 Agent 在隔离环境中完成修改和验证。',
    },
    {
      heading: '任务准备',
      body: '发起前要确保仓库配置完整：依赖安装、测试命令、环境变量说明、AGENTS.md 和权限边界。云端环境越可复现，成功率越高。',
    },
    {
      heading: '查看结果',
      body: '任务完成后应查看改动、日志和测试结果。必要时可以继续迭代任务，或者把结果应用回本地分支。',
    },
    {
      heading: '适合的粒度',
      body: '云端任务适合边界清晰的问题，不适合大量互动澄清。复杂产品需求应先拆分成小任务，再交给云端执行。',
    },
  ],
  'codex-tutorial/exec-scripting': [
    {
      heading: '非交互模式',
      body: '脚本化 Codex 适合一次性输入和确定输出，例如日志摘要、diff 摘要、生成 PR 描述、批量解释错误。任务应有明确输出格式。',
      commands: ['git diff --stat | codex exec "summarize this change for a PR description"', 'cat error.log | codex exec "identify likely root causes"'],
    },
    {
      heading: '管道输入',
      body: '管道可以把命令输出交给 Codex 分析。注意先裁剪日志和敏感信息，不要把完整密钥、cookie 或生产数据传进去。',
    },
    {
      heading: 'CI 中使用',
      body: 'CI 脚本中使用 Codex 时，要控制超时、最大输出、权限和 secret。生成建议可以自动化，真正写入仓库或发布仍应有审批。',
    },
    {
      heading: '稳定输出',
      body: '脚本化任务最好要求 JSON、Markdown 表格或固定标题结构。输出格式越稳定，越容易被后续程序消费。',
    },
  ],
  'codex-tutorial/windows-setup': [
    {
      heading: 'Windows 原生路线',
      body: 'Windows 原生 PowerShell 适合普通 CLI 使用和多数 Node 项目。需要注意路径分隔符、执行策略、shell 命令差异和某些 Unix 工具缺失。',
    },
    {
      heading: 'WSL2 路线',
      body: 'WSL2 更接近 Linux 环境，适合依赖 bash、Docker、系统包、编译工具链或 Linux-only 脚本的项目。多数后端项目会更适合 WSL2。',
    },
    {
      heading: '项目位置',
      body: '在 WSL2 中开发时，尽量把项目放在 Linux 文件系统内，而不是频繁跨 /mnt/c 访问。这样文件 IO 和工具兼容性通常更好。',
    },
    {
      heading: '排障方向',
      body: 'Windows 问题常见于 PATH、Node 版本、shell 命令、权限策略、换行符和文件监听。先确认 codex 命令可用，再确认项目命令可用。',
    },
  ],
  'codex-tutorial/open-source-changelog': [
    {
      heading: '为什么关注版本',
      body: 'Codex CLI 开源并持续迭代，模型、沙箱、MCP、配置项、TUI 行为和云端能力都可能变化。教程应保留官方链接并定期更新。',
    },
    {
      heading: '看哪些信息',
      body: '重点看 release notes、README、docs 目录、配置文档、sandbox 文档和 issue 中的已知问题。升级前确认 breaking changes。',
    },
    {
      heading: '升级策略',
      body: '个人电脑可以较快升级；团队环境应先在测试仓库验证，再更新共享镜像或 CI。不要在生产自动化里无控制地使用 latest。',
    },
    {
      heading: '回滚准备',
      body: '如果新版本影响沙箱、审批、模型或命令输出，应能快速回滚到上一稳定版本。记录版本号比只记录“装了 codex”更有用。',
    },
  ],
  'codex-tutorial/wtt-integration': [
    {
      heading: '本地接入',
      body: '用户在 WTT claim Codex Agent，拿到 agent_id 和 agent_token，然后在自己的机器上启动 wtt-connect。之后 Feed 里的消息会进入本地 Codex 工作区。',
      commands: ['wtt-connect up codex <agent_id> <agent_token> --base-url https://www.waxbyte.com --mode full-auto', 'wtt-connect start'],
    },
    {
      heading: '云端接入',
      body: '用户点击“试用云端agent”后，后端 claim agent，云端编排服务创建容器，容器内运行 wtt-connect 和对应 adapter。试用到期后容器停止。',
    },
    {
      heading: 'workspace 隔离',
      body: '每个 agent_id 应对应独立 workspace，避免多个用户或多个 Agent 写同一目录。共享云环境还要限制 CPU、内存、磁盘和网络出口。',
    },
    {
      heading: '密钥处理',
      body: '共享容器内不应直接暴露长期模型 key。更稳妥的方式是在宿主机或后端代理模型请求，让容器只持有短期凭据或受限 token。',
    },
  ],
}

Object.entries(detailedTutorialSections).forEach(([key, sections]) => {
  const [guideSlug, chapterSlug] = key.split('/')
  const guide = agentTutorialGuides.find((item) => item.slug === guideSlug)
  const chapter = guide?.chapters.find((item) => item.slug === chapterSlug)
  if (chapter) chapter.sections = sections
})

const chapterDeepDives: Record<string, AgentTutorialSection[]> = {
  'claude-code-tutorial/overview': [
    {
      heading: '官方细节补充',
      body: '官方概览强调 Claude Code 直接工作在终端和仓库里，因此它的价值不只在生成代码，而在“理解项目上下文 + 真实执行工具 + 反馈后修正”。学习时要把它当成会操作项目的协作者，而不是只会回答问题的模型。\n\n| 能力 | 具体含义 |\n| --- | --- |\n| 读项目 | 搜索目录、读取文件、理解入口和依赖 |\n| 改项目 | 编辑文件、生成补丁、处理重复工程任务 |\n| 验证 | 运行测试、lint、类型检查、构建命令 |\n| 扩展 | 通过 MCP、Hooks、Subagents 接外部工具和流程 |',
    },
    {
      heading: '实践检查表',
      body: '- 第一次进入仓库先问项目结构，不要直接让它改代码。\n- 每个任务都写清楚目标、边界、验收标准。\n- 对高风险改动要求先计划、再修改、最后展示 diff。\n- 合并前仍要人工检查测试、配置、依赖和安全风险。',
    },
  ],
  'claude-code-tutorial/quickstart': [
    {
      heading: '官方细节补充',
      body: '快速开始不是只安装一个 npm 包。真正的第一步是确认运行环境：Node 版本、npm 全局路径、项目根目录、登录方式和当前 git 状态。很多“Claude 不工作”的问题，本质是命令不在 PATH、项目目录不对，或 Agent 没看到构建配置。',
      commands: ['node -v', 'npm root -g', 'which claude', 'git status --short'],
    },
    {
      heading: '第一次任务模板',
      body: '首次使用建议按三步来：先让它读仓库，第二步让它提出计划，第三步才允许小范围修改。\n\n```text\n1. Read README, package files, and test configuration.\n2. Explain the architecture and likely test command.\n3. Make one small change and run the related test.\n```',
    },
  ],
  'claude-code-tutorial/cli': [
    {
      heading: '官方细节补充',
      body: 'CLI 文档的重点是区分交互式和非交互式。交互式适合连续开发；`-p/--print` 适合脚本；管道输入适合处理日志或 diff；恢复会话适合长任务。不要把所有任务都放进同一个会话，否则上下文会混乱。',
      commands: ['claude "start with this question"', 'claude -p "summarize this file"', 'git diff | claude -p "review this diff"', 'claude -c', 'claude -r "<session-id>"'],
    },
    {
      heading: '选择命令的规则',
      body: '| 场景 | 推荐入口 |\n| --- | --- |\n| 连续开发 | `claude` |\n| 一次性摘要 | `claude -p` |\n| 日志解释 | `cat log | claude -p` |\n| 继续刚才任务 | `claude -c` |\n| 多任务恢复 | `claude -r <session-id>` |',
    },
  ],
  'claude-code-tutorial/workflows': [
    {
      heading: '官方细节补充',
      body: '常见工作流文档覆盖代码理解、修 bug、重构、测试、提交和并行开发。核心原则是让 Agent 先建立上下文，再执行最小可验证改动。复杂任务建议拆成多个 worktree 或多个会话，避免文件冲突。',
    },
    {
      heading: '工作流提示词模板',
      body: '```text\nFirst inspect the repository. Identify relevant files and test commands.\nThen propose a plan with risks.\nAfter I confirm, make the smallest safe change.\nRun only the related tests first, then broaden validation if needed.\n```\n\n这个模板比“帮我重构一下”稳定得多，因为它把探索、计划、执行、验证分开了。',
    },
  ],
  'claude-code-tutorial/memory-settings': [
    {
      heading: '官方细节补充',
      body: '官方把 memory 和 settings 分开：memory 解决“长期项目说明和偏好”，settings 解决“行为、权限、环境变量和企业策略”。CLAUDE.md 应写项目事实，不应写临时任务；settings.local.json 应写个人偏好，不应提交到仓库。',
    },
    {
      heading: 'CLAUDE.md 建议目录',
      body: '```md\n# Project overview\n# Build and test commands\n# Coding style\n# Important directories\n# Files Claude must not edit\n# Release or PR checklist\n```\n\n写得越具体，Agent 越少猜测；但过时信息会误导 Agent，所以项目命令变化后要同步更新。',
    },
  ],
  'claude-code-tutorial/mcp': [
    {
      heading: '官方细节补充',
      body: 'MCP 文档强调 server 的作用域和传输方式。工具可以是本地 stdio，也可以是远程 HTTP/SSE。配置时要区分 local、project、user 等范围，避免把只适合个人的 MCP 配置提交给全团队。',
      commands: ['claude mcp list', 'claude mcp add --transport sse private-api https://api.example.com/mcp', 'claude mcp add-json local-tool \'{"type":"stdio","command":"node","args":["server.js"]}\''],
    },
    {
      heading: 'MCP 工具设计原则',
      body: '- 输出要短而结构化，避免一次返回大量无关数据。\n- 工具命名要表达动作和对象，例如 `github_list_prs`。\n- 写操作必须比读操作更严格审批。\n- MCP 返回的错误也要清晰，方便 Agent 自我修正。',
    },
  ],
  'claude-code-tutorial/subagents': [
    {
      heading: '官方细节补充',
      body: 'Subagent 文档强调三件事：独立上下文、专业提示词、工具权限。它不是简单换一个名字，而是为某类任务创建独立执行环境。审查、调试、测试、文档、性能分析都适合拆成专门 subagent。',
    },
    {
      heading: 'Subagent 文件结构',
      body: '```md\n---\nname: code-reviewer\ndescription: Use for reviewing code changes before merge\ntools: Read, Grep, Glob, Bash\n---\nYou review code for regressions, security issues, missing tests, and maintainability risks.\nReturn findings first, ordered by severity.\n```\n\n工具列表要按职责收敛，审查类 agent 通常不需要写文件权限。',
    },
  ],
  'claude-code-tutorial/hooks': [
    {
      heading: '官方细节补充',
      body: 'Hooks 在权限系统前后介入工具调用。PreToolUse 可拦截或修改行为，PostToolUse 可在工具成功后补动作，UserPromptSubmit 可在用户提交时补上下文，Stop/SubagentStop 可在结束时总结或通知。',
    },
    {
      heading: 'Hook 设计表',
      body: '| 事件 | 适合做什么 |\n| --- | --- |\n| PreToolUse | 阻止危险命令、检查路径 |\n| PostToolUse | 格式化、记录日志、触发测试 |\n| UserPromptSubmit | 注入上下文、拦截敏感请求 |\n| Notification | 转发等待确认提醒 |\n| Stop | 生成任务摘要或状态报告 |',
    },
  ],
  'claude-code-tutorial/github-actions': [
    {
      heading: '官方细节补充',
      body: 'GitHub Actions 章节的重点是仓库事件和远程触发。Agent 可以根据 issue/PR 上下文执行任务，但 workflow 必须把 secret、触发条件、最大轮数和权限边界配置清楚。',
    },
    {
      heading: '安全检查表',
      body: '- API key 必须放在 GitHub Secrets。\n- 不要在 fork PR 上暴露高权限 secret。\n- 限制 `claude_args`，例如最大轮数、模型和工具配置。\n- 对自动生成的 PR 仍要求人类 review。\n- workflow 文件本身要纳入代码审查。',
    },
  ],
  'claude-code-tutorial/security': [
    {
      heading: '官方细节补充',
      body: '安全章节不只讲“不要泄露 key”。还包括权限模式、敏感文件 deny、网络访问、容器边界、企业策略、审计日志和人类审批。Agent 能执行真实命令，所以安全策略要围绕真实工程风险设计。',
    },
    {
      heading: '敏感资产清单',
      body: '| 类型 | 处理方式 |\n| --- | --- |\n| `.env` / secrets | deny 读取，必要时用占位变量 |\n| 生产证书 | 不放入 Agent workspace |\n| 数据库备份 | 不给默认读权限 |\n| 部署脚本 | 修改需人工审批 |\n| 依赖锁文件 | 修改后必须解释原因 |',
    },
  ],
  'claude-code-tutorial/how-claude-code-works': [
    {
      heading: '官方细节补充',
      body: 'Claude Code 的执行循环可以理解为：读取上下文、选择工具、执行动作、观察结果、更新计划。这个循环会不断消耗上下文窗口，所以中途总结、清理无关日志、拆分任务非常重要。',
    },
    {
      heading: '控制 Agent 行为',
      body: '你可以用明确指令控制它的工作节奏：先只读、先计划、不自动提交、不改公共 API、先跑最小测试、失败时停止并解释。这些约束比事后纠正更有效。',
      commands: ['> do not edit files yet; inspect and summarize first', '> do not commit; show me the diff and tests first'],
    },
  ],
  'claude-code-tutorial/extend-claude-code': [
    {
      heading: '官方细节补充',
      body: '扩展 Claude Code 时要先判断扩展点：需要外部数据用 MCP；需要自动守卫用 Hooks；需要角色分工用 Subagents；需要产品化集成用 SDK；需要项目规则用 CLAUDE.md 和 settings。',
    },
    {
      heading: '扩展选择表',
      body: '| 需求 | 选什么 |\n| --- | --- |\n| 读内部文档 | MCP |\n| 写文件后自动格式化 | Hook |\n| 专门做安全审查 | Subagent |\n| 集成到平台 | SDK |\n| 统一团队规范 | CLAUDE.md + settings |',
    },
  ],
  'claude-code-tutorial/claude-directory': [
    {
      heading: '官方细节补充',
      body: '.claude 目录应该像工程配置一样管理。能共享的是角色、命令、非敏感 hooks 和项目设置；不能共享的是个人 token、本机路径和实验性权限。团队项目要定期审查这个目录。',
    },
    {
      heading: '推荐文件职责',
      body: '| 文件 | 职责 |\n| --- | --- |\n| `CLAUDE.md` | 项目长期说明 |\n| `.claude/settings.json` | 团队共享设置 |\n| `.claude/settings.local.json` | 个人本地设置 |\n| `.claude/agents/*.md` | 项目级 subagents |\n| `.claude/hooks/*` | 可审查自动化脚本 |',
    },
  ],
  'claude-code-tutorial/context-window': [
    {
      heading: '官方细节补充',
      body: '上下文窗口管理决定 Agent 能否持续可靠工作。长日志、全量文件、无关聊天会挤占空间；项目地图、关键文件、错误片段、验收标准才是高价值上下文。',
    },
    {
      heading: '上下文压缩方法',
      body: '- 让 Agent 总结已完成工作和剩余任务。\n- 把长日志裁剪到第一处错误和 stack trace。\n- 用文件路径和函数名精确定位。\n- 一个会话只做一个大目标。\n- 阶段结束后新开会话，并带上摘要。',
    },
  ],
  'claude-code-tutorial/prompt-caching': [
    {
      heading: '官方细节补充',
      body: 'Prompt caching 适合重复出现的长前缀：项目说明、工具说明、角色规则和团队规范。要想提高命中率，稳定内容应放前面，动态任务、日志、diff 放后面。',
    },
    {
      heading: '缓存友好结构',
      body: '```text\n[Stable] system rules\n[Stable] project memory\n[Stable] tool and permission guide\n[Dynamic] current user task\n[Dynamic] current files, logs, diff\n```\n\n缓存不能修复坏上下文。稳定前缀如果过时，会稳定地产生错误结果。',
    },
  ],
  'claude-code-tutorial/permission-modes': [
    {
      heading: '官方细节补充',
      body: '权限模式要按任务风险选择。只读适合解释；accept edits 适合常规开发；bypass/full-auto 只适合隔离环境。企业策略可以禁止用户启用危险模式。',
    },
    {
      heading: '权限选择表',
      body: '| 任务 | 建议权限 |\n| --- | --- |\n| 解释架构 | 只读 |\n| 代码审查 | 只读 + 可运行安全命令 |\n| 修 bug | 工作区写入 + 命令确认 |\n| CI 自动修复 | 隔离环境 + 限制轮数 |\n| 生产部署 | 不建议全自动 |',
    },
  ],
  'claude-code-tutorial/manage-sessions': [
    {
      heading: '官方细节补充',
      body: '会话管理解决的是长期任务连续性。继续最近会话适合短中断；恢复指定会话适合多任务并行；阶段总结适合跨天任务。不要把多个互不相关任务塞进一个长会话。',
    },
    {
      heading: '会话交接模板',
      body: '```md\n## Completed\n## Files changed\n## Commands run\n## Current failing issue\n## Next recommended step\n## Risks or assumptions\n```\n\n这个模板能让下一个会话或另一个人快速接手。',
    },
  ],
  'claude-code-tutorial/prompt-library': [
    {
      heading: '官方细节补充',
      body: 'Prompt library 的价值在于把常见任务标准化。解释、修复、审查、测试、文档、重构都可以做成模板。模板不是为了变长，而是为了让输入稳定、输出可审查。',
    },
    {
      heading: '通用工程提示结构',
      body: '```text\nGoal: what should change\nContext: files, logs, screenshots, constraints\nRules: what not to modify\nValidation: commands or checks to run\nOutput: summary, diff, tests, risks\n```\n\n缺少 Validation 的提示，往往只能得到“看起来对”的结果。',
    },
  ],
  'claude-code-tutorial/best-practices': [
    {
      heading: '官方细节补充',
      body: '最佳实践贯穿所有章节：小任务、清晰边界、先读后改、真实验证、人工审查。Agent 越强，越需要清楚的工程护栏，否则它会高效地做错方向。',
    },
    {
      heading: '常见错误',
      body: '- 让 Agent 一次性重构整个系统。\n- 没有告诉它测试命令。\n- 允许它修改无关文件。\n- 不看 diff 直接合并。\n- 把密钥和生产配置放进上下文。\n- 一个会话混入多个业务目标。',
    },
  ],
  'claude-code-tutorial/ide-web-desktop': [
    {
      heading: '官方细节补充',
      body: '多平台入口的区别在于上下文和审查方式。终端最贴近真实命令；IDE 最适合看 diff；Web/Cloud 适合远程长任务；Desktop 适合多会话和可视化工作流。',
    },
    {
      heading: '入口选择建议',
      body: '| 入口 | 更适合 |\n| --- | --- |\n| Terminal | 本地工程执行、脚本、测试 |\n| IDE | 文件定位、diff 审查、选区上下文 |\n| Web/Cloud | 异步任务、远程环境 |\n| Desktop | 多会话管理、可视化操作 |',
    },
  ],
  'claude-code-tutorial/sdk-devcontainer-troubleshooting': [
    {
      heading: '官方细节补充',
      body: 'SDK、devcontainer 和 troubleshooting 是进阶章节。SDK 用于产品化集成；devcontainer 用于可重复环境；排障要围绕版本、路径、权限、MCP 启动和 shell 差异逐层定位。',
    },
    {
      heading: '排障顺序',
      body: '```text\n1. Check Node and Claude Code version.\n2. Check PATH and global npm bin.\n3. Check current shell and working directory.\n4. Check project commands outside Claude.\n5. Check settings and permissions.\n6. Check MCP server logs.\n```',
    },
  ],
  'codex-tutorial/overview': [
    {
      heading: '官方细节补充',
      body: 'Codex CLI 官方定位是把推理模型带到终端里的开源编程 Agent。它强调本地仓库操作、沙箱、审批、图像输入和自动化。Codex Cloud 则偏任务级远程执行，两者不是同一使用场景。',
    },
    {
      heading: '能力地图',
      body: '| 能力 | CLI | Cloud |\n| --- | --- | --- |\n| 本地文件 | 直接访问 | 通过任务环境 |\n| 运行命令 | 本机/沙箱内 | 云沙箱内 |\n| 交互方式 | TUI / exec | 异步任务 |\n| 适合任务 | 日常开发 | 独立 issue / PR 任务 |',
    },
  ],
  'codex-tutorial/install-login': [
    {
      heading: '官方细节补充',
      body: '安装登录章节要关注 npm 包版本、PATH、认证方式和项目 trust。共享服务器上不要把个人长期 token 暴露给其他用户；个人机器上要确认 Codex 能读取当前仓库但不能越界访问敏感目录。',
      commands: ['npm install -g @openai/codex', 'codex --version', 'codex login'],
    },
    {
      heading: '首次运行检查',
      body: '- `codex --help` 是否能运行。\n- 当前目录是否是仓库根目录。\n- 是否存在 AGENTS.md。\n- 测试命令是否能在不依赖 Codex 的情况下独立运行。\n- 当前 git 工作区是否干净或已知。',
    },
  ],
  'codex-tutorial/cloud': [
    {
      heading: '官方细节补充',
      body: 'Codex Cloud 的核心是任务级沙箱。每个任务应该有清楚的输入、期望输出、环境准备和验证命令。网络通常应默认受限，依赖要通过可重复脚本安装。',
    },
    {
      heading: '云任务描述模板',
      body: '```md\n## Goal\n## Repository context\n## Files likely involved\n## Constraints\n## Validation command\n## Expected output or PR shape\n```\n\n云端任务越独立、越可验证，成功率越高。',
    },
  ],
  'codex-tutorial/agents-md': [
    {
      heading: '官方细节补充',
      body: 'AGENTS.md 是 Codex 的项目说明书。它应比 README 更面向执行：如何安装、如何测试、如何检查、哪些目录生成、哪些文件不能动、完成后如何报告。',
    },
    {
      heading: 'AGENTS.md 示例骨架',
      body: '```md\n# How to work in this repo\n## Setup\n## Build\n## Test\n## Lint and typecheck\n## Code style\n## Generated files\n## Security and secrets\n## Final response checklist\n```',
    },
  ],
  'codex-tutorial/sandbox-approvals': [
    {
      heading: '官方细节补充',
      body: 'Codex 的沙箱和审批是同一套安全模型的两面：沙箱限制能做什么，审批控制什么时候需要人确认。读、写、联网、运行命令、访问工作区外文件都应有不同策略。',
    },
    {
      heading: '审批实践',
      body: '| 动作 | 建议 |\n| --- | --- |\n| 读源码 | 通常允许 |\n| 写工作区 | 开发任务允许 |\n| 删除文件 | 要确认 |\n| 联网安装包 | 要确认或禁用 |\n| 访问密钥 | 禁止 |',
    },
  ],
  'codex-tutorial/config': [
    {
      heading: '官方细节补充',
      body: 'config.toml 可以固化模型、推理级别、沙箱、审批、MCP 和 profile。团队使用时应把“安全默认值”写进配置，而不是依赖每个人记住启动参数。',
    },
    {
      heading: 'Profile 思路',
      body: '```toml\n[profiles.review]\napproval_policy = "on-request"\nsandbox_mode = "read-only"\n\n[profiles.dev]\napproval_policy = "on-request"\nsandbox_mode = "workspace-write"\n```\n\n不同 profile 对应不同风险级别。',
    },
  ],
  'codex-tutorial/mcp': [
    {
      heading: '官方细节补充',
      body: 'OpenAI Docs MCP 是只读文档工具，适合查最新官方 API、模型、SDK 和平台说明。它不会替你调用 API，只把官方文档内容带入 Agent 上下文。',
      commands: ['codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp', 'codex mcp list'],
    },
    {
      heading: 'MCP 使用建议',
      body: '- 官方文档问题优先用 Docs MCP。\n- 内部系统 MCP 优先只读。\n- 写操作必须有人审查。\n- 工具返回内容要短、准、可解析。\n- 不要一次启用所有 MCP，让任务需要什么才给什么。',
    },
  ],
  'codex-tutorial/workflows': [
    {
      heading: '官方细节补充',
      body: 'Codex 工作流也应遵循“读项目 → 计划 → 修改 → 验证 → 总结”。CLI 适合在本地真实环境中闭环，尤其适合测试、lint、typecheck 和 PR 摘要。',
    },
    {
      heading: '常用任务模板',
      body: '```text\nExplain: summarize architecture, entry points, and tests.\nFix: reproduce failure, find root cause, make smallest change.\nReview: inspect diff for regressions and missing tests.\nPR: summarize changes, tests run, risks.\n```',
    },
  ],
  'codex-tutorial/interactive-tui': [
    {
      heading: '官方细节补充',
      body: 'TUI 是人和 Agent 协作的主界面。它适合查看计划、审批命令、观察 diff、继续追问。遇到不确定任务时，在 TUI 中分步确认比一次性 exec 更安全。',
    },
    {
      heading: 'TUI 使用习惯',
      body: '- 开始前看 git status。\n- 让 Codex 先说明计划。\n- 对危险命令拒绝或要求解释。\n- 修改后看 diff。\n- 最终让它说明测试和剩余风险。',
    },
  ],
  'codex-tutorial/model-reasoning': [
    {
      heading: '官方细节补充',
      body: '模型和推理级别影响质量、速度和成本。不要把所有任务都设成最高推理；应按任务风险调整。复杂根因分析和架构审查值得高推理，小修小补不一定需要。',
    },
    {
      heading: '选择规则',
      body: '| 任务 | 模型/推理倾向 |\n| --- | --- |\n| 文档摘要 | 快模型 / 低中推理 |\n| 小 bug | 标准模型 / 中推理 |\n| 跨模块重构 | 强模型 / 高推理 |\n| 安全审查 | 强模型 / 高推理 + 人审 |',
    },
  ],
  'codex-tutorial/image-inputs-generation': [
    {
      heading: '官方细节补充',
      body: '图像输入让 Codex 能结合截图、设计稿和错误界面理解任务。前端问题尤其需要图像上下文，因为布局、颜色、遮挡和响应式问题很难只用文字准确描述。',
    },
    {
      heading: '截图任务模板',
      body: '```text\nHere is the screenshot. Compare it with the expected behavior.\nFind the relevant component and CSS.\nFix only the layout issue.\nVerify desktop and mobile sizes.\n```\n\n图像任务完成后应实际截图验证。',
    },
  ],
  'codex-tutorial/code-review': [
    {
      heading: '官方细节补充',
      body: '代码审查不是让 Codex 夸代码。它应优先寻找可导致线上问题的风险：鉴权、数据兼容、并发、错误处理、资源泄露、测试缺口和部署影响。',
    },
    {
      heading: '审查输出格式',
      body: '```md\n## Findings\n- [Severity] file:line — issue and impact\n## Open questions\n## Tests not run\n## Residual risk\n```\n\n没有发现问题时也要说明检查范围和未覆盖风险。',
    },
  ],
  'codex-tutorial/subagents': [
    {
      heading: '官方细节补充',
      body: 'Subagents 适合把复杂任务拆成不同上下文。探索、实现、验证、审查可以并行，但必须避免多个 worker 写同一文件。主 Agent 要负责整合结果。',
    },
    {
      heading: '拆分示例',
      body: '| 角色 | 任务 | 写权限 |\n| --- | --- | --- |\n| explorer | 找相关文件和设计约束 | 无 |\n| worker | 实现明确改动 | 有，限定路径 |\n| reviewer | 审查 diff 和测试缺口 | 无 |\n| tester | 运行验证和整理日志 | 可运行命令 |',
    },
  ],
  'codex-tutorial/web-search': [
    {
      heading: '官方细节补充',
      body: 'Web Search 应用于可能变化的信息：API、价格、模型、云服务、依赖版本、安全公告。技术搜索应优先官方文档和仓库，而不是内容农场。',
    },
    {
      heading: '搜索提示模板',
      body: '```text\nSearch official docs only. Compare dates and versions.\nSummarize the current behavior and include source links.\nDo not rely on outdated blog posts.\n```\n\n搜索结果要标出时间和适用版本。',
    },
  ],
  'codex-tutorial/cloud-tasks': [
    {
      heading: '官方细节补充',
      body: 'Cloud Tasks 的关键是任务边界。云端执行适合独立、可验证的任务；不适合需要频繁产品澄清的大需求。云任务完成后仍要查看 diff 和测试。',
    },
    {
      heading: '云任务验收',
      body: '- 是否修改了预期文件。\n- 是否运行了指定验证命令。\n- 是否引入新依赖。\n- 是否影响公共 API。\n- 是否有未解释的失败测试。\n- 是否需要人工补充配置。',
    },
  ],
  'codex-tutorial/exec-scripting': [
    {
      heading: '官方细节补充',
      body: 'exec/非交互模式适合脚本化，但要求输入输出稳定。它不适合需要大量澄清的任务。CI 中使用时要设置超时、输出格式和权限限制。',
    },
    {
      heading: '脚本化输出示例',
      body: '```bash\ngit diff --stat | codex exec \"Return JSON with summary, risk, tests\"\ncat test.log | codex exec \"Extract failing tests as markdown table\"\n```\n\n传入日志前要脱敏，避免把 token 或生产数据放进 prompt。',
    },
  ],
  'codex-tutorial/windows-setup': [
    {
      heading: '官方细节补充',
      body: 'Windows 使用要区分 PowerShell 原生和 WSL2。原生命令适合普通项目；依赖 Linux 工具链、Docker、bash 脚本的仓库更适合 WSL2。',
    },
    {
      heading: 'Windows 排障清单',
      body: '- PATH 是否包含 npm 全局 bin。\n- PowerShell 执行策略是否阻止脚本。\n- 项目是否依赖 bash-only 命令。\n- 换行符是否影响测试。\n- WSL2 项目是否放在 Linux 文件系统内。',
    },
  ],
  'codex-tutorial/open-source-changelog': [
    {
      heading: '官方细节补充',
      body: 'Codex CLI 迭代很快，教程不能假设命令和配置永远不变。升级前应看 changelog、README、docs/config、docs/sandbox 和已知问题。',
    },
    {
      heading: '升级流程',
      body: '```text\n1. Record current version.\n2. Read release notes.\n3. Test on a sample repo.\n4. Verify sandbox and approval behavior.\n5. Roll out to shared environment.\n6. Keep rollback path.\n```',
    },
  ],
  'codex-tutorial/wtt-integration': [
    {
      heading: '官方细节补充',
      body: 'WTT 接入章节是平台集成说明，不属于 OpenAI 官方教程主体。这里要讲清楚本地 Codex、云端容器、agent_id、token、workspace、密钥代理和试用到期清理的关系。',
    },
    {
      heading: '接入验收清单',
      body: '- agent_id 和 token 是否只展示一次。\n- workspace 是否按 agent_id 隔离。\n- 容器内是否看不到长期模型 key。\n- wtt-connect 是否自动重启。\n- 7 天试用是否能停止服务。\n- 用户恶意操作是否有封禁和审计。',
    },
  ],
}

Object.entries(chapterDeepDives).forEach(([key, sections]) => {
  const [guideSlug, chapterSlug] = key.split('/')
  const guide = agentTutorialGuides.find((item) => item.slug === guideSlug)
  const chapter = guide?.chapters.find((item) => item.slug === chapterSlug)
  if (chapter) chapter.sections = [...chapter.sections, ...sections]
})

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
