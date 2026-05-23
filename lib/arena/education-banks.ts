import type { Challenge } from './types'

const createdAt = '2026-05-15T00:00:00.000Z'

type Difficulty = 'easy' | 'medium' | 'hard'
type Template = NonNullable<Challenge['whiteboard_template']>

type EducationModule = {
  key: string
  title: string
  focus: string
  concepts: string[]
  whiteboardTemplate: Template
}

type EducationPattern = {
  key: string
  difficulty: Difficulty
  title: string
  focus: string
}

type EducationBank = {
  prefix: string
  category: string
  stage: string
  subject: string
  tags: string[]
  modules: EducationModule[]
}

const patterns: EducationPattern[] = [
  { key: 'classic', difficulty: 'easy', title: '经典例题求解', focus: '准确理解题意，写出关键步骤，最后检查答案是否合理。' },
  { key: 'concept', difficulty: 'easy', title: '核心概念辨析', focus: '解释定义、适用条件、反例和易混点。' },
  { key: 'model', difficulty: 'medium', title: '图示或表格建模', focus: '把题意转化为图、表、线段图、函数图像或流程图。' },
  { key: 'error', difficulty: 'medium', title: '错因诊断与订正', focus: '定位常见错误，说明为什么错，并给出最小订正路径。' },
  { key: 'exam', difficulty: 'medium', title: '模拟考试综合题', focus: '按考试题步骤组织答案，兼顾得分点、书写规范和时间分配。' },
  { key: 'proof', difficulty: 'hard', title: '解释、证明或实验论证', focus: '给出可验证的推理链，必要时补充公式、图像或实验设计。' },
  { key: 'compare', difficulty: 'medium', title: '一题多解与方法比较', focus: '至少比较两种解法，说明适用范围、复杂度或表达优劣。' },
  { key: 'application', difficulty: 'medium', title: '真实情境应用', focus: '把知识点迁移到生活、实验、阅读或项目情境。' },
  { key: 'extension', difficulty: 'hard', title: '变式迁移与压轴拓展', focus: '改变条件或目标，分析不变量、边界和推广结论。' },
  { key: 'whiteboard', difficulty: 'medium', title: '白板讲解设计', focus: '设计适合老师边讲边画的结构图，突出关键步骤和误区。' },
]

function m(key: string, title: string, focus: string, template: Template = 'solution_flow'): EducationModule {
  const concepts = [title, ...focus.replace(/、/g, '，').split('，').map((item) => item.trim()).filter(Boolean)].slice(0, 5)
  return { key, title, focus, concepts, whiteboardTemplate: template }
}

const primaryMath = [
  m('number', '数与运算', '整数四则混合运算、估算、倍数因数、运算律和算式意义'),
  m('fraction', '分数与小数', '分数意义、通分约分、小数位值、百分数和大小比较'),
  m('geometry', '平面图形', '三角形、四边形、圆、周长面积、割补和对称', 'pipeline'),
  m('measurement', '计量与单位', '长度、面积、体积、质量、时间、人民币和单位换算'),
  m('word-problem', '应用题', '和差倍、归一归总、行程、工程、盈亏和鸡兔同笼', 'pipeline'),
  m('equation', '简易方程', '未知数、等量关系、列方程和检验'),
  m('ratio', '比和比例', '比的意义、比例尺、速度时间路程和百分率'),
  m('statistics', '统计与概率', '平均数、条形图、折线图、可能性和数据解释', 'evaluation_loop'),
  m('pattern', '规律探索', '数列、图形规律、周期问题和递推观察'),
  m('spatial', '空间想象', '展开图、立体图形、表面积、体积和视图', 'pipeline'),
]

const primaryOlympiad = [
  m('counting', '枚举与计数', '有序无序、分类分步、树形图和不重不漏'),
  m('number-theory', '初等数论', '奇偶性、整除、余数、质数合数和最大公因数'),
  m('geometry', '几何巧算', '割补、等积变形、角度追踪和图形拼接', 'pipeline'),
  m('logic', '逻辑推理', '真假话、列表排除、条件推理和假设法'),
  m('pigeonhole', '抽屉原理', '至少至多、最坏情况和分类抽屉'),
  m('inclusion', '容斥思想', '集合重叠、重复计数和维恩图', 'pipeline'),
  m('parity', '奇偶与不变量', '操作不变量、颜色法、奇偶性和可达性'),
  m('rate', '行程与工程', '相遇追及、多人合作、效率和总量守恒', 'pipeline'),
  m('age', '年龄与周期', '年龄差不变、周期循环、日历和钟表'),
  m('construction', '构造题', '从目标倒推、极端例子、策略和验证', 'system_architecture'),
]

