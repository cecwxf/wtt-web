import type { Challenge } from './types'

export type ArenaSectionSlug = string

export type ArenaSection = {
  slug: ArenaSectionSlug
  parentSlug?: ArenaSectionSlug
  title: string
  titleZh: string
  eyebrow: string
  description: string
  descriptionZh: string
  category?: string
  accent: string
  href: string
  sources: Array<{ label: string; url: string }>
}

const technologySections: ArenaSection[] = [
  {
    slug: 'ai-kernel',
    parentSlug: 'technology',
    title: 'AI Kernel',
    titleZh: 'AI Kernel 板块',
    eyebrow: 'OpenCL · CUDA C++ · Triton · AI Operators',
    description: 'LeetGPU-style kernel drills in real kernel languages. OpenCL is the default macOS runner path; CUDA C++ and Triton are exposed as target environments for hardware/remote runners.',
    descriptionZh: '按 LeetGPU 题型完整铺开，默认使用 OpenCL C；Mac 环境可真实运行 OpenCL kernel，CUDA C++ 和 Triton 作为后续硬件/远程 runner 目标环境。',
    category: 'ai-kernel',
    accent: 'from-[#3ce8e2] to-[#00b3b3]',
    href: '/arena/sections/ai-kernel',
    sources: [
      { label: 'LeetGPU challenge map', url: 'https://github.com/AlphaGPU/leetgpu-challenges' },
      { label: 'Tensara GPU challenges', url: 'https://tensara.org/' },
    ],
  },
  {
    slug: 'ai-interview',
    parentSlug: 'technology',
    title: 'AI Interview',
    titleZh: 'AI 面试板块',
    eyebrow: 'ML System Design · LLM · MLOps',
    description: 'Authority-inspired AI interview prompts covering ML system design, LLM/RAG, feature stores, online experiments, model serving and reliability.',
    descriptionZh: '聚合权威面试站点方向：机器学习系统设计、LLM/RAG、特征平台、在线实验、模型服务与稳定性。',
    category: 'ai-interview',
    accent: 'from-violet-300 to-fuchsia-500',
    href: '/arena/sections/ai-interview',
    sources: [
      { label: 'Interview Query ML system design', url: 'https://www.interviewquery.com/p/machine-learning-interview-questions' },
      { label: 'iGotAnOffer ML system design', url: 'https://igotanoffer.com/en/advice/machine-learning-system-design-interview' },
      { label: 'DataInterview ML system design', url: 'https://www.datainterview.com/blog/ml-system-design-interview-questions' },
      { label: 'Google Rules of ML', url: 'https://developers.google.com/machine-learning/guides/rules-of-ml' },
    ],
  },
  {
    slug: 'coding-interview',
    parentSlug: 'technology',
    title: 'Coding Interview',
    titleZh: '编程面试板块',
    eyebrow: 'DSA · Online Judge · Agent Review',
    description: 'Classic coding interview drills with real judge feedback and Agent review.',
    descriptionZh: '经典算法面试题，保留真实判题与 Agent 复盘。',
    category: 'coding-interview',
    accent: 'from-amber-200 to-orange-500',
    href: '/arena/sections/coding-interview',
    sources: [
      { label: 'LeetCode problem patterns', url: 'https://leetcode.com/problemset/' },
    ],
  },
  {
    slug: 'linux-kernel-interview',
    parentSlug: 'technology',
    title: 'Linux Kernel Interview',
    titleZh: 'Linux Kernel 面试板块',
    eyebrow: 'Drivers · Scheduler · MM · Debug',
    description: 'Kernel subsystem interview drills covering drivers, scheduling, memory, filesystems, networking, stability, performance and debugging.',
    descriptionZh: '覆盖驱动、调度、内存、文件系统、网络、稳定性、性能与 Debug 的 Linux kernel 面试题。',
    category: 'linux-kernel-interview',
    accent: 'from-lime-200 to-emerald-500',
    href: '/arena/sections/linux-kernel-interview',
    sources: [
      { label: '0voice linux_kernel_wiki', url: 'https://github.com/0voice/linux_kernel_wiki' },
      { label: 'kernel-index docs map', url: 'https://github.com/tamnd/kernel-index' },
      { label: 'Linux sysadmin questions', url: 'https://github.com/chassing/linux-sysadmin-interview-questions' },
    ],
  },
  {
    slug: 'android-interview',
    parentSlug: 'technology',
    title: 'Android Interview',
    titleZh: 'Android 面试板块',
    eyebrow: 'App · Framework · HAL · BSP',
    description: 'Android application, framework and system interview prompts covering Binder, Camera, Audio, Video, Graphics, AI runtime and BSP.',
    descriptionZh: '覆盖 Android 应用、Framework、Binder、Camera、Audio、Video、Graphics、AI 推理框架和 BSP。',
    category: 'android-interview',
    accent: 'from-green-200 to-lime-500',
    href: '/arena/sections/android-interview',
    sources: [
      { label: 'Android Interview Questions', url: 'https://github.com/mohsenoid/Android-Interview-Questions' },
      { label: 'android-interview-questions', url: 'https://github.com/nitinlondhe2113/android-interview-questions' },
      { label: 'Android Q&A cheatsheet', url: 'https://github.com/vamsitallapudi/Android-Interview-Questions-And-Answers' },
    ],
  },
  {
    slug: 'ai-infra-interview',
    parentSlug: 'technology',
    title: 'AI Infra Interview',
    titleZh: 'AI Infra 面试板块',
    eyebrow: 'PCIe · RDMA · Networking · Cluster',
    description: 'AI infrastructure interviews covering PCIe/CXL, RDMA/RoCE, high-performance networking, GPU/NPU clusters, serving and reliability.',
    descriptionZh: '覆盖 PCIe/CXL、RDMA/RoCE、高性能网络、GPU/NPU 集群、推理平台、资源调度与可靠性。',
    category: 'ai-infra-interview',
    accent: 'from-sky-200 to-blue-500',
    href: '/arena/sections/ai-infra-interview',
    sources: [
      { label: 'RDMA-bench', url: 'https://github.com/efficient/rdma_bench' },
      { label: 'SNIA RDMA Q&A', url: 'https://www.snia.org/blog/2025/rdma-qa' },
      { label: 'RDMA subsystem papers', url: 'https://arxiv.org/abs/2304.11467' },
    ],
  },
  {
    slug: 'ai-compiler-runtime-interview',
    parentSlug: 'technology',
    title: 'AI Compiler/Runtime Interview',
    titleZh: 'AI 编译器/Runtime 面试板块',
    eyebrow: 'LLVM · MLIR · CUDA · PyTorch · Triton',
    description: 'AI compiler and runtime interviews covering LLVM/MLIR, CUDA kernels, PyTorch 2 compiler, Triton, graph executors, quantization lowering and profiling.',
    descriptionZh: '覆盖 LLVM/MLIR、CUDA Kernel、PyTorch 2 编译栈、Triton、图执行 Runtime、量化 lowering、算子融合和性能调试。',
    category: 'ai-compiler-runtime-interview',
    accent: 'from-indigo-200 to-cyan-500',
    href: '/arena/sections/ai-compiler-runtime-interview',
    sources: [
      { label: 'LLVM documentation', url: 'https://llvm.org/docs/' },
      { label: 'MLIR documentation', url: 'https://mlir.llvm.org/docs/' },
      { label: 'Triton documentation', url: 'https://triton-lang.org/main/index.html' },
      { label: 'PyTorch compiler docs', url: 'https://pytorch.org/docs/stable/torch.compiler.html' },
      { label: 'CUDA C Programming Guide', url: 'https://docs.nvidia.com/cuda/cuda-c-programming-guide/' },
    ],
  },
  {
    slug: 'ic-chip-interview',
    parentSlug: 'technology',
    title: 'IC Chip Interview',
    titleZh: 'IC 芯片面试板块',
    eyebrow: 'DV · RTL · STA · PD · Tapeout',
    description: 'IC development interview prompts spanning architecture, RTL, DV/UVM, CDC/RDC, DFT, STA, physical design, signoff and tapeout.',
    descriptionZh: '覆盖芯片架构、RTL、DV/UVM、CDC/RDC、DFT、STA、后端、Signoff、DFM 与流片。',
    category: 'ic-chip-interview',
    accent: 'from-rose-200 to-pink-500',
    href: '/arena/sections/ic-chip-interview',
    sources: [
      { label: 'VLSI Verify', url: 'https://vlsiverify.com/' },
      { label: 'Hardware RTL interview questions', url: 'https://github.com/pengwubj/hw_interview_questions' },
      { label: 'DV interview handbook', url: 'https://www.dvhandbook.online/assets/docs/Cracking_Digital_VLSI_Verification_Interview.pdf' },
    ],
  },
  {
    slug: 'hardware-interview',
    parentSlug: 'technology',
    title: 'Hardware Interview',
    titleZh: '硬件面试板块',
    eyebrow: 'Schematic · PCB · SI/PI · EMC',
    description: 'Hardware engineering interviews covering schematic design, PCB layout, SI/PI, power, clocks, high-speed interfaces, debug and production.',
    descriptionZh: '覆盖原理图、PCB、SI/PI、电源、时钟、高速接口、模拟/RF、调试、量产、EMC 与安规。',
    category: 'hardware-interview',
    accent: 'from-yellow-200 to-amber-500',
    href: '/arena/sections/hardware-interview',
    sources: [
      { label: 'Hardware Engineer Interview Questions', url: 'https://github.com/mikinty/Hardware-Engineer-Interview-Questions' },
      { label: 'Embedded knowledge/interview repo', url: 'https://github.com/theEmbeddedGeorge/theEmbeddedNewTestament.github.io' },
      { label: 'HWE-Bench', url: 'https://arxiv.org/abs/2603.18102' },
    ],
  },
  {
    slug: 'virtualization-interview',
    parentSlug: 'technology',
    title: 'Virtualization Interview',
    titleZh: '虚拟化面试板块',
    eyebrow: 'KVM · Xen · pKVM · L4Re',
    description: 'Virtualization interviews covering CPU, memory, interrupt and I/O virtualization, KVM/QEMU, Xen, pKVM, microkernels and migration.',
    descriptionZh: '覆盖 CPU/内存/中断/I/O 虚拟化、KVM/QEMU、Xen、pKVM、L4Re/微内核、迁移和性能调试。',
    category: 'virtualization-interview',
    accent: 'from-fuchsia-200 to-purple-500',
    href: '/arena/sections/virtualization-interview',
    sources: [
      { label: 'KVM/QEMU questions', url: 'https://www.learnthatstack.com/interview-questions/system_administration/kvm' },
      { label: 'KVM project overview', url: 'https://en.wikipedia.org/wiki/Kernel-based_Virtual_Machine' },
      { label: 'Xen overview', url: 'https://en.wikipedia.org/wiki/Xen' },
    ],
  },
  {
    slug: 'programming-interview',
    parentSlug: 'technology',
    title: 'Programming Interview',
    titleZh: '编程面试板块',
    eyebrow: 'C · C++ · Python · Systems',
    description: 'Open-ended programming interview prompts for C/C++/Python language internals, systems programming, debugging, testing and performance.',
    descriptionZh: '开放式编程面试题，覆盖 C/C++/Python 语言机制、系统编程、并发、调试测试、性能与安全。',
    category: 'programming-interview',
    accent: 'from-orange-200 to-red-500',
    href: '/arena/sections/programming-interview',
    sources: [
      { label: 'Python interview questions', url: 'https://github.com/Devinterview-io/python-interview-questions' },
      { label: 'C++ interview prep', url: 'https://github.com/Nabagata/interview-prep' },
      { label: 'LeetCode C++/Python solutions', url: 'https://github.com/zqfang/LeetCode' },
    ],
  },
  {
    slug: 'arm-riscv-interview',
    parentSlug: 'technology',
    title: 'ARM/RISC-V Interview',
    titleZh: 'ARM/RISC-V 体系结构面试板块',
    eyebrow: 'ISA · MMU · Interrupt · Coherency',
    description: 'Architecture interviews covering ARM and RISC-V privilege models, interrupts, MMU/TLB, cache coherency, atomics, boot, security and debug.',
    descriptionZh: '覆盖 ARM/RISC-V 特权架构、中断、MMU/TLB、Cache 一致性、原子内存模型、启动、安全扩展和 Debug。',
    category: 'arm-riscv-interview',
    accent: 'from-cyan-200 to-indigo-500',
    href: '/arena/sections/arm-riscv-interview',
    sources: [
      { label: 'RISC-V ISA manual', url: 'https://github.com/riscv/riscv-isa-manual' },
      { label: 'ARM architecture docs', url: 'https://developer.arm.com/documentation' },
      { label: 'RISC-V Advanced Interrupt Architecture', url: 'https://github.com/riscv/riscv-aia' },
    ],
  },
  {
    slug: 'firmware-interview',
    parentSlug: 'technology',
    title: 'Firmware Interview',
    titleZh: '固件面试板块',
    eyebrow: 'U-Boot · UEFI · Secure Boot · Bring-up',
    description: 'Firmware interviews covering BootROM, U-Boot, UEFI/EDK2, secure boot, early hardware init, ACPI/device tree, OTA and board porting.',
    descriptionZh: '覆盖 BootROM、U-Boot、UEFI/EDK2、安全启动、早期硬件初始化、ACPI/设备树、升级恢复和平台移植。',
    category: 'firmware-interview',
    accent: 'from-teal-200 to-cyan-500',
    href: '/arena/sections/firmware-interview',
    sources: [
      { label: 'U-Boot source', url: 'https://github.com/u-boot/u-boot' },
      { label: 'U-Boot UEFI docs', url: 'https://docs.u-boot.org/en/latest/develop/uefi/u-boot_on_efi.html' },
      { label: 'Tianocore EDK2', url: 'https://github.com/tianocore/edk2' },
    ],
  },
  {
    slug: 'rtos-interview',
    parentSlug: 'technology',
    title: 'RTOS Interview',
    titleZh: 'RTOS 面试板块',
    eyebrow: 'FreeRTOS · Zephyr · Scheduler · Drivers',
    description: 'RTOS interviews covering FreeRTOS and Zephyr scheduling, tasks, IPC, memory, interrupts, drivers, low power, safety and debugging.',
    descriptionZh: '覆盖 FreeRTOS/Zephyr 调度、任务、IPC、内存、中断、驱动、低功耗、安全和调试测试。',
    category: 'rtos-interview',
    accent: 'from-emerald-200 to-teal-500',
    href: '/arena/sections/rtos-interview',
    sources: [
      { label: 'FreeRTOS kernel', url: 'https://github.com/FreeRTOS/FreeRTOS-Kernel' },
      { label: 'Zephyr RTOS', url: 'https://github.com/zephyrproject-rtos/zephyr' },
      { label: 'FreeRTOS interview questions', url: 'https://embeddedprep.com/100-freertos-interview-questions/' },
    ],
  },
]

