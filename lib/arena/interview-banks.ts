import type { Challenge } from './types'

const createdAt = '2026-05-15T00:00:00.000Z'

type Difficulty = 'easy' | 'medium' | 'hard'
type Template = NonNullable<Challenge['whiteboard_template']>

type InterviewModule = {
  key: string
  title: string
  focus: string
  tags: string[]
  concepts: string[]
  whiteboardTemplate: Template
}

type QuestionPattern = {
  key: string
  difficulty: Difficulty
  title: string
  focus: string
}

type InterviewBank = {
  prefix: string
  category: string
  title: string
  tags: string[]
  count: number
  modules: InterviewModule[]
  patterns: QuestionPattern[]
}

const longPatterns: QuestionPattern[] = [
  { key: 'core-path', difficulty: 'easy', title: '核心职责、关键数据结构和调用路径分别是什么？', focus: '解释核心职责、关键对象、入口函数、状态流转和常见误区。' },
  { key: 'lifecycle', difficulty: 'medium', title: '从初始化到释放的完整生命周期如何设计？', focus: '覆盖初始化、注册、引用计数、并发访问、错误回滚和资源释放。' },
  { key: 'perf-debug', difficulty: 'hard', title: '出现性能抖动时如何定位根因？', focus: '说明观测指标、trace 点、二分路径、压测方法和修复验证。' },
  { key: 'race', difficulty: 'hard', title: '如何排查竞态、死锁或时序问题？', focus: '说明锁粒度、内存屏障、上下文限制、复现方法和最小修复。' },
  { key: 'failure', difficulty: 'medium', title: '线上偶发失败时你的 debug playbook 是什么？', focus: '从日志、trace、dump、复现、回滚、灰度和长期治理展开。' },
  { key: 'api-contract', difficulty: 'medium', title: '对外 API 或 ABI 契约应该如何定义？', focus: '说明边界条件、兼容性、错误码、权限、安全和版本演进。' },
  { key: 'latency', difficulty: 'hard', title: '如何分析端到端延迟和关键路径？', focus: '拆解同步/异步路径、排队、锁等待、缓存命中和硬件交互。' },
  { key: 'memory', difficulty: 'medium', title: '内存占用、生命周期和泄漏风险如何控制？', focus: '覆盖分配策略、所有权、缓存、碎片、泄漏检测和压力测试。' },
  { key: 'security', difficulty: 'medium', title: '需要考虑哪些权限、安全和隔离问题？', focus: '说明攻击面、权限边界、输入校验、信息泄露和防护策略。' },
  { key: 'testability', difficulty: 'easy', title: '如何设计单测、集成测试和回归测试？', focus: '给出可观测接口、mock/stub、故障注入、覆盖率和回归门禁。' },
  { key: 'bringup', difficulty: 'medium', title: '新平台 bring-up 时第一轮验证怎么做？', focus: '按最小链路、时钟/电源/依赖、日志开关和冒烟测试展开。' },
  { key: 'compat', difficulty: 'medium', title: '跨版本、跨平台兼容性如何保证？', focus: '说明 feature flag、能力探测、fallback、兼容矩阵和升级策略。' },
  { key: 'observability', difficulty: 'medium', title: '你会设计哪些观测指标和 trace 点？', focus: '覆盖关键事件、耗时、错误、资源、队列、采样和告警阈值。' },
  { key: 'bottleneck', difficulty: 'hard', title: '最可能的瓶颈在哪里，如何证明？', focus: '用实验设计、指标对比、火焰图/trace 和反事实验证证明瓶颈。' },
  { key: 'fallback', difficulty: 'medium', title: '异常情况下如何降级、恢复和保护用户体验？', focus: '讨论超时、重试、限流、隔离、回滚、数据一致性和用户可感知影响。' },
  { key: 'data-flow', difficulty: 'easy', title: '请画出数据流、控制流和状态机。', focus: '要求区分数据面、控制面、状态迁移、错误分支和异步回调。' },
  { key: 'compare', difficulty: 'medium', title: '和相邻方案相比取舍是什么？', focus: '比较复杂度、性能、稳定性、可维护性、成本和团队实施风险。' },
  { key: 'capacity', difficulty: 'hard', title: '容量、吞吐或规模扩大 10 倍后怎么改？', focus: '说明容量估算、热点拆分、缓存/批处理、调度和压测验证。' },
  { key: 'incident', difficulty: 'hard', title: '如果线上已经发生事故，你如何止血和复盘？', focus: '覆盖止血、证据保留、影响面评估、根因分析、修复和长期预防。' },
  { key: 'design-review', difficulty: 'medium', title: '做设计评审时你最关注哪几个问题？', focus: '从需求边界、关键路径、失败模式、可测性、可运维性和演进空间评审。' },
]

const shortPatterns = longPatterns.slice(0, 10)