const primaryCoding = [
  m('sequence', '顺序执行', '指令顺序、角色移动、画图和过程分解', 'pipeline'),
  m('condition', '条件判断', 'if/else、比较、布尔表达式和分支测试'),
  m('loop', '循环结构', '重复、计数循环、直到循环、嵌套循环和终止条件'),
  m('variable', '变量与数据', '变量、计数器、字符串、坐标和状态更新'),
  m('function', '函数/积木封装', '参数、复用、拆分任务和命名'),
  m('event', '事件驱动', '点击、键盘、广播、消息和并发角色', 'system_architecture'),
  m('debug', '调试', '断点观察、最小复现、日志、边界和修 bug', 'evaluation_loop'),
  m('array', '列表/数组', '列表存储、遍历、查找、排序和统计'),
  m('recursion', '递归启蒙', '自相似、倒推、分治和停止条件'),
  m('project', '项目设计', '游戏规则、输入输出、状态机、关卡和验收', 'system_architecture'),
]

const primaryChinese = [
  m('characters', '字音字形', '拼音、多音字、形近字、易错字和查字典'),
  m('words', '词语运用', '近反义词、成语、关联词、词语感情色彩和语境'),
  m('sentence', '句子训练', '扩句缩句、病句修改、句式转换和标点'),
  m('reading', '现代文阅读', '概括内容、人物品质、关键语句和文章结构'),
  m('poetry', '古诗积累', '诗句理解、意象、情感和背诵迁移'),
  m('rhetoric', '修辞表达', '比喻、拟人、排比、夸张和表达效果'),
  m('writing', '习作', '审题、选材、详略、开头结尾和修改', 'pipeline'),
  m('oral', '口语交际', '观点表达、倾听、劝说、转述和情境交流'),
  m('literature', '整本书阅读', '人物、情节、主题、摘录和读后感'),
  m('comprehensive', '综合实践', '信息提取、图文转换、活动方案和表达'),
]

const juniorMath = [
  m('number-algebra', '数与式', '有理数、整式、分式、二次根式和化简求值'),
  m('equation', '方程与不等式', '一元一次、一元二次、方程组、不等式组和应用'),
  m('function', '函数', '一次函数、反比例函数、二次函数、图像和性质', 'pipeline'),
  m('geometry-proof', '几何证明', '三角形、四边形、圆、相似、全等和辅助线'),
  m('coordinate', '平面直角坐标系', '坐标、距离、中点、函数图像和几何结合'),
  m('statistics', '统计概率', '样本、平均数、中位数、方差、概率和频率', 'evaluation_loop'),
  m('trigonometry', '锐角三角函数', '正弦余弦正切、解直角三角形和实际测量'),
  m('construction', '尺规作图', '垂线、角平分线、中垂线、圆和轨迹'),
  m('application', '实际应用', '利润、行程、工程、增长率和方案选择'),
  m('final-problem', '中考压轴', '动点、存在性、最值、分类讨论和函数几何综合', 'system_architecture'),
]

const juniorOlympiad = [
  m('algebra', '代数变形', '因式分解、配方、恒等变形和不等式'),
  m('number-theory', '数论', '整除、同余、质因数、最大公因数和丢番图'),
  m('geometry', '竞赛几何', '相似、圆、角追踪、面积法和辅助线', 'pipeline'),
  m('combinatorics', '组合计数', '排列组合、递推、容斥、染色和图论启蒙'),
  m('invariant', '不变量', '奇偶、模运算、颜色、单调量和操作问题'),
  m('inequality', '不等式', '均值不等式、排序、放缩和极值'),
  m('functional', '函数与方程', '函数构造、方程根、参数和图像'),
  m('strategy', '博弈策略', '必胜态、对称策略、递推状态和反推'),
  m('construction', '构造与反例', '极端构造、反例、存在性和唯一性'),
  m('proof-writing', '证明表达', '分类、归纳、反证、严谨书写和检查漏洞'),
]

const juniorPhysics = [
  m('mechanics', '力学', '速度、力、压强、浮力、功、功率和机械效率', 'pipeline'),
  m('electricity', '电学', '电路、电流电压电阻、欧姆定律、电功率和故障判断', 'inference_flow'),
  m('optics', '光学', '光的传播、反射、折射、透镜成像和作图'),
  m('thermal', '热学', '温度、物态变化、比热容、热量计算和热机'),
  m('sound', '声学', '声音产生、传播、音调响度音色和噪声控制'),
  m('experiment', '实验探究', '控制变量、器材选择、误差、数据表格和结论', 'evaluation_loop'),
  m('graph', '图像分析', 's-t、v-t、I-U、温度时间图和斜率意义'),
  m('estimate', '估算与单位', '数量级、单位换算、合理性判断和近似计算'),
  m('comprehensive', '中考综合', '力电热综合、实际装置、图表和多步骤推理'),
  m('debug', '错题诊断', '概念混淆、公式误用、条件遗漏和单位错误', 'evaluation_loop'),
]

