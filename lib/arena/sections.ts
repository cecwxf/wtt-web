import type { Challenge } from './types'

export type ArenaSectionSlug =
  | 'ai-kernel'
  | 'ai-interview'
  | 'linux-kernel-interview'
  | 'android-interview'
  | 'ai-infra-interview'
  | 'ic-chip-interview'
  | 'hardware-interview'
  | 'virtualization-interview'
  | 'programming-interview'
  | 'arm-riscv-interview'
  | 'firmware-interview'
  | 'rtos-interview'
  | 'coding-interview'

export type ArenaSection = {
  slug: ArenaSectionSlug
  title: string
  titleZh: string
  eyebrow: string
  description: string
  descriptionZh: string
  category: string
  accent: string
  href: string
  sources: Array<{ label: string; url: string }>
}

export const arenaSections: ArenaSection[] = [
  {
    slug: 'ai-kernel',
    title: 'AI Kernel',
    titleZh: 'AI Kernel 板块',
    eyebrow: 'GPU · CUDA/OpenCL · AI Operators',
    description: 'LeetGPU-style kernel drills: vector ops, GEMM, convolution, attention, quantization, MoE and model blocks. CPU-sim today, hardware runners later.',
    descriptionZh: '按 LeetGPU 题型完整铺开：向量、GEMM、卷积、Attention、量化、MoE 与模型块。当前 CPU-sim，后续切真实硬件 runner。',
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
    slug: 'ic-chip-interview',
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

export function getArenaSection(slug: string) {
  return arenaSections.find((section) => section.slug === slug) || null
}

export function challengesForSection(challenges: Challenge[], slug: string) {
  const section = getArenaSection(slug)
  if (!section) return []
  return challenges.filter((challenge) => challenge.category === section.category)
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
