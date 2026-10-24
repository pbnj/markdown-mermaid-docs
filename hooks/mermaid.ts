import { type MermaidArt, render } from './vendor/grok-mermaid/index.js'
import { parseStyles, type Styles } from './style.ts'

const OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/

type Fence = { indent: number; marker: string; isMermaid: boolean; body: string[] }

/** A reply cut at its diagrams: markdown to draw as the engine does, or art. */
export type Segment =
  | { kind: 'markdown'; text: string }
  | { kind: 'art'; art: MermaidArt; styles: Styles; indent: number }

function isClose(line: string, fence: Fence): boolean {
  const marker = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line)?.[1]
  return !!marker && marker[0] === fence.marker[0] && marker.length >= fence.marker.length
}

function dedent(line: string, indent: number): string {
  let i = 0
  while (i < indent && line[i] === ' ') i++
  return line.slice(i)
}

/**
 * Cuts `text` at each top-level ```mermaid fence that draws within `columns`,
 * so the fence becomes art. An unclosed fence (a reply still streaming) is
 * drawn from what has arrived. A fence that does not draw, or does not fit,
 * stays markdown with a note under it. Fences of other languages, and
 * anything inside them, are left alone. One markdown segment means there is
 * nothing to draw.
 */
export function segments(text: string, columns?: number): Segment[] {
  if (!/^ {0,3}(`{3,}|~{3,})\s*mermaid/im.test(text)) return [{ kind: 'markdown', text }]

  const out: Segment[] = []
  let md: string[] = []
  let fence: Fence | null = null
  let raw: string[] = []

  const flush = () => {
    if (md.length > 0) out.push({ kind: 'markdown', text: md.join('\n') })
    md = []
  }

  const close = (isClosed: boolean) => {
    if (!fence?.isMermaid) {
      md.push(...raw)
      return
    }
    const src = fence.body.join('\n')
    const art = render(src)
    const pad = ' '.repeat(fence.indent)

    if (!art) {
      md.push(...raw)
    } else if (columns !== undefined && art.width > columns - fence.indent) {
      md.push(...raw, `${pad}*Mermaid diagram needs ${art.width} columns; the terminal has ${columns}.*`)
    } else {
      flush()
      out.push({ kind: 'art', art, styles: parseStyles(src), indent: fence.indent })
      // Mid-stream every half-typed line warns; only a finished block says so.
      if (isClosed && art.warnings.length > 0) {
        const more = art.warnings.length > 1 ? ` (+${art.warnings.length - 1} more)` : ''
        md.push(`${pad}*Mermaid diagram partly drawn: ${art.warnings[0]}${more}*`)
      }
    }
  }

  for (const line of text.split('\n')) {
    if (!fence) {
      const [, indent = '', marker = '', info = ''] = OPEN.exec(line) ?? []
      // A backtick fence's info string holds no backticks: that is inline code.
      if (marker && !(marker[0] === '`' && info.includes('`'))) {
        const lang = info.trim().split(/\s+/, 1)[0]?.toLowerCase()
        fence = { indent: indent.length, marker, isMermaid: lang === 'mermaid', body: [] }
        raw = [line]
      } else {
        md.push(line)
      }
      continue
    }

    raw.push(line)
    if (isClose(line, fence)) {
      close(true)
      fence = null
    } else {
      fence.body.push(dedent(line, fence.indent))
    }
  }

  if (fence) close(false)
  flush()
  return out
}

/** One top-level ```mermaid fence of a document. */
export type Block = { source: string; line: number; heading?: string }

/** The document's top-level ```mermaid fences, each with its line and section. */
export function mermaidBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let heading: string | undefined
  let fence: (Fence & { line: number }) | null = null

  for (const [i, line] of text.split('\n').entries()) {
    if (fence) {
      if (isClose(line, fence)) {
        if (fence.isMermaid) blocks.push({ source: fence.body.join('\n'), line: fence.line, heading })
        fence = null
      } else {
        fence.body.push(dedent(line, fence.indent))
      }
      continue
    }
    const [, indent = '', marker = '', info = ''] = OPEN.exec(line) ?? []
    if (marker && !(marker[0] === '`' && info.includes('`'))) {
      const lang = info.trim().split(/\s+/, 1)[0]?.toLowerCase()
      fence = { indent: indent.length, marker, isMermaid: lang === 'mermaid', body: [], line: i + 1 }
      continue
    }
    const h = /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1]
    if (h) heading = h
  }
  return blocks
}