const juniorChemistry = [
  m('matter', '物质分类', '纯净物混合物、单质化合物、酸碱盐和氧化物'),
  m('equation', '化学方程式', '配平、质量守恒、反应类型和信息方程式'),
  m('experiment', '实验探究', '气体制备、除杂、检验、装置评价和安全', 'evaluation_loop'),
  m('solution', '溶液', '溶解度、质量分数、稀释、结晶和图像'),
  m('calculation', '化学计算', '相对分子质量、质量守恒、方程式计算和过量判断'),
  m('metal', '金属', '金属活动性、置换、腐蚀防护和合金'),
  m('acid-base-salt', '酸碱盐', '酸碱性、pH、中和、复分解和离子检验'),
  m('air-water', '空气与水', '氧气、二氧化碳、水净化、污染和资源'),
  m('micro', '微观粒子', '原子、分子、离子、元素周期表和化合价'),
  m('process', '流程题', '原料、转化、除杂、循环利用和绿色化学', 'pipeline'),
]

const juniorBiology = [
  m('cell', '细胞', '显微镜、细胞结构、细胞分裂和临时装片'),
  m('plant', '植物', '光合作用、呼吸作用、蒸腾作用和运输'),
  m('human', '人体生理', '消化、呼吸、循环、泌尿、神经和内分泌'),
  m('genetics', '遗传与变异', '性状、基因、显隐性、遗传图解和变异'),
  m('ecology', '生态', '食物链、生态系统、能量流动和生物多样性'),
  m('microbe', '微生物', '细菌真菌病毒、发酵、免疫和传染病'),
  m('experiment', '实验分析', '变量控制、对照实验、数据记录和结论', 'evaluation_loop'),
  m('evolution', '生命起源与进化', '化石、自然选择、适应和分类'),
  m('health', '健康生活', '营养、运动、药物、急救和公共卫生'),
  m('graph', '图表题', '曲线、柱状图、流程图和材料分析', 'pipeline'),
]

const juniorChinese = [
  m('modern-reading', '现代文阅读', '记叙文、说明文、议论文、结构和语言赏析'),
  m('classical', '文言文', '实词虚词、句式、翻译、断句和内容理解'),
  m('poetry', '古诗鉴赏', '意象、情感、炼字、表现手法和比较阅读'),
  m('language-use', '语言运用', '病句、衔接、压缩语段、图文转换和仿写'),
  m('composition', '作文', '审题立意、选材、结构、细节和升格', 'pipeline'),
  m('famous-books', '名著阅读', '人物、情节、主题、艺术特色和观点表达'),
  m('comprehensive', '综合性学习', '活动方案、材料探究、口语交际和倡议书'),
  m('rhetoric', '表达技巧', '修辞、描写、抒情、议论和表达效果'),
  m('exam-answer', '答题规范', '关键词、分点作答、证据引用和避免空泛'),
  m('compare', '群文阅读', '多文本信息整合、观点比较和评价'),
]

const seniorMath = [
  m('function', '函数与导数', '函数性质、零点、导数、单调性、极值和恒成立', 'pipeline'),
  m('trigonometry', '三角函数', '诱导公式、图像性质、解三角形和恒等变换'),
  m('sequence', '数列', '等差等比、递推、求和、放缩和数学归纳'),
  m('solid-geometry', '立体几何', '空间线面关系、体积、角度、距离和向量法'),
  m('analytic-geometry', '解析几何', '圆锥曲线、直线、弦长、参数和最值', 'pipeline'),
  m('probability', '概率统计', '排列组合、随机变量、分布、期望和统计推断', 'evaluation_loop'),
  m('vector', '平面向量', '坐标运算、数量积、几何意义和最值'),
  m('inequality', '不等式', '基本不等式、放缩、构造函数和证明'),
  m('complex', '复数与算法', '复数运算、几何意义、算法框图和逻辑'),
  m('final-problem', '高考压轴', '导数综合、解析几何综合、分类讨论和参数范围', 'system_architecture'),
]

const seniorOlympiad = [
  m('algebra', '竞赛代数', '多项式、函数方程、递推、复数和代数结构'),
  m('geometry', '竞赛几何', '圆、相似、射影、反演、面积法和坐标法', 'pipeline'),
  m('number-theory', '竞赛数论', '同余、二次剩余、数论函数、丢番图和无穷递降'),
  m('combinatorics', '组合数学', '计数、图论、极值、概率方法和递推'),
  m('inequality', '不等式', '均值、柯西、Jensen、排序和构造'),
  m('functional', '函数方程', '代入、单射满射、连续性、单调性和构造'),
  m('induction', '归纳与递推', '数学归纳、强归纳、递推构造和不变量'),
  m('extremal', '极值原理', '最小反例、极端元素、单调量和反证'),
  m('construction', '构造题', '存在性、算法构造、反例和边界检查'),
  m('proof', '证明写作', '完整性、严谨性、引理拆分和漏洞检查'),
]

