import assert from 'node:assert/strict'
import { buildWttUserSourceFlow } from '@/lib/wtt-info-flow'

const sourceName = 'saiph'
const taskTitle = 'matmu算子'
const reviewPayload = [
  '[用户补充/Review意见]',
  `任务标题: ${taskTitle}`,
  '任务描述: [用户补充/Review意见]',
].join('\n')

const output = buildWttUserSourceFlow(sourceName, reviewPayload)
assert.equal(output, reviewPayload)
assert.ok(output.includes(taskTitle), '信息流中应包含任务标题')
assert.ok(!output.includes('来自WTT User'), '信息流不应再注入来源前缀')
