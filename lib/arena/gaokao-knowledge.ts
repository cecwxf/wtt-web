export type StrongUniversity = {
  name: string
  strengths: string[]
}

export type StrongProvinceGroup = {
  province: string
  universities: StrongUniversity[]
}

export type UniversityFactProfile = {
  name: string
  province: string
  city: string
  tiers: string[]
  strengths: string[]
  budget?: {
    year: number
    fact: string
    source: string
    url: string
  }
  employment?: {
    year: number
    fact: string
    source: string
    url: string
  }
  facultyTeams: Array<{
    area: string
    note: string
    source: string
    url: string
  }>
  admissionSources: Array<{
    scope: string
    source: string
    url: string
  }>
}

export const gaokaoKnowledgeSources = [
  { label: '教育部全国高等学校名单（截至 2024-06-20）', url: 'https://www.moe.gov.cn/jyb_xxgk/s5743/s5744/202406/t20240621_1136990.html' },
  { label: '第二轮“双一流”建设高校及建设学科名单', url: 'https://www.gov.cn/zhengce/zhengceku/2022-02/14/content_5673496.htm' },
  { label: '阳光高考院校库', url: 'https://gaokao.chsi.com.cn/' },
  { label: '软科中国大学排名', url: 'https://www.shanghairanking.cn/' },
]

export const c9Universities = ['北京大学', '清华大学', '复旦大学', '上海交通大学', '南京大学', '浙江大学', '中国科学技术大学', '西安交通大学', '哈尔滨工业大学']

export const project985Universities = [
  '北京大学', '中国人民大学', '清华大学', '北京航空航天大学', '北京理工大学', '中国农业大学', '北京师范大学', '中央民族大学',
  '南开大学', '天津大学', '大连理工大学', '东北大学', '吉林大学', '哈尔滨工业大学', '复旦大学', '同济大学', '上海交通大学', '华东师范大学',
  '南京大学', '东南大学', '浙江大学', '中国科学技术大学', '厦门大学', '山东大学', '中国海洋大学', '武汉大学', '华中科技大学',
  '湖南大学', '中南大学', '国防科技大学', '中山大学', '华南理工大学', '四川大学', '电子科技大学', '重庆大学',
  '西安交通大学', '西北工业大学', '西北农林科技大学', '兰州大学',
]

export const project211Universities = [
  '北京大学', '中国人民大学', '清华大学', '北京交通大学', '北京工业大学', '北京航空航天大学', '北京理工大学', '北京科技大学', '北京化工大学', '北京邮电大学',
  '中国农业大学', '北京林业大学', '北京中医药大学', '北京师范大学', '北京外国语大学', '中国传媒大学', '中央财经大学', '对外经济贸易大学', '北京体育大学', '中央音乐学院',
  '中央民族大学', '中国政法大学', '华北电力大学', '中国矿业大学（北京）', '中国石油大学（北京）', '中国地质大学（北京）',
  '南开大学', '天津大学', '天津医科大学', '河北工业大学', '太原理工大学', '内蒙古大学',
  '辽宁大学', '大连理工大学', '东北大学', '大连海事大学', '吉林大学', '延边大学', '东北师范大学',
  '哈尔滨工业大学', '哈尔滨工程大学', '东北农业大学', '东北林业大学',
  '复旦大学', '同济大学', '上海交通大学', '华东理工大学', '东华大学', '华东师范大学', '上海外国语大学', '上海财经大学', '上海大学', '海军军医大学',
  '南京大学', '苏州大学', '东南大学', '南京航空航天大学', '南京理工大学', '中国矿业大学', '河海大学', '江南大学', '南京农业大学', '中国药科大学', '南京师范大学',
  '浙江大学', '安徽大学', '中国科学技术大学', '合肥工业大学', '厦门大学', '福州大学', '南昌大学',
  '山东大学', '中国海洋大学', '中国石油大学（华东）', '郑州大学',
  '武汉大学', '华中科技大学', '中国地质大学（武汉）', '武汉理工大学', '华中农业大学', '华中师范大学', '中南财经政法大学',
  '湖南大学', '中南大学', '湖南师范大学', '国防科技大学',
  '中山大学', '暨南大学', '华南理工大学', '华南师范大学', '广西大学', '海南大学',
  '重庆大学', '西南大学', '四川大学', '西南交通大学', '电子科技大学', '四川农业大学', '西南财经大学',
  '贵州大学', '云南大学', '西藏大学',
  '西北大学', '西安交通大学', '西北工业大学', '西安电子科技大学', '长安大学', '西北农林科技大学', '陕西师范大学', '空军军医大学',
  '兰州大学', '青海大学', '宁夏大学', '新疆大学', '石河子大学',
]