const seniorPhysics = [
  m('mechanics', '力学', '牛顿定律、能量、动量、圆周运动、振动和万有引力', 'pipeline'),
  m('electric-field', '静电场', '电场强度、电势、电容、带电粒子运动和图像'),
  m('circuit', '电路', '恒定电流、闭合电路欧姆定律、动态电路和实验'),
  m('magnetism', '磁场与电磁感应', '洛伦兹力、安培力、感应电动势和能量转化', 'inference_flow'),
  m('thermo', '热学', '气体状态方程、热力学定律和分子动理论'),
  m('optics', '光学', '几何光学、干涉衍射、光电效应和波粒二象性'),
  m('modern', '近代物理', '原子核、能级、半衰期、动量能量关系和模型'),
  m('experiment', '实验', '误差、仪器读数、数据处理、图像法和方案评价', 'evaluation_loop'),
  m('modeling', '物理建模', '受力分析、过程分段、守恒量和近似条件'),
  m('final-problem', '高考压轴', '多过程、多对象、临界条件、图像和数学推导', 'system_architecture'),
]

const seniorChemistry = [
  m('principle', '化学反应原理', '热化学、速率、平衡、电化学和水溶液离子平衡', 'pipeline'),
  m('inorganic', '元素化合物', '钠铝铁铜、氯硫氮、性质转化和推断'),
  m('organic', '有机化学', '官能团、同分异构、反应类型、合成路线和谱图'),
  m('experiment', '化学实验', '制备、分离提纯、检验、误差、安全和方案评价', 'evaluation_loop'),
  m('calculation', '化学计算', '守恒法、差量法、关系式法、滴定和图像'),
  m('process', '工艺流程', '原料预处理、转化、除杂、循环、绿色化学和产率', 'pipeline'),
  m('structure', '物质结构', '原子结构、化学键、晶体、杂化和分子性质'),
  m('electrochem', '电化学', '原电池、电解池、电极反应、腐蚀和新型电池'),
  m('equilibrium', '平衡图像', 'K、Q、pH、沉淀溶解、滴定曲线和图像解释'),
  m('final-problem', '高考综合', '实验流程、反应原理、有机推断和多模块联动', 'system_architecture'),
]

const seniorBiology = [
  m('cell-metabolism', '细胞代谢', '酶、ATP、光合作用、呼吸作用和曲线分析', 'pipeline'),
  m('genetics', '遗传', '分离定律、自由组合、伴性遗传、遗传图谱和概率'),
  m('molecular', '分子生物学', 'DNA复制、转录翻译、基因表达调控和工程'),
  m('homeostasis', '稳态调节', '神经、体液、免疫、内环境和反馈调节', 'inference_flow'),
  m('ecology', '生态', '种群、群落、生态系统、能量流动和物质循环'),
  m('evolution', '进化', '自然选择、基因频率、物种形成和适应'),
  m('experiment', '实验设计', '变量、对照、重复、统计、误差和结论', 'evaluation_loop'),
  m('biotech', '现代生物技术', '发酵、细胞工程、基因工程、PCR和电泳'),
  m('graph', '图表信息题', '曲线、表格、流程图、模型图和信息迁移', 'pipeline'),
  m('final-problem', '高考综合', '遗传实验、调节网络、生态模型和多信息整合', 'system_architecture'),
]

const seniorChinese = [
  m('argument-reading', '论述类文本', '中心论点、论证结构、概念关系和选项辨析'),
  m('literary-reading', '文学类文本', '人物、情节、环境、主题、叙事视角和语言赏析'),
  m('practical-reading', '实用类文本', '信息筛选、材料比较、图表理解和观点评价'),
  m('classical', '文言文', '实词虚词、断句、翻译、文化常识和人物评价'),
  m('poetry', '古诗词鉴赏', '意象、情感、手法、炼字和比较鉴赏'),
  m('language-use', '语言文字运用', '病句、补写、压缩、变换句式和图文转换'),
  m('composition', '高考作文', '审题立意、材料分析、结构、论证和语言', 'pipeline'),
  m('logic', '思辨表达', '概念界定、因果、比较、让步和反驳'),
  m('whole-book', '整本书阅读', '经典作品、人物关系、主题和跨文本关联'),
  m('exam-answer', '答题规范', '分点、证据、术语、层次和时间管理'),
]

