import type { Challenge } from './types'

const createdAt = '2026-05-11T00:00:00.000Z'

type InterviewSpec = {
  id: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  tags: string[]
  prompt: string
  concepts: string[]
  whiteboardTemplate: NonNullable<Challenge['whiteboard_template']>
  followUps: string[]
}

type ModuleSpec = {
  key: string
  title: string
  tags: string[]
  concepts: string[]
  whiteboardTemplate: NonNullable<Challenge['whiteboard_template']>
  followUps: string[]
  items: Array<{ id: string; title: string; difficulty: 'easy' | 'medium' | 'hard'; focus: string }>
}

const modules: ModuleSpec[] = [
  {
    key: 'pretraining',
    title: '大模型预训练',
    tags: ['pretraining', 'data-engineering', 'distributed-training'],
    concepts: ['数据配比', 'tokenizer', '分布式训练', 'checkpoint', '训练稳定性'],
    whiteboardTemplate: 'pipeline',
    followUps: ['如何证明数据配比带来了收益？', '训练 loss 异常时你先查哪三类问题？', '如何避免 benchmark 污染？'],
    items: [
      { id: 'data-mixture', title: '如何设计万亿 token 预训练数据配比？', difficulty: 'hard', focus: '覆盖网页、代码、数学、多语种和高质量语料的配比策略，说明去重、质量过滤、污染检测和实验闭环。' },
      { id: 'tokenizer', title: '如何为中英代码混合大模型设计 tokenizer？', difficulty: 'medium', focus: '比较 BPE、Unigram、SentencePiece 的取舍，说明词表大小、压缩率、OOV、代码 token 和多语言公平性。' },
      { id: 'distributed-loop', title: '预训练分布式训练主循环如何设计？', difficulty: 'hard', focus: '讲清数据并行、张量并行、流水并行、梯度累积、通信重叠、容错和吞吐监控。' },
      { id: 'loss-instability', title: '预训练 loss 突然 spike 如何排查？', difficulty: 'hard', focus: '从数据 batch、数值溢出、学习率、梯度裁剪、并行通信、checkpoint 回滚和隔离实验展开。' },
      { id: 'long-context', title: '如何把预训练上下文长度从 4K 扩到 128K？', difficulty: 'hard', focus: '讨论位置编码外推、长文本数据、attention 复杂度、显存、训练策略和评测方法。' },
      { id: 'contamination', title: '如何检测预训练数据污染了评测集？', difficulty: 'medium', focus: '说明 exact/fuzzy match、n-gram/minhash、embedding 检索、时间切分和污染后的评测修正。' },
      { id: 'curriculum', title: '预训练是否需要 curriculum learning？', difficulty: 'medium', focus: '比较随机混合、阶段式课程、质量退火、难度采样和对收敛速度/泛化的影响。' },
      { id: 'checkpointing', title: '百亿参数训练 checkpoint 如何设计？', difficulty: 'medium', focus: '覆盖模型/优化器状态、分片保存、异步写入、恢复一致性、版本管理和存储成本。' },
      { id: 'optimizer-schedule', title: 'AdamW、学习率 warmup 和 cosine decay 如何解释？', difficulty: 'easy', focus: '从公式、权重衰减、梯度噪声、warmup 必要性和 schedule 对收敛的影响讲清楚。' },
      { id: 'observability', title: '预训练平台需要哪些观测指标？', difficulty: 'medium', focus: '设计 tokens/s、MFU、loss、梯度范数、数据质量、通信耗时、GPU 利用率和告警策略。' },
    ],
  },
  {
    key: 'post-training',
    title: '后训练 / SFT / RLHF',
    tags: ['post-training', 'sft', 'rlhf', 'alignment'],
    concepts: ['SFT', '偏好数据', '奖励模型', 'DPO', '安全对齐'],
    whiteboardTemplate: 'evaluation_loop',
    followUps: ['SFT 和偏好优化分别解决什么问题？', '如何发现模型只是学会了格式而不是能力？', '如何防止安全对齐损伤有用性？'],
    items: [
      { id: 'sft-data', title: '如何构建高质量 SFT 指令数据集？', difficulty: 'medium', focus: '说明任务分布、难度分层、多轮对话、拒答样本、质量审核、去重和数据版本。' },
      { id: 'sft-format', title: 'SFT 训练样本格式会如何影响模型行为？', difficulty: 'easy', focus: '覆盖 system/user/assistant 模板、结束符、工具调用格式、长答案偏置和推理链暴露风险。' },
      { id: 'preference-data', title: '如何采集和清洗偏好数据？', difficulty: 'medium', focus: '讨论 pairwise/ranking 标注、一致性、标注员校准、偏置控制、冲突样本和主动采样。' },
      { id: 'reward-model', title: '奖励模型如何训练和评估？', difficulty: 'hard', focus: '讲清 Bradley-Terry 目标、过拟合、reward hacking、校准、OOD 泛化和人工复核。' },
      { id: 'ppo-vs-dpo', title: 'PPO、DPO、IPO 在后训练中如何取舍？', difficulty: 'hard', focus: '从训练稳定性、实现复杂度、KL 控制、数据需求、线上效果和可解释性比较。' },
      { id: 'rlhf-pipeline', title: '请画出完整 RLHF 训练 pipeline。', difficulty: 'hard', focus: '包含 SFT、偏好采集、奖励模型、策略优化、评测、安全红队和回滚。' },
      { id: 'safety-alignment', title: '如何做安全对齐但不显著降低可用性？', difficulty: 'medium', focus: '讨论拒答边界、分级策略、安全数据混合、无害性/有用性评测和灰度上线。' },
      { id: 'multi-turn', title: '多轮对话能力如何后训练？', difficulty: 'medium', focus: '覆盖历史压缩、指代消解、状态保持、工具结果引用、一致性和上下文长度。' },
      { id: 'domain-adapt', title: '垂直领域大模型后训练如何避免灾难性遗忘？', difficulty: 'medium', focus: '比较 LoRA、全参、混合通用数据、回放、评测矩阵和上线策略。' },
      { id: 'eval-loop', title: '后训练效果如何建立自动评测闭环？', difficulty: 'medium', focus: '说明黄金集、LLM-as-judge、人审校准、回归测试、线上反馈和数据再生产。' },
    ],
  },
  {
    key: 'llm-architecture',
    title: '大模型架构与推理机制',
    tags: ['llm', 'transformer', 'attention', 'agent'],
    concepts: ['attention', 'RoPE', 'MoE', 'KV cache', 'speculative decoding'],
    whiteboardTemplate: 'inference_flow',
    followUps: ['复杂度瓶颈在哪里？', '哪些机制主要影响训练，哪些主要影响推理？', '如何用矩阵形状解释你的答案？'],
    items: [
      { id: 'attention', title: '从矩阵形状解释 Transformer self-attention。', difficulty: 'easy', focus: '说明 Q/K/V 形状、softmax、mask、多头拆分、复杂度和常见实现优化。' },
      { id: 'rope', title: 'RoPE 为什么适合大模型位置编码？', difficulty: 'medium', focus: '比较绝对位置、相对位置、ALiBi、RoPE 外推和长上下文缩放。' },
      { id: 'moe-routing', title: 'MoE 模型路由器如何设计和训练？', difficulty: 'hard', focus: '覆盖 top-k routing、负载均衡 loss、expert capacity、通信、推理延迟和退化问题。' },
      { id: 'kv-cache', title: 'KV cache 为什么能加速自回归 decode？', difficulty: 'medium', focus: '从 prefill/decode、缓存张量形状、显存占用、分页管理和 cache miss 讲清楚。' },
      { id: 'spec-decode', title: 'Speculative decoding 如何降低推理延迟？', difficulty: 'hard', focus: '说明 draft model、verify、接受率、吞吐/延迟权衡和失败场景。' },
      { id: 'long-context-memory', title: '长上下文模型如何处理注意力和记忆成本？', difficulty: 'hard', focus: '比较 sparse attention、sliding window、chunking、压缩记忆和检索增强。' },
      { id: 'tool-use', title: 'Function calling / tool use 模型如何设计？', difficulty: 'medium', focus: '讲清 schema、工具选择、参数生成、执行反馈、错误恢复和安全边界。' },
      { id: 'agent-memory', title: 'Agent 长短期记忆系统如何设计？', difficulty: 'medium', focus: '覆盖会话摘要、向量记忆、事实更新、遗忘策略、隐私和评测。' },
      { id: 'multimodal-llm', title: '多模态大模型如何接入图像编码器？', difficulty: 'hard', focus: '说明 vision encoder、projector、token 对齐、训练阶段、分辨率和推理成本。' },
      { id: 'rag-vs-finetune', title: '什么时候选择 RAG，什么时候选择微调？', difficulty: 'medium', focus: '从知识更新、权限、成本、幻觉、可控性、延迟和评测闭环比较。' },
    ],
  },
  {
    key: 'quantization',
    title: '量化 / 压缩 / 蒸馏',
    tags: ['quantization', 'compression', 'inference'],
    concepts: ['PTQ', 'QAT', 'INT8', 'INT4', 'SmoothQuant', '蒸馏'],
    whiteboardTemplate: 'inference_flow',
    followUps: ['量化误差主要来自权重还是激活？', '如何判断量化收益被访存瓶颈抵消？', '如何设计量化回归测试？'],
    items: [
      { id: 'ptq-qat', title: 'PTQ 和 QAT 的核心差异是什么？', difficulty: 'easy', focus: '比较校准数据、训练成本、精度恢复、工程复杂度和适用场景。' },
      { id: 'int8-int4', title: 'LLM INT8 与 INT4 量化如何取舍？', difficulty: 'medium', focus: '分析权重量化、激活量化、group size、zero point、吞吐、显存和精度。' },
      { id: 'gptq-awq', title: 'GPTQ、AWQ 这类权重量化方法在解决什么问题？', difficulty: 'hard', focus: '说明 Hessian/激活感知、逐层误差、校准集、离群通道和部署限制。' },
      { id: 'smoothquant', title: 'SmoothQuant 为什么能缓解激活离群值？', difficulty: 'hard', focus: '讲清平滑因子、权重/激活缩放迁移、校准、W8A8 和精度风险。' },
      { id: 'kv-quant', title: 'KV cache 量化如何影响长上下文推理？', difficulty: 'medium', focus: '分析显存节省、注意力误差、per-token/per-channel 策略和回退机制。' },
      { id: 'mixed-precision', title: 'FP16、BF16、FP8 混合精度如何选择？', difficulty: 'medium', focus: '覆盖动态范围、溢出、硬件支持、训练稳定性和推理吞吐。' },
      { id: 'pruning', title: '结构化剪枝如何真正带来推理加速？', difficulty: 'medium', focus: '区分非结构化稀疏、通道剪枝、N:M 稀疏、kernel 支持和精度恢复。' },
      { id: 'distillation', title: '如何把大模型能力蒸馏到小模型？', difficulty: 'medium', focus: '说明 teacher 数据生成、logit 蒸馏、过程蒸馏、偏差继承和评测。' },
      { id: 'accuracy-regression', title: '量化后如何建立精度回归体系？', difficulty: 'medium', focus: '覆盖 per-task 指标、长尾样本、困惑度、人工评测、线上 shadow 和阈值。' },
      { id: 'quant-serving', title: '量化模型上线如何做灰度和回滚？', difficulty: 'medium', focus: '讨论模型格式、兼容性、延迟/成本指标、质量 guardrail 和双写验证。' },
    ],
  },
  {
    key: 'compiler',
    title: 'AI 编译器 / 图优化',
    tags: ['compiler', 'graph-optimization', 'torch-compile'],
    concepts: ['torch.compile', '算子融合', '动态 shape', 'layout', 'MLIR'],
    whiteboardTemplate: 'pipeline',
    followUps: ['动态 shape 为什么难？', '融合为什么有时会变慢？', '如何证明图优化没有改变数值语义？'],
    items: [
      { id: 'torch-compile', title: 'torch.compile 从 Python 到 kernel 大致经历哪些阶段？', difficulty: 'medium', focus: '说明 Dynamo 捕获、FX graph、AOTAutograd、Inductor、代码生成和 fallback。' },
      { id: 'dynamic-shape', title: '动态图和动态 shape 对编译器有什么挑战？', difficulty: 'hard', focus: '覆盖 guard、specialization、shape polymorphism、cache 爆炸和回退策略。' },
      { id: 'fusion', title: '算子融合为什么能提速，什么时候会变慢？', difficulty: 'medium', focus: '分析访存减少、寄存器压力、并行度下降、layout 变化和调度代价。' },
      { id: 'autotune', title: 'kernel autotuning 系统如何设计？', difficulty: 'hard', focus: '讨论搜索空间、代价模型、benchmark 噪声、缓存、硬件差异和回滚。' },
      { id: 'memory-planning', title: '计算图内存规划如何减少峰值显存？', difficulty: 'medium', focus: '说明生命周期分析、buffer reuse、in-place、安全性和与 autograd 的关系。' },
      { id: 'layout', title: 'NCHW、NHWC、blocked layout 如何影响性能？', difficulty: 'medium', focus: '从访存连续性、向量化、Tensor Core/NPU cube、transpose 成本和算子兼容性讲解。' },
      { id: 'onnx-export', title: 'PyTorch 模型导出 ONNX 失败如何排查？', difficulty: 'medium', focus: '覆盖动态控制流、自定义 op、shape 推断、算子版本、数值对齐和 fallback。' },
      { id: 'mlir-tvm', title: 'MLIR/TVM 类编译栈如何分层？', difficulty: 'hard', focus: '说明前端 IR、高层图优化、调度、低层 IR、代码生成和 runtime 接口。' },
      { id: 'compile-cache', title: 'AI 编译缓存如何设计才不会失控？', difficulty: 'medium', focus: '讨论 key 设计、shape/version/device 维度、淘汰、预热和线上观测。' },
      { id: 'custom-op', title: '新增自定义算子如何接入训练和推理编译链？', difficulty: 'hard', focus: '覆盖 schema、shape function、autograd、kernel、测试、导出和多硬件适配。' },
    ],
  },
  {
    key: 'runtime',
    title: '推理 Runtime / Serving',
    tags: ['runtime', 'serving', 'llm-inference'],
    concepts: ['continuous batching', 'paged attention', 'SLO', '路由', '多租户'],
    whiteboardTemplate: 'inference_flow',
    followUps: ['吞吐和首 token 延迟如何权衡？', '如何做多租户隔离？', '降级策略会影响哪些质量指标？'],
    items: [
      { id: 'continuous-batching', title: 'LLM continuous batching 如何设计？', difficulty: 'hard', focus: '讲清请求队列、prefill/decode 混排、调度策略、吞吐、尾延迟和公平性。' },
      { id: 'prefill-decode', title: 'prefill 和 decode 分离部署有什么收益和代价？', difficulty: 'hard', focus: '分析计算/访存瓶颈、KV 传输、资源池、调度复杂度和故障恢复。' },
      { id: 'paged-attention', title: 'PagedAttention 解决了 KV cache 的什么问题？', difficulty: 'medium', focus: '说明分页、碎片、共享前缀、换入换出、显存利用率和调度。' },
      { id: 'routing', title: '多模型推理路由如何设计？', difficulty: 'medium', focus: '覆盖大小模型级联、成本/质量/SLO、租户策略、fallback 和在线学习。' },
      { id: 'autoscaling', title: '大模型服务如何按 SLO 自动扩缩容？', difficulty: 'hard', focus: '讨论队列长度、token/s、GPU 利用率、冷启动、预测扩容和成本控制。' },
      { id: 'admission-control', title: '高峰期如何做 admission control 和限流？', difficulty: 'medium', focus: '说明租户配额、优先级、排队预算、降级、拒绝策略和用户体验。' },
      { id: 'streaming', title: '流式输出服务端如何保证稳定性？', difficulty: 'medium', focus: '覆盖 SSE/WebSocket、断连重试、背压、partial result、超时和审计。' },
      { id: 'tenant-isolation', title: '多租户推理平台如何隔离性能和数据？', difficulty: 'hard', focus: '讨论队列隔离、KV cache 隔离、配额、日志脱敏、权限和审计。' },
      { id: 'canary', title: '推理 Runtime 如何做热更新和 canary？', difficulty: 'medium', focus: '说明模型版本、权重加载、流量切分、shadow、回滚和指标门禁。' },
      { id: 'observability', title: 'LLM Serving 需要哪些核心观测指标？', difficulty: 'medium', focus: '覆盖 TTFT、TPOT、tokens/s、batch size、cache 命中、OOM、错误率和成本。' },
    ],
  },
  {
    key: 'pytorch',
    title: 'PyTorch 框架与训练工程',
    tags: ['pytorch', 'training-framework', 'distributed'],
    concepts: ['autograd', 'DDP', 'FSDP', 'AMP', 'profiler'],
    whiteboardTemplate: 'training_serving_consistency',
    followUps: ['如何定位训练吞吐瓶颈？', '显存不够时有哪些层次的办法？', '如何判断分布式训练是否正确同步？'],
    items: [
      { id: 'autograd', title: 'PyTorch autograd 如何构建和执行反向图？', difficulty: 'medium', focus: '说明 Tensor、Function、计算图、叶子节点、梯度累积、detach 和 inplace 风险。' },
      { id: 'ddp', title: 'DDP 为什么通常比 DataParallel 更快？', difficulty: 'medium', focus: '比较进程模型、梯度 bucket、all-reduce、通信重叠和常见 hang 问题。' },
      { id: 'fsdp-zero', title: 'FSDP/ZeRO 如何降低大模型训练显存？', difficulty: 'hard', focus: '讲清参数、梯度、优化器状态分片，通信时机，prefetch 和 checkpoint。' },
      { id: 'amp', title: 'AMP 混合精度训练为什么需要 loss scaling？', difficulty: 'medium', focus: '解释 FP16 溢出/下溢、GradScaler、BF16 差异和数值稳定性。' },
      { id: 'dataloader', title: 'DataLoader 吞吐不足如何优化？', difficulty: 'easy', focus: '覆盖 num_workers、pin memory、prefetch、数据格式、随机增强和 CPU/GPU pipeline。' },
      { id: 'profiler', title: '如何用 PyTorch Profiler 定位训练瓶颈？', difficulty: 'medium', focus: '说明 trace、算子耗时、CUDA kernel、内存、通信和可视化分析路径。' },
      { id: 'custom-cuda-op', title: '如何在 PyTorch 中接入自定义 CUDA op？', difficulty: 'hard', focus: '覆盖 C++ extension、CUDA kernel、dispatch、autograd、编译、测试和发布。' },
      { id: 'oom', title: '训练 OOM 如何系统排查？', difficulty: 'medium', focus: '分析 batch、激活、优化器状态、碎片、checkpointing、累积梯度和泄漏。' },
      { id: 'init', title: '参数初始化为什么影响深层网络训练？', difficulty: 'easy', focus: '解释 Xavier、Kaiming、残差、归一化层和梯度传播。' },
      { id: 'parallelism', title: '张量并行、流水并行、数据并行如何组合？', difficulty: 'hard', focus: '从通信量、显存、bubble、拓扑和工程复杂度比较。' },
    ],
  },
  {
    key: 'cnn-cv',
    title: 'CNN / 视觉模型',
    tags: ['cnn', 'computer-vision', 'vision-model'],
    concepts: ['卷积', 'BatchNorm', 'ResNet', '检测', '分割'],
    whiteboardTemplate: 'solution_flow',
    followUps: ['如何解释感受野？', '训练和推理阶段有什么不同？', '如何做视觉模型的错误分析？'],
    items: [
      { id: 'conv-bn-relu', title: 'Conv-BN-ReLU 模块为什么常一起出现？', difficulty: 'easy', focus: '解释卷积局部性、归一化、非线性、训练稳定性和推理 BN folding。' },
      { id: 'resnet', title: 'ResNet 为什么能训练很深的网络？', difficulty: 'easy', focus: '从残差连接、梯度传播、恒等映射、退化问题和 bottleneck 结构说明。' },
      { id: 'detector', title: '目标检测系统如何设计训练和推理流程？', difficulty: 'medium', focus: '覆盖 backbone、FPN、anchor/anchor-free、NMS、mAP、数据增强和部署。' },
      { id: 'segmentation', title: '语义分割模型如何处理边界和小目标？', difficulty: 'medium', focus: '说明 encoder-decoder、skip connection、loss、class imbalance 和后处理。' },
      { id: 'augmentation', title: '视觉训练数据增强如何影响泛化？', difficulty: 'medium', focus: '比较 crop、mixup、cutmix、color jitter、auto augment 和分布偏移。' },
      { id: 'edge-deploy', title: 'CNN 模型部署到端侧如何优化？', difficulty: 'medium', focus: '覆盖量化、剪枝、算子支持、内存带宽、batch=1 延迟和功耗。' },
      { id: 'vit-vs-cnn', title: 'ViT 和 CNN 在归纳偏置上有什么差异？', difficulty: 'medium', focus: '讨论局部性、平移等变、数据规模、位置编码、复杂度和迁移。' },
      { id: 'fpn', title: 'FPN 为什么适合多尺度检测？', difficulty: 'medium', focus: '解释自顶向下路径、横向连接、语义/分辨率融合和小目标收益。' },
      { id: 'ocr', title: 'OCR 识别系统如何设计？', difficulty: 'medium', focus: '拆解文本检测、方向矫正、识别模型、语言模型纠错、评测和线上监控。' },
      { id: 'image-retrieval', title: '图片相似检索系统如何设计？', difficulty: 'medium', focus: '说明视觉 embedding、ANN、去重、过滤、重排、冷启动和版权/安全。' },
    ],
  },
  {
    key: 'npu-gpgpu',
    title: 'NPU / GPGPU / 性能优化',
    tags: ['npu', 'gpgpu', 'kernel', 'performance'],
    concepts: ['memory hierarchy', 'roofline', 'GEMM', 'DMA', 'collective'],
    whiteboardTemplate: 'pipeline',
    followUps: ['这个算子是算力瓶颈还是带宽瓶颈？', '如何设计 benchmark 才可信？', '换到 NPU 后哪些假设会失效？'],
    items: [
      { id: 'memory-hierarchy', title: 'GPGPU 内存层次如何影响 kernel 性能？', difficulty: 'medium', focus: '覆盖 global/shared/register/cache、coalescing、bank conflict 和 occupancy。' },
      { id: 'roofline', title: '如何用 roofline 模型分析算子瓶颈？', difficulty: 'medium', focus: '说明算术强度、带宽上限、峰值算力、测量方法和优化方向。' },
      { id: 'layernorm', title: 'LayerNorm kernel 如何优化？', difficulty: 'hard', focus: '讲清均值/方差归约、向量化、warp/block 切分、数值稳定和访存次数。' },
      { id: 'gemm-tiling', title: 'GEMM tiling 为什么是 GPU/NPU 性能核心？', difficulty: 'hard', focus: '解释 tile、shared memory、寄存器阻塞、Tensor Core/cube 单元和数据复用。' },
      { id: 'attention-kernel', title: 'FlashAttention 类 kernel 为什么更省显存？', difficulty: 'hard', focus: '从 online softmax、分块、HBM IO、重计算和数值稳定性解释。' },
      { id: 'npu-op-mapping', title: '算子迁移到 NPU 时如何做映射和切分？', difficulty: 'hard', focus: '讨论 cube/vector/scalar 单元、tiling、片上存储、DMA 和算子限制。' },
      { id: 'dma', title: 'NPU/GPU 中 DMA 与计算如何重叠？', difficulty: 'medium', focus: '说明 double buffering、stream、event、依赖、带宽和调试方法。' },
      { id: 'collective', title: '多卡训练 all-reduce 性能如何优化？', difficulty: 'hard', focus: '覆盖 ring/tree、拓扑、bucket、通信计算重叠、梯度压缩和故障定位。' },
      { id: 'heterogeneous', title: 'CPU/GPU/NPU 异构调度如何设计？', difficulty: 'medium', focus: '分析算子放置、数据搬运、队列、同步、fallback 和性能模型。' },
      { id: 'power', title: '如何在推理中平衡性能、功耗和成本？', difficulty: 'medium', focus: '讨论 batch、频率、量化、模型路由、SLO、利用率和能效指标。' },
    ],
  },
  {
    key: 'mlops-rag-system',
    title: 'MLOps / RAG / AI 系统设计',
    tags: ['mlops', 'rag', 'ai-system-design', 'evaluation'],
    concepts: ['评测平台', '模型监控', '特征平台', 'RAG', 'A/B 实验'],
    whiteboardTemplate: 'system_architecture',
    followUps: ['没有即时标签时如何评估？', '如何做安全灰度？', '哪个指标最容易误导？'],
    items: [
      { id: 'eval-platform', title: 'LLM 应用评测平台如何设计？', difficulty: 'hard', focus: '覆盖黄金集、自动评审、人审校准、回归测试、安全红队、成本和发布门禁。' },
      { id: 'monitoring', title: '生产模型监控和漂移响应如何设计？', difficulty: 'medium', focus: '说明数据质量、特征漂移、预测分布、业务 KPI、告警、回滚和无标签监控。' },
      { id: 'feature-store', title: '训练/在线一致的 Feature Store 如何设计？', difficulty: 'hard', focus: '覆盖 point-in-time、离线回填、在线低延迟、版本、血缘、权限和监控。' },
      { id: 'embedding-search', title: '语义向量检索系统如何设计？', difficulty: 'medium', focus: '说明 embedding、ANN、过滤、多租户、增量索引、召回评估和重排。' },
      { id: 'enterprise-rag', title: '企业知识库 RAG 助手如何设计？', difficulty: 'medium', focus: '拆解文档解析、chunk、embedding、权限、召回/重排、引用、幻觉和反馈。' },
      { id: 'recommendation-feed', title: '千万用户推荐 Feed 如何设计？', difficulty: 'medium', focus: '覆盖召回、粗排、精排、特征、冷启动、反馈闭环、实验和反作弊。' },
      { id: 'search-ranking', title: '电商搜索排序系统如何设计？', difficulty: 'medium', focus: '说明 query 理解、召回、多阶段排序、业务约束、指标和安全上线。' },
      { id: 'fraud', title: '实时风控模型系统如何设计？', difficulty: 'medium', focus: '覆盖流式特征、规则+模型、低延迟、误杀控制、人工审核和延迟标签。' },
      { id: 'ab-testing', title: 'AI 产品 A/B 实验平台如何设计？', difficulty: 'medium', focus: '讨论随机化、分层、样本量、guardrail、指标延迟、干扰和回滚。' },
      { id: 'governance', title: '企业 AI 平台的权限、隐私和审计如何设计？', difficulty: 'hard', focus: '覆盖数据分级、访问控制、日志脱敏、模型输出审计、合规和 incident 响应。' },
    ],
  },
]