export const newlyAddedDoubleFirstClassUniversities = [
  '北京协和医学院', '首都师范大学', '外交学院', '中国人民公安大学', '中央美术学院', '中央戏剧学院', '中国音乐学院', '中国科学院大学',
  '天津工业大学', '天津中医药大学', '山西大学',
  '上海科技大学', '上海海洋大学', '上海中医药大学', '上海体育学院', '上海音乐学院', '南京林业大学', '南京信息工程大学', '南京医科大学', '南京中医药大学', '南京邮电大学',
  '宁波大学', '中国美术学院', '河南大学', '湘潭大学',
  '广州医科大学', '广州中医药大学', '华南农业大学', '南方科技大学',
  '成都理工大学', '西南石油大学', '成都中医药大学',
]

export const doubleFirstClassUniversities = Array.from(new Set([...project211Universities, ...newlyAddedDoubleFirstClassUniversities])).sort((a, b) => a.localeCompare(b, 'zh-CN'))

export const strongNon985211ByProvince: StrongProvinceGroup[] = [
  { province: '北京', universities: [{ name: '首都医科大学', strengths: ['临床医学', '口腔医学', '首都医疗资源'] }, { name: '首都师范大学', strengths: ['师范', '基础学科'] }, { name: '外交学院', strengths: ['外交外事', '国际关系'] }] },
  { province: '天津', universities: [{ name: '天津工业大学', strengths: ['纺织', '材料', '工科'] }, { name: '中国民航大学', strengths: ['民航交通', '航空安全'] }, { name: '天津财经大学', strengths: ['财经', '会计金融'] }] },
  { province: '河北', universities: [{ name: '燕山大学', strengths: ['机械', '材料'] }, { name: '河北医科大学', strengths: ['临床医学'] }, { name: '石家庄铁道大学', strengths: ['交通土木'] }] },
  { province: '山西', universities: [{ name: '山西大学', strengths: ['物理', '哲学', '计算机'] }, { name: '中北大学', strengths: ['兵器', '仪器'] }, { name: '山西医科大学', strengths: ['医学'] }] },
  { province: '内蒙古', universities: [{ name: '内蒙古工业大学', strengths: ['能源', '化工'] }, { name: '内蒙古农业大学', strengths: ['草学', '农牧'] }, { name: '内蒙古医科大学', strengths: ['医学'] }] },
  { province: '辽宁', universities: [{ name: '东北财经大学', strengths: ['财经'] }, { name: '中国医科大学', strengths: ['临床医学'] }, { name: '沈阳药科大学', strengths: ['药学'] }] },
  { province: '吉林', universities: [{ name: '长春理工大学', strengths: ['光学', '仪器'] }, { name: '东北电力大学', strengths: ['电气', '能源'] }, { name: '吉林农业大学', strengths: ['农业'] }] },
  { province: '黑龙江', universities: [{ name: '哈尔滨医科大学', strengths: ['医学'] }, { name: '黑龙江大学', strengths: ['外语', '文理'] }, { name: '东北石油大学', strengths: ['石油工程'] }] },
  { province: '上海', universities: [{ name: '上海科技大学', strengths: ['理工交叉', '科研平台'] }, { name: '上海理工大学', strengths: ['光学', '能源动力'] }, { name: '上海中医药大学', strengths: ['中医药'] }] },
  { province: '江苏', universities: [{ name: '南京医科大学', strengths: ['临床医学', '公共卫生'] }, { name: '南京邮电大学', strengths: ['通信', '电子信息'] }, { name: '南京信息工程大学', strengths: ['大气科学', '信息'] }, { name: '江苏大学', strengths: ['机械', '车辆'] }] },
  { province: '浙江', universities: [{ name: '浙江工业大学', strengths: ['化工', '机械', '控制'] }, { name: '杭州电子科技大学', strengths: ['电子信息', '计算机'] }, { name: '温州医科大学', strengths: ['眼视光', '临床医学'] }, { name: '宁波大学', strengths: ['力学', '海洋'] }] },
  { province: '安徽', universities: [{ name: '安徽医科大学', strengths: ['医学'] }, { name: '安徽师范大学', strengths: ['师范'] }, { name: '安徽工业大学', strengths: ['冶金', '材料'] }] },
  { province: '福建', universities: [{ name: '福建师范大学', strengths: ['师范', '文理基础'] }, { name: '福建医科大学', strengths: ['医学'] }, { name: '华侨大学', strengths: ['建筑', '工商管理'] }] },
  { province: '江西', universities: [{ name: '江西财经大学', strengths: ['财经'] }, { name: '江西师范大学', strengths: ['师范'] }, { name: '华东交通大学', strengths: ['交通', '土木'] }] },
  { province: '山东', universities: [{ name: '青岛大学', strengths: ['医学', '纺织', '综合'] }, { name: '山东师范大学', strengths: ['师范'] }, { name: '山东科技大学', strengths: ['矿业', '测绘', '工科'] }] },
  { province: '河南', universities: [{ name: '河南大学', strengths: ['双一流学科', '师范文理'] }, { name: '河南师范大学', strengths: ['师范'] }, { name: '河南科技大学', strengths: ['机械', '材料'] }] },
  { province: '湖北', universities: [{ name: '武汉科技大学', strengths: ['冶金', '材料'] }, { name: '湖北大学', strengths: ['师范文理'] }, { name: '武汉工程大学', strengths: ['化工'] }] },
  { province: '湖南', universities: [{ name: '湘潭大学', strengths: ['数学', '法学', '材料'] }, { name: '长沙理工大学', strengths: ['交通', '电气'] }, { name: '南华大学', strengths: ['核工程', '医学'] }] },
  { province: '广东', universities: [{ name: '南方科技大学', strengths: ['理工交叉', '科研平台'] }, { name: '深圳大学', strengths: ['计算机', '电子信息', '城市机会'] }, { name: '广东工业大学', strengths: ['自动化', '机械', '电子'] }, { name: '广州医科大学', strengths: ['临床医学'] }] },
  { province: '广西', universities: [{ name: '广西医科大学', strengths: ['医学'] }, { name: '桂林电子科技大学', strengths: ['电子信息'] }, { name: '广西师范大学', strengths: ['师范'] }] },
  { province: '海南', universities: [{ name: '海南师范大学', strengths: ['师范'] }, { name: '海南医科大学', strengths: ['医学'] }] },
  { province: '重庆', universities: [{ name: '重庆邮电大学', strengths: ['通信', '计算机'] }, { name: '重庆医科大学', strengths: ['医学'] }, { name: '西南政法大学', strengths: ['法学'] }] },
  { province: '四川', universities: [{ name: '西南石油大学', strengths: ['石油工程'] }, { name: '成都理工大学', strengths: ['地质资源'] }, { name: '成都中医药大学', strengths: ['中医药'] }, { name: '四川师范大学', strengths: ['师范'] }] },
  { province: '贵州', universities: [{ name: '贵州医科大学', strengths: ['医学'] }, { name: '贵州师范大学', strengths: ['师范'] }] },
  { province: '云南', universities: [{ name: '昆明理工大学', strengths: ['冶金', '材料', '工科'] }, { name: '昆明医科大学', strengths: ['医学'] }, { name: '云南师范大学', strengths: ['师范'] }] },
  { province: '西藏', universities: [{ name: '西藏民族大学', strengths: ['民族学', '师范'] }] },
  { province: '陕西', universities: [{ name: '西安建筑科技大学', strengths: ['建筑', '土木'] }, { name: '西安理工大学', strengths: ['水利', '机械'] }, { name: '西安邮电大学', strengths: ['通信', '计算机'] }] },
  { province: '甘肃', universities: [{ name: '西北师范大学', strengths: ['师范'] }, { name: '兰州交通大学', strengths: ['交通', '土木'] }, { name: '兰州理工大学', strengths: ['机械', '材料'] }] },
  { province: '青海', universities: [{ name: '青海师范大学', strengths: ['师范'] }, { name: '青海民族大学', strengths: ['民族学', '法学'] }] },
  { province: '宁夏', universities: [{ name: '宁夏医科大学', strengths: ['医学'] }, { name: '北方民族大学', strengths: ['民族学', '工科'] }] },
  { province: '新疆', universities: [{ name: '新疆医科大学', strengths: ['医学'] }, { name: '新疆师范大学', strengths: ['师范'] }, { name: '新疆农业大学', strengths: ['农业'] }] },
]