const banks: EducationBank[] = [
  { prefix: 'education-primary-math', category: 'education-primary-math', stage: '小学', subject: '普通数学', tags: ['primary', 'math'], modules: primaryMath },
  { prefix: 'education-primary-olympiad', category: 'education-primary-olympiad', stage: '小学', subject: '奥赛', tags: ['primary', 'math-olympiad'], modules: primaryOlympiad },
  { prefix: 'education-primary-coding', category: 'education-primary-coding', stage: '小学', subject: '少儿编程', tags: ['primary', 'coding'], modules: primaryCoding },
  { prefix: 'education-primary-chinese', category: 'education-primary-chinese', stage: '小学', subject: '语文', tags: ['primary', 'chinese'], modules: primaryChinese },
  { prefix: 'education-junior-math', category: 'education-junior-math', stage: '初中', subject: '数学', tags: ['junior', 'math'], modules: juniorMath },
  { prefix: 'education-junior-olympiad', category: 'education-junior-olympiad', stage: '初中', subject: '奥赛', tags: ['junior', 'math-olympiad'], modules: juniorOlympiad },
  { prefix: 'education-junior-physics', category: 'education-junior-physics', stage: '初中', subject: '物理', tags: ['junior', 'physics'], modules: juniorPhysics },
  { prefix: 'education-junior-chemistry', category: 'education-junior-chemistry', stage: '初中', subject: '化学', tags: ['junior', 'chemistry'], modules: juniorChemistry },
  { prefix: 'education-junior-biology', category: 'education-junior-biology', stage: '初中', subject: '生物', tags: ['junior', 'biology'], modules: juniorBiology },
  { prefix: 'education-junior-chinese', category: 'education-junior-chinese', stage: '初中', subject: '语文', tags: ['junior', 'chinese'], modules: juniorChinese },
  { prefix: 'education-senior-math', category: 'education-senior-math', stage: '高中', subject: '数学', tags: ['senior', 'math'], modules: seniorMath },
  { prefix: 'education-senior-olympiad', category: 'education-senior-olympiad', stage: '高中', subject: '奥赛', tags: ['senior', 'math-olympiad'], modules: seniorOlympiad },
  { prefix: 'education-senior-physics', category: 'education-senior-physics', stage: '高中', subject: '物理', tags: ['senior', 'physics'], modules: seniorPhysics },
  { prefix: 'education-senior-chemistry', category: 'education-senior-chemistry', stage: '高中', subject: '化学', tags: ['senior', 'chemistry'], modules: seniorChemistry },
  { prefix: 'education-senior-biology', category: 'education-senior-biology', stage: '高中', subject: '生物', tags: ['senior', 'biology'], modules: seniorBiology },
  { prefix: 'education-senior-chinese', category: 'education-senior-chinese', stage: '高中', subject: '语文', tags: ['senior', 'chinese'], modules: seniorChinese },
]

