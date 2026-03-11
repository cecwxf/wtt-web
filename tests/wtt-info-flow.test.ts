import assert from 'node:assert/strict'
import { buildWttUserSourceFlow, SOURCE_FLOW_FOOTER, SOURCE_FLOW_HEADER } from '@/lib/wtt-info-flow'

const sourceName = 'saiph'
const taskTitle = 'matmu算子'
const reviewPayload = [
  '[用户补充/Review意见]',
  `任务标题: ${taskTitle}`,
  '任务描述: [用户补充/Review意见]',
].join('\n')

const output = buildWttUserSourceFlow(sourceName, reviewPayload)
const expected = [
  SOURCE_FLOW_HEADER,
  `│ 来自WTT User: ${sourceName}`,
  SOURCE_FLOW_FOOTER,
  reviewPayload,
].join('\n')

assert.equal(output, expected)
assert.ok(output.includes(taskTitle), '信息流中应包含任务标题')