export const universityFactProfiles: UniversityFactProfile[] = [
  {
    name: '清华大学',
    province: '北京',
    city: '北京',
    tiers: ['C9', '985', '211', '双一流'],
    strengths: ['工科', '计算机', '电子信息', '经管', '建筑'],
    budget: { year: 2024, fact: '公开预算/决算需以学校信息公开网原表为准；本地知识库已索引 2024 年度部门预算和 2024 年度部门决算入口。', source: '清华大学信息公开', url: 'https://www.tsinghua.edu.cn/info/1119/110818.htm' },
    employment: { year: 2024, fact: '学校新闻披露 2024 届毕业生制造业、能源业就业人数同比增长，华为、中芯国际、国家电网等为签约人数靠前单位。', source: '清华大学新闻', url: 'https://www.tsinghua.edu.cn/info/1182/116497.htm' },
    facultyTeams: [{ area: '计算机/AI/交叉信息', note: '需按目标专业到院系师资页核验导师、实验室和招生方向。', source: '清华大学院系设置', url: 'https://www.tsinghua.edu.cn/yxsz.htm' }],
    admissionSources: [{ scope: '各省近三年专业分/位次', source: '清华本科招生网', url: 'https://join-tsinghua.edu.cn/' }],
  },
  {
    name: '浙江大学',
    province: '浙江',
    city: '杭州',
    tiers: ['C9', '985', '211', '双一流'],
    strengths: ['计算机', '控制', '农学', '医学', '工科综合'],
    budget: { year: 2024, fact: '已索引学校 2024 年部门预算公开入口，具体收支总预算需按原表核验后引用。', source: '浙江大学信息公开', url: 'https://www.zju.edu.cn/xxgk/2024/0419/c17961a2904342/page.htm' },
    employment: { year: 2024, fact: '就业和升学去向应以浙江大学就业质量报告/本科教学质量报告为准。', source: '浙江大学信息公开', url: 'https://www.zju.edu.cn/xxgk/' },
    facultyTeams: [{ area: '计算机/控制/软件', note: '优先核验计算机学院、控制学院、软件学院师资和国家重点平台。', source: '浙江大学院系设置', url: 'https://www.zju.edu.cn/yxsz/list.htm' }],
    admissionSources: [{ scope: '各省近三年专业分/位次', source: '浙江大学本科招生网', url: 'https://zdzsc.zju.edu.cn/' }],
  },
  {
    name: '中山大学',
    province: '广东',
    city: '广州/珠海/深圳',
    tiers: ['985', '211', '双一流'],
    strengths: ['医学', '计算机', '管理', '基础学科', '粤港澳就业'],
    budget: { year: 2024, fact: '学校 2024 年度部门预算公开页披露收支总预算等数据，引用时需带年份和口径。', source: '中山大学信息公开网', url: 'https://xxgk.sysu.edu.cn/article/311' },
    employment: { year: 2024, fact: '院系就业报告可补充到具体专业；全校层面以学校就业质量报告为准。', source: '中山大学就业指导中心', url: 'https://career.sysu.edu.cn/' },
    facultyTeams: [{ area: '计算机/医学/系统科学', note: '按广州、珠海、深圳校区和目标学院分别核验师资团队。', source: '中山大学院系设置', url: 'https://www.sysu.edu.cn/yxsz.htm' }],
    admissionSources: [{ scope: '各省近三年专业分/位次', source: '中山大学本科招生网', url: 'https://admission.sysu.edu.cn/' }],
  },
  {
    name: '南方科技大学',
    province: '广东',
    city: '深圳',
    tiers: ['双一流', '非985/211强势地方高校'],
    strengths: ['理工交叉', '计算机', '电子信息', '材料', '深圳产业机会'],
    employment: { year: 2024, fact: '就业、升学和深造去向需以学校就业质量报告和本科教学质量报告核验。', source: '南方科技大学信息公开', url: 'https://www.sustech.edu.cn/zh/info_public.html' },
    facultyTeams: [{ area: '计算机/电子/材料', note: '年轻科研平台强，具体导师应按学院师资页核验。', source: '南方科技大学院系', url: 'https://www.sustech.edu.cn/zh/faculties.html' }],
    admissionSources: [{ scope: '综合评价/各省招生', source: '南方科技大学招生网', url: 'https://zs.sustech.edu.cn/' }],
  },
  {
    name: '杭州电子科技大学',
    province: '浙江',
    city: '杭州',
    tiers: ['非985/211强势地方高校'],
    strengths: ['电子信息', '计算机', '会计', '杭州互联网/芯片机会'],
    employment: { year: 2024, fact: '就业去向需以学校就业质量报告核验，建议重点看信息类专业去向和杭州本地就业比例。', source: '杭州电子科技大学就业网', url: 'https://career.hdu.edu.cn/' },
    facultyTeams: [{ area: '计算机/电子信息', note: '按计算机学院、电子信息学院师资页核验团队。', source: '杭州电子科技大学院系', url: 'https://www.hdu.edu.cn/' }],
    admissionSources: [{ scope: '浙江及外省近三年专业分/位次', source: '杭州电子科技大学本科招生网', url: 'https://zhaosheng.hdu.edu.cn/' }],
  },
]

