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
  and keep what they drew out of the conversation: the model reads one line
  (see [Context and tokens](#context-and-tokens)).

Styling follows the diagram's `classDef`, `class`, `:::`, `style` and
`linkStyle` (fill, stroke, color, bold, italic); unstyled diagrams use your
theme's colors. Flowchart shapes draw with their own outlines: rounded,
stadium, circle, diamond, hexagon, subroutine, cylinder, parallelograms,
trapezoids and asymmetric.

## Context and tokens

`/markdown` and `/mermaid` show you a file without adding it to Claude's
context. A command's output normally becomes part of the conversation, so
showing a 700-line document with a dozen diagrams that way would cost
thousands of tokens on every later turn. These commands put only one line in
the conversation instead:

```
Showed `docs/architecture.md` to the person: 709 lines, 11 Mermaid diagrams. Read the file to see its content. (view 242be727)
```

The file's text goes into the mod's session state, outside the
conversation, under that view id. The command's row looks it up and draws the
document or its diagrams from there.

- **Claude sees only the summary line.** To discuss the document, Claude reads
  the file itself, just as it would if you named the file.
- **Each run is a snapshot.** A row keeps showing the file as it was when the
  command ran. Run the command again to see the file as it is now.
- **The drawing is never cached, only the text.** Rows are redrawn from the
  saved text, so resizing the terminal or updating the mod affects old rows
  too.
- **Session state doesn't survive a resume.** In a resumed session a row whose
  copy is gone is drawn from the file as it is now, with a dim note saying so.

Mermaid in Claude's own replies is different: the reply's text is already in
the conversation, and the mod only changes how it's drawn, not what's stored.

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
