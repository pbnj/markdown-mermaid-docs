import type { Span } from './vendor/grok-mermaid/index.js'

/** What a Mermaid style rule asks of one node, subgraph or link. */
export type Paint = {
  fill?: string
  stroke?: string
  color?: string
  bold?: boolean
  italic?: boolean
}

/** The `classDef`, `class`, `style` and `linkStyle` statements of one diagram. */
export type Styles = {
  classDefs: Map<string, Paint>
  classes: Map<string, string[]>
  styles: Map<string, Paint>
  links: Map<string, Paint>
}

/** What a terminal run is drawn with. */
export type Look = {
  color?: string
  backgroundColor?: string
  bold?: boolean
  italic?: boolean
}

// Split on commas outside parentheses, so `rgb(1,2,3)` stays one value.
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const c of s) {
    if (c === '(') depth++
    if (c === ')') depth--
    if (c === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

function colorValue(v: string): string | undefined {
  const value = v.replace(/!important$/i, '').trim()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return value
  if (/^rgba?\([^)]*\)$/i.test(value)) return value.replace(/\s+/g, '')
  if (/^[a-z]+$/i.test(value) && !/^(none|transparent|inherit|initial)$/i.test(value)) return value
  return undefined
}

function parsePaint(props: string): Paint {
  const paint: Paint = {}
  for (const decl of splitTop(props)) {
    const at = decl.indexOf(':')
    if (at < 0) continue
    const key = decl.slice(0, at).trim().toLowerCase()
    const value = decl.slice(at + 1).trim()
    if (key === 'fill' || key === 'background' || key === 'background-color') paint.fill = colorValue(value)
    else if (key === 'stroke') paint.stroke = colorValue(value)
    else if (key === 'color') paint.color = colorValue(value)
    else if (key === 'font-weight') paint.bold = /^(bold|[6-9]00)$/i.test(value)
    else if (key === 'font-style') paint.italic = /^italic$/i.test(value)
  }
  return paint
}

const names = (s: string) => s.split(',').map(n => n.trim()).filter(Boolean)

/** Reads a diagram's style statements; anything else in `src` is ignored. */
export function parseStyles(src: string): Styles {
  const styles: Styles = { classDefs: new Map(), classes: new Map(), styles: new Map(), links: new Map() }
  const assign = (id: string, cls: string) => styles.classes.set(id, [...(styles.classes.get(id) ?? []), cls])

  for (const raw of src.split(/[\n;]/)) {
    const m = /^\s*(classDef|class|style|linkStyle)\s+(\S+)\s+(.+?)\s*$/i.exec(raw)
    if (!m) continue
    const [, kw = '', target = '', rest = ''] = m
    switch (kw.toLowerCase()) {
      case 'classdef':
        for (const n of names(target)) styles.classDefs.set(n, parsePaint(rest))
        break
      case 'class':
        for (const id of names(target)) for (const cls of names(rest)) assign(id, cls)
        break
      case 'style':
        styles.styles.set(target, parsePaint(rest))
        break
      case 'linkstyle':
        for (const n of names(target)) styles.links.set(n.toLowerCase(), parsePaint(rest))
        break
    }
  }
  return styles
}

const merge = (...paints: (Paint | undefined)[]): Paint => Object.assign({}, ...paints.filter(Boolean))

/** The paint a run's owner resolves to, or nothing where no rule names it. */
export function paintFor(tag: string | undefined, styles: Styles, inline: Record<string, string[]>): Paint | undefined {
  if (!tag) return undefined
  const at = tag.indexOf(':')
  const kind = tag.slice(0, at)
  const id = tag.slice(at + 1)

  if (kind === 'edge') {
    const paint = merge(styles.links.get('default'), styles.links.get(id))
    return Object.keys(paint).length > 0 ? paint : undefined
  }

  const classes = [...(inline[id] ?? []), ...(styles.classes.get(id) ?? [])]
  const base = kind === 'node' && classes.length === 0 ? styles.classDefs.get('default') : undefined
  const paint = merge(base, ...classes.map(c => styles.classDefs.get(c)), styles.styles.get(id))
  return Object.keys(paint).length > 0 ? paint : undefined
}

// Black or white, whichever reads on `fill`; nothing for a fill not in hex.
function contrast(fill: string | undefined): string | undefined {
  const hex = fill && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(fill)?.[1]
  if (!hex) return undefined
  const full = hex.length === 3 ? [...hex].map(c => c + c).join('') : hex
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? '#000000' : '#ffffff'
}

/** Unstyled runs, in theme colors so they follow the person's theme. */
const BASE: Record<Span['cls'], Look> = {
  border: { color: 'inactive' },
  text: {},
  edge: { color: 'suggestion' },
  edgeLabel: { color: 'subtle' },
  title: { color: 'claude', bold: true },
  none: {},
}

/** The run's look, with no prop left `undefined`. */
export function lookFor(span: Span, paint: Paint | undefined, isEdge: boolean): Look {
  const look = paintedLook(span, paint, isEdge)
  return Object.fromEntries(Object.entries(look).filter(([, v]) => v !== undefined)) as Look
}


function paintedLook(span: Span, paint: Paint | undefined, isEdge: boolean): Look {
  const base = BASE[span.cls]
  if (!paint) return base

  if (isEdge) {
    if (span.cls === 'edge') return { ...base, color: paint.stroke ?? base.color }
    return { ...base, color: paint.color ?? base.color, bold: paint.bold, italic: paint.italic }
  }

  const look: Look = { ...base, backgroundColor: paint.fill }
  if (span.cls === 'border') look.color = paint.stroke ?? base.color
  if (span.cls === 'text') {
    look.color = paint.color ?? contrast(paint.fill) ?? base.color
    look.bold = paint.bold
    look.italic = paint.italic
  }
  return look
}