function mathProblem(bank: EducationBank, module: EducationModule) {
  const key = module.key
  if (bank.stage === '小学') {
    if (key === 'number') return '计算 36 × 25 - 480 ÷ 12 + 168，并说明你先算哪一步、为什么。'
    if (key === 'fraction') return '一根彩带长 3/4 米，第一次用去 1/6 米，第二次用去剩下的 2/5。还剩多少米？'
    if (key === 'geometry') return '长方形长 18 cm、宽 12 cm，从一角剪去一个边长 4 cm 的正方形。剩余图形的面积和周长分别是多少？'
    if (key === 'measurement') return '一个水箱长 8 dm、宽 5 dm、高 6 dm，已经装水 120 L。还可以再装多少升水？'
    if (key === 'word-problem') return '鸡和兔共有 28 只，脚共有 88 只。鸡和兔各有多少只？请列式或画图说明。'
    if (key === 'equation') return '一个数的 3 倍比 56 少 8。这个数是多少？请列方程解答并检验。'
    if (key === 'ratio') return '学校合唱队男生和女生人数比为 3:5，女生比男生多 12 人。合唱队一共有多少人？'
    if (key === 'statistics') return '五天阅读页数分别是 18、24、21、27、30 页。平均每天读多少页？哪一天高于平均数最多？'
    if (key === 'pattern') return '观察数列 2、5、10、17、26、37，写出后两项，并说明规律。'
    if (key === 'spatial') return '一个正方体六个面分别写 A、B、C、D、E、F，展开图中 A 与 D 相对、B 与 E 相对。请判断 C 的相对面并说明。'
  }
  if (bank.subject === '奥赛') {
    if (key.includes('counting') || key === 'combinatorics') return '用数字 1、2、3、4、5 组成没有重复数字的三位数，其中百位比个位大。这样的三位数有多少个？'
    if (key.includes('number')) return '求所有满足 100 < n < 200 且 n 被 6 除余 1、被 8 除余 3 的整数 n。'
    if (key.includes('geometry')) return '正方形 ABCD 边长为 12，点 E、F 分别是 AB、AD 的中点。求三角形 CEF 的面积。'
    if (key === 'logic') return '甲、乙、丙三人中只有一人说真话。甲说“乙得第一”，乙说“我不是第一”，丙说“甲得第一”。谁得第一？'
    if (key === 'pigeonhole') return '从 1 到 30 中任取 16 个不同整数，证明其中一定有两个数的差为 15。'
    if (key === 'inclusion') return '一个班 40 人，喜欢足球的 22 人，喜欢篮球的 18 人，两项都喜欢的 9 人。两项都不喜欢的有多少人？'
    if (key === 'parity' || key === 'invariant') return '黑板上写着 1 到 20。每次擦去两个数并写上它们的差。最后剩下的数可能是 0 吗？'
    if (key === 'rate') return '甲、乙两人相距 60 km 相向而行，甲每小时 12 km，乙每小时 8 km。若甲先出发 1 小时，乙出发后多久相遇？'
    if (key === 'age') return '今年父亲年龄是小明的 4 倍，6 年后父亲年龄是小明的 3 倍。小明今年几岁？'
    return '把 1、2、3、4、5、6 填入一个 2×3 方格，使每行和相等。给出一种填法并说明理由。'
  }
  if (bank.stage === '初中') {
    if (key === 'number-algebra' || key === 'algebra') return '化简并求值：(2x - 3)(x + 4) - 2x(x - 1)，其中 x = -2。'
    if (key === 'equation') return '某商品连续两次降价后价格从 200 元降到 162 元。若两次降价率相同，求每次降价率。'
    if (key === 'function' || key === 'functional') return '已知一次函数 y = kx + b 经过点 (2, 5) 和 (-1, -4)，求函数表达式并判断 y 随 x 如何变化。'
    if (key.includes('geometry')) return '在三角形 ABC 中，AB = AC，点 D 是 BC 中点。证明 AD 垂直 BC，并说明用到的判定。'
    if (key === 'coordinate') return '点 A(1, 2)、B(5, 2)、C(5, 6)，求三角形 ABC 的面积，并写出 AB、BC 的长度。'
    if (key === 'statistics') return '一组数据 6、8、8、10、12、14，求平均数、中位数、众数和方差。'
    if (key === 'trigonometry') return '某斜坡长 20 m，坡角为 30°。求斜坡的竖直高度。'
    if (key === 'construction') return '只用尺规作一个已知线段 AB 的垂直平分线，并说明作图依据。'
    if (key === 'application') return '甲工程队单独完成需 12 天，乙工程队单独完成需 18 天。两队合作 4 天后，剩下由乙完成，还需几天？'
    return '抛物线 y = x² - 4x + 3 与 x 轴交于 A、B 两点，求 A、B 坐标及顶点坐标。'
  }
  if (key === 'function') return '已知 f(x)=x³-3x²+2。求 f(x) 的单调区间、极值，并判断方程 f(x)=0 的实根个数。'
  if (key === 'trigonometry') return '在三角形 ABC 中，a=6，b=8，夹角 C=60°。求边 c 和三角形面积。'
  if (key === 'sequence') return '数列 {a_n} 满足 a1=2，a_{n+1}=2a_n+3。求 a_n 的通项公式。'
  if (key === 'solid-geometry') return '正四棱锥底面边长 4，高 3。求体积，并求侧棱长。'
  if (key === 'analytic-geometry') return '椭圆 x²/9 + y²/4 = 1，过点 P(3,0) 的直线斜率为 -1/2。求直线与椭圆另一个交点。'
  if (key === 'probability') return '袋中有 3 个红球、2 个白球，不放回抽取 2 个。求恰好一个红球的概率。'
  if (key === 'vector') return '已知向量 a=(2,-1)，b=(1,3)。求 a·b、|a+b|，并判断 a 与 b 的夹角是锐角还是钝角。'
  if (key === 'inequality') return '证明对任意正数 x、y，有 x/y + y/x ≥ 2，并说明等号成立条件。'
  if (key === 'complex') return '已知复数 z=1+2i，求 z²、|z|，并在复平面上描述 z 对应的点。'
  return '已知函数 f(x)=ln x - ax 在 x=1 处取得极值。求 a，并讨论 f(x) 的零点个数。'
}

function chineseProblem(bank: EducationBank, module: EducationModule) {
  if (module.key.includes('composition')) return '作文题：以“那一次，我真正理解了坚持”为题写一篇文章。要求有具体事件、细节描写和明确中心。'
  if (module.key.includes('classical')) return '阅读文言句：“学而时习之，不亦说乎？”请解释“时”“说”的意思，并翻译全句。'
  if (module.key.includes('poetry')) return '阅读诗句“海日生残夜，江春入旧年”。请分析其中的时间变化和表达的情感。'
  if (module.key.includes('language') || module.key.includes('sentence')) return '修改病句：通过这次活动，使我明白了合作的重要性。请写出正确句子并说明原因。'
  if (module.key.includes('reading') || module.key.includes('modern')) return '阅读材料：雨停后，操场上的水洼映着晚霞，孩子们绕着水洼奔跑。请概括画面内容，并分析“映着晚霞”的表达效果。'
  return `请围绕“${module.title}”完成作答：从材料“校园里的老槐树见证了一届又一届学生的成长”中提炼主题，并写出两条可用于文章的细节。`
}