const linuxModules: InterviewModule[] = [
  { key: 'drivers', title: '驱动模型', focus: 'platform/device/driver、probe/remove、devm、设备树、字符设备、sysfs/debugfs', tags: ['driver', 'device-tree'], concepts: ['probe/remove', 'devm', '设备树', 'sysfs', 'debugfs'], whiteboardTemplate: 'system_architecture' },
  { key: 'scheduler', title: '调度器', focus: 'CFS/EEVDF、vruntime、RT/deadline、负载均衡、NUMA、cgroup CPU、抢占', tags: ['scheduler', 'cfs'], concepts: ['CFS', 'EEVDF', 'vruntime', 'NUMA', 'cgroup'], whiteboardTemplate: 'solution_flow' },
  { key: 'memory', title: '内存管理', focus: '页表、伙伴系统、slab/slub、vmalloc、OOM、回收、NUMA、内存屏障', tags: ['memory-management', 'mm'], concepts: ['page table', 'slub', 'OOM', 'reclaim', 'NUMA'], whiteboardTemplate: 'pipeline' },
  { key: 'filesystem', title: '文件系统/VFS', focus: 'VFS、inode/dentry、page cache、writeback、journaling、overlayfs、FUSE', tags: ['vfs', 'filesystem'], concepts: ['inode', 'dentry', 'page cache', 'writeback', 'journal'], whiteboardTemplate: 'pipeline' },
  { key: 'networking', title: '网络协议栈', focus: 'NAPI、skb、qdisc、netfilter、TCP 拥塞控制、XDP/eBPF、零拷贝', tags: ['networking', 'xdp'], concepts: ['NAPI', 'skb', 'qdisc', 'TCP', 'XDP'], whiteboardTemplate: 'inference_flow' },
  { key: 'block-io', title: '块设备/I/O', focus: 'bio/request、blk-mq、I/O scheduler、NVMe、DMA、flush/FUA、io_uring', tags: ['block', 'io'], concepts: ['blk-mq', 'NVMe', 'DMA', 'io_uring', 'flush'], whiteboardTemplate: 'pipeline' },
  { key: 'sync-irq', title: '中断/同步/时钟', focus: 'hardirq/softirq/tasklet/workqueue、spinlock/mutex/RCU、hrtimer、NO_HZ', tags: ['irq', 'locking'], concepts: ['softirq', 'workqueue', 'RCU', 'spinlock', 'hrtimer'], whiteboardTemplate: 'solution_flow' },
  { key: 'debug-tracing', title: 'Debug/Tracing', focus: 'ftrace、perf、kprobe/uprobes、tracepoints、crash dump、lockdep、kmemleak', tags: ['debug', 'tracing'], concepts: ['ftrace', 'perf', 'kprobe', 'lockdep', 'crash dump'], whiteboardTemplate: 'evaluation_loop' },
  { key: 'stability-power', title: '稳定性/电源管理', focus: 'suspend/resume、runtime PM、thermal、watchdog、panic、hung task、reboot reason', tags: ['stability', 'power-management'], concepts: ['runtime PM', 'suspend', 'thermal', 'watchdog', 'panic'], whiteboardTemplate: 'evaluation_loop' },
  { key: 'boot-security', title: '启动/安全/容器', focus: 'bootloader、initcall、module loading、LSM、namespaces、cgroups、seccomp、capability', tags: ['boot', 'security'], concepts: ['initcall', 'LSM', 'namespace', 'cgroup', 'seccomp'], whiteboardTemplate: 'system_architecture' },
  { key: 'smmu-iommu', title: 'SMMU/IOMMU', focus: 'ARM SMMU、IOMMU domain、stream ID、IOVA、map/unmap、ATS/PRI、设备隔离和 DMA fault', tags: ['smmu', 'iommu'], concepts: ['SMMU', 'IOMMU domain', 'stream ID', 'IOVA', 'DMA fault'], whiteboardTemplate: 'system_architecture' },
  { key: 'dma', title: 'DMA 子系统', focus: 'dma_map、coherent/streaming DMA、cache maintenance、scatter-gather、DMAengine、IOMMU 和 bounce buffer', tags: ['dma', 'dmaengine'], concepts: ['dma_map', 'coherent DMA', 'scatter-gather', 'DMAengine', 'cache maintenance'], whiteboardTemplate: 'pipeline' },
  { key: 'pcie', title: 'PCIe 子系统', focus: '枚举、BAR、MSI/MSI-X、ASPM、AER、热插拔、ATS/PRI、endpoint/root complex 驱动', tags: ['pcie', 'aer'], concepts: ['BAR', 'MSI-X', 'ASPM', 'AER', 'root complex'], whiteboardTemplate: 'pipeline' },
  { key: 'v4l2-media', title: 'V4L2/Media', focus: 'V4L2 device/subdev、media controller、vb2 buffer、mmap/userptr/dmabuf、pipeline link 和 streaming', tags: ['v4l2', 'media'], concepts: ['V4L2', 'media controller', 'vb2', 'dmabuf', 'subdev'], whiteboardTemplate: 'pipeline' },
  { key: 'usb', title: 'USB 框架', focus: 'USB core、host controller、URB、endpoint、descriptor、gadget、Type-C/PD 和 autosuspend', tags: ['usb', 'gadget'], concepts: ['URB', 'endpoint', 'descriptor', 'gadget', 'Type-C'], whiteboardTemplate: 'pipeline' },
  { key: 'tty-terminal', title: 'TTY/终端', focus: 'TTY core、line discipline、console、pty、termios、串口驱动、输入输出缓冲和 hangup', tags: ['tty', 'serial'], concepts: ['TTY', 'line discipline', 'pty', 'termios', 'console'], whiteboardTemplate: 'solution_flow' },
]

