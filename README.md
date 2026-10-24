# markdown-mermaid-docs

A Claude Code mod that draws Mermaid diagrams in the terminal as colored Unicode
box-drawing art, using a patched copy of
[grok-mermaid](https://www.npmjs.com/package/grok-mermaid).

- **Claude's replies**: each ` ```mermaid ` block is drawn in place of its
  source, while it streams too. A diagram wider than the terminal stays source,
  with a note.
- **`/markdown <file>`**: draws a markdown file, its diagrams included.
- **`/mermaid <file> [n]`**: draws a file's diagrams, or only its n-th, each
  with its section heading and line.
- Both commands complete folder and markdown file names as you type the path,
  and keep what they drew out of the conversation: the model reads one line.

Styling follows the diagram's `classDef`, `class`, `:::`, `style` and
`linkStyle` (fill, stroke, color, bold, italic); unstyled diagrams use your
theme's colors. Flowchart shapes draw with their own outlines: rounded,
stadium, circle, diamond, hexagon, subroutine, cylinder, parallelograms,
trapezoids and asymmetric.

## Install

At the prompt of a terminal session:

```
/plugin install markdown-mermaid-docs --marketplace pbnj/markdown-mermaid-docs
```

Answer `y` to add the marketplace, then pick a scope (user is first; Enter
takes it).

From a shell:

```
claude plugin install markdown-mermaid-docs --marketplace pbnj/markdown-mermaid-docs
```

In the desktop app, where `/plugin` does not run: click + next to the prompt
box, then Plugins, Add marketplace with `pbnj/markdown-mermaid-docs`, then Add
plugin.

## Limits

- Links can't attach to pointed or curved sides; `:::` classes are read in
  flowcharts only; Mermaid v11 `@{ shape }` syntax is not supported.
- Diagrams wider than the terminal fall back to their source.
- Mermaid in the output of the Read tool is not drawn, only in Claude's replies
  and the two commands.

## Credits

`hooks/vendor/grok-mermaid/` is grok-mermaid 0.2.3, Apache-2.0 (see its
`LICENSE`), with the changes listed in its `README.md`.

## License

Copyright 2026 Peter Benjamin. Licensed under the Apache License, Version 2.0;
see [LICENSE](LICENSE).