export function gaokaoKnowledgeContextMarkdown() {
  const strong = strongNon985211ByProvince.map((group) => `${group.province}: ${group.universities.map((item) => `${item.name}(${item.strengths.join('/')})`).join('、')}`).join('\n')
  const profiles = universityFactProfiles.map((item) => {
    const budget = item.budget ? `经费: ${item.budget.year} ${item.budget.fact} 来源 ${item.budget.source} ${item.budget.url}` : '经费: 待核验学校预算/决算公开'
    const employment = item.employment ? `就业/升学: ${item.employment.year} ${item.employment.fact} 来源 ${item.employment.source} ${item.employment.url}` : '就业/升学: 待核验就业质量报告'
    return `- ${item.name} | ${item.city} | ${item.tiers.join('/')} | 强项: ${item.strengths.join('、')} | ${budget} | ${employment} | 招录入口: ${item.admissionSources.map((source) => `${source.source} ${source.url}`).join('；')}`
  }).join('\n')

  return [
    '高考志愿本地知识库（只可引用已给出来源的事实；缺失字段必须标为待核验）',
    `C9: ${c9Universities.join('、')}`,
    `985: ${project985Universities.join('、')}`,
    `211: ${project211Universities.join('、')}`,
    `第二轮双一流新增/非传统211重点关注: ${newlyAddedDoubleFirstClassUniversities.join('、')}`,
    '各省非985/211强势院校:',
    strong,
    '已索引院校事实包:',
    profiles,
  ].join('\n')
}