const androidModules: InterviewModule[] = [
  { key: 'app', title: '应用开发', focus: 'Activity/Fragment 生命周期、Jetpack、协程、ANR、启动优化、内存泄漏', tags: ['android-app', 'jetpack'], concepts: ['Activity', 'Fragment', 'ANR', 'Coroutine', 'Leak'], whiteboardTemplate: 'solution_flow' },
  { key: 'binder', title: 'Binder/IPC', focus: 'Binder 驱动、ServiceManager、AIDL、线程池、死亡通知、权限校验', tags: ['binder', 'ipc'], concepts: ['Binder', 'AIDL', 'ServiceManager', 'thread pool', 'death recipient'], whiteboardTemplate: 'inference_flow' },
  { key: 'framework', title: 'Framework', focus: 'AMS/WMS/PMS、Zygote、SystemServer、四大组件启动和系统服务注册', tags: ['framework', 'system-server'], concepts: ['AMS', 'WMS', 'PMS', 'Zygote', 'SystemServer'], whiteboardTemplate: 'system_architecture' },
  { key: 'camera', title: 'Camera', focus: 'Camera2 API、CameraService、HAL3、request/result、ISP pipeline、buffer queue', tags: ['camera', 'hal'], concepts: ['Camera2', 'HAL3', 'ISP', 'BufferQueue', 'request/result'], whiteboardTemplate: 'pipeline' },
  { key: 'audio', title: 'Audio', focus: 'AudioFlinger、AudioPolicy、HAL、AudioTrack/Record、低延迟、路由和焦点', tags: ['audio', 'media'], concepts: ['AudioFlinger', 'AudioPolicy', 'HAL', 'AudioTrack', 'routing'], whiteboardTemplate: 'pipeline' },
  { key: 'video', title: 'Video/Media', focus: 'MediaCodec、Codec2、Extractor/Muxer、Surface、DRM、低延迟播放', tags: ['video', 'mediacodec'], concepts: ['MediaCodec', 'Codec2', 'Surface', 'DRM', 'Extractor'], whiteboardTemplate: 'pipeline' },
  { key: 'graphics', title: 'Graphics/Display', focus: 'SurfaceFlinger、HWComposer、BufferQueue、VSYNC、Choreographer、合成和掉帧', tags: ['graphics', 'display'], concepts: ['SurfaceFlinger', 'HWC', 'VSYNC', 'BufferQueue', 'Choreographer'], whiteboardTemplate: 'inference_flow' },
  { key: 'ai-runtime', title: 'AI 推理框架', focus: 'NNAPI、TFLite、Hexagon/NPU delegate、模型量化、内存拷贝和异构调度', tags: ['nnapi', 'ai-runtime'], concepts: ['NNAPI', 'TFLite', 'delegate', 'NPU', 'quantization'], whiteboardTemplate: 'inference_flow' },
  { key: 'bsp', title: 'BSP/Bring-up', focus: 'bootloader、kernel、device tree、SELinux、init.rc、vendor HAL、OTA 和 CTS/VTS', tags: ['bsp', 'bringup'], concepts: ['bootloader', 'device tree', 'SELinux', 'HAL', 'CTS/VTS'], whiteboardTemplate: 'system_architecture' },
  { key: 'perf-stability', title: '性能/稳定性', focus: 'ANR/tombstone、Perfetto、Systrace、memory pressure、thermal、功耗和线上监控', tags: ['perfetto', 'stability'], concepts: ['Perfetto', 'tombstone', 'thermal', 'memory pressure', 'ANR'], whiteboardTemplate: 'evaluation_loop' },
]

const aiInfraModules: InterviewModule[] = [
  { key: 'pcie-cxl', title: 'PCIe/CXL', focus: 'PCIe 枚举、BAR、MSI-X、DMA、ATS/PRI、CXL.cache/mem 和链路训练', tags: ['pcie', 'cxl'], concepts: ['BAR', 'MSI-X', 'DMA', 'ATS', 'CXL'], whiteboardTemplate: 'pipeline' },
  { key: 'rdma', title: 'RDMA/RoCE', focus: 'QP/CQ/MR、RDMA read/write/send、RoCEv2、PFC/ECN、拥塞和注册内存', tags: ['rdma', 'roce'], concepts: ['QP', 'CQ', 'MR', 'RoCE', 'PFC/ECN'], whiteboardTemplate: 'inference_flow' },
  { key: 'network', title: '高性能网络', focus: 'DPDK、XDP、RSS、ECMP、RDMA 网络、拥塞控制、包转发和丢包定位', tags: ['networking', 'dpdk'], concepts: ['DPDK', 'XDP', 'RSS', 'ECMP', 'congestion'], whiteboardTemplate: 'pipeline' },
  { key: 'cluster', title: 'GPU/NPU 集群', focus: 'NVLink/IB、拓扑感知调度、AllReduce、MIG、多租户隔离和故障域', tags: ['gpu-cluster', 'npu'], concepts: ['NVLink', 'InfiniBand', 'AllReduce', 'MIG', 'topology'], whiteboardTemplate: 'system_architecture' },
  { key: 'storage', title: '数据/存储管道', focus: 'NVMe-oF、对象存储、数据预取、checkpoint、训练数据吞吐和缓存层级', tags: ['storage', 'data-pipeline'], concepts: ['NVMe-oF', 'checkpoint', 'prefetch', 'object storage', 'cache'], whiteboardTemplate: 'pipeline' },
  { key: 'scheduler', title: '调度与资源管理', focus: 'Kubernetes、Slurm、队列、配额、Gang scheduling、弹性训练和抢占', tags: ['scheduler', 'kubernetes'], concepts: ['Kubernetes', 'Slurm', 'quota', 'gang scheduling', 'preemption'], whiteboardTemplate: 'system_architecture' },
  { key: 'observability', title: '可观测性', focus: 'GPU/NIC/PCIe 指标、分布式 trace、profiling、告警、根因分析和容量预测', tags: ['observability', 'sre'], concepts: ['metrics', 'trace', 'profiling', 'alert', 'RCA'], whiteboardTemplate: 'evaluation_loop' },
  { key: 'serving', title: '推理平台', focus: '模型路由、KV cache、批处理、弹性扩缩、成本治理、多模型灰度和 SLA', tags: ['serving', 'llm-inference'], concepts: ['routing', 'KV cache', 'batching', 'autoscaling', 'SLA'], whiteboardTemplate: 'inference_flow' },
  { key: 'security', title: '安全与多租户', focus: '租户隔离、GPU/NIC 共享、密钥、镜像供应链、审计和数据访问控制', tags: ['security', 'multi-tenant'], concepts: ['isolation', 'audit', 'supply chain', 'secret', 'ACL'], whiteboardTemplate: 'system_architecture' },
  { key: 'incident', title: '故障演练', focus: '节点故障、链路降速、拥塞、OOM、驱动重置、checkpoint 恢复和复盘', tags: ['incident', 'reliability'], concepts: ['fault domain', 'checkpoint', 'OOM', 'driver reset', 'postmortem'], whiteboardTemplate: 'evaluation_loop' },
]