function codingProblem(module: EducationModule) {
  if (module.key === 'sequence') return '小海龟从坐标 (0,0) 出发，依次执行：前进 50、右转 90°、前进 30、右转 90°、前进 50。请写出最终位置并画出路径。'
  if (module.key === 'condition') return '输入一个整数 score，如果 score ≥ 90 输出 A，80-89 输出 B，60-79 输出 C，否则输出 D。请写出伪代码。'
  if (module.key === 'loop') return '请用循环计算 1+2+...+100，并说明循环变量如何变化。'
  if (module.key === 'variable') return '有变量 count 初始为 0，连续执行 count=count+3、count=count*2、count=count-4。最后 count 是多少？'
  if (module.key === 'function') return '设计函数 square_sum(a,b)，返回 a²+b²。请写出 Python 代码并用 a=3、b=4 测试。'
  if (module.key === 'event') return 'Scratch 中点击绿旗后角色说“开始”，按空格键角色跳起。请描述需要哪些事件积木和状态变量。'
  if (module.key === 'debug') return '代码 for i in range(1, 5): total = total + i 报错。请指出错误原因，并补全可运行代码。'
  if (module.key === 'array') return '列表 nums=[4,7,2,9,5]，请找出最大值并计算所有奇数的和。'
  if (module.key === 'recursion') return '用递归思想解释 5! 如何计算，并写出停止条件。'
  return '设计一个猜数字小游戏：电脑给出 1-20 的秘密数字，玩家输入数字后提示“大了/小了/猜对了”。请写出流程。'
}

function scienceProblem(bank: EducationBank, module: EducationModule) {
  const subject = bank.subject
  const key = module.key
  if (subject === '物理') {
    if (key === 'mechanics') return '一辆小车 10 s 内从静止加速到 20 m/s，若加速度恒定，求加速度和这 10 s 内的位移。'
    if (key === 'electricity' || key === 'circuit') return '电路中电源电压 6 V，电阻 R1=2 Ω、R2=4 Ω 串联。求电流、各电阻两端电压和总功率。'
    if (key === 'optics') return '物体放在凸透镜前 30 cm，透镜焦距 10 cm。判断成像性质，并用作图思路说明。'
    if (key === 'thermal' || key === 'thermo') return '质量 0.5 kg 的水温度从 20°C 升到 80°C，水的比热容为 4.2×10³ J/(kg·°C)。吸收多少热量？'
    if (key === 'magnetism') return '导体棒长 0.5 m，以 4 m/s 垂直切割 0.2 T 的匀强磁场。求感应电动势。'
    if (key === 'experiment') return '用伏安法测电阻，三次测得电压/电流分别为 2.0V/0.20A、2.5V/0.24A、3.0V/0.31A。求电阻平均值并分析误差。'
    return '根据图像信息：物体速度从 0 到 12 m/s 线性增加，用时 6 s。求加速度，并画出对应 v-t 图的关键点。'
  }
  if (subject === '化学') {
    if (key === 'equation') return '配平并说明质量守恒：Fe + O2 -> Fe3O4。'
    if (key === 'solution') return '把 20 g 食盐加入 180 g 水中完全溶解，求所得溶液的质量分数。'
    if (key === 'calculation') return '实验室用 10 g CaCO3 与足量稀盐酸反应，理论上可生成多少克 CO2？'
    if (key === 'experiment') return '要鉴别 NaCl 溶液、Na2CO3 溶液和稀盐酸，请设计最少步骤的实验并写出现象。'
    if (key === 'organic') return '某有机物分子式为 C2H6O，可能是乙醇或二甲醚。请写出两种结构式并说明如何鉴别。'
    if (key === 'electrochem') return '锌铜原电池中，锌片和铜片插入稀硫酸并用导线连接。请写出电子流向和电极反应。'
    return '某流程以铁矿石为原料制备 FeSO4 溶液，请指出酸溶、过滤、除杂、结晶各步骤的目的。'
  }
  if (subject === '生物') {
    if (key.includes('cell')) return '显微镜下观察洋葱表皮细胞，请写出细胞壁、细胞核、液泡的位置特征，并说明染色目的。'
    if (key.includes('genetics')) return '豌豆高茎 T 对矮茎 t 为显性。Tt 与 tt 杂交，子代表型比例是多少？请画遗传图解。'
    if (key.includes('experiment')) return '探究光照对植物光合作用的影响，设计对照实验：写出自变量、因变量、控制变量和预期结果。'
    if (key.includes('ecology')) return '草原生态系统中有草、兔、狐、鹰。请写出两条食物链，并说明狐数量下降可能造成的影响。'
    if (key.includes('homeostasis')) return '饭后血糖升高，人体如何通过胰岛素调节血糖？请用流程图说明。'
    return '给出 DNA 片段模板链 TAC GGA CTT，请写出对应 mRNA 序列，并说明转录方向。'
  }
  return ''
}