const educationStages = [
  {
    key: 'primary',
    title: 'Primary Education',
    titleZh: '小学阶段',
    eyebrow: '小学 · 基础 · 兴趣',
    description: 'Primary-school learning drills for mathematics, olympiad math, coding and Chinese.',
    descriptionZh: '小学数学、奥赛、少儿编程和语文，强调概念理解、图示表达和兴趣启发。',
    accent: 'from-sky-200 to-cyan-500',
    subjects: [
      ['math', 'Primary Mathematics', '小学普通数学', '数与运算 · 图形 · 应用题', '对齐小学数学常见题型：数与运算、分数小数、图形测量、统计和应用题。'],
      ['olympiad', 'Primary Olympiad Math', '小学奥赛', '计数 · 数论 · 几何 · 逻辑', '参考 MOEMS/AMC8 风格，覆盖小学竞赛常见的计数、数论、几何、逻辑和构造题。'],
      ['coding', 'Kids Coding', '少儿编程', 'Scratch · Python · Debug · Project', '覆盖顺序、条件、循环、变量、函数、事件、调试和小项目设计。'],
      ['chinese', 'Primary Chinese', '小学语文', '字词 · 阅读 · 古诗 · 写作', '覆盖字词句、阅读理解、古诗文积累、修辞和习作表达。'],
    ],
  },
  {
    key: 'junior',
    title: 'Junior Secondary',
    titleZh: '初级中学阶段',
    eyebrow: '中考 · 学科基础 · 推理',
    description: 'Junior-high drills for Chinese middle-school exam and international checkpoint-style practice.',
    descriptionZh: '初中数学、奥赛、物理、化学、生物、语文，面向中考、模拟题和能力迁移。',
    accent: 'from-emerald-200 to-teal-500',
    subjects: [
      ['math', 'Junior Mathematics', '初中数学', '方程 · 函数 · 几何 · 统计', '覆盖方程不等式、函数、几何证明、统计概率和中考压轴题型。'],
      ['olympiad', 'Junior Olympiad Math', '初中奥赛', '数论 · 组合 · 几何 · 代数', '参考 AMC8/AMC10、MOEMS 和初中竞赛风格，强调证明、构造和分类讨论。'],
      ['physics', 'Junior Physics', '初中物理', '力学 · 电学 · 光热声', '覆盖力学、电学、光学、热学、声学、实验探究和中考综合题。'],
      ['chemistry', 'Junior Chemistry', '初中化学', '物质 · 反应 · 实验 · 计算', '覆盖物质分类、化学方程式、实验探究、溶液和基础计算。'],
      ['biology', 'Junior Biology', '初中生物', '细胞 · 生理 · 遗传 · 生态', '覆盖细胞、生物体结构、生理、遗传、生态和实验分析。'],
      ['chinese', 'Junior Chinese', '初中语文', '现代文 · 文言文 · 作文', '覆盖现代文阅读、文言文、古诗鉴赏、综合性学习和作文。'],
    ],
  },
  {
    key: 'senior',
    title: 'Senior Secondary',
    titleZh: '高级中学阶段',
    eyebrow: '高考 · 竞赛 · 综合能力',
    description: 'Senior-high practice for Gaokao-style, olympiad-style and international upper-secondary questions.',
    descriptionZh: '高中数学、奥赛、物理、化学、生物、语文，面向高考、模拟题、竞赛和综合素养。',
    accent: 'from-violet-200 to-fuchsia-500',
    subjects: [
      ['math', 'Senior Mathematics', '高中数学', '函数 · 解析几何 · 概率 · 导数', '覆盖函数导数、三角、数列、立体几何、解析几何、概率统计和高考压轴。'],
      ['olympiad', 'Senior Olympiad Math', '高中奥赛', 'IMO · 代数 · 几何 · 组合', '覆盖代数、几何、数论、组合与不等式，强调完整证明和构造。'],
      ['physics', 'Senior Physics', '高中物理', '力电磁 · 实验 · 模型', '覆盖力学、电磁学、热学、光学、近代物理、实验和高考模型题。'],
      ['chemistry', 'Senior Chemistry', '高中化学', '反应原理 · 有机 · 实验 · 工艺流程', '覆盖反应原理、元素化合物、有机、实验设计、工艺流程和计算。'],
      ['biology', 'Senior Biology', '高中生物', '遗传 · 代谢 · 稳态 · 实验', '覆盖分子与细胞、遗传进化、稳态调节、生态、实验设计和图表分析。'],
      ['chinese', 'Senior Chinese', '高中语文', '论述文 · 古诗文 · 作文', '覆盖论述类文本、文学类文本、古诗文、语言运用和高考作文。'],
    ],
  },
] as const

