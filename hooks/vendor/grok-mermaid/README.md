Vendored from grok-mermaid 0.2.3 (https://github.com/xl0/grok-mermaid), `dist/`,
Apache-2.0 (see LICENSE), with these changes for markdown-mermaid-docs:

- canvas.js: each cell records what drew it (`tag`: `node:<id>`, `group:<id>`,
  `edge:<n>`), carried through blit and the BT/RL flips; `toLines` splits runs
  on it and puts it on each span as `tag`.
- graph.js: nodes keep their `id`.
- layout.js: nodes, subgraph frames and edges set the tag they draw with; a
  box's whole rectangle, inside included, is tagged.
- parse.js: a flowchart node's `:::name` classes are kept on the node; each
  Mermaid shape keeps its own name (subroutine, cylinder, stadium, circle,
  hexagon, asymmetric) and `[/ /]`, `[\ \]`, `[/ \]`, `[\ /]` are parsed as
  parallelograms and trapezoids instead of label text.
- layout.js (shapes): `drawBox` draws each shape's corners and sides
  (`CORNERS`, `sideGlyph`), a subroutine's inner bars (2 columns wider) and a
  cylinder's lid (1 row taller); for `BT`/`RL` a shape is drawn as its mirror
  image (`upright`) so the canvas flip turns it the right way round.
- canvas.js (shapes): the flips mirror `╱ ╲ < > ( )` on box borders only.
- index.js, types.d.ts: `render` returns `classes`, those classes by node id.

Source maps were removed.
