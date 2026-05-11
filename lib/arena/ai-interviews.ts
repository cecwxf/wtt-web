import type { Challenge } from './types'

const createdAt = '2026-05-11T00:00:00.000Z'

type InterviewSpec = {
  id: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  tags: string[]
  prompt: string
  sources: string[]
}

const specs: InterviewSpec[] = [
  {
    id: 'ai-interview-recommendation-feed',
    title: 'Design a Personalized Recommendation Feed',
    difficulty: 'medium',
    tags: ['ml-system-design', 'ranking', 'recommendation'],
    prompt: '设计一个面向千万级用户的信息流/短视频推荐系统。请覆盖候选召回、粗排/精排、特征、在线服务延迟、冷启动、A/B 实验、反馈闭环与反作弊。',
    sources: ['Interview Query ML system design', 'iGotAnOffer ML system design', 'DataInterview ML system design'],
  },
  {
    id: 'ai-interview-real-time-fraud',
    title: 'Real-time Fraud Detection System',
    difficulty: 'medium',
    tags: ['ml-system-design', 'streaming', 'risk'],
    prompt: '设计一个实时风控/欺诈检测系统。重点说明流式特征、规则与模型混合、低延迟推理、误杀控制、人工审核闭环、标签延迟与模型漂移监控。',
    sources: ['Interview Query ML system design', 'Google Rules of ML'],
  },
  {
    id: 'ai-interview-search-ranking',
    title: 'Search Ranking for an E-commerce Platform',
    difficulty: 'medium',
    tags: ['ranking', 'retrieval', 'experimentation'],
    prompt: '为电商搜索设计排序系统。请拆解 query 理解、召回、多阶段排序、特征交叉、业务约束、评价指标，以及如何在不伤害转化率的情况下上线新模型。',
    sources: ['DataInterview ML system design', 'Interview Query ML system design'],
  },
  {
    id: 'ai-interview-feature-store',
    title: 'Feature Store for Online/Offline Consistency',
    difficulty: 'hard',
    tags: ['feature-store', 'mlops', 'data-platform'],
    prompt: '设计一个特征平台，要求训练和在线推理特征一致。说明 point-in-time correctness、离线回填、在线低延迟读取、特征版本、血缘、监控和权限治理。',
    sources: ['Google Rules of ML', 'DataInterview ML system design'],
  },
  {
    id: 'ai-interview-model-monitoring',
    title: 'Model Monitoring and Drift Response',
    difficulty: 'medium',
    tags: ['mlops', 'monitoring', 'reliability'],
    prompt: '设计生产模型监控体系。请覆盖数据质量、特征漂移、预测分布、业务 KPI、延迟/错误率、告警分级、自动回滚，以及没有即时标签时如何判断退化。',
    sources: ['Google Rules of ML', 'iGotAnOffer ML system design'],
  },
  {
    id: 'ai-interview-rag-assistant',
    title: 'Enterprise RAG Assistant',
    difficulty: 'medium',
    tags: ['llm', 'rag', 'retrieval'],
    prompt: '设计企业知识库 RAG 助手。请说明文档解析、切分、embedding、召回/重排、权限过滤、引用溯源、幻觉缓解、评测集与在线反馈。',
    sources: ['Interview Query ML system design', 'iGotAnOffer ML system design'],
  },
  {
    id: 'ai-interview-llm-evaluation',
    title: 'LLM Evaluation Harness',
    difficulty: 'hard',
    tags: ['llm', 'evaluation', 'safety'],
    prompt: '设计一个 LLM 应用评测平台。覆盖离线基准、黄金集构建、自动评审与人工评审、回归测试、安全红队、成本/延迟指标和线上 shadow/canary。',
    sources: ['Google Rules of ML', 'DataInterview ML system design'],
  },
  {
    id: 'ai-interview-embedding-search',
    title: 'Semantic Embedding Search',
    difficulty: 'medium',
    tags: ['embedding', 'vector-search', 'retrieval'],
    prompt: '设计语义向量检索系统。说明 embedding 训练/选择、ANN 索引、增量更新、多租户隔离、过滤条件、召回评估、重排和冷启动策略。',
    sources: ['Interview Query ML system design', 'DataInterview ML system design'],
  },
  {
    id: 'ai-interview-serving-llm-at-scale',
    title: 'Serve LLMs at Scale',
    difficulty: 'hard',
    tags: ['llm-serving', 'inference', 'systems'],
    prompt: '设计大模型推理服务。请覆盖 continuous batching、KV cache、量化、路由、限流、SLO、成本、GPU 利用率、降级策略与多模型灰度发布。',
    sources: ['iGotAnOffer ML system design', 'DataInterview ML system design'],
  },
  {
    id: 'ai-interview-training-data-leakage',
    title: 'Find and Prevent Training Data Leakage',
    difficulty: 'medium',
    tags: ['data-leakage', 'validation', 'ml-debugging'],
    prompt: '面试官给出一个离线 AUC 很高、上线效果很差的模型。请系统排查训练/验证泄漏、时间穿越、样本选择偏差、特征泄漏和指标设计问题。',
    sources: ['Google Rules of ML', 'Interview Query ML system design'],
  },
  {
    id: 'ai-interview-transformer-attention',
    title: 'Explain Transformer Attention and KV Cache',
    difficulty: 'easy',
    tags: ['transformer', 'attention', 'llm'],
    prompt: '解释 self-attention、multi-head attention、causal mask、位置编码与 KV cache。要求能从矩阵形状、计算复杂度和推理加速角度讲清楚。',
    sources: ['Machine Learning interviews GitHub guides', 'LLM system design interview guides'],
  },
  {
    id: 'ai-interview-kernel-optimization',
    title: 'Optimize a GPU Kernel for LayerNorm',
    difficulty: 'hard',
    tags: ['gpu', 'kernel', 'performance'],
    prompt: '面试官要求优化 LayerNorm GPU kernel。请分析内存访问、归约、warp/block 组织、shared memory、向量化、数值稳定性和如何设计 benchmark。',
    sources: ['LeetGPU challenge map', 'Tensara GPU challenges'],
  },
]

function slugFor(id: string) {
  return id
}

function descriptionFor(spec: InterviewSpec) {
  return `AI 面试题 / Agent 练习题。\n\n题目：${spec.prompt}\n\n答题建议：\n- 先明确目标、约束、规模和核心指标。\n- 拆成数据、模型、在线服务、评估、监控、迭代闭环。\n- 给出关键 trade-off，不要只列组件。\n- 可以直接在右侧 Arena Coach 中进行多轮模拟面试。\n\n参考来源方向：${spec.sources.join('；')}。题面已按 WTT Arena 训练口径重写。`
}

export const aiInterviewChallenges: Challenge[] = specs.map((spec) => ({
  id: spec.id,
  title: spec.title,
  slug: slugFor(spec.id),
  description: descriptionFor(spec),
  difficulty: spec.difficulty,
  category: 'ai-interview',
  tags: ['ai-interview', ...spec.tags],
  challenge_type: 'qa',
  time_limit_ms: 0,
  memory_limit_mb: 0,
  starter_code: '',
  function_name: 'arena_interview_answer',
  input_keys: ['answer'],
  published: true,
  created_at: createdAt,
  updated_at: createdAt,
}))
