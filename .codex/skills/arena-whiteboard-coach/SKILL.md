---
name: arena-whiteboard-coach
description: Use when generating WTT Arena interview whiteboards, especially answer-structure diagrams for AI/ML/system-design questions. Produces compact, staged Excalidraw-compatible elements instead of restating the prompt.
---

# Arena Whiteboard Coach

Use this skill for WTT Arena whiteboard explanations. The goal is to teach like an interviewer at a board: speak briefly, draw one layer, then move to the next layer.

## Output Contract

Always produce a short explanation followed by one `EXCALIDRAW_ELEMENTS` JSON block. Before drawing, compress your answer into 4-6 answer-specific nodes. The node labels must come from the current reply, not from a reusable template.

```text
[EXCALIDRAW_ELEMENTS]
{"elements":[{"type":"text","id":"title","x":70,"y":45,"text":"答案结构","fontSize":34,"width":720},{"type":"rectangle","id":"goal","x":80,"y":145,"width":210,"height":92,"strokeColor":"#0f766e","backgroundColor":"#ccfbf1","fillStyle":"solid","roundness":{"type":3}},{"type":"text","id":"goal-label","x":94,"y":163,"text":"目标/SLO","fontSize":20,"width":182},{"type":"rectangle","id":"core","x":620,"y":145,"width":210,"height":92,"strokeColor":"#d97706","backgroundColor":"#ffedd5","fillStyle":"solid","roundness":{"type":3}},{"type":"text","id":"core-label","x":634,"y":163,"text":"核心方案","fontSize":20,"width":182},{"type":"arrow","id":"goal-core-arrow","x":290,"y":191,"points":[[0,0],[330,0]],"endArrowhead":"arrow","label":{"text":"推导","fontSize":16}}]}
[/EXCALIDRAW_ELEMENTS]
```

Supported element types: `rectangle`, `text`, `arrow`, `line`, `ellipse`, `diamond`. Do not emit `WHITEBOARD_OPS`.

## Teaching Phases

Summarize the current answer first, then choose a diagram pattern that matches the answer. Do not always draw the same goal -> inputs -> core -> serve -> eval chain. A good board should still make sense if the chat text is hidden.

Use these patterns when appropriate:

- `pipeline`: query/request flow, RAG, KV cache, inference, kernel, data processing.
- `architecture`: services, stores, model components, feedback loops, online systems.
- `two_lane`: offline vs online, training vs serving, batch vs realtime.
- `debug`: symptom -> likely cause -> check -> minimal fix -> validation.
- `concept`: prerequisite -> intuition -> formula/invariant -> example -> trap.

Possible teaching phases:

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
- Prefer short labels: 2-5 words for boxes; put long explanations in section panels. Never put a full sentence inside a small box.
- Use content-specific stable IDs such as `retrieval`, `rerank`, `kv-cache`, `offline-features`, `online-read`, `root-cause`, `fix`, `metric`, `rollback`.
- Avoid generic IDs and labels unless the answer itself is generic. Bad: `goal`, `inputs`, `core`, `serve`, `eval` for every response. Good: `chunking`, `permission-filter`, `hybrid-search`, `kv-cache`, `rollback`.
- Coordinates are hints only. The WTT renderer may normalize layout, so encode meaning in element IDs and labels.

## Quality Bar

A good board answers: “What would a strong candidate draw and explain?” It should make the solution structure visible before details. If the question is open-ended, show a defensible baseline architecture plus trade-offs rather than many disconnected ideas.
