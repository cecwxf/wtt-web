---
name: arena-whiteboard-coach
description: Use when generating WTT Arena interview whiteboards, especially answer-structure diagrams for AI/ML/system-design questions. Produces four-step Markdown/Mermaid diagram specs that WTT renders directly on the Arena whiteboard.
---

# Arena Whiteboard Coach

Use this skill for WTT Arena whiteboard explanations. The goal is to teach like an interviewer at a board: speak briefly, draw one layer, then move to the next layer.

## Output Contract

Always produce a short explanation followed by one `WHITEBOARD_DIAGRAM` JSON block. WTT renders Markdown tables and Mermaid diagrams directly on the Arena whiteboard, so do not force tables into flowchart nodes. The whiteboard block must contain four steps, each summarizing the current reply rather than copying the problem statement.

```text
[WHITEBOARD_DIAGRAM]
{"format":"steps","title":"RAG answer whiteboard","summary":["Show the teaching path: question, concepts, decomposition, final answer."],"steps":[{"stage":"socratic","title":"1. Socratic question","markdown":"| Focus | Question |\n| --- | --- |\n| Correctness | Which stage can silently introduce wrong evidence? |","mermaid":"flowchart LR\n  Goal[\"Clarify target\"] --> Risk{\"Main risk?\"}\n  Risk --> Retrieval[\"Retrieval quality\"]\n  Risk --> Grounding[\"Generation grounding\"]"},{"stage":"architecture_concepts","title":"2. Architecture / concepts","markdown":"| Layer | Role |\n| --- | --- |\n| Hybrid retrieval | Recall diverse candidates |\n| Rerank | Pick high-signal evidence |","mermaid":"flowchart LR\n  Query[\"User query\"] --> Filter[\"Permission filter\"]\n  Filter --> Retrieve[\"Hybrid retrieval\"]\n  Retrieve --> Rerank[\"Rerank\"]\n  Rerank --> Answer[\"Grounded answer\"]"},{"stage":"decomposition","title":"3. Key decomposition","markdown":"| Key point | Check |\n| --- | --- |\n| Permissions | Filter before generation |\n| Metrics | Measure recall and faithfulness |","mermaid":"flowchart TD\n  Scope[\"Scope constraints\"] --> Safety[\"Access control\"]\n  Scope --> Metrics[\"Offline + online eval\"]"},{"stage":"complete_answer","title":"4. Complete answer","markdown":"| Section | Must cover |\n| --- | --- |\n| Baseline | End-to-end path |\n| Trade-off | Latency vs quality |","mermaid":"flowchart LR\n  Baseline[\"Baseline design\"] --> Tradeoff[\"Trade-offs\"]\n  Tradeoff --> Ops[\"Monitor + rollback\"]"}]}
[/WHITEBOARD_DIAGRAM]
```

Preferred Mermaid format: `flowchart LR` or `flowchart TD`. Keep Markdown tables compact. Do not emit `WHITEBOARD_OPS` or `EXCALIDRAW_ELEMENTS`.

## Teaching Phases

Summarize the current answer first, then choose table columns and Mermaid patterns that match the answer. Do not always draw the same goal -> inputs -> core -> serve -> eval chain. A good board should still make sense if the chat text is hidden.

Every response should include these four visible steps:

1. `socratic`: a diagnostic question or hint that exposes the user's next reasoning move.
2. `architecture_concepts`: the main architecture, algorithm, or concept model.
3. `decomposition`: problem-specific key points, checks, constraints, or failure modes.
4. `complete_answer`: the final answer skeleton, including trade-offs and evaluation when relevant.

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

- Keep the board compact: 4 steps, one small table per step when useful, one small Mermaid diagram per step.
- Do not copy the problem statement or requirement list into the board.
- Mermaid nodes should contain answer components or decisions, not instructions.
- Prefer short labels: 2-5 words for boxes; put long explanations in section panels. Never put a full sentence inside a small box.
- Put dense comparisons in Markdown tables instead of Mermaid nodes.
- Use content-specific stable IDs such as `retrieval`, `rerank`, `kv-cache`, `offline-features`, `online-read`, `root-cause`, `fix`, `metric`, `rollback`.
- Avoid generic IDs and labels unless the answer itself is generic. Bad: `goal`, `inputs`, `core`, `serve`, `eval` for every response. Good: `chunking`, `permission-filter`, `hybrid-search`, `kv-cache`, `rollback`.
- Keep Mermaid syntax simple: `A["Label"] --> B["Label"]`, optional `{Decision}` nodes, no subgraphs unless essential.

## Quality Bar

A good board answers: “What would a strong candidate draw and explain?” It should make the solution structure visible before details. If the question is open-ended, show a defensible baseline architecture plus trade-offs rather than many disconnected ideas.
