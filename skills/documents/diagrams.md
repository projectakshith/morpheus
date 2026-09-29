---
name: diagrams
category: documents
description: Creating clear architecture, sequence, and flowchart diagrams via Mermaid
triggers: ["diagram", "mermaid", "architecture diagram", "flowchart", "sequence diagram"]
---

# Diagrams Skill

## Mermaid Diagram Conventions
1. **Flowcharts (`flowchart TD` / `flowchart LR`)**:
   - Quote node labels containing brackets, parens, or colons: `node["Process (Step 1)"]`.
   - Use meaningful subgraphs to represent service boundaries or layers.
2. **Sequence Diagrams (`sequenceDiagram`)**:
   - Use `autonumber` for readability.
   - Use `actor`, `participant`, and activation lifelines (`activate`/`deactivate`).
3. **State Diagrams (`stateDiagram-v2`)**:
   - Model lifecycle states and transitions explicitly with trigger labels on transitions.