const icModules: InterviewModule[] = [
  { key: 'spec-arch', title: '规格/架构', focus: 'PRD 到 micro-architecture、接口协议、吞吐/面积/功耗约束和架构评审', tags: ['architecture', 'spec'], concepts: ['micro-architecture', 'PPA', 'interface', 'review', 'constraint'], whiteboardTemplate: 'system_architecture' },
  { key: 'rtl', title: 'RTL 设计', focus: 'Verilog/SystemVerilog、FSM、流水线、握手、复位、时钟门控和可综合编码', tags: ['rtl', 'verilog'], concepts: ['FSM', 'pipeline', 'handshake', 'reset', 'clock gating'], whiteboardTemplate: 'solution_flow' },
  { key: 'cdc-rdc', title: 'CDC/RDC', focus: '异步 FIFO、同步器、reset crossing、metastability、CDC waiver 和 formal 检查', tags: ['cdc', 'rdc'], concepts: ['async FIFO', 'synchronizer', 'metastability', 'waiver', 'formal'], whiteboardTemplate: 'pipeline' },
  { key: 'dv-uvm', title: 'DV/UVM', focus: 'UVM testbench、sequence、scoreboard、coverage、constraint random、assertion 和 regression', tags: ['uvm', 'verification'], concepts: ['UVM', 'scoreboard', 'coverage', 'SVA', 'regression'], whiteboardTemplate: 'evaluation_loop' },
  { key: 'dft', title: 'DFT', focus: 'scan、MBIST/LBIST、ATPG、test coverage、JTAG、压缩和 bring-up 可测性', tags: ['dft', 'atpg'], concepts: ['scan', 'MBIST', 'ATPG', 'JTAG', 'coverage'], whiteboardTemplate: 'pipeline' },
  { key: 'sta', title: '综合/STA', focus: 'SDC、setup/hold、multi-cycle/false path、OCV、ECO 和 timing closure', tags: ['sta', 'synthesis'], concepts: ['SDC', 'setup/hold', 'OCV', 'ECO', 'timing closure'], whiteboardTemplate: 'evaluation_loop' },
  { key: 'pd', title: '后端/物理设计', focus: 'floorplan、placement、CTS、routing、congestion、macro、clock tree 和 PPA 收敛', tags: ['physical-design', 'pd'], concepts: ['floorplan', 'CTS', 'routing', 'congestion', 'PPA'], whiteboardTemplate: 'pipeline' },
  { key: 'power-signoff', title: '低功耗/Signoff', focus: 'UPF、power domain、level shifter、isolation、IR drop、EM、功耗分析', tags: ['low-power', 'signoff'], concepts: ['UPF', 'power domain', 'IR drop', 'EM', 'isolation'], whiteboardTemplate: 'evaluation_loop' },
  { key: 'dfm-tapeout', title: 'DFM/流片', focus: 'DRC/LVS/ERC、antenna、density、metal fill、mask、tapeout checklist 和风险签核', tags: ['dfm', 'tapeout'], concepts: ['DRC', 'LVS', 'antenna', 'metal fill', 'checklist'], whiteboardTemplate: 'evaluation_loop' },
  { key: 'silicon', title: '硅后验证', focus: 'bring-up、ATE、JTAG、scan dump、性能/功耗实测、bug 归因和 ECO 策略', tags: ['post-silicon', 'bringup'], concepts: ['ATE', 'JTAG', 'bring-up', 'ECO', 'silicon debug'], whiteboardTemplate: 'pipeline' },
  { key: 'smmu-ip', title: 'SMMU/IOMMU IP', focus: 'context bank、stream table、TLB、page table walker、ATS/PRI、fault reporting 和 coherency', tags: ['smmu', 'iommu'], concepts: ['context bank', 'stream table', 'TLB', 'PTW', 'ATS/PRI'], whiteboardTemplate: 'system_architecture' },
  { key: 'dma-ip', title: 'DMA IP', focus: 'descriptor ring、scatter-gather、AXI master、interrupt coalescing、cache coherency、backpressure 和 QoS', tags: ['dma', 'axi'], concepts: ['descriptor ring', 'scatter-gather', 'AXI master', 'coherency', 'QoS'], whiteboardTemplate: 'pipeline' },
  { key: 'axi', title: 'AXI/ACE/CHI 协议', focus: 'AXI channels、burst、ID/order、outstanding、ACE snoop、CHI transaction 和 deadlock avoidance', tags: ['axi', 'protocol'], concepts: ['AXI channel', 'burst', 'outstanding', 'ACE', 'CHI'], whiteboardTemplate: 'inference_flow' },
  { key: 'cmn-noc', title: 'CMN/NoC', focus: 'ARM CMN、mesh NoC、RN/HN/SN、home node、snoop filter、QoS、路由和拥塞控制', tags: ['cmn', 'noc'], concepts: ['CMN', 'mesh NoC', 'home node', 'snoop filter', 'QoS'], whiteboardTemplate: 'system_architecture' },
  { key: 'ddr-memory-ip', title: 'DDR/内存控制器 IP', focus: 'DDR controller、PHY training、refresh、bank conflict、QoS、ECC、DFI 和带宽/延迟权衡', tags: ['ddr', 'memory-controller'], concepts: ['DDR controller', 'PHY training', 'refresh', 'ECC', 'DFI'], whiteboardTemplate: 'pipeline' },
]

