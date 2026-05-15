import type { Challenge } from './types'

const createdAt = '2026-05-15T00:00:00.000Z'

export const gaokaoVolunteerChallenges: Challenge[] = [
  {
    id: 'gaokao-volunteer-advisor',
    title: '高考志愿咨询：按分数、位次、专业和就业做院校推荐',
    slug: 'gaokao-volunteer-advisor',
    description: `高考志愿 Ask 咨询入口。

请在右侧 Arena Coach 中直接提问，例如：
- 我是四川物理类，2026 高考预估 625 分，省排名约 9000，想学计算机或电子信息，怎么冲稳保？
- 河南历史类 580 分，想当老师或考公，哪些大学和专业更稳？
- 浙江考生，喜欢医学但不想读太长年限，应该怎么选专业和城市？

咨询所需信息：
1. 省份、年份、科类或选科组合。
2. 分数、全省位次；如果只有分数，需要先估算位次并说明不确定性。
3. 兴趣方向、不能接受的城市/专业、家庭预算、是否考研、就业地域偏好。
4. 是否接受中外合作、地方专项、提前批、医学长学制、师范定向等特殊类型。

数据与依据要求：
- 全国本科高校以教育部 2024 年全国高等学校名单为基准：全国高等学校共 3117 所，普通高等学校 2868 所，其中本科学校 1308 所。
- 高校层次按历史 985、211、第二轮“双一流”147 所、普通本科等标签辅助筛选；不要把标签当作唯一结论。
- 近 3 年专业录取分数线、最低位次、招生计划和选科要求，应优先引用阳光高考、省教育考试院、学校本科招生网公开数据。
- 高校排名、经费、就业质量、毕业去向，应引用学校年度就业质量报告、学校预算/决算公开、软科等第三方榜单，并说明年份。

回答格式：
1. 先确认缺失信息；缺少省份、科类、位次时，不要直接给确定推荐。
2. 给出冲/稳/保三档，每档列院校、专业组或专业、依据、风险。
3. 对每个推荐说明：近年位次匹配、专业实力、城市/行业机会、就业去向、读研或转专业空间。
4. 给出大学期间课程建议、竞赛/证书/科研/实习路径。
5. 给出未来就业建议和需要避开的风险。
6. 若数据无法验证，明确写“需要以当年省考试院和学校招生网为准”。`,
    difficulty: 'medium',
    category: 'gaokao-volunteer',
    tags: ['gaokao', 'volunteer', 'university', 'major', 'career'],
    challenge_type: 'qa',
    time_limit_ms: 0,
    memory_limit_mb: 0,
    starter_code: '',
    function_name: 'gaokao_volunteer_advice',
    input_keys: ['province', 'score', 'rank', 'subject_group', 'interests'],
    teaching_skills: ['explain_answer', 'debug_answer', 'concept_remediation', 'transfer_problem'],
    concepts: ['高考志愿', '省排名', '冲稳保', '专业分数线', '就业去向', '大学规划'],
    rubric: [
      '必须先确认省份、科类/选科、分数、位次和兴趣约束。',
      '推荐要按冲稳保分层，并说明分数线/位次依据和风险。',
      '必须覆盖专业、城市、就业、读研、课程和实习建议。',
      '涉及年度录取数据时必须说明来源年份和不确定性。',
    ],
    follow_up_questions: [
      '你的省份、科类或选科组合是什么？',
      '你有全省位次吗？只有分数时需要先估位次。',
      '你更看重城市、学校层次、专业强度还是就业稳定性？',
    ],
    published: true,
    created_at: createdAt,
    updated_at: createdAt,
  },
]