const educationStageSections: ArenaSection[] = educationStages.map((stage) => ({
  slug: `education-${stage.key}`,
  parentSlug: 'education',
  title: stage.title,
  titleZh: stage.titleZh,
  eyebrow: stage.eyebrow,
  description: stage.description,
  descriptionZh: stage.descriptionZh,
  accent: stage.accent,
  href: `/arena/sections/education-${stage.key}`,
  sources: [
    { label: '义务教育数学课程标准 2022', url: 'https://www.moe.gov.cn/srcsite/A26/s8001/202204/W020220420582346895190.pdf' },
    { label: '中国教育考试网高考', url: 'https://gaokao.neea.edu.cn/' },
    { label: 'Cambridge Checkpoint resources', url: 'https://www.cambridgeinternational.org/' },
  ],
}))

const educationSubjectSections: ArenaSection[] = educationStages.flatMap((stage) => stage.subjects.map(([key, title, titleZh, eyebrow, descriptionZh]) => ({
  slug: `education-${stage.key}-${key}`,
  parentSlug: `education-${stage.key}`,
  title,
  titleZh,
  eyebrow,
  description: descriptionZh,
  descriptionZh,
  category: `education-${stage.key}-${key}`,
  accent: stage.accent,
  href: `/arena/sections/education-${stage.key}-${key}`,
  sources: [
    { label: '中国教育考试网高考', url: 'https://gaokao.neea.edu.cn/' },
    { label: 'MAA AMC', url: 'https://maa.org/student-programs/amc/' },
    { label: 'MOEMS', url: 'https://moems.org/' },
    { label: 'Cambridge Checkpoint', url: 'https://www.cambridgeinternational.org/' },
  ],
})))

