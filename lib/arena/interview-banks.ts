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

type ConcreteModuleContext = {
  scenario: string
  artifact: string
  corePath: string
  failure: string
  evidence: string
  scale: string
  boundary: string
  compare: string
  lab: string
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

const linuxConcreteContexts: Record<string, ConcreteModuleContext> = {
  drivers: {
    scenario: '你要为一块 PCIe/平台混合形态的数据采集卡写 Linux 驱动，设备通过 device tree 或 PCI BAR 暴露寄存器，并向用户态提供 char device 与 sysfs 调试入口',
    artifact: 'probe/remove、devm 资源、irq、dma buffer、file_operations、sysfs/debugfs 节点',
    corePath: '从 bus match 到 probe，完成资源解析、寄存器映射、中断申请、DMA buffer 准备、字符设备注册，再到 open/ioctl/read/write 的调用链',
    failure: '少量机器热插拔后 remove 卡死，或者 probe 失败路径遗漏释放导致下一次加载驱动失败',
    evidence: 'dmesg、dynamic_debug、/proc/interrupts、ftrace function_graph、devres log、lspci/resource、sysfs 节点状态',
    scale: '同一机器从 1 块卡扩到 8 块卡，并发 open/ioctl 增加到几百路',
    boundary: '用户态传入非法 ioctl 参数、设备树缺字段、中断风暴、DMA 地址不满足设备 mask、probe 中途失败',
    compare: '手写 unwind 与 devm、miscdevice 与 cdev、sysfs 与 debugfs、poll/read 与 mmap ring buffer',
    lab: '写一个最小 platform_driver，故意让第 3 个资源申请失败，验证错误回滚和 remove 幂等性',
  },
  scheduler: {
    scenario: '一台 2 路 NUMA 服务器同时跑在线推理服务和离线 batch job，线上 P99 latency 被周期性拉高，但平均 CPU 利用率不高',
    artifact: 'task_struct、sched_entity、vruntime、runqueue、cgroup cpu.max/cpu.weight、NUMA balancing、sched tracepoint',
    corePath: '从 wake_up_new_task/enqueue_task 到 pick_next_task，再到 context switch、负载均衡和 cgroup throttling 的关键路径',
    failure: '在线服务线程被 batch job 抢占或被 cgroup throttle，出现 200ms 级尾延迟尖刺',
    evidence: 'perf sched timehist、trace-cmd sched_switch/sched_wakeup、/proc/schedstat、cgroup cpu.stat、numastat、runqlat',
    scale: '核心数翻倍、容器数量翻倍、在线线程绑定策略从默认改成 cpuset 隔离',
    boundary: 'RT 线程、NOHZ、NUMA 迁移、软中断占用、CPU quota 周期边界',
    compare: 'CFS/EEVDF 与 RT/deadline、nice 与 cgroup weight、绑核与自动负载均衡、隔离核与共享核',
    lab: '用 stress-ng 和一个 latency-sensitive echo server 复现 P99 抖动，再用 perf sched 证明等待来自 runqueue 还是 throttling',
  },
  memory: {
    scenario: '线上服务升级内核后出现 kswapd 飙高、direct reclaim 增多，部分容器触发 OOM，但 free 看起来还有不少内存',
    artifact: 'page table、zone、buddy、slab/slub、LRU、memcg、watermark、vmstat、OOM report',
    corePath: '从 page fault 或 kmalloc 进入分配路径，经过 zone watermarks、reclaim/compaction、memcg charge 到 OOM 选择',
    failure: '高阶页分配失败、slab 泄漏、memcg 限制触发 OOM、NUMA 节点局部内存耗尽',
    evidence: '/proc/zoneinfo、/proc/vmstat、slabtop、page_owner、memcg memory.events、trace mm_page_alloc/mm_vmscan、OOM log',
    scale: 'QPS 增加 10 倍后 page cache、slab 和匿名页互相挤压',
    boundary: 'GFP_ATOMIC、THP、NUMA fallback、memory.high 与 memory.max、swap 开关',
    compare: 'kmalloc/vmalloc、slab/slub、文件页/匿名页、direct reclaim/kswapd、memcg OOM/system OOM',
    lab: '用 memcg 限制、page_owner 和 slabtop 构造一个可解释的 OOM 现场，并写出三条验证假设',
  },
  filesystem: {
    scenario: '日志服务在 ext4/xfs 上写入吞吐稳定，但每隔几十秒 fsync 延迟尖刺，业务怀疑是 page cache 或 journal 导致',
    artifact: 'VFS、inode/dentry、address_space、page cache、writeback、journal transaction、block layer bio',
    corePath: '从 write/pwrite 进入 VFS，经过 page cache 脏页、writeback、journal、bio 提交到设备完成回调',
    failure: 'fsync 卡在 journal commit、dirty throttle、inode lock contention 或底层设备 flush/FUA',
    evidence: 'blktrace/bpftrace、trace writeback/jbd2/ext4、/proc/meminfo dirty、iostat、perf lock、filefrag',
    scale: '单目录百万文件、单文件多线程 append、从本地 NVMe 切到网络盘',
    boundary: 'O_DIRECT、rename 原子性、崩溃一致性、page cache 回写策略、overlayfs/FUSE 额外开销',
    compare: 'buffered I/O 与 O_DIRECT、ext4 ordered/writeback/journal、xfs 与 ext4、sync_file_range 与 fsync',
    lab: '写 fio profile 对比 buffered write、O_DIRECT 和 fsync=1，画出 VFS 到 block layer 的延迟分布',
  },
  networking: {
    scenario: '一台网关升级后在 25GbE 下小包转发丢包，CPU softirq 占用高，业务怀疑 NAPI budget、qdisc 或 GRO 设置有问题',
    artifact: 'skb、NAPI poll、GRO/GSO、qdisc、netfilter hook、TCP 拥塞控制、XDP/eBPF 程序',
    corePath: '从 NIC RX ring 中断/NAPI poll 取包，构造 skb，经过协议栈、netfilter/qdisc，到 TX queue 发出',
    failure: 'softnet backlog drop、qdisc 排队、GRO 聚合失效、RPS/RSS 不均、驱动 ring 满',
    evidence: 'ethtool -S、/proc/net/softnet_stat、dropwatch、perf top、bpftool prog/profile、tc -s qdisc、nstat',
    scale: '从 1GbE 到 25/100GbE，小包 PPS 增加 20 倍并叠加 iptables 规则',
    boundary: 'NAPI budget、IRQ affinity、XDP drop/pass/redirect、TCP retrans、MTU 和 checksum offload',
    compare: '内核协议栈、XDP、DPDK、tc eBPF、iptables/nftables 的延迟和可维护性取舍',
    lab: '用 pktgen + dropwatch 复现 softnet drop，并证明瓶颈在 RX ring、NAPI、qdisc 还是用户态消费',
  },
  'block-io': {
    scenario: 'NVMe SSD 在混合读写下 P99.9 延迟突然升高，应用看到 io_uring submit 很快但 completion 延迟异常',
    artifact: 'bio、request、blk-mq tag、hardware queue、I/O scheduler、flush/FUA、io_uring SQ/CQ',
    corePath: '从 io_uring 提交到 VFS/block layer，bio 合并，blk-mq 分配 tag，进入 NVMe queue，再完成中断回调',
    failure: 'blk-mq tag 耗尽、flush storm、I/O scheduler 合并策略不当、NVMe thermal throttling',
    evidence: 'blktrace、iostat -x、/sys/block/queue、nvme smart-log、trace block_rq_issue/complete、io_uring stats',
    scale: '队列深度从 32 提到 1024，盘从单块变 RAID/NVMe-oF',
    boundary: 'read/write 混部、sync flush、multi-queue CPU affinity、direct I/O 对齐、设备掉速',
    compare: 'io_uring 与 libaio、mq-deadline/none、buffered/direct I/O、本地 NVMe 与 NVMe-oF',
    lab: '用 fio 构造 randread + fsync write 混合负载，画出 submit/completion/block 三段延迟',
  },
  'sync-irq': {
    scenario: '驱动在高并发下偶发死锁，现场显示一个 CPU 在 hardirq 中拿锁，另一个进程上下文持锁后等待完成量',
    artifact: 'hardirq/softirq、tasklet/workqueue、spinlock/mutex、RCU、completion、hrtimer、lockdep',
    corePath: '区分 hardirq、softirq、workqueue 和进程上下文中能否睡眠、能拿什么锁、如何延后处理',
    failure: 'irq context 使用 mutex、spin_lock 未关中断导致自死锁、RCU grace period 被阻塞',
    evidence: 'lockdep splat、/proc/interrupts、ftrace irqsoff/preemptoff、sysrq-l、rcu stall log、trace irq_handler_entry',
    scale: '中断频率提升 10 倍，单队列改多队列，workqueue 从 ordered 改 unbound',
    boundary: 'atomic context、sleepable RCU、local_bh_disable、timer callback、CPU hotplug',
    compare: 'spinlock/mutex/rwsem/RCU、tasklet/workqueue/threaded irq、completion/waitqueue',
    lab: '构造 irq handler + workqueue 的共享队列，解释为何某个锁必须用 spin_lock_irqsave',
  },
  'debug-tracing': {
    scenario: '生产内核不能重启也不能开重日志，你需要定位一次 30 秒发生一次的 20ms 抖动',
    artifact: 'ftrace、tracepoint、kprobe/uprobes、perf、BPF、crash dump、lockdep、kmemleak',
    corePath: '从低开销指标发现异常，再逐步打开 tracepoint/kprobe，缩小到函数、锁或设备路径',
    failure: '观测本身扰动业务、trace buffer 丢事件、kprobe 打在热路径导致额外延迟',
    evidence: 'trace-cmd report、perf record/script、bpftool prog profile、/sys/kernel/debug/tracing、vmcore',
    scale: '从单机复现扩展到 1000 台灰度采样，要求自动归因和低开销',
    boundary: '生产权限、符号缺失、内核版本差异、BPF verifier、NMI/irq 上下文限制',
    compare: 'printk、ftrace、perf、BPF、crash dump、vendor tracepoint 的适用边界',
    lab: '设计一个只打开 5 分钟的 trace plan，定位 runqueue 延迟、block I/O 延迟或锁等待中的一个',
  },
  'stability-power': {
    scenario: '手机/边缘设备在 suspend/resume 后偶发外设不可用，同时 thermal 限频导致后台任务延迟',
    artifact: 'runtime PM、system suspend、wake lock、thermal zone、watchdog、panic/hung task、reboot reason',
    corePath: '从设备 runtime suspend 到 system suspend，再到 wakeup source、resume callback 和 thermal governor',
    failure: '设备 resume 顺序错误、wakeup source 泄漏、thermal trip 配置不合理、watchdog 误触发',
    evidence: 'dmesg suspend log、/sys/kernel/debug/wakeup_sources、thermal sysfs、pstore/ramoops、ftrace power events',
    scale: '从开发板到量产设备，外设数量增加且电源域/时钟依赖更复杂',
    boundary: 'noirq suspend、autosuspend delay、shared regulator、panic 后日志保留、低电量场景',
    compare: 'runtime PM 与 system suspend、thermal governor 取舍、panic/watchdog/hung task 的定位价值',
    lab: '设计一次 suspend/resume 压测，要求记录 wakeup source、设备回调耗时和失败后的恢复策略',
  },
  'boot-security': {
    scenario: '一台服务器或 Android 设备启动变慢 8 秒，同时安全团队要求验证 LSM/seccomp/cgroup 隔离没有被绕过',
    artifact: 'bootloader、initcall、module loading、LSM hook、namespace、cgroup、seccomp、capability',
    corePath: '从 firmware/bootloader 到 kernel initcall、init 进程，再到服务拉起、namespace/cgroup/seccomp 生效',
    failure: 'initcall 卡慢、模块签名失败、容器 capability 过大、seccomp profile 漏洞',
    evidence: 'initcall_debug、systemd-analyze、dmesg、audit log、/proc/self/status、lsns、cgroupfs',
    scale: '节点从裸机服务扩到多租户容器，启动链路必须可审计和可回滚',
    boundary: 'secure boot、module signing、LSM stacking、user namespace、privileged container',
    compare: 'capability/seccomp/LSM/cgroup/namespaces 的隔离层次和缺口',
    lab: '给一个容器逃逸风险样例，要求画出 namespace/cgroup/seccomp/LSM 分别拦截的位置',
  },
  'smmu-iommu': {
    scenario: 'ARM 服务器上接入一张加速卡，开启 SMMU 后 DMA fault 间歇出现，关闭 IOMMU 后问题消失',
    artifact: 'IOMMU domain、stream ID、IOVA、page table、map/unmap、ATS/PRI、fault report、TLB invalidation',
    corePath: '从设备 stream ID 绑定 domain，到 dma_map 生成 IOVA，再由 SMMU 做地址翻译和 fault 上报',
    failure: 'stream ID 配错、IOVA 生命周期错误、unmap 后设备仍 DMA、ATS/PRI 缓存失效',
    evidence: 'dmesg IOMMU fault、/sys/kernel/iommu_groups、ftrace iommu_map/unmap、设备寄存器、SMMU event queue',
    scale: '设备从单 function 到 SR-IOV 多 VF，多租户隔离要求更高',
    boundary: 'identity mapping、strict/lazy invalidation、DMA mask、coherent/non-coherent 设备',
    compare: '直通 DMA 与 IOMMU 隔离、SMMU v2/v3、ATS/PRI 开关、strict 与 non-strict 模式',
    lab: '设计一个 DMA-after-unmap 的复现实验，说明如何从 fault address 反推 buffer 生命周期问题',
  },
  dma: {
    scenario: '网卡驱动在 ARM 平台上偶发收到旧数据，x86 上正常，怀疑 coherent/streaming DMA 或 cache maintenance 使用错误',
    artifact: 'dma_map_single、dma_alloc_coherent、scatterlist、DMAengine descriptor、cache maintenance、bounce buffer',
    corePath: '从 CPU buffer 准备、dma_map 建立设备可见地址、设备 DMA、completion 到 dma_unmap/sync 的生命周期',
    failure: 'streaming DMA 忘记 sync、方向标错、scatterlist 边界错误、IOMMU bounce buffer 影响性能',
    evidence: 'dma-debug、ftrace dma_map_ops、IOMMU fault、cache miss/perf、设备 descriptor dump',
    scale: 'buffer 从 4KB 增加到 1MB，单队列变多队列，NUMA 和 IOMMU 都打开',
    boundary: 'coherent vs non-coherent、DMA_TO_DEVICE/FROM_DEVICE、cache line 对齐、32-bit DMA mask',
    compare: 'coherent DMA 与 streaming DMA、CPU copy 与 DMAengine、scatter-gather 与连续 buffer',
    lab: '给一段伪代码找 DMA API 使用错误，并说明为什么只在 ARM non-coherent 平台复现',
  },
  pcie: {
    scenario: 'PCIe 加速卡在某些服务器上只能训练到 Gen3 x8，且 AER 偶发报 Correctable Error，业务吞吐下降',
    artifact: 'PCIe enumeration、BAR、MSI/MSI-X、ASPM、AER、hotplug、ATS/PRI、root port capability',
    corePath: '从枚举配置空间、分配 BAR、开启 bus mastering/MSI-X，到驱动建立队列和错误恢复',
    failure: '链路降速/降宽、MSI-X vector 不足、AER recovery 不完整、ASPM 导致延迟尖刺',
    evidence: 'lspci -vv、setpci、dmesg AER、pciehp log、ethtool/设备 counters、root port capability',
    scale: '单卡到 8 卡，拓扑跨 NUMA/root complex，热插拔和错误恢复必须在线完成',
    boundary: 'BAR 64-bit prefetchable、IOMMU、ACS、ASPM policy、AER fatal/non-fatal/correctable',
    compare: 'MSI/MSI-X/INTx、polling 与 interrupt、ASPM 开关、SR-IOV VF 与 PF 管理',
    lab: '设计一套 PCIe bring-up checklist：链路、BAR、中断、DMA、AER、热插拔分别如何验证',
  },
  'v4l2-media': {
    scenario: '摄像头 pipeline 从 sensor 到 ISP 再到 video node，偶发第一帧黑屏或 buffer underrun',
    artifact: 'V4L2 subdev、media graph、vb2 buffer、mmap/userptr/dmabuf、streamon/streamoff、format negotiation',
    corePath: '从 media entity link setup、format propagation、queue buffer，到 streamon 启动 sensor/ISP/DMA',
    failure: 'subdev format 不一致、buffer 生命周期错误、dmabuf cache 同步遗漏、streamoff 回收竞态',
    evidence: 'media-ctl graph、v4l2-ctl --stream-mmap、trace v4l2/vb2、dmesg、ISP frame counter',
    scale: '单摄到多摄同步，分辨率从 1080p 到 4K60，buffer 数和带宽压力上升',
    boundary: 'mmap/userptr/dmabuf、multi-planar format、pipeline link、frame interval、热插拔',
    compare: 'V4L2 video node 与 subdev、mmap/userptr/dmabuf、同步启动与异步 pipeline',
    lab: '画出 sensor->CSI->ISP->memory 的 media graph，并指出 format negotiation 失败会在哪里暴露',
  },
  usb: {
    scenario: 'USB 摄像头接在 Type-C dock 后偶发断流，dmesg 出现 reset high-speed USB device 和 autosuspend 相关日志',
    artifact: 'USB device/config/interface/endpoint descriptor、URB、host controller、gadget、Type-C/PD、autosuspend',
    corePath: '从枚举读取 descriptor、选择 configuration/interface，到提交 URB、完成回调和错误恢复',
    failure: 'URB -EPIPE/-ETIMEDOUT、autosuspend 过早、带宽不足、hub reset、Type-C 电源协商异常',
    evidence: 'usbmon、dmesg、lsusb -v、powertop、host controller counters、Type-C partner sysfs',
    scale: '单设备扩展到多个高带宽等时设备共享 hub',
    boundary: 'control/bulk/interrupt/isochronous endpoint、autosuspend delay、U1/U2、gadget role switch',
    compare: 'bulk 与 isochronous、轮询与中断端点、autosuspend 开关、host 与 gadget 驱动',
    lab: '用 usbmon 分析一次摄像头断流，要求从 URB 状态码定位是设备、hub、host 还是电源问题',
  },
  'tty-terminal': {
    scenario: '串口控制台在高日志量下丢字符，用户态 pty 程序偶发 hangup 后无法恢复',
    artifact: 'TTY core、line discipline、tty_driver、uart_port、console、pty、termios、flip buffer',
    corePath: '从硬件中断收字符进入 flip buffer，经 line discipline 到 read，再到 write/console 输出路径',
    failure: 'flip buffer overflow、termios 配置错误、console lock contention、hangup 生命周期处理不完整',
    evidence: 'stty、/proc/tty/driver/serial、ftrace tty/uart、dmesg console loglevel、perf lock',
    scale: '日志从低频交互变成高频 console dump，串口波特率和 CPU 中断压力成为瓶颈',
    boundary: 'canonical/raw mode、flow control、console early/normal、pty master/slave、hangup signal',
    compare: 'console/tty/pty/serial driver、poll/read、硬件流控与软件流控',
    lab: '设计一个复现串口丢字符的实验，并说明如何判断瓶颈在 UART FIFO、IRQ、TTY buffer 还是用户态读取',
  },
}

const aiInfraConcreteContexts: Record<string, ConcreteModuleContext> = {
  'pcie-cxl': {
    scenario: '训练集群新上 CXL 内存扩展盒，GPU 通过 PCIe switch 访问 host/CXL memory，部分节点出现链路降速和 DMA timeout',
    artifact: 'PCIe topology、BAR/MSI-X、DMA mapping、ATS/PRI、CXL.cache/mem、link training、NUMA distance',
    corePath: '从设备枚举、BAR 映射、DMA/ATS 建立，到 CXL memory 被 runtime/训练进程纳入 NUMA memory pool',
    failure: 'Gen5 降到 Gen4、ACS/ATS 配置不一致、CXL memory latency 抖动、DMA timeout',
    evidence: 'lspci -tvvv、cxl list、dmesg AER/CXL、numactl -H、perf c2c、PCIe counters',
    scale: '单节点 1 个 CXL 盒扩到多 switch、多 GPU、多租户共享 memory pool',
    boundary: 'NUMA placement、IOMMU strict mode、CXL type-3 memory、hotplug、firmware/BIOS 配置',
    compare: '本地 DRAM、CXL memory、NVMe spill、GPU HBM 的延迟/带宽/隔离取舍',
    lab: '设计一个 benchmark 区分 CXL latency 抖动、PCIe 降速和 NUMA 放置错误',
  },
  rdma: {
    scenario: 'RoCEv2 训练网络在 AllReduce 高峰出现吞吐塌陷，PFC pause 帧暴增但应用只看到 NCCL timeout',
    artifact: 'QP/CQ/MR、RDMA write/read/send、RoCEv2、PFC/ECN、DCQCN、memory registration、NCCL transport',
    corePath: '从注册内存、建立 QP、post send/recv，到 CQ completion、拥塞反馈和重传/超时处理',
    failure: 'PFC storm、ECN 标记不足、MR 注册缓存失效、CQ overrun、QP retry exceeded',
    evidence: 'perftest、rdma res、ethtool -S、switch PFC/ECN counters、NCCL_DEBUG、DCQCN stats',
    scale: '从 8 卡单机扩到 1024 卡多机，incast 和跨 pod 流量明显增加',
    boundary: 'lossless 网络假设、MTU、GID/SL/traffic class、NUMA affinity、注册内存大小',
    compare: 'RoCE 与 InfiniBand、RDMA write/read/send、TCP fallback、PFC 与 ECN/DCQCN',
    lab: '给一段 NCCL timeout 日志和交换机 PFC counters，要求判断是端侧、网络侧还是拓扑问题',
  },
  network: {
    scenario: 'AI 数据面同时承载训练 AllReduce、checkpoint 上传和在线推理流量，某个 rack 出现周期性丢包和 reorder',
    artifact: 'DPDK/XDP fast path、RSS、ECMP、QoS queue、ACL、telemetry、flow hashing',
    corePath: '从 NIC RX/TX queue、RSS hash、内核/XDP/DPDK 处理，到交换机 ECMP/QoS 转发',
    failure: 'ECMP hash 极化、QoS 队列饿死、RSS 不均、ACL 慢路径、microburst 丢包',
    evidence: 'switch queue counters、sFlow/INT、ethtool -S、XDP stats、DPDK telemetry、packet capture',
    scale: '从单 rack 到多 pod，链路 oversubscription 从 1:1 到 3:1',
    boundary: 'MTU/jumbo frame、RDMA lossless、ECMP seed、QoS mapping、telemetry 采样误差',
    compare: '内核网络、XDP、DPDK、SmartNIC offload、交换机 QoS 的工程取舍',
    lab: '设计一次 microburst 复现和观测实验，证明丢包发生在服务器 NIC、ToR 还是 spine',
  },
  cluster: {
    scenario: '一个 512 GPU 训练任务吞吐只有预期 60%，拓扑显示跨 IB spine 的流量异常高，调度器没有感知 NVLink/NUMA',
    artifact: 'GPU/NPU topology、NVLink、InfiniBand、NCCL graph、MIG、故障域、拓扑感知调度',
    corePath: '从作业申请资源、调度 placement、NCCL 拓扑发现，到 AllReduce ring/tree 构建',
    failure: '跨 NUMA/跨 rack 放置、NVLink 断链、MIG 隔离不当、故障域过于集中',
    evidence: 'nvidia-smi topo -m、NCCL graph dump、ibstat/perfquery、scheduler placement log、DCGM metrics',
    scale: '从 8 卡扩到 512/4096 卡，通信拓扑和故障恢复成为主瓶颈',
    boundary: 'heterogeneous GPU、MIG、IB rail、NCCL algorithm、node failure、maintenance drain',
    compare: 'ring/tree/CollNet、拓扑感知与 binpack、MIG 共享与整卡独占',
    lab: '给定 4 个 rack 的 GPU/IB 拓扑，要求设计一个 placement 策略并估算 AllReduce 瓶颈',
  },
  storage: {
    scenario: '预训练数据从对象存储读取，GPU 利用率周期性掉到 30%，同时 checkpoint 写入会拖慢训练',
    artifact: 'object storage、NVMe cache、prefetch queue、dataset shard、checkpoint writer、NVMe-oF',
    corePath: '从样本索引、远端读取、节点本地缓存、dataloader prefetch，到 GPU batch 消费和 checkpoint 异步写入',
    failure: '小文件放大、cache miss、checkpoint burst、对象存储限流、数据 shard 热点',
    evidence: 'GPU util、dataloader time、S3/object metrics、NVMe iostat、cache hit ratio、training step time',
    scale: '数据从 10TB 到 10PB，训练节点从 8 台到 1000 台',
    boundary: 'shuffle 随机性、epoch 边界、checkpoint 一致性、恢复时间目标 RTO、缓存淘汰',
    compare: '对象存储直读、本地 NVMe cache、分布式文件系统、NVMe-oF 的成本和瓶颈',
    lab: '设计一个数据管道压测，证明 GPU 空转是存储、CPU decode、网络还是 dataloader 造成',
  },
  scheduler: {
    scenario: '平台同时运行预训练、微调、推理和 notebook，VIP 训练任务要求 gang scheduling，但普通用户抱怨排队时间过长',
    artifact: 'Kubernetes/Slurm queue、quota、priority、gang scheduling、preemption、elastic training、checkpoint',
    corePath: '从用户提交作业、资源配额检查、队列排序、gang 分配，到抢占/恢复和弹性扩缩',
    failure: 'gang 任务长期饿死、小任务被大任务阻塞、抢占导致 checkpoint 风暴、GPU 碎片化',
    evidence: 'scheduler event、queue latency、GPU fragmentation、preemption count、checkpoint duration、tenant quota usage',
    scale: '租户从 5 个到 200 个，GPU 型号混合，作业时长从分钟到数周',
    boundary: 'quota hard/soft、priority inversion、heterogeneous GPU、node drain、spot/preemptible capacity',
    compare: 'Kubernetes 与 Slurm、binpack 与 spread、gang scheduling 与 elastic training、抢占与排队',
    lab: '给一个队列快照，要求决定是否抢占、抢占谁、如何避免 checkpoint 风暴',
  },
  observability: {
    scenario: '训练平台每天都有 NCCL timeout、GPU Xid、PCIe replay 和 dataloader slowdown，但告警太多无法定位主因',
    artifact: 'GPU/NIC/PCIe metrics、DCGM、distributed trace、profiling、alert rule、RCA workflow、capacity forecast',
    corePath: '从端侧指标采集、作业维度聚合、trace 串联 step，到告警降噪和根因候选排序',
    failure: '指标维度爆炸、采样丢失、时间戳不对齐、告警风暴、根因和症状混淆',
    evidence: 'DCGM exporter、Prometheus labels、OpenTelemetry trace、NCCL logs、Xid events、PCIe counters',
    scale: '从百卡到万卡，指标 cardinality 和存储成本成为平台问题',
    boundary: '租户隔离、日志脱敏、采样率、时钟同步、指标保留周期',
    compare: 'metrics/logs/traces/profiles、作业视角与节点视角、实时告警与离线 RCA',
    lab: '设计一个从 NCCL timeout 自动关联到 GPU/NIC/PCIe/网络的 dashboard 和告警树',
  },
  serving: {
    scenario: '多租户 LLM 推理平台在晚高峰 TTFT 超过 SLA，KV cache 显存逼近上限，部分租户请求被排队 20 秒',
    artifact: 'request router、prefill/decode pool、KV cache、continuous batching、autoscaler、SLA/cost policy',
    corePath: '从请求进入路由、排队 admission、prefill、decode、streaming output，到计费和指标上报',
    failure: 'prefill 堵塞 decode、KV cache 碎片、batching 牺牲尾延迟、路由策略导致热点模型过载',
    evidence: 'TTFT/TPOT、queue time、batch size、KV cache usage、GPU util、OOM log、tenant SLA dashboard',
    scale: '模型从 3 个扩到 100 个，租户从内部测试到公开 API',
    boundary: '长上下文、streaming 断连、priority、模型热加载、灰度回滚、安全过滤',
    compare: '静态 batch、continuous batching、prefill/decode 分离、大小模型级联、serverless 冷启动',
    lab: '给一组 TTFT/TPOT/KV cache 指标，要求判断该扩 prefill、decode 还是限流长上下文',
  },
  security: {
    scenario: '多租户 AI 平台允许用户上传镜像和数据集，同时共享 GPU/NIC，需要防止数据泄露和供应链攻击',
    artifact: 'tenant isolation、GPU/NIC sharing、image scanning、secret management、audit log、data ACL、network policy',
    corePath: '从用户认证授权、镜像准入、作业运行时隔离、数据访问，到日志审计和 incident response',
    failure: '镜像内嵌密钥、容器越权挂载数据集、GPU memory residual、日志泄露 prompt/data',
    evidence: 'audit log、Kubernetes admission event、image scan report、IAM policy diff、network flow log、secret access log',
    scale: '从内部团队共享扩到外部客户多租户，合规和审计要求上升',
    boundary: 'privileged pod、hostPath、MIG/SR-IOV 隔离、数据分级、密钥轮换、日志脱敏',
    compare: 'namespace/RBAC/network policy、VM 隔离、MIG、机密计算、镜像签名的边界',
    lab: '设计一个恶意镜像准入测试，说明 admission、runtime、审计各层如何拦截',
  },
  incident: {
    scenario: '一次大训练在 70% 进度时多节点 NCCL timeout，随后触发驱动 reset 和 OOM，checkpoint 也无法立即恢复',
    artifact: 'fault domain、node health、driver reset、OOM killer、checkpoint consistency、job restart policy、postmortem',
    corePath: '从告警发现、止血隔离节点、保留证据、恢复 checkpoint，到根因复盘和长期预防',
    failure: '自动重试扩大影响、checkpoint 损坏、驱动 reset 后 GPU 不可用、故障节点再次被调度',
    evidence: 'NCCL logs、dmesg Xid/OOM、scheduler event、checkpoint metadata、network counters、node health history',
    scale: '从单作业事故扩展到全平台同类故障演练和自动化隔离',
    boundary: 'RTO/RPO、证据保留、租户通知、自动 drain、灰度恢复、复盘 action owner',
    compare: '立即重试、降级规模、回滚驱动、隔离 rack、从上一个 checkpoint 恢复的取舍',
    lab: '写一份 30 分钟止血 runbook：谁看什么信号，何时停止重试，何时恢复训练',
  },
}

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

const aiCompilerRuntimeModules: InterviewModule[] = [
  { key: 'llvm-ir', title: 'LLVM/IR', focus: 'SSA、IRBuilder、PassManager、analysis/transform、SelectionDAG/GlobalISel、target lowering 和优化验证', tags: ['llvm', 'compiler'], concepts: ['LLVM IR', 'SSA', 'PassManager', 'target lowering', 'GlobalISel'], whiteboardTemplate: 'pipeline' },
  { key: 'mlir', title: 'MLIR', focus: 'dialect、operation/interface、region、canonicalize、conversion、bufferization 和多层 lowering', tags: ['mlir', 'compiler'], concepts: ['MLIR dialect', 'operation', 'region', 'conversion', 'bufferization'], whiteboardTemplate: 'system_architecture' },
  { key: 'triton', title: 'Triton 编译栈', focus: 'program_id、block program、tl.load/store mask、tl.dot、autotune、shared memory 和 PTX lowering', tags: ['triton', 'gpu-kernel'], concepts: ['Triton block', 'program_id', 'tl.dot', 'autotune', 'PTX lowering'], whiteboardTemplate: 'pipeline' },
  { key: 'cuda', title: 'CUDA Kernel', focus: 'thread/block/warp、memory coalescing、shared memory、occupancy、stream/event、graph capture 和 Nsight profiling', tags: ['cuda', 'gpu'], concepts: ['warp', 'coalescing', 'shared memory', 'occupancy', 'CUDA stream'], whiteboardTemplate: 'inference_flow' },
  { key: 'pytorch-compiler', title: 'PyTorch 2 编译器', focus: 'torch.compile、Dynamo、FX Graph、AOTAutograd、Inductor、graph break、guard 和 fallback', tags: ['pytorch', 'torch-compile'], concepts: ['torch.compile', 'Dynamo', 'FX Graph', 'AOTAutograd', 'Inductor'], whiteboardTemplate: 'system_architecture' },
  { key: 'pytorch-runtime', title: 'PyTorch Runtime', focus: 'Dispatcher、ATen、TensorImpl、Autograd engine、custom op、memory format、allocator 和 CUDA extension', tags: ['pytorch', 'runtime'], concepts: ['Dispatcher', 'ATen', 'TensorImpl', 'Autograd engine', 'custom op'], whiteboardTemplate: 'pipeline' },
  { key: 'ai-runtime', title: 'AI Runtime', focus: 'graph executor、memory planner、stream scheduler、kernel registry、shape cache、async error 和 profiling', tags: ['ai-runtime', 'executor'], concepts: ['graph executor', 'memory planner', 'stream scheduler', 'kernel registry', 'shape cache'], whiteboardTemplate: 'system_architecture' },
  { key: 'fusion-layout', title: '算子融合/Layout', focus: 'operator fusion、layout transform、tiling、vectorization、memory reuse、numerical stability 和 fallback', tags: ['fusion', 'layout'], concepts: ['operator fusion', 'layout transform', 'tiling', 'vectorization', 'memory reuse'], whiteboardTemplate: 'pipeline' },
  { key: 'quant-lowering', title: '量化 Lowering', focus: 'INT8/FP8、calibration、scale/zero-point、QDQ、TensorCore、accuracy regression 和 mixed precision', tags: ['quantization', 'lowering'], concepts: ['INT8', 'FP8', 'QDQ', 'TensorCore', 'calibration'], whiteboardTemplate: 'solution_flow' },
  { key: 'xla-tvm-iree', title: 'XLA/TVM/IREE', focus: 'HLO/StableHLO、Relay/TIR、schedule、autotuning、VM/runtime、backend codegen 和 deployment', tags: ['xla', 'tvm', 'iree'], concepts: ['StableHLO', 'Relay', 'TIR', 'autotuning', 'runtime VM'], whiteboardTemplate: 'system_architecture' },
  { key: 'distributed-runtime', title: '分布式 Runtime', focus: 'NCCL collectives、tensor/pipeline parallel、overlap、rendezvous、checkpoint、elastic recovery 和故障隔离', tags: ['distributed', 'nccl'], concepts: ['NCCL', 'AllReduce', 'tensor parallel', 'overlap', 'elastic recovery'], whiteboardTemplate: 'inference_flow' },
  { key: 'debug-profiler', title: 'Compiler/Runtime Debug', focus: 'IR dump、graph break 定位、kernel bisect、Nsight/torch profiler、perf counter、numerical diff 和回归门禁', tags: ['debug', 'profiler'], concepts: ['IR dump', 'graph break', 'Nsight', 'torch profiler', 'numerical diff'], whiteboardTemplate: 'evaluation_loop' },
]

const banks: InterviewBank[] = [
  { prefix: 'linux-kernel', category: 'linux-kernel-interview', title: 'Linux Kernel 面试', tags: ['linux-kernel', 'kernel'], count: 200, modules: linuxModules, patterns: longPatterns },
  { prefix: 'android', category: 'android-interview', title: 'Android 面试', tags: ['android', 'framework'], count: 200, modules: androidModules, patterns: longPatterns },
  { prefix: 'ai-infra', category: 'ai-infra-interview', title: 'AI Infra 面试', tags: ['ai-infra', 'rdma', 'pcie'], count: 100, modules: aiInfraModules, patterns: shortPatterns },
  { prefix: 'ai-compiler-runtime', category: 'ai-compiler-runtime-interview', title: 'AI 编译器/Runtime 面试', tags: ['ai-compiler', 'runtime', 'llvm', 'mlir', 'cuda', 'pytorch', 'triton'], count: 120, modules: aiCompilerRuntimeModules, patterns: shortPatterns },
  { prefix: 'ic-chip', category: 'ic-chip-interview', title: 'IC 芯片面试', tags: ['ic', 'vlsi'], count: 150, modules: icModules, patterns: shortPatterns },
  { prefix: 'hardware', category: 'hardware-interview', title: '硬件面试', tags: ['hardware', 'pcb'], count: 100, modules: hardwareModules, patterns: shortPatterns },
  { prefix: 'virtualization', category: 'virtualization-interview', title: '虚拟化面试', tags: ['virtualization', 'hypervisor'], count: 100, modules: virtualizationModules, patterns: shortPatterns },
  { prefix: 'programming', category: 'programming-interview', title: '编程面试', tags: ['programming', 'c', 'cpp', 'python'], count: 100, modules: programmingModules, patterns: shortPatterns },
  { prefix: 'arm-riscv', category: 'arm-riscv-interview', title: 'ARM/RISC-V 体系结构面试', tags: ['arm', 'riscv', 'architecture'], count: 100, modules: armRiscvModules, patterns: shortPatterns },
  { prefix: 'firmware', category: 'firmware-interview', title: '固件面试', tags: ['firmware', 'uboot', 'uefi'], count: 100, modules: firmwareModules, patterns: shortPatterns },
  { prefix: 'rtos', category: 'rtos-interview', title: 'RTOS 面试', tags: ['rtos', 'freertos', 'zephyr'], count: 100, modules: rtosModules, patterns: shortPatterns },
]

function descriptionFor(bank: InterviewBank, module: InterviewModule, pattern: QuestionPattern) {
  const concrete = concreteQuestionFor(bank, module, pattern)
  if (concrete) {
    return `${bank.title} / ${module.title}

题目：${bank.title}：${module.title}：${concrete.title}

真实场景：${concrete.context.scenario}

你需要回答：
1. 先画出端到端关键路径：${concrete.context.corePath}
2. 明确关键对象/数据结构/接口：${concrete.context.artifact}
3. 解释为什么会出现这个问题：${concrete.context.failure}
4. 给出你会收集的证据：${concrete.context.evidence}
5. 说明边界条件和容易误判的点：${concrete.context.boundary}
6. 给一个最小实验或验证方法：${concrete.context.lab}

考察重点：${concrete.focus}

白板提示：画出「正常路径 -> 异常分支 -> 观测信号 -> 验证实验 -> 修复/取舍」；不要画成通用流程图，必须落到 ${module.concepts.slice(0, 5).join('、')}。

追问方向：${concrete.followUps.join(' / ')}`
  }

  return `${bank.title} / ${module.title}

题目：${bank.title}：${module.title}：${pattern.title.replace('{focus}', module.focus)}

考察重点：${pattern.focus} 本题场景聚焦 ${module.focus}。

白板提示：围绕 ${module.concepts.slice(0, 5).join('、')} 画出关键路径、状态变化、观测信号和排查分支。

追问方向：如果线上出问题先看什么证据？如何证明你的判断？规模或约束变化后方案如何调整？`
}

function concreteQuestionFor(bank: InterviewBank, module: InterviewModule, pattern: QuestionPattern) {
  const context = bank.prefix === 'linux-kernel'
    ? linuxConcreteContexts[module.key]
    : bank.prefix === 'ai-infra'
    ? aiInfraConcreteContexts[module.key]
    : undefined
  if (!context) return null

  const variants: Record<string, { title: string; focus: string; followUps: string[] }> = {
    'core-path': {
      title: `围绕“${context.failure}”，${module.title}的正常关键路径应该怎么走？`,
      focus: `要求从具体场景出发讲清 ${context.corePath}，并解释 ${context.artifact} 的职责、生命周期和常见误区。`,
      followUps: [`${context.artifact} 中哪个对象最容易出现生命周期错误？`, '如果只能画一张图，你会把同步路径和异步回调如何区分？', `如何用 ${context.evidence.split('、').slice(0, 2).join(' 和 ')} 证明路径真的被执行？`],
    },
    lifecycle: {
      title: `${context.artifact} 要上线时，初始化、失败回滚和释放路径怎么设计？`,
      focus: `围绕 ${context.scenario} 设计完整生命周期，特别说明中途失败、并发访问、资源释放和重复初始化的处理。`,
      followUps: ['中途第 3 个资源申请失败时如何回滚？', '释放路径如何做到幂等？', `哪些资源应该延后到真正使用 ${module.concepts[0]} 时再申请？`],
    },
    'perf-debug': {
      title: `${context.failure} 时，你如何一步步证明性能瓶颈在哪里？`,
      focus: `不要泛泛说 perf/trace；要基于 ${context.evidence} 设计分层观测，区分等待、排队、硬件、锁和配置问题。`,
      followUps: ['第一个低成本指标看什么？', '如何设计反事实实验排除错误假设？', `如果 ${context.scale}，瓶颈判断会怎样变化？`],
    },
    race: {
      title: `${context.failure} 背后如果是竞态、死锁或时序问题，你会怀疑哪条路径？`,
      focus: `结合 ${context.boundary} 说明并发上下文、锁粒度、状态迁移和最小修复，不能只说“加锁”。`,
      followUps: ['哪些路径可能在中断/异步/回调上下文执行？', '如何证明不是观测工具引入的扰动？', '最小修复和长期重构分别是什么？'],
    },
    failure: {
      title: `线上已经出现 ${context.failure}，请给出 30 分钟内的排查路径。`,
      focus: `按止血、证据保留、定位、恢复和复盘组织回答，必须说清 ${context.evidence} 的优先级。`,
      followUps: ['什么时候停止自动重试？', '哪些证据会被重启或恢复动作破坏？', '如何把这次事故变成回归测试？'],
    },
    'api-contract': {
      title: `${context.artifact} 暴露给上层时，接口契约、边界和错误语义怎么定义？`,
      focus: `基于 ${context.artifact} 说明输入校验、错误码、权限/隔离、版本演进和兼容性，不允许只讲 API 命名。`,
      followUps: ['哪些错误必须同步返回，哪些适合异步通知？', '如何处理老版本用户态或老固件？', `安全边界如何覆盖 ${context.boundary}？`],
    },
    latency: {
      title: `请把“${context.failure}”拆成可测量的端到端延迟关键路径。`,
      focus: `拆出同步等待、异步队列、硬件交互、缓存/内存路径，并说明每段用什么证据测量。`,
      followUps: ['P50 和 P99 分别可能受什么影响？', '如何判断是排队还是执行慢？', `如果 ${context.scale}，哪一段最先恶化？`],
    },
    memory: {
      title: `${context.artifact} 里的 buffer、缓存和对象所有权如何设计，怎样避免泄漏或 use-after-free？`,
      focus: `结合 ${context.artifact} 讲清分配位置、所有权、释放时机、失败回滚、压力测试和泄漏检测。`,
      followUps: ['谁拥有 buffer，谁只借用引用？', '如何构造泄漏或 UAF 的最小复现？', `哪些 ${context.boundary} 会改变内存策略？`],
    },
    security: {
      title: `围绕 ${context.boundary}，权限、安全和隔离风险具体在哪里？`,
      focus: `要求指出攻击面、越权路径、信息泄露点、隔离边界和审计证据，必须落到 ${context.boundary}。`,
      followUps: ['哪个输入最不可信？', '如何证明隔离边界真的生效？', '日志里哪些字段必须脱敏或限权？'],
    },
    testability: {
      title: `请为“${context.failure}”设计一个能教会新人定位问题的最小实验。`,
      focus: `实验必须能复现 ${context.failure} 或验证 ${context.corePath}，包含输入、观测、预期结果和失败解释。`,
      followUps: ['实验如何避免偶然通过？', '哪些指标必须自动采集？', '如何把实验纳入 CI 或回归门禁？'],
    },
    bringup: {
      title: `新机器/新平台第一次 bring-up ${module.title} 时，你会按什么顺序验证 ${context.artifact}？`,
      focus: `从最小链路开始，逐步验证 ${context.artifact}、配置、硬件/平台依赖和异常恢复。`,
      followUps: ['第一条必须成功的最小链路是什么？', '失败后如何判断是软件配置还是硬件/固件问题？', '哪些检查必须自动化？'],
    },
    compat: {
      title: `遇到 ${context.boundary} 时，跨版本/跨硬件兼容性最容易踩哪些坑？`,
      focus: `围绕 ${context.boundary} 说明能力探测、fallback、版本矩阵、灰度和回滚。`,
      followUps: ['哪些能力不能靠版本号判断？', 'fallback 会牺牲什么指标？', '兼容性测试矩阵如何收敛？'],
    },
    observability: {
      title: `为了定位“${context.failure}”，如果只能加 8 个指标或 trace 点，你会放在哪里？`,
      focus: `指标必须覆盖 ${context.corePath} 的入口、关键状态、队列/等待、错误分支和恢复结果。`,
      followUps: ['哪个指标最容易误导？', '如何控制采样成本？', `如何把 ${context.evidence} 关联到同一次请求或作业？`],
    },
    bottleneck: {
      title: `你认为这个场景最可能的第一瓶颈是什么，如何用实验推翻自己？`,
      focus: `基于 ${context.scale} 和 ${context.compare} 做假设排序，用指标和反事实实验证明或推翻。`,
      followUps: ['如果实验结果相反，下一假设是什么？', '如何避免只优化局部指标？', '瓶颈移动后白板图怎么改？'],
    },
    fallback: {
      title: `当 ${context.failure} 发生时，如何降级、隔离和恢复而不扩大影响？`,
      focus: `讨论超时、重试、隔离、回滚、数据一致性和用户/租户可感知影响，不能只说“重启服务”。`,
      followUps: ['何时降级，何时直接 fail fast？', '自动恢复的停止条件是什么？', '如何验证降级没有破坏一致性或安全边界？'],
    },
    'data-flow': {
      title: `请画出 ${context.failure} 对应的数据流、控制流、状态机和异常分支。`,
      focus: `图中必须包含 ${context.artifact}、正常路径、${context.failure} 的异常路径、观测点和恢复路径。`,
      followUps: ['哪些边是同步调用，哪些边是异步回调？', '状态机里哪个状态最容易卡住？', '如何从一条日志定位到图中的节点？'],
    },
    compare: {
      title: `面对 ${context.failure}，${context.compare} 应该如何取舍？`,
      focus: `比较性能、可靠性、安全、复杂度、可观测性和团队维护成本，必须结合 ${context.scenario}。`,
      followUps: ['哪个方案短期最安全，哪个长期最可维护？', '如果约束变成低延迟优先，选择会变吗？', '如何用实验而不是偏好做决策？'],
    },
    capacity: {
      title: `如果 ${context.scale}，原方案哪里会先失效？`,
      focus: `要求做容量估算、热点分析、资源隔离和压测设计，指出第一个会被打满的队列/锁/链路/缓存。`,
      followUps: ['容量公式里最不确定的参数是什么？', '扩容前能做哪些软件侧优化？', '如何设计压测避免假乐观？'],
    },
    incident: {
      title: `把 ${context.failure} 当成一次真实事故：你如何止血、恢复、复盘？`,
      focus: `给出时间线、证据保留、影响面、恢复动作、根因验证、长期修复和 owner，不要写抽象流程。`,
      followUps: ['前 10 分钟做什么？', '哪些动作可能破坏证据？', '复盘 action 如何变成可验证的门禁？'],
    },
    'design-review': {
      title: `评审 ${context.scenario} 的设计文档时，你会抓住哪 6 个具体问题？`,
      focus: `评审必须覆盖 ${context.corePath}、${context.failure}、${context.evidence}、${context.boundary} 和 ${context.scale}。`,
      followUps: ['哪个问题如果答不上来就不能上线？', '如何把设计评审转成测试计划？', '哪些风险需要灰度而不是一次性上线？'],
    },
  }

  const selected = variants[pattern.key] || variants['core-path']
  return { ...selected, context }
}

function makeBankChallenges(bank: InterviewBank): Challenge[] {
  const rows = bank.patterns.flatMap((pattern) => bank.modules.map((module) => {
    const id = `${bank.prefix}-${module.key}-${pattern.key}`
    const concrete = concreteQuestionFor(bank, module, pattern)
    const title = concrete?.title || pattern.title.replace('{focus}', module.focus)
    return {
      id,
      title: `${bank.title}：${module.title}：${title}`,
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
        ...(concrete?.followUps || [
          `如果 ${module.concepts[0]} 出现异常，你第一步看什么？`,
          '如何用最小实验验证你的根因判断？',
          '如果规模扩大 10 倍，哪个环节先成为瓶颈？',
        ]),
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
