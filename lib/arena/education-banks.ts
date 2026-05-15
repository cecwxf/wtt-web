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
  { key: 'classic', difficulty: 'easy', title: '经典例题求解', focus: '先读题提取条件，再列式/建模，最后检查答案单位和合理性。' },
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

const primaryEnglish = [
  m('phonics', 'Phonics 自然拼读', '字母组合、发音规则、重音和拼读迁移'),
  m('vocabulary', '词汇与短语', '近义词、反义词、词形变化、搭配和语境猜词'),
  m('grammar', '基础语法', '时态、人称、冠词、介词、疑问句和否定句'),
  m('reading-main', '阅读主旨', '标题、主题句、段落大意和信息定位'),
  m('reading-infer', '阅读推断', '指代、因果、人物态度和隐含信息'),
  m('cloze', '完形填空', '上下文线索、语法搭配和逻辑连接'),
  m('writing', '基础写作', '看图写话、日记、邮件、人物和事件描述', 'pipeline'),
  m('speaking', '听说表达', '情景问答、复述、表达喜好和礼貌交际'),
  m('sentence', '句型转换', '同义句、特殊疑问句、there be 和比较级'),
  m('culture', '跨文化常识', '节日、学校生活、家庭、食物和礼仪'),
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

const juniorEnglish = [
  m('grammar', '语法', '时态语态、从句、非谓语、情态动词和主谓一致'),
  m('vocabulary', '词汇', '构词法、短语搭配、熟词生义和语境猜词'),
  m('cloze', '完形填空', '上下文、逻辑连接、词义辨析和篇章结构'),
  m('reading', '阅读理解', '细节、主旨、推断、态度和标题'),
  m('task-reading', '任务型阅读', '信息筛选、归纳概括、表格补全和表达转换'),
  m('listening-speaking', '听说', '情景反应、信息转述、观点表达和交际策略'),
  m('writing', '书面表达', '审题、要点覆盖、结构、连接词和润色', 'pipeline'),
  m('sentence', '句型转换', '同义句、被动语态、宾语从句和条件句'),
  m('culture', '文化语境', '节日、校园、旅行、环保和跨文化理解'),
  m('exam-strategy', '考试策略', '时间分配、定位信息、排除法和检查'),
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

const seniorEnglish = [
  m('reading', '阅读理解', '主旨、细节、推断、态度、篇章结构和词义猜测'),
  m('seven-five', '七选五', '段落逻辑、指代衔接、主题句和过渡句'),
  m('cloze', '完形填空', '语篇逻辑、词义辨析、情感线索和搭配'),
  m('grammar-fill', '语法填空', '谓语非谓语、从句、介词、冠词和词形变化'),
  m('writing', '应用文写作', '邮件、通知、倡议、邀请、建议信和语言得体', 'pipeline'),
  m('continuation', '读后续写', '情节推进、人物情感、冲突解决和语言衔接', 'pipeline'),
  m('translation', '翻译与表达', '长难句、从句、非谓语和语义准确'),
  m('listening', '听力', '场景、数字、态度、推断和信息筛选'),
  m('culture', '跨文化阅读', '社会文化、科技、环保、教育和价值判断'),
  m('exam-strategy', '高考策略', '题型顺序、时间控制、证据定位和复查'),
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
  { prefix: 'education-primary-english', category: 'education-primary-english', stage: '小学', subject: '英语', tags: ['primary', 'english'], modules: primaryEnglish },
  { prefix: 'education-primary-coding', category: 'education-primary-coding', stage: '小学', subject: '少儿编程', tags: ['primary', 'coding'], modules: primaryCoding },
  { prefix: 'education-primary-chinese', category: 'education-primary-chinese', stage: '小学', subject: '语文', tags: ['primary', 'chinese'], modules: primaryChinese },
  { prefix: 'education-junior-math', category: 'education-junior-math', stage: '初中', subject: '数学', tags: ['junior', 'math'], modules: juniorMath },
  { prefix: 'education-junior-olympiad', category: 'education-junior-olympiad', stage: '初中', subject: '奥赛', tags: ['junior', 'math-olympiad'], modules: juniorOlympiad },
  { prefix: 'education-junior-physics', category: 'education-junior-physics', stage: '初中', subject: '物理', tags: ['junior', 'physics'], modules: juniorPhysics },
  { prefix: 'education-junior-english', category: 'education-junior-english', stage: '初中', subject: '英语', tags: ['junior', 'english'], modules: juniorEnglish },
  { prefix: 'education-junior-chemistry', category: 'education-junior-chemistry', stage: '初中', subject: '化学', tags: ['junior', 'chemistry'], modules: juniorChemistry },
  { prefix: 'education-junior-biology', category: 'education-junior-biology', stage: '初中', subject: '生物', tags: ['junior', 'biology'], modules: juniorBiology },
  { prefix: 'education-junior-chinese', category: 'education-junior-chinese', stage: '初中', subject: '语文', tags: ['junior', 'chinese'], modules: juniorChinese },
  { prefix: 'education-senior-math', category: 'education-senior-math', stage: '高中', subject: '数学', tags: ['senior', 'math'], modules: seniorMath },
  { prefix: 'education-senior-olympiad', category: 'education-senior-olympiad', stage: '高中', subject: '奥赛', tags: ['senior', 'math-olympiad'], modules: seniorOlympiad },
  { prefix: 'education-senior-physics', category: 'education-senior-physics', stage: '高中', subject: '物理', tags: ['senior', 'physics'], modules: seniorPhysics },
  { prefix: 'education-senior-english', category: 'education-senior-english', stage: '高中', subject: '英语', tags: ['senior', 'english'], modules: seniorEnglish },
  { prefix: 'education-senior-chemistry', category: 'education-senior-chemistry', stage: '高中', subject: '化学', tags: ['senior', 'chemistry'], modules: seniorChemistry },
  { prefix: 'education-senior-biology', category: 'education-senior-biology', stage: '高中', subject: '生物', tags: ['senior', 'biology'], modules: seniorBiology },
  { prefix: 'education-senior-chinese', category: 'education-senior-chinese', stage: '高中', subject: '语文', tags: ['senior', 'chinese'], modules: seniorChinese },
]

function descriptionFor(bank: EducationBank, module: EducationModule, pattern: EducationPattern) {
  return `${bank.stage}${bank.subject} / ${module.title}

题目：${bank.stage}${bank.subject}：${module.title}：${pattern.title}

经典题型：围绕 ${module.focus} 设计一道有代表性的练习。请先说明题意、关键条件和目标，再给出分步解法。

考察重点：${pattern.focus}

白板提示：用 ${module.concepts.slice(0, 5).join('、')} 组织图示、公式、表格或流程，突出本题的关键步骤、易错点和迁移变式。

练习要求：Arena Coach 应先用苏格拉底式问题确认学生理解，再逐步讲解；必要时写出公式、单位、图像、实验变量或作文提纲。`
}

function makeBankChallenges(bank: EducationBank): Challenge[] {
  return patterns.flatMap((pattern) => bank.modules.map((module) => {
    const id = `${bank.prefix}-${module.key}-${pattern.key}`
    return {
      id,
      title: `${bank.stage}${bank.subject}：${module.title}：${pattern.title}`,
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
