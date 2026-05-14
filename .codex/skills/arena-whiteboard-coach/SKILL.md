---
name: arena-whiteboard-coach
description: Use when generating WTT Arena interview whiteboards, especially answer-structure diagrams for AI/ML/system-design questions. Produces compact, staged Excalidraw-compatible elements instead of restating the prompt.
---

# Arena Whiteboard Coach

Use this skill for WTT Arena whiteboard explanations. The goal is to teach like an interviewer at a board: speak briefly, draw one layer, then move to the next layer.

## Output Contract

Always produce a short explanation followed by one `EXCALIDRAW_ELEMENTS` JSON block:

```text
[EXCALIDRAW_ELEMENTS]
{"elements":[{"type":"text","id":"title","x":70,"y":45,"text":"答案结构","fontSize":34,"width":720},{"type":"rectangle","id":"goal","x":80,"y":145,"width":210,"height":92,"strokeColor":"#0f766e","backgroundColor":"#ccfbf1","fillStyle":"solid","roundness":{"type":3}},{"type":"text","id":"goal-label","x":94,"y":163,"text":"目标/SLO","fontSize":20,"width":182},{"type":"rectangle","id":"core","x":620,"y":145,"width":210,"height":92,"strokeColor":"#d97706","backgroundColor":"#ffedd5","fillStyle":"solid","roundness":{"type":3}},{"type":"text","id":"core-label","x":634,"y":163,"text":"核心方案","fontSize":20,"width":182},{"type":"arrow","id":"goal-core-arrow","x":290,"y":191,"points":[[0,0],[330,0]],"endArrowhead":"arrow","label":{"text":"推导","fontSize":16}}]}
[/EXCALIDRAW_ELEMENTS]
```

Supported element types: `rectangle`, `text`, `arrow`, `line`, `ellipse`, `diamond`. Do not emit `WHITEBOARD_OPS`.

## Teaching Phases

Order the board in these phases:

1. `goal`: goal, scale, SLO, primary metric.
2. `inputs`: users, data, traffic, constraints.
3. `core`: model, algorithm, retrieval, kernel, or inference path.
4. `serve`: online service/runtime path, latency, reliability.
5. `evaluate`: metrics, monitoring, experiments, rollback.
6. `tradeoffs`: bottlenecks, failure modes, interviewer follow-ups.

## Layout Rules

- Keep the board compact: 4-6 answer boxes, 1-2 section panels, 3-5 arrows, at most 24 elements.
- Do not copy the problem statement or requirement list into the board.
- Rectangles and text should contain answer components or decisions, not instructions.
- Prefer short labels: 2-6 words for boxes, one sentence per section item.
- Use stable IDs such as `goal`, `inputs`, `core`, `serve`, `eval`, `risks`.
- Use a simple left-to-right layout: boxes around y=145, sections around y=365, arrows between boxes. Leave spacing; avoid dense coordinate clusters.

## Quality Bar

A good board answers: “What would a strong candidate draw and explain?” It should make the solution structure visible before details. If the question is open-ended, show a defensible baseline architecture plus trade-offs rather than many disconnected ideas.
