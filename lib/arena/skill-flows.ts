export type ArenaSkillFlow = {
  id: string
  title: string
  subtitle: string
  domain: 'education' | 'interview'
  accent: string
  href: string
  steps: string[]
}

export const arenaSkillFlows: ArenaSkillFlow[] = [
  {
    id: 'mistake-review',
    title: '错题复盘',
    subtitle: '题目识别、错因诊断、订正路径、举一反三和复习计划。',
    domain: 'education',
    accent: 'from-amber-200 via-orange-300 to-rose-400',
    href: '/arena/flows/mistake-review',
    steps: ['识别题目', '定位错因', '生成同类题', '安排复习'],
  },
  {
    id: 'photo-question-answering',
    title: '拍照答疑',
    subtitle: '面向图片/PDF 题目，后续可接 Pix2Text/LaTeX-OCR 识别公式和版面。',
    domain: 'education',
    accent: 'from-sky-200 via-cyan-300 to-teal-400',
    href: '/arena/flows/photo-question',
    steps: ['上传题目', 'OCR/公式识别', '分步讲解', '微检查'],
  },
  {
    id: 'daily-practice-plan',
    title: '每日练习',
    subtitle: '围绕薄弱知识点生成 10-20 分钟短练，并沉淀学习记录。',
    domain: 'education',
    accent: 'from-lime-200 via-emerald-300 to-green-500',
    href: '/arena/flows/daily-review',
    steps: ['读取弱点', '选择题型', '短练任务', 'FSRS 复习'],
  },
  {
    id: 'mock-interview-review',
    title: '模拟面试评分',
    subtitle: '把回答当作候选人表现评审，给分、补强答案并继续追问。',
    domain: 'interview',
    accent: 'from-violet-200 via-fuchsia-300 to-pink-500',
    href: '/arena/flows/mock-interview',
    steps: ['Agent 提问', '用户回答', '评分复盘', '下一轮追问'],
  },
  {
    id: 'system-design-interview',
    title: '系统设计面试',
    subtitle: '按需求澄清、规模估算、架构、瓶颈、容灾和成本组织训练。',
    domain: 'interview',
    accent: 'from-slate-200 via-blue-300 to-indigo-500',
    href: '/arena/flows/system-design-interview',
    steps: ['澄清需求', '设计架构', '分析瓶颈', '复盘取舍'],
  },
]