const hardwareModules: InterviewModule[] = [
  { key: 'schematic', title: '原理图设计', focus: '需求分解、器件选型、接口保护、复位/启动、可测点和设计评审', tags: ['schematic', 'bringup'], concepts: ['component selection', 'reset', 'protection', 'test point', 'review'], whiteboardTemplate: 'system_architecture' },
  { key: 'pcb', title: 'PCB Layout', focus: '叠层、阻抗、走线、回流路径、分区、过孔、DFM 和装配约束', tags: ['pcb', 'layout'], concepts: ['stackup', 'impedance', 'return path', 'via', 'DFM'], whiteboardTemplate: 'pipeline' },
  { key: 'si-pi', title: 'SI/PI', focus: '反射、串扰、眼图、PDN、去耦、SSN、仿真和实测对齐', tags: ['signal-integrity', 'power-integrity'], concepts: ['eye diagram', 'crosstalk', 'PDN', 'decoupling', 'SSN'], whiteboardTemplate: 'evaluation_loop' },
  { key: 'power', title: '电源模块', focus: 'Buck/LDO、负载瞬态、纹波、效率、热设计、保护和上电时序', tags: ['power', 'pmic'], concepts: ['Buck', 'LDO', 'ripple', 'thermal', 'power sequence'], whiteboardTemplate: 'pipeline' },
  { key: 'clock', title: '时钟/复位', focus: '晶振、PLL、jitter、skew、时钟树、复位释放和跨时钟域风险', tags: ['clock', 'reset'], concepts: ['PLL', 'jitter', 'skew', 'clock tree', 'reset'], whiteboardTemplate: 'solution_flow' },
  { key: 'high-speed', title: '高速接口', focus: 'PCIe/USB/HDMI/MIPI/DDR、阻抗、训练、均衡、眼图和协议分析', tags: ['high-speed', 'ddr'], concepts: ['PCIe', 'USB', 'MIPI', 'DDR', 'equalization'], whiteboardTemplate: 'inference_flow' },
  { key: 'analog-rf', title: '模拟/RF', focus: 'ADC/DAC、运放、滤波、噪声、EMI、天线匹配和射频调试', tags: ['analog', 'rf'], concepts: ['ADC', 'op amp', 'noise', 'filter', 'matching'], whiteboardTemplate: 'solution_flow' },
  { key: 'fpga-mcu', title: 'MCU/FPGA', focus: '启动、外设、DMA、中断、FPGA 时序、约束、在线升级和调试接口', tags: ['mcu', 'fpga'], concepts: ['DMA', 'interrupt', 'timing constraint', 'boot', 'JTAG'], whiteboardTemplate: 'system_architecture' },
  { key: 'debug-production', title: '调试/量产', focus: 'bring-up、示波器/逻辑分析仪、ICT/FCT、良率、失效分析和工装', tags: ['debug', 'production'], concepts: ['bring-up', 'oscilloscope', 'ICT', 'yield', 'failure analysis'], whiteboardTemplate: 'evaluation_loop' },
  { key: 'emc-safety', title: 'EMC/安规', focus: 'ESD/EFT/Surge、辐射/传导、接地屏蔽、热安全、认证和整改', tags: ['emc', 'safety'], concepts: ['ESD', 'EFT', 'Surge', 'grounding', 'certification'], whiteboardTemplate: 'evaluation_loop' },
]

const virtualizationModules: InterviewModule[] = [
  { key: 'cpu', title: 'CPU 虚拟化', focus: 'VMX/SVM、VM-exit、特权指令、EPT/NPT、nested virtualization 和调度', tags: ['cpu-virtualization', 'vmx'], concepts: ['VM-exit', 'EPT', 'NPT', 'nested', 'vCPU'], whiteboardTemplate: 'inference_flow' },
  { key: 'memory', title: '内存虚拟化', focus: '影子页表、二级页表、TLB shootdown、balloon、hugepage、NUMA 和 overcommit', tags: ['memory-virtualization', 'ept'], concepts: ['shadow page table', 'EPT', 'TLB', 'balloon', 'hugepage'], whiteboardTemplate: 'pipeline' },
  { key: 'interrupt', title: '中断虚拟化', focus: 'APIC/vAPIC、posted interrupt、MSI-X、IRQ routing、timer 和中断风暴', tags: ['interrupt', 'apic'], concepts: ['APIC', 'posted interrupt', 'MSI-X', 'timer', 'IRQ routing'], whiteboardTemplate: 'inference_flow' },
  { key: 'io', title: 'I/O 虚拟化', focus: 'virtio、vhost、VFIO、SR-IOV、IOMMU、设备直通和安全隔离', tags: ['virtio', 'vfio'], concepts: ['virtio', 'vhost', 'VFIO', 'SR-IOV', 'IOMMU'], whiteboardTemplate: 'system_architecture' },
  { key: 'kvm-qemu', title: 'KVM/QEMU', focus: 'KVM ioctl、QEMU device model、TCG/KVM、machine type、migration 和 monitor', tags: ['kvm', 'qemu'], concepts: ['KVM ioctl', 'QEMU', 'TCG', 'migration', 'device model'], whiteboardTemplate: 'system_architecture' },
  { key: 'xen', title: 'Xen', focus: 'type-1 hypervisor、Dom0/DomU、PV/HVM、grant table、event channel 和 toolstack', tags: ['xen', 'hypervisor'], concepts: ['Dom0', 'DomU', 'PV', 'HVM', 'grant table'], whiteboardTemplate: 'system_architecture' },
  { key: 'pkvm-tee', title: 'pKVM/TEE', focus: 'Android pKVM、stage-2、内存捐赠、EL2 隔离、TEE/TrustZone 和攻击面', tags: ['pkvm', 'tee'], concepts: ['pKVM', 'stage-2', 'EL2', 'TrustZone', 'memory donation'], whiteboardTemplate: 'system_architecture' },
  { key: 'l4re', title: 'L4Re/微内核', focus: 'capability、IPC、用户态服务、驱动隔离、实时性和可信计算基缩小', tags: ['l4re', 'microkernel'], concepts: ['capability', 'IPC', 'user-space driver', 'TCB', 'realtime'], whiteboardTemplate: 'solution_flow' },
  { key: 'container-vm', title: '容器与虚拟机', focus: 'namespace/cgroup、rootless、Kata/gVisor、Firecracker、隔离强度和启动延迟', tags: ['container', 'microvm'], concepts: ['namespace', 'cgroup', 'Kata', 'gVisor', 'Firecracker'], whiteboardTemplate: 'system_architecture' },
  { key: 'live-debug', title: '迁移/性能/Debug', focus: 'live migration、dirty page tracking、virtio 性能、steal time、trace 和故障恢复', tags: ['migration', 'debug'], concepts: ['live migration', 'dirty page', 'steal time', 'trace', 'recovery'], whiteboardTemplate: 'evaluation_loop' },
]

