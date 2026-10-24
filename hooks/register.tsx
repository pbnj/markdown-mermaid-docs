import type { Elements, EngineInterface, PromptAutocompleteSuggestion, Register } from 'claude-code'

import type { Doc } from '../types'
import { mermaidBlocks, type Segment, segments } from './mermaid.ts'
import { lookFor, paintFor } from './style.ts'

// The columns a reply's bullet, or a command row's indent, takes before the text.
const GUTTER = 2

type Ui = Pick<Elements[keyof Elements], 'Box' | 'Markdown' | 'Text'>

/** Each segment as a tree: markdown as the engine draws it, art in its colors. */
function drawn({ Box, Markdown, Text }: Ui, parts: Segment[]) {
  return parts.map(part => {
    if (part.kind === 'markdown') {
      return part.text.trim() === '' ? null : (
        <Box marginTop={1}>
          <Markdown text={part.text} />
        </Box>
      )
    }

    const { art, styles, indent } = part
    return (
      <Box flexDirection="column" marginTop={1} paddingLeft={indent}>
        {art.styled.map(row => (
          <Text wrap="truncate-end">
            {row.length === 0
              ? ' '
              : row.map(span => {
                  const look = lookFor(span, paintFor(span.tag, styles, art.classes), !!span.tag?.startsWith('edge:'))
                  return <Text {...look}>{span.text}</Text>
                })}
          </Text>
        ))}
      </Box>
    )
  })
}

