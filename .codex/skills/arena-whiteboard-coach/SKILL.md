---
name: arena-whiteboard-coach
description: Use when generating WTT Arena interview whiteboards, especially answer-structure diagrams for AI/ML/system-design questions. Produces compact Mermaid-based diagram specs that WTT converts into Excalidraw whiteboards.
---

# Arena Whiteboard Coach

Use this skill for WTT Arena whiteboard explanations. The goal is to teach like an interviewer at a board: speak briefly, draw one layer, then move to the next layer.

## Output Contract

Always produce a short explanation followed by one `WHITEBOARD_DIAGRAM` JSON block. Before drawing, compress your answer into 4-8 answer-specific nodes. The node labels must come from the current reply, not from a reusable template.

```text
[WHITEBOARD_DIAGRAM]
{"format":"mermaid","title":"RAG answer architecture","summary":["Separate retrieval quality, permission safety, generation grounding, and evaluation loop."],"source":"flowchart LR\n  Q[\"User query\"] --> P[\"Permission filter\"]\n  P --> H[\"Hybrid retrieval\"]\n  H --> R[\"Rerank\"]\n  R --> G[\"Grounded generation\"]\n  G --> E[\"Eval + feedback\"]"}
[/WHITEBOARD_DIAGRAM]
```

Preferred format: Mermaid `flowchart LR` or `flowchart TD`. WTT will convert it to editable Excalidraw elements. Do not emit `WHITEBOARD_OPS`.

## Teaching Phases

Summarize the current answer first, then choose a diagram pattern that matches the answer. Do not always draw the same goal -> inputs -> core -> serve -> eval chain. A good board should still make sense if the chat text is hidden.

Use these patterns when appropriate:

- `pipeline`: query/request flow, RAG, KV cache, inference, kernel, data processing.
- `architecture`: services, stores, model components, feedback loops, online systems.
- `two_lane`: offline vs online, training vs serving, batch vs realtime.
- `debug`: symptom -> likely cause -> check -> minimal fix -> validation.
- `concept`: prerequisite -> intuition -> formula/invariant -> example -> trap.
- `decision tree`: branch on constraints or failure conditions with Mermaid `{Decision}` nodes.

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
- Mermaid nodes should contain answer components or decisions, not instructions.
- Prefer short labels: 2-5 words for boxes; put long explanations in section panels. Never put a full sentence inside a small box.
- Use content-specific stable IDs such as `retrieval`, `rerank`, `kv-cache`, `offline-features`, `online-read`, `root-cause`, `fix`, `metric`, `rollback`.
- Avoid generic IDs and labels unless the answer itself is generic. Bad: `goal`, `inputs`, `core`, `serve`, `eval` for every response. Good: `chunking`, `permission-filter`, `hybrid-search`, `kv-cache`, `rollback`.
- Keep Mermaid syntax simple: `A["Label"] --> B["Label"]`, optional `{Decision}` nodes, no subgraphs unless essential.

## Quality Bar

A good board answers: “What would a strong candidate draw and explain?” It should make the solution structure visible before details. If the question is open-ended, show a defensible baseline architecture plus trade-offs rather than many disconnected ideas.