const programmingModules: InterviewModule[] = [
  { key: 'c-memory', title: 'C 内存/指针', focus: '指针、数组、生命周期、malloc/free、UB、对齐、restrict 和 volatile', tags: ['c', 'memory'], concepts: ['pointer', 'malloc', 'UB', 'alignment', 'volatile'], whiteboardTemplate: 'solution_flow' },
  { key: 'cpp-object', title: 'C++ 对象模型', focus: 'RAII、构造析构、拷贝/移动、虚函数、vtable、异常安全和智能指针', tags: ['cpp', 'object-model'], concepts: ['RAII', 'move', 'vtable', 'exception safety', 'smart pointer'], whiteboardTemplate: 'solution_flow' },
  { key: 'cpp-concurrency', title: 'C++ 并发', focus: 'thread、mutex、condition_variable、atomic、memory order、future 和 lock-free', tags: ['cpp', 'concurrency'], concepts: ['mutex', 'atomic', 'memory order', 'condition_variable', 'lock-free'], whiteboardTemplate: 'pipeline' },
  { key: 'stl', title: 'STL/算法', focus: 'vector/map/unordered_map、迭代器失效、复杂度、排序、堆和自定义比较器', tags: ['stl', 'algorithm'], concepts: ['vector', 'map', 'iterator invalidation', 'sort', 'heap'], whiteboardTemplate: 'solution_flow' },
  { key: 'python-runtime', title: 'Python Runtime', focus: '对象模型、引用计数、GC、descriptor、decorator、iterator/generator 和 import', tags: ['python', 'runtime'], concepts: ['refcount', 'GC', 'descriptor', 'generator', 'import'], whiteboardTemplate: 'solution_flow' },
  { key: 'python-async', title: 'Python 并发/异步', focus: 'GIL、threading、multiprocessing、asyncio、event loop、协程和性能边界', tags: ['python', 'asyncio'], concepts: ['GIL', 'asyncio', 'event loop', 'multiprocessing', 'coroutine'], whiteboardTemplate: 'pipeline' },
  { key: 'systems', title: '系统编程', focus: '进程/线程、socket、epoll、文件描述符、信号、mmap、IPC 和错误处理', tags: ['systems', 'linux'], concepts: ['epoll', 'socket', 'mmap', 'signal', 'IPC'], whiteboardTemplate: 'system_architecture' },
  { key: 'dsa', title: '数据结构/算法', focus: '数组、链表、树、图、动态规划、双指针、哈希、复杂度和边界条件', tags: ['dsa', 'algorithm'], concepts: ['tree', 'graph', 'DP', 'hash', 'complexity'], whiteboardTemplate: 'solution_flow' },
  { key: 'debug-test', title: '调试/测试', focus: 'gdb/lldb、sanitizer、core dump、单测、mock、fuzz、CI 和回归定位', tags: ['debug', 'testing'], concepts: ['gdb', 'sanitizer', 'core dump', 'fuzz', 'CI'], whiteboardTemplate: 'evaluation_loop' },
  { key: 'perf-security', title: '性能/安全', focus: 'cache locality、profiling、内存越界、整数溢出、注入、序列化和安全编码', tags: ['performance', 'security'], concepts: ['cache locality', 'profiling', 'overflow', 'injection', 'serialization'], whiteboardTemplate: 'evaluation_loop' },
]

const armRiscvModules: InterviewModule[] = [
  { key: 'isa', title: 'ISA/特权架构', focus: 'ARMv8/AArch64、RISC-V RV64、EL/M/S/U privilege、异常级切换和系统寄存器', tags: ['arm', 'riscv', 'isa'], concepts: ['AArch64', 'RV64', 'EL', 'privilege', 'CSR'], whiteboardTemplate: 'solution_flow' },
  { key: 'exception-interrupt', title: '异常/中断', focus: 'ARM GIC、RISC-V CLINT/PLIC/AIA、向量表、优先级、嵌套、中断延迟和上下文保存', tags: ['interrupt', 'gic', 'plic'], concepts: ['GIC', 'PLIC', 'AIA', 'vector table', 'interrupt latency'], whiteboardTemplate: 'inference_flow' },
  { key: 'mmu-tlb', title: 'MMU/TLB', focus: '页表格式、stage-1/stage-2、ASID/VMID、TLB shootdown、page attribute 和 huge page', tags: ['mmu', 'tlb'], concepts: ['page table', 'stage-2', 'ASID', 'VMID', 'TLB'], whiteboardTemplate: 'pipeline' },
  { key: 'cache-coherency', title: 'Cache/一致性', focus: 'cache hierarchy、MESI/MOESI、barrier、shareability、snoop、DMA coherency 和 false sharing', tags: ['cache', 'coherency'], concepts: ['MESI', 'barrier', 'shareability', 'snoop', 'DMA coherency'], whiteboardTemplate: 'system_architecture' },
  { key: 'atomic-memory-model', title: '原子/内存模型', focus: 'ARM acquire/release、RISC-V aq/rl、fence、LL/SC、AMO、锁实现和乱序可见性', tags: ['atomic', 'memory-model'], concepts: ['acquire/release', 'fence', 'LL/SC', 'AMO', 'memory order'], whiteboardTemplate: 'solution_flow' },
  { key: 'boot-reset', title: '启动/复位', focus: 'reset vector、SPL/BL、EL3/EL2/EL1、RISC-V M-mode、设备树/ACPI 和 SMP bring-up', tags: ['boot', 'smp'], concepts: ['reset vector', 'EL3', 'M-mode', 'device tree', 'SMP'], whiteboardTemplate: 'pipeline' },
  { key: 'security', title: '安全扩展', focus: 'TrustZone、ARM CCA/RME、PMP/ePMP、TEE、secure monitor、memory attribution 和攻击面', tags: ['trustzone', 'security'], concepts: ['TrustZone', 'RME', 'PMP', 'TEE', 'secure monitor'], whiteboardTemplate: 'system_architecture' },
  { key: 'vector-simd', title: '向量/SIMD', focus: 'NEON/SVE/SVE2、RISC-V Vector、VL、predicate、alignment、吞吐和编译器自动向量化', tags: ['simd', 'vector'], concepts: ['NEON', 'SVE', 'RVV', 'predicate', 'auto-vectorization'], whiteboardTemplate: 'pipeline' },
  { key: 'debug-trace', title: 'Debug/Trace', focus: 'JTAG、CoreSight、ETM/STM、RISC-V debug module、trace buffer、watchpoint 和性能计数器', tags: ['debug', 'trace'], concepts: ['JTAG', 'CoreSight', 'ETM', 'debug module', 'PMU'], whiteboardTemplate: 'evaluation_loop' },
  { key: 'virtualization', title: '虚拟化扩展', focus: 'ARM EL2/stage-2、GIC virtualization、RISC-V H extension、vCPU trap、IOMMU 和设备直通', tags: ['virtualization', 'el2'], concepts: ['EL2', 'stage-2', 'GICv', 'H extension', 'trap'], whiteboardTemplate: 'system_architecture' },
]