/** `~/x` from the home directory; anything else as the file system reads it. */
async function expandHome($: EngineInterface, path: string): Promise<string> {
  if (path !== '~' && !path.startsWith('~/')) return path
  const home = await $.env.get('HOME')
  return home ? home + path.slice(1) : path
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const unquote = (path: string) => path.trim().replace(/^(["'])(.*)\1$/, '$2')

/** The file's text, or the sentence saying why it could not be read. */
async function readFile($: EngineInterface, path: string): Promise<{ text: string } | { error: string }> {
  try {
    return { text: await $.fs.read(await expandHome($, path)) }
  } catch (err) {
    return { error: `Could not read \`${path}\`: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** `/mermaid <file> [n]`: the page of the file's diagrams, or its n-th, to draw. */
async function listing($: EngineInterface, args: string): Promise<{ path: string; page: string; summary: string } | { error: string }> {
  const m = /^(.*?)(?:\s+(\d+))?\s*$/.exec(args.trim())
  const path = unquote(m?.[1] ?? '')
  const pick = m?.[2] ? Number(m[2]) : undefined
  if (path === '') return { error: 'Usage: `/mermaid <file> [n]`: draws the Mermaid diagrams in a markdown file, or only its n-th.' }

  const read = await readFile($, path)
  if ('error' in read) return read
  const blocks = mermaidBlocks(read.text)
  if (blocks.length === 0) return { error: `No Mermaid diagrams in \`${path}\`.` }
  if (pick !== undefined && (pick < 1 || pick > blocks.length)) {
    return { error: `\`${path}\` has ${plural(blocks.length, 'Mermaid diagram')}; there is no #${pick}.` }
  }

  const shown = pick === undefined ? blocks.map((b, i) => ({ ...b, n: i + 1 })) : [{ ...blocks[pick - 1]!, n: pick }]
  const summary = pick === undefined ? plural(blocks.length, 'Mermaid diagram') : `diagram ${pick} of ${blocks.length}`
  const page = [
    `**${path}**: ${summary}`,
    ...shown.map(b => `**${b.n}.** ${b.heading ? `${b.heading} ` : ''}(line ${b.line})\n\n\`\`\`mermaid\n${b.source}\n\`\`\``),
  ].join('\n\n')
  return { path, page, summary }
}

// `/markdown` and `/mermaid` keep what they showed here, out of the
// conversation; the row's text, which the model reads, names the copy by its id.
const docs = { plugin: 'markdown-mermaid-docs', key: 'docs' } as const
const VIEW = /\(view ([0-9a-f]{8})\)\s*$/

/** Keeps `doc` for the row to draw; its id, for the row's text. */
async function keep($: EngineInterface, doc: Doc): Promise<string> {
  const id = crypto.randomUUID().replaceAll('-', '').slice(0, 8)
  await $.state.set({ ...docs, id }, doc)
  return id
}

/** `/mermaid <file> [n]`: keeps the page of diagrams and answers one line about it. */
async function diagrams($: EngineInterface, args: string): Promise<string> {
  const list = await listing($, args)
  if ('error' in list) return list.error
  const id = await keep($, { path: list.path, text: list.page })
  return `Showed \`${list.path}\` to the person: ${list.summary}. Read the file to see their source. (view ${id})`
}

/** `/markdown <file>`: keeps the file's text and answers one line about it. */
async function showing($: EngineInterface, args: string): Promise<string> {
  const path = unquote(args)
  if (path === '') return 'Usage: `/markdown <file>`: draws a markdown file, its Mermaid diagrams included.'

  const read = await readFile($, path)
  if ('error' in read) return read.error

  const id = await keep($, { path, text: read.text })

  const lines = read.text.split('\n').length
  const count = mermaidBlocks(read.text).length
  return `Showed \`${path}\` to the person: ${plural(lines, 'line')}, ${plural(count, 'Mermaid diagram')}. Read the file to see its content. (view ${id})`
}

// The draft up to the first argument of `/markdown` or `/mermaid`.
const FIRST_ARG = /^\s*\/(markdown|mermaid)\s+$/
const MARKDOWN = /\.(md|markdown)$/i
const MOST = 50

const size = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** Folders and markdown files whose path starts with `token`, as typeahead rows. */
async function pathsFor($: EngineInterface, token: string): Promise<PromptAutocompleteSuggestion[]> {
  const cut = token.lastIndexOf('/') + 1
  const dir = token.slice(0, cut)
  const prefix = token.slice(cut).toLowerCase()
  if (dir === '' && prefix === '~') return [{ text: '~/', description: 'home folder' }]

  const where = dir === '' ? undefined : await expandHome($, dir)
  const entries = await $.fs.list(where).catch(() => [])

  const rows: (PromptAutocompleteSuggestion & { isDir: boolean })[] = []
  for (const entry of entries) {
    if (!entry.name.toLowerCase().startsWith(prefix)) continue
    if (entry.name.startsWith('.') && !prefix.startsWith('.')) continue
    // A link is listed as `other`; where it leads says which it is.
    const kind = entry.isLink ? (await $.fs.stat(`${where ?? ''}${entry.name}`).catch(() => undefined))?.kind : entry.kind
    if (kind === 'dir') rows.push({ text: `${dir}${entry.name}/`, label: `${entry.name}/`, isDir: true })
    else if (kind === 'file' && MARKDOWN.test(entry.name)) {
      rows.push({ text: `${dir}${entry.name}`, label: entry.name, description: size(entry.size), isDir: false })
    }
  }
  return rows
    .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.text.localeCompare(b.text))
    .slice(0, MOST)
    .map(({ isDir, ...row }) => row)
}

export const register: Register = on => {
  // File names for the command's first argument, beneath the engine's rows.
  on('prompt.autocomplete', async ($, e, next) => {
    const result = await next(e)
    if (!FIRST_ARG.test(e.text.slice(0, e.start))) return result
    return { suggestions: [...result.suggestions, ...(await pathsFor($, e.token))] }
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mermaid',
      description: 'Draw the Mermaid diagrams in a markdown file',
      argumentHint: '<file> [n]',
    })
    await $.command.register({
      name: 'markdown',
      description: 'Draw a markdown file, Mermaid diagrams included',
      argumentHint: '<file>',
    })
    return next(e)
  })

  on('command.run', { command: 'markdown' }, async ($, e) => ({ text: await showing($, e.args) }))

  // The document `/markdown` kept for this row, or the file as it is now
  // where the copy is gone (a resumed session).
  on('ui.render', { component: 'CommandOutput', props: { command: 'markdown' } }, async ($, e, next) => {
    const id = VIEW.exec(e.props.text)?.[1]
    if (e.props.isErrored || !id) return next(e)

    const ui = $.ui.resolve(e)
    let doc = (await $.state.get({ ...docs, id })).value
    let note: string | undefined
    if (!doc) {
      const read = await readFile($, unquote(e.props.args))
      if ('error' in read) return next(e)
      doc = { path: unquote(e.props.args), text: read.text }
      note = 'The copy from when this ran is gone; drawn from the file as it is now.'
    }

    const columns = e.viewport ? e.viewport.columns - GUTTER : undefined
    return (
      <ui.Box flexDirection="column">
        {note && <ui.Text dimColor>{note}</ui.Text>}
        {drawn(ui, segments(doc.text, columns))}
      </ui.Box>
    )
  })

  on('command.run', { command: 'mermaid' }, async ($, e) => ({ text: await diagrams($, e.args) }))

  // The page of diagrams `/mermaid` kept for this row, or made again from the
  // file where the copy is gone.
  on('ui.render', { component: 'CommandOutput', props: { command: 'mermaid' } }, async ($, e, next) => {
    const id = VIEW.exec(e.props.text)?.[1]
    if (e.props.isErrored || !id) return next(e)

    const ui = $.ui.resolve(e)
    let page = (await $.state.get({ ...docs, id })).value?.text
    let note: string | undefined
    if (page === undefined) {
      const list = await listing($, e.props.args)
      if ('error' in list) return next(e)
      page = list.page
      note = 'The copy from when this ran is gone; drawn from the file as it is now.'
    }

    const columns = e.viewport ? e.viewport.columns - GUTTER : undefined
    return (
      <ui.Box flexDirection="column">
        {note && <ui.Text dimColor>{note}</ui.Text>}
        {drawn(ui, segments(page, columns))}
      </ui.Box>
    )
  })

  // Redraws the reply only: the stored reply keeps the Mermaid source.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary) return next(e)

    const columns = e.viewport ? e.viewport.columns - GUTTER : undefined
    const parts = segments(e.props.text, columns)
    const [only] = parts
    if (parts.length === 1 && only?.kind === 'markdown') {
      // Nothing drew; a note may still have been added under a fence.
      return only.text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text: only.text } })
    }

    const ui = $.ui.resolve(e)

    // The engine draws the opening text, so the reply keeps its bullet; the
    // rest sits in the gutter that text is drawn in.
    const [head, ...tail] = parts
    const lead = head?.kind === 'markdown' && head.text.trim() !== ''
    const opening = lead ? await next({ ...e, props: { ...e.props, text: head.text } }) : null

    return (
      <ui.Box flexDirection="column">
        {opening}
        <ui.Box flexDirection="column" paddingLeft={GUTTER}>
          {drawn(ui, lead ? tail : parts)}
        </ui.Box>
      </ui.Box>
    )
  })
}