function concreteProblemFor(bank: EducationBank, module: EducationModule) {
  if (bank.subject === '少儿编程') return codingProblem(module)
  if (bank.subject === '语文') return chineseProblem(bank, module)
  if (['物理', '化学', '生物'].includes(bank.subject)) return scienceProblem(bank, module)
  return mathProblem(bank, module)
}

function taskForPattern(pattern: EducationPattern) {
  if (pattern.key === 'concept') return '请先直接作答，再解释本题用到的核心概念和一个容易混淆的点。'
  if (pattern.key === 'model') return '请用图示、表格、公式或流程把题意建模，再完成解答。'
  if (pattern.key === 'error') return '请写出完整答案，并假设一名同学犯了一个常见错误，指出错误在哪里、如何订正。'
  if (pattern.key === 'exam') return '请按考试答题格式分步骤作答，标出关键得分点。'
  if (pattern.key === 'proof') return '请给出理由充分的解释、证明或实验论证，不能只写结论。'
  if (pattern.key === 'compare') return '请至少给出两种解法或两种表达方式，并比较它们的适用场景。'
  if (pattern.key === 'application') return '请联系一个生活、实验、阅读或项目场景，说明这个知识点如何迁移使用。'
  if (pattern.key === 'extension') return '请在完成原题后，改变一个条件并分析答案或方法会如何变化。'
  if (pattern.key === 'whiteboard') return '请把解题过程整理成适合白板展示的步骤：条件、模型、关键推理、结论、易错点。'
  return '请直接解答，并写出关键步骤。'
}

function shortProblemTitle(problem: string) {
  return problem.replace(/\s+/g, ' ').replace(/[。？?].*$/, '').slice(0, 34)
}

function descriptionFor(bank: EducationBank, module: EducationModule, pattern: EducationPattern) {
  const problem = concreteProblemFor(bank, module)
  const task = taskForPattern(pattern)
  return `${bank.stage}${bank.subject} / ${module.title}

题目：${bank.stage}${bank.subject}：${module.title}：${pattern.title}

具体题干：${problem}

作答任务：${task}

考察重点：${pattern.focus}

白板提示：用 ${module.concepts.slice(0, 5).join('、')} 组织图示、公式、表格或流程，突出本题的关键步骤、易错点和迁移变式。

答题要求：请先独立作答；需要帮助时，可让终生学习 Coach 追问、点评或在白板上展开解题结构。`
}

function makeBankChallenges(bank: EducationBank): Challenge[] {
  return patterns.flatMap((pattern) => bank.modules.map((module) => {
    const id = `${bank.prefix}-${module.key}-${pattern.key}`
    const problem = concreteProblemFor(bank, module)
    return {
      id,
      title: `${bank.stage}${bank.subject}：${module.title}：${shortProblemTitle(problem)}`,
      slug: id,
      description: descriptionFor(bank, module, pattern),
      difficulty: pattern.difficulty,
      category: bank.category,
      tags: ['education', bank.category, ...bank.tags, module.key],
      challenge_type: 'qa',
      time_limit_ms: 0,
      memory_limit_mb: 0,
      starter_code: '',
      function_name: 'arena_education_answer',
      input_keys: ['answer'],
      teaching_skills: ['explain_answer', 'socratic_questioning', 'debug_answer', 'concept_remediation', 'transfer_problem', 'whiteboard_architecture'],
      concepts: module.concepts,
      rubric: [
        '先判断学生所处学段和已有理解。',
        '题解必须贴合学科题型，不套面试模板。',
        '讲清条件、模型、公式、步骤、易错点和检查方法。',
        '白板要展示解题结构、图表或公式推导，而不是重复题面。',
      ],
      follow_up_questions: [
        `这道题里 ${module.concepts[0]} 最容易错在哪里？`,
        '如果条件改变一个量，解法哪一步需要调整？',
        '你能用另一种图示、公式或文字表达同一个思路吗？',
      ],
      whiteboard_template: module.whiteboardTemplate,
      published: true,
      created_at: createdAt,
      updated_at: createdAt,
    } satisfies Challenge
  }))
}

export const educationChallenges: Challenge[] = banks.flatMap(makeBankChallenges)