const firmwareModules: InterviewModule[] = [
  { key: 'boot-flow', title: '启动流程', focus: 'BootROM、SPL/TPL、U-Boot proper、UEFI SEC/PEI/DXE/BDS、handoff 和 boot args', tags: ['bootloader', 'boot-flow'], concepts: ['BootROM', 'SPL', 'DXE', 'BDS', 'handoff'], whiteboardTemplate: 'pipeline' },
  { key: 'uboot', title: 'U-Boot', focus: 'driver model、device tree、environment、bootcmd、FIT image、bootm/booti、SPL size 和 board porting', tags: ['u-boot', 'spl'], concepts: ['driver model', 'device tree', 'FIT', 'bootcmd', 'SPL'], whiteboardTemplate: 'system_architecture' },
  { key: 'uefi', title: 'UEFI', focus: 'Boot Services、Runtime Services、protocol/handle、HOB、ACPI/SMBIOS、Secure Boot 和 capsule update', tags: ['uefi', 'edk2'], concepts: ['Boot Services', 'Runtime Services', 'protocol', 'ACPI', 'Secure Boot'], whiteboardTemplate: 'system_architecture' },
  { key: 'secure-boot', title: '安全启动', focus: 'ROM trust anchor、签名链、FIT/UEFI Secure Boot、rollback protection、key ladder 和 fuse/OTP', tags: ['secure-boot', 'crypto'], concepts: ['trust anchor', 'signature chain', 'rollback', 'fuse', 'key ladder'], whiteboardTemplate: 'pipeline' },
  { key: 'device-init', title: '早期硬件初始化', focus: 'DDR training、PMIC、clock/reset、pinmux、PCIe/USB init、console 和 board id', tags: ['bringup', 'ddr-training'], concepts: ['DDR training', 'PMIC', 'clock', 'pinmux', 'console'], whiteboardTemplate: 'pipeline' },
  { key: 'acpi-dt', title: 'ACPI/Device Tree', focus: 'DTB、overlay、ACPI table、AML、硬件描述边界、Linux handoff 和兼容性', tags: ['acpi', 'device-tree'], concepts: ['DTB', 'overlay', 'ACPI', 'AML', 'handoff'], whiteboardTemplate: 'solution_flow' },
  { key: 'update-recovery', title: '升级/恢复', focus: 'A/B slot、OTA、capsule、recovery mode、watchdog、断电保护和回滚策略', tags: ['ota', 'recovery'], concepts: ['A/B slot', 'capsule', 'watchdog', 'rollback', 'recovery'], whiteboardTemplate: 'evaluation_loop' },
  { key: 'debug', title: '固件 Debug', focus: '串口、JTAG、semihosting、early log、panic reset reason、trace buffer 和 QEMU 仿真', tags: ['firmware-debug', 'jtag'], concepts: ['UART', 'JTAG', 'early log', 'reset reason', 'QEMU'], whiteboardTemplate: 'evaluation_loop' },
  { key: 'uefi-uboot-choice', title: 'U-Boot/UEFI 取舍', focus: '嵌入式与服务器启动差异、标准 API、驱动模型、体积、生态、调试和认证要求', tags: ['u-boot', 'uefi'], concepts: ['standard API', 'driver model', 'footprint', 'ecosystem', 'certification'], whiteboardTemplate: 'solution_flow' },
  { key: 'platform-porting', title: '平台移植', focus: '新增 SoC/board、Kconfig、defconfig、linker script、memory map、clock tree 和 upstream 策略', tags: ['porting', 'soc'], concepts: ['Kconfig', 'defconfig', 'memory map', 'clock tree', 'upstream'], whiteboardTemplate: 'pipeline' },
]

const rtosModules: InterviewModule[] = [
  { key: 'scheduler', title: '调度器', focus: 'FreeRTOS priority scheduler、Zephyr scheduler、tick/tickless、preemption、timeslice 和实时性', tags: ['scheduler', 'freertos', 'zephyr'], concepts: ['priority', 'tickless', 'preemption', 'timeslice', 'latency'], whiteboardTemplate: 'solution_flow' },
  { key: 'tasks', title: '任务/线程', focus: 'task/thread lifecycle、stack、priority inversion、idle task、hook、context switch 和栈溢出检测', tags: ['task', 'thread'], concepts: ['task lifecycle', 'stack', 'context switch', 'idle task', 'stack overflow'], whiteboardTemplate: 'pipeline' },
  { key: 'ipc-sync', title: 'IPC/同步', focus: 'queue、semaphore、mutex、event group、message queue、mailbox、priority inheritance 和 ISR safe API', tags: ['ipc', 'sync'], concepts: ['queue', 'semaphore', 'mutex', 'event group', 'priority inheritance'], whiteboardTemplate: 'pipeline' },
  { key: 'memory', title: '内存管理', focus: 'FreeRTOS heap_1-5、Zephyr k_heap/slab/mempool、静态分配、碎片、MPU 和内存保护', tags: ['memory', 'heap'], concepts: ['heap_4', 'slab', 'mempool', 'MPU', 'fragmentation'], whiteboardTemplate: 'evaluation_loop' },
  { key: 'interrupt', title: '中断与延迟', focus: 'ISR、deferred work、bottom half、critical section、interrupt latency、jitter 和优先级屏蔽', tags: ['interrupt', 'latency'], concepts: ['ISR', 'deferred work', 'critical section', 'jitter', 'latency'], whiteboardTemplate: 'inference_flow' },
  { key: 'drivers', title: '驱动模型', focus: 'Zephyr device model/devicetree、FreeRTOS HAL、GPIO/I2C/SPI/UART、DMA、power management 和 async API', tags: ['driver', 'devicetree'], concepts: ['devicetree', 'HAL', 'I2C', 'SPI', 'DMA'], whiteboardTemplate: 'system_architecture' },
  { key: 'network-fs', title: '网络/文件系统', focus: 'TCP/IP stack、MQTT、BLE、littlefs/FATFS、flash wear leveling、socket 和 buffer 管理', tags: ['network', 'filesystem'], concepts: ['TCP/IP', 'MQTT', 'BLE', 'littlefs', 'wear leveling'], whiteboardTemplate: 'pipeline' },
  { key: 'low-power', title: '低功耗', focus: 'tickless idle、sleep state、wakeup source、clock gating、PM policy、设备 runtime PM 和功耗测量', tags: ['low-power', 'pm'], concepts: ['tickless', 'wakeup source', 'clock gating', 'PM policy', 'runtime PM'], whiteboardTemplate: 'evaluation_loop' },
  { key: 'safety-security', title: '安全/功能安全', focus: 'MPU、TrustZone-M、secure boot、OTA、watchdog、ASIL/SIL 思路和故障注入', tags: ['safety', 'security'], concepts: ['MPU', 'TrustZone-M', 'watchdog', 'OTA', 'fault injection'], whiteboardTemplate: 'evaluation_loop' },
  { key: 'debug-test', title: '调试/测试', focus: 'trace、SEGGER SystemView、Zephyr shell、logging、unit test、HIL、fault injection 和死锁定位', tags: ['debug', 'test'], concepts: ['SystemView', 'Zephyr shell', 'logging', 'HIL', 'fault injection'], whiteboardTemplate: 'evaluation_loop' },
]