const specs: InterviewSpec[] = modules.flatMap((module) => module.items.map((item) => ({
  id: `ai-interview-${module.key}-${item.id}`,
  title: `${module.title}：${item.title}`,
  difficulty: item.difficulty,
  tags: [...module.tags, module.key],
  prompt: `${item.focus}\n\n请从面试候选人的角度结构化回答：先澄清目标和约束，再给出核心原理/架构或推导，补充关键公式、指标、trade-off、失败模式和上线/验证方案。`,
  concepts: module.concepts,
  whiteboardTemplate: module.whiteboardTemplate,
  followUps: module.followUps,
})))

function descriptionFor(spec: InterviewSpec) {
  return `AI 面试题 / Agent 练习题。

题目：${spec.title}

要求：${spec.prompt}

答题建议：
- 先明确目标、约束、规模和成功指标。
- 按数据/模型/训练或推理/系统/评测/监控拆解。
- 必要时写出公式、复杂度、容量或延迟估算。
- 给出关键 trade-off、失败场景、排查路径和迭代方案。
- 可以直接在右侧 Arena Coach 中选择“苏格拉底 / 面试回答 / Ask”模式练习。`
}

export const aiInterviewChallenges: Challenge[] = specs.map((spec) => ({
  id: spec.id,
  title: spec.title,
  slug: spec.id,
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
  teaching_skills: ['explain_answer', 'step_derivation', 'socratic_questioning', 'debug_answer', 'concept_remediation', 'transfer_problem', 'whiteboard_architecture'],
  concepts: spec.concepts,
  rubric: [
    '澄清目标、约束、规模和成功指标。',
    '讲清核心原理、端到端架构或推导路径。',
    '给出公式、复杂度、容量、延迟或成本估算。',
    '说明 trade-off、瓶颈、监控、回滚和迭代方案。',
  ],
  follow_up_questions: spec.followUps,
  whiteboard_template: spec.whiteboardTemplate,
  published: true,
  created_at: createdAt,
  updated_at: createdAt,
}))
