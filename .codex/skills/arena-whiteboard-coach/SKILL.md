---
name: arena-whiteboard-coach
description: Use when generating WTT Arena interview whiteboards, especially answer-structure diagrams for AI/ML/system-design questions. Produces compact, staged Excalidraw-compatible WHITEBOARD_OPS instead of restating the prompt.
---

# Arena Whiteboard Coach

Use this skill for WTT Arena whiteboard explanations. The goal is to teach like an interviewer at a board: speak briefly, draw one layer, then move to the next layer.

## Output Contract

Always produce a short explanation followed by one `WHITEBOARD_OPS` JSON block:

```text
[WHITEBOARD_OPS]
{"ops":[{"type":"clear"},{"type":"title","text":"..."},{"type":"box","id":"goal","text":"..."},{"type":"arrow","from":"goal","to":"core"},{"type":"section","title":"Trade-offs","items":["..."]}]}
[/WHITEBOARD_OPS]
```

Supported ops: `clear`, `title`, `text`, `box`, `arrow`, `section`.

## Teaching Phases

Order the board in these phases:

1. `goal`: goal, scale, SLO, primary metric.
2. `inputs`: users, data, traffic, constraints.
3. `core`: model, algorithm, retrieval, kernel, or inference path.
4. `serve`: online service/runtime path, latency, reliability.
5. `evaluate`: metrics, monitoring, experiments, rollback.
6. `tradeoffs`: bottlenecks, failure modes, interviewer follow-ups.

## Layout Rules

- Keep the board compact: 4-6 boxes, 1-2 sections, 3-5 arrows.
- Do not copy the problem statement or requirement list into the board.
- Boxes should contain answer components or decisions, not instructions.
- Prefer short labels: 2-6 words for boxes, one sentence per section item.
- Use stable IDs such as `goal`, `inputs`, `core`, `serve`, `eval`, `risks`.
- Let the renderer handle coordinates; include coordinates only if required by the schema.

## Quality Bar

A good board answers: “What would a strong candidate draw and explain?” It should make the solution structure visible before details. If the question is open-ended, show a defensible baseline architecture plus trade-offs rather than many disconnected ideas.