const banks: InterviewBank[] = [
  { prefix: 'linux-kernel', category: 'linux-kernel-interview', title: 'Linux Kernel 面试', tags: ['linux-kernel', 'kernel'], count: 200, modules: linuxModules, patterns: longPatterns },
  { prefix: 'android', category: 'android-interview', title: 'Android 面试', tags: ['android', 'framework'], count: 200, modules: androidModules, patterns: longPatterns },
  { prefix: 'ai-infra', category: 'ai-infra-interview', title: 'AI Infra 面试', tags: ['ai-infra', 'rdma', 'pcie'], count: 100, modules: aiInfraModules, patterns: shortPatterns },
  { prefix: 'ic-chip', category: 'ic-chip-interview', title: 'IC 芯片面试', tags: ['ic', 'vlsi'], count: 150, modules: icModules, patterns: shortPatterns },
  { prefix: 'hardware', category: 'hardware-interview', title: '硬件面试', tags: ['hardware', 'pcb'], count: 100, modules: hardwareModules, patterns: shortPatterns },
  { prefix: 'virtualization', category: 'virtualization-interview', title: '虚拟化面试', tags: ['virtualization', 'hypervisor'], count: 100, modules: virtualizationModules, patterns: shortPatterns },
  { prefix: 'programming', category: 'programming-interview', title: '编程面试', tags: ['programming', 'c', 'cpp', 'python'], count: 100, modules: programmingModules, patterns: shortPatterns },
  { prefix: 'arm-riscv', category: 'arm-riscv-interview', title: 'ARM/RISC-V 体系结构面试', tags: ['arm', 'riscv', 'architecture'], count: 100, modules: armRiscvModules, patterns: shortPatterns },
  { prefix: 'firmware', category: 'firmware-interview', title: '固件面试', tags: ['firmware', 'uboot', 'uefi'], count: 100, modules: firmwareModules, patterns: shortPatterns },
  { prefix: 'rtos', category: 'rtos-interview', title: 'RTOS 面试', tags: ['rtos', 'freertos', 'zephyr'], count: 100, modules: rtosModules, patterns: shortPatterns },
]

function descriptionFor(bank: InterviewBank, module: InterviewModule, pattern: QuestionPattern) {
  return `${bank.title} / ${module.title}

题目：${bank.title}：${module.title}：${pattern.title.replace('{focus}', module.focus)}

考察重点：${pattern.focus} 本题场景聚焦 ${module.focus}。

白板提示：围绕 ${module.concepts.slice(0, 5).join('、')} 画出关键路径、状态变化、观测信号和排查分支。

追问方向：如果线上出问题先看什么证据？如何证明你的判断？规模或约束变化后方案如何调整？`
}

function makeBankChallenges(bank: InterviewBank): Challenge[] {
  const rows = bank.patterns.flatMap((pattern) => bank.modules.map((module) => {
    const id = `${bank.prefix}-${module.key}-${pattern.key}`
    return {
      id,
      title: `${bank.title}：${module.title}：${pattern.title.replace('{focus}', module.focus)}`,
      slug: id,
      description: descriptionFor(bank, module, pattern),
      difficulty: pattern.difficulty,
      category: bank.category,
      tags: ['interview', bank.category, ...bank.tags, ...module.tags],
      challenge_type: 'qa',
      time_limit_ms: 0,
      memory_limit_mb: 0,
      starter_code: '',
      function_name: 'arena_interview_answer',
      input_keys: ['answer'],
      teaching_skills: ['explain_answer', 'step_derivation', 'socratic_questioning', 'debug_answer', 'concept_remediation', 'transfer_problem', 'whiteboard_architecture'],
      concepts: module.concepts,
      rubric: [
        '回答必须贴合题目模块，不套通用模板。',
        '讲清关键机制、数据流或控制流。',
        '说明验证方法、观测指标和排查路径。',
        '能回答约束变化、故障场景和工程取舍。',
      ],
      follow_up_questions: [
        `如果 ${module.concepts[0]} 出现异常，你第一步看什么？`,
        '如何用最小实验验证你的根因判断？',
        '如果规模扩大 10 倍，哪个环节先成为瓶颈？',
      ],
      whiteboard_template: module.whiteboardTemplate,
      published: true,
      created_at: createdAt,
      updated_at: createdAt,
    } satisfies Challenge
  }))
  return rows.slice(0, bank.count)
}

export const generalInterviewChallenges: Challenge[] = banks.flatMap(makeBankChallenges)