export const arenaSections: ArenaSection[] = [
  {
    slug: 'technology',
    title: 'Technology',
    titleZh: '技术板块',
    eyebrow: 'IT · AI · Kernel · Hardware · Coding',
    description: 'A unified entry for technical interview, systems, AI kernel and coding boards.',
    descriptionZh: '统一收纳 AI Kernel、AI/系统/硬件/芯片/固件/RTOS/编程等技术训练和面试板块。',
    accent: 'from-[#3ce8e2] to-[#00b3b3]',
    href: '/arena/sections/technology',
    sources: [
      { label: 'LeetGPU challenge map', url: 'https://github.com/AlphaGPU/leetgpu-challenges' },
      { label: 'Linux kernel docs map', url: 'https://github.com/tamnd/kernel-index' },
      { label: 'RISC-V ISA manual', url: 'https://github.com/riscv/riscv-isa-manual' },
    ],
  },
  {
    slug: 'education',
    title: 'Education',
    titleZh: '教育板块',
    eyebrow: '小学 · 初中 · 高中 · Coach',
    description: 'Stage-based learning boards with Arena Coach and whiteboard support.',
    descriptionZh: '按小学、初中、高中组织学科训练；每道题复用 Arena Chat 和白板讲解。',
    accent: 'from-amber-200 to-pink-500',
    href: '/arena/sections/education',
    sources: [
      { label: '义务教育数学课程标准 2022', url: 'https://www.moe.gov.cn/srcsite/A26/s8001/202204/W020220420582346895190.pdf' },
      { label: '中国教育考试网高考', url: 'https://gaokao.neea.edu.cn/' },
      { label: 'MAA AMC', url: 'https://maa.org/student-programs/amc/' },
    ],
  },
  {
    slug: 'gaokao-volunteer',
    title: 'Gaokao Volunteer Advisor',
    titleZh: '高考志愿板块',
    eyebrow: '院校 · 专业 · 位次 · 就业',
    description: 'A data-aware Gaokao volunteer advisor for university tiers, province rank, major choice, study planning and career outcomes.',
    descriptionZh: '围绕本科院校层次、近年分数线/位次、热门专业、毕业去向、大学规划和就业建议进行 Ask 咨询。',
    category: 'gaokao-volunteer',
    accent: 'from-blue-200 to-indigo-500',
    href: '/arena/sections/gaokao-volunteer',
    sources: [
      { label: '教育部全国高等学校名单', url: 'https://www.moe.gov.cn/jyb_xxgk/s5743/s5744/202406/t20240621_1136990.html' },
      { label: '阳光高考', url: 'https://gaokao.chsi.com.cn/' },
      { label: '第二轮双一流名单', url: 'https://www.gov.cn/zhengce/zhengceku/2022-02/14/content_5673496.htm' },
      { label: '软科中国大学排名', url: 'https://www.shanghairanking.cn/' },
    ],
  },
  ...technologySections,
  ...educationStageSections,
  ...educationSubjectSections,
]

export function getArenaSection(slug: string) {
  return arenaSections.find((section) => section.slug === slug) || null
}

export function childSections(slug: string) {
  return arenaSections.filter((section) => section.parentSlug === slug)
}

export function rootArenaSections() {
  return arenaSections.filter((section) => !section.parentSlug)
}

function categorySetForSection(slug: string): Set<string> {
  const section = getArenaSection(slug)
  const categories = new Set<string>()
  if (!section) return categories
  if (section.category) categories.add(section.category)
  childSections(slug).forEach((child) => {
    categorySetForSection(child.slug).forEach((category) => categories.add(category))
  })
  return categories
}

export function challengesForSection(challenges: Challenge[], slug: string) {
  const categories = categorySetForSection(slug)
  if (!categories.size) return []
  return challenges.filter((challenge) => categories.has(challenge.category))
}

export function sectionStats(challenges: Challenge[], slug: string) {
  const rows = challengesForSection(challenges, slug)
  return {
    total: rows.length,
    easy: rows.filter((challenge) => challenge.difficulty === 'easy').length,
    medium: rows.filter((challenge) => challenge.difficulty === 'medium').length,
    hard: rows.filter((challenge) => challenge.difficulty === 'hard').length,
  }
}
