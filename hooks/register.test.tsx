import type { On, PromptAutocompleteInput, PromptAutocompleteResult } from 'claude-code'
import { expect, test } from 'claude-code/testing'

type Run = { type: string; props?: Record<string, unknown>; children: unknown[] }

// A diagram row is one Text of runs; the props of the first run matching `re`.
const run = (row: { children: unknown[] } | undefined, re: RegExp) =>
  (row?.children as Run[] | undefined)?.find(c => re.test(c.children.join('')))?.props ?? {}

// A trimmed data-flow diagram, styled with `:::class` tags and `classDef`
// lines.
const STYLED = [
  'Here is the flow:',
  '',
  '```mermaid',
  'flowchart LR',
  '    subgraph TB1["TB1 — edge"]',
  '        api["FastAPI edge"]:::comp',
  '    end',
  '    user(["Browser"]):::ext',
  '    vec[("Corpus")]',
  '    user -->|"F1 POST"| api',
  '    api ==> vec',
  '    class vec store',
  '    style user stroke:#ff0000',
  '    linkStyle 1 stroke:#cc0000,color:#00aa00',
  '    classDef ext fill:#e8e8e8,stroke:#888888,color:#000000;',
  '    classDef comp fill:#d6e4ff,stroke:#2f5fd0;',
  '    classDef store fill:#333333,stroke:#d6a300;',
  '```',
  '',
  'And some code:',
  '',
  '````markdown',
  '```mermaid',
  'flowchart LR',
  '  X --> Y',
  '```',
  '````',
].join('\n')

const message = (text: string) =>
  ({
    plugin: 'markdown-mermaid-docs',
    component: 'AssistantMessage',
    requestId: 'msg-1',
    props: { text, isFirstOfReply: true },
  }) as const

// Nothing draws beneath the plugin: this hook stands for the engine, drawing
// the text it was handed.
const engine = (on: On) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{'text' in e.props ? `engine: ${String(e.props.text)}` : ''}</Text>
  })

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a styled diagram is drawn in its colors on ${surface}`, async ($, on) => {
    engine(on)
    const ui = await $.ui.mount({ ...message(STYLED), surface })

    // The opening text is the engine's own drawing, so the bullet stays.
    expect((await ui.find({ type: 'Text', text: /^engine: Here is the flow/ }))?.text).not.toContain('mermaid')

    // `:::comp`: the fill behind it, black text chosen to read on that fill.
    const api = await ui.find({ type: 'Text', text: /FastAPI edge/ })
    expect(run(api, /FastAPI edge/)).toMatchObject({ backgroundColor: '#d6e4ff', color: '#000000' })

    // `class vec store` on a dark fill: white text.
    const vec = await ui.find({ type: 'Text', text: /Corpus/ })
    expect(run(vec, /Corpus/)).toMatchObject({ backgroundColor: '#333333', color: '#ffffff' })

    // `style` outranks the class's stroke.
    const user = await ui.find({ type: 'Text', text: /Browser/ })
    expect(run(user, /^\($/)).toMatchObject({ backgroundColor: '#e8e8e8', color: '#ff0000' })

    // `linkStyle 1`: the thick link in its stroke.
    expect(run(await ui.find({ type: 'Text', text: /━/ }), /━/)).toMatchObject({ color: '#cc0000' })

    // A mermaid fence nested in another fence stays source.
    expect((await ui.find({ type: 'Markdown', text: /X --> Y/ }))?.text).toContain('```mermaid')
    await ui.unmount()
  })
}

test('a diagram with no styles draws in theme colors', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...message('Flow:\n\n```mermaid\nflowchart LR\n  A[Start] --> B[Done]\n```'), surface: 'terminal' })

  const start = await ui.find({ type: 'Text', text: /Start/ })
  expect(run(start, /Start/).backgroundColor).toBeUndefined()
  expect(run(start, /▶/)).toMatchObject({ color: 'suggestion' })
  await ui.unmount()
})

test('a reply still streaming draws the fence it has so far', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({
    ...message('```mermaid\nflowchart TD\n  A[One] --> B[Two'),
    surface: 'terminal',
  })

  expect(await ui.find({ type: 'Text', text: /One/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: /partly drawn/ })).toBeUndefined()
  await ui.unmount()
})

test('a diagram wider than the terminal stays source, with a note', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({
    ...message('Wide:\n\n```mermaid\nflowchart LR\n  A[Start] --> B[Done]\n```'),
    surface: 'terminal',
    viewport: { columns: 12, rows: 40 },
  })

  expect((await ui.find({ type: 'Text', text: /^engine:/ }))?.text).toContain('needs')
  await ui.unmount()
})

test('a reply with no mermaid is left alone', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...message('just `code`'), surface: 'terminal' })

  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine: just `code`')
  await ui.unmount()
})


test('each shape draws its own outline', async ($, on) => {
  engine(on)
  const src = [
    'flowchart TD',
    '  s(["stadium"]) --> d{"diamond"}',
    '  d --> h{{"hexagon"}}',
    '  h --> p[/"model"/]',
    '  p --> t[/"trapezoid"\\]',
    '  t --> c[("store")]',
    '  c --> r[["subroutine"]]',
    '  r --> a>"flag"]',
  ].join('\n')
  const ui = await $.ui.mount({ ...message(`Shapes:\n\n\`\`\`mermaid\n${src}\n\`\`\``), surface: 'terminal' })
  const row = async (re: RegExp) => (await ui.find({ type: 'Text', text: re }))?.text ?? ''

  expect(await row(/stadium/)).toMatch(/\( stadium \)/)
  expect(await row(/diamond/)).toMatch(/< diamond >/)
  expect(await row(/hexagon/)).toMatch(/│ hexagon │/)
  // The slanted family no longer shows its brackets as label text.
  expect(await row(/model/)).toMatch(/│ model │/)
  expect(await row(/trapezoid/)).toMatch(/│ trapezoid │/)
  expect(await row(/^\s*╱─+╲\s*$/)).toBeTruthy()
  expect(await row(/├─+┤/)).toBeTruthy()
  expect(await row(/subroutine/)).toMatch(/││ subroutine ││/)
  expect(await row(/flag/)).toMatch(/> flag │/)
  await ui.unmount()
})

test('a fill covers the whole outline, corners included', async ($, on) => {
  engine(on)
  const src = 'flowchart LR\n  d{"ok?"}:::c\n  classDef c fill:#d6e4ff,stroke:#2f5fd0'
  const ui = await $.ui.mount({ ...message(`Fill:\n\n\`\`\`mermaid\n${src}\n\`\`\``), surface: 'terminal' })
  const top = await ui.find({ type: 'Text', text: /╱─+╲/ })

  expect(run(top, /╱─+╲/)).toMatchObject({ backgroundColor: '#d6e4ff', color: '#2f5fd0' })
  await ui.unmount()
})

test('RL mirrors the layout but keeps shapes and labels the right way round', async ($, on) => {
  engine(on)
  const src = 'flowchart RL\n  a(["f(x)"]) --> b{"ok?"}\n  b --> c>"flag"]'
  const ui = await $.ui.mount({ ...message(`RL:\n\n\`\`\`mermaid\n${src}\n\`\`\``), surface: 'terminal' })
  const row = async (re: RegExp) => (await ui.find({ type: 'Text', text: re }))?.text ?? ''

  expect(await row(/f\(x\)/)).toMatch(/\( f\(x\) \)/)
  expect(await row(/ok\?/)).toMatch(/< ok\? >/)
  expect(await row(/flag/)).toMatch(/> flag │/)
  await ui.unmount()
})

const DOC = [
  '# Shop',
  '',
  '## Request routing',
  '',
  '```mermaid',
  'flowchart LR',
  '  REQ([request]):::app --> GW["AuthGateway"]:::app',
  '  classDef app fill:#7c2d12,color:#fff,stroke:#fdba74',
  '```',
  '',
  '## Stores',
  '',
  '```mermaid',
  'flowchart LR',
  '  C[shop] --> S[("Postgres")]',
  '```',
].join('\n')

// Files by path; a relative one matches however the engine resolved it.
const command = (on: On, files: Record<string, string>) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'mermaid' } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('fs.read', (_, e) => {
    const text = Object.entries(files).find(([name]) => e.path === name || e.path.endsWith(`/${name}`))?.[1]
    if (text === undefined) throw new Error('ENOENT: no such file')
    return { value: text }
  })
}

// `/mermaid <args>` typed at the prompt.
const typed = (args: string) =>
  ({ command: 'mermaid', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const

const commandRow = (command: string, args: string, text: string) =>
  ({
    plugin: 'markdown-mermaid-docs',
    component: 'CommandOutput',
    props: { command, args, text, isErrored: false },
    surface: 'terminal',
  }) as const

test('/mermaid draws every diagram in a file; the model reads one line', async ($, on) => {
  command(on, { 'docs/shop.md': DOC })
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const { text = '' } = await $.command.run(typed('docs/shop.md'))
  expect(text).toMatch(/^Showed `docs\/shop\.md` to the person: 2 Mermaid diagrams\. .*\(view [0-9a-f]{8}\)$/)
  expect(text).not.toContain('AuthGateway')

  const ui = await $.ui.mount(commandRow('mermaid', 'docs/shop.md', text))
  expect(await ui.find({ type: 'Markdown', text: /\*\*1\.\*\* Request routing \(line 5\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: /\*\*2\.\*\* Stores \(line 13\)/ })).toBeDefined()
  expect(run(await ui.find({ type: 'Text', text: /AuthGateway/ }), /AuthGateway/)).toMatchObject({ backgroundColor: '#7c2d12' })
  expect(await ui.find({ type: 'Text', text: /├─+┤/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /copy from when this ran/ })).toBeUndefined()
  await ui.unmount()
})

test('/mermaid <file> n shows one diagram, ~ is the home directory', async ($, on) => {
  command(on, { '/home/me/shop.md': DOC })
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const { text = '' } = await $.command.run(typed('~/shop.md 2'))
  expect(text).toContain('diagram 2 of 2')

  const ui = await $.ui.mount(commandRow('mermaid', '~/shop.md 2', text))
  expect(await ui.find({ type: 'Text', text: /Postgres/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /AuthGateway/ })).toBeUndefined()
  await ui.unmount()
})

test('/mermaid redraws from the file once its copy is gone', async ($, on) => {
  command(on, { 'docs/shop.md': DOC })
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount(commandRow('mermaid', 'docs/shop.md 1', 'Showed `docs/shop.md` to the person. (view deadbeef)'))
  expect(await ui.find({ type: 'Text', text: /copy from when this ran is gone/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /AuthGateway/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Postgres/ })).toBeUndefined()
  await ui.unmount()
})

test('/mermaid says what went wrong', async ($, on) => {
  command(on, { 'plain.md': '# nothing to draw', 'docs/shop.md': DOC })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const say = async (args: string) => (await $.command.run(typed(args))).text ?? ''

  expect(await say('')).toContain('Usage')
  expect(await say('missing.md')).toContain('Could not read `missing.md`')
  expect(await say('plain.md')).toContain('No Mermaid diagrams')
  expect(await say('docs/shop.md 3')).toContain('there is no #3')
})

test('/markdown draws the whole document; the model reads one line', async ($, on) => {
  command(on, { 'docs/shop.md': `${DOC}\n\nSome closing prose.` })
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const { text = '' } = await $.command.run({ ...typed('docs/shop.md'), command: 'markdown' })
  expect(text).toMatch(/^Showed `docs\/shop\.md` to the person: 18 lines, 2 Mermaid diagrams\. .*\(view [0-9a-f]{8}\)$/)
  expect(text).not.toContain('AuthGateway')

  const ui = await $.ui.mount(commandRow('markdown', 'docs/shop.md', text))
  expect(await ui.find({ type: 'Markdown', text: /## Request routing/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: /Some closing prose/ })).toBeDefined()
  expect(run(await ui.find({ type: 'Text', text: /AuthGateway/ }), /AuthGateway/)).toMatchObject({ backgroundColor: '#7c2d12' })
  expect(await ui.find({ type: 'Text', text: /copy from when this ran/ })).toBeUndefined()
  await ui.unmount()
})

test('/markdown redraws from the file once its copy is gone', async ($, on) => {
  command(on, { 'docs/shop.md': DOC })
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount(commandRow('markdown', 'docs/shop.md', 'Showed `docs/shop.md` to the person. (view deadbeef)'))
  expect(await ui.find({ type: 'Text', text: /copy from when this ran is gone/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /AuthGateway/ })).toBeDefined()
  await ui.unmount()
})

test('/markdown says what went wrong', async ($, on) => {
  command(on, {})
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const say = async (args: string) => (await $.command.run({ ...typed(args), command: 'markdown' })).text ?? ''

  expect(await say('')).toContain('Usage')
  expect(await say('missing.md')).toContain('Could not read `missing.md`')
})

// A folder tree for `$.fs.list`; a key matches the end of the path listed, which
// the engine resolves against the cwd, the mod's own folder under a test.
const tree = (on: On, dirs: Record<string, { name: string; kind: 'file' | 'dir' | 'other'; size?: number; isLink?: boolean }[]>) => {
  on('env.get', () => ({ value: '/home/me' }))
  on('fs.list', (_, e) => {
    const path = (e.path ?? '').replace(/\/$/, '')
    const entries = Object.entries(dirs).find(([key]) => path === key || path.endsWith(`/${key}`))?.[1]
    if (!entries) throw new Error('ENOENT')
    return { value: entries.map(d => ({ size: 0, mtimeMs: 0, isLink: false, ...d })) }
  })
  on('fs.stat', () => ({ value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: true } }))
  // The engine's own rows are not on the event; nothing beneath adds any.
  on('prompt.autocomplete', () => ({ suggestions: [] }))
}

// The engine raises `prompt.autocomplete` itself; its `$` has no call for it.
type Autocomplete = (e: PromptAutocompleteInput) => Promise<PromptAutocompleteResult>
const autocomplete = ($: unknown) => ($ as { prompt: { autocomplete: Autocomplete } }).prompt.autocomplete

const typing = (text: string) => {
  const start = text.search(/\S+$/)
  return { text, cursor: text.length, token: text.slice(start), start }
}

test('/markdown completes folders and markdown files', async ($, on) => {
  tree(on, {
    'markdown-mermaid-docs': [
      { name: 'docs', kind: 'dir' },
      { name: 'README.md', kind: 'file', size: 2048 },
      { name: 'main.go', kind: 'file' },
      { name: '.github', kind: 'dir' },
    ],
    'markdown-mermaid-docs/docs': [
      { name: 'shop-architecture.md', kind: 'file', size: 30 },
      { name: 'shop.png', kind: 'file' },
      { name: 'shared', kind: 'other', isLink: true },
      { name: 'other.md', kind: 'file' },
    ],
    '/home/me': [{ name: 'notes.markdown', kind: 'file' }],
  })
  const texts = async (draft: string) => (await autocomplete($)(typing(draft))).suggestions.map(s => s.text)

  expect(await texts('/markdown d')).toEqual(['docs/'])
  expect(await texts('/markdown R')).toEqual(['README.md'])
  expect(await texts('/mermaid docs/sh')).toEqual(['docs/shared/', 'docs/shop-architecture.md'])
  expect(await texts('/markdown ~/n')).toEqual(['~/notes.markdown'])
  expect(await texts('/markdown .g')).toEqual(['.github/'])
  expect((await autocomplete($)(typing('/markdown R'))).suggestions[0]).toMatchObject({ label: 'README.md', description: '2 KB' })
  // Only the command's first argument, only these commands.
  expect(await texts('/mermaid docs/shop-architecture.md d')).toEqual([])
  expect(await texts('/review d')).toEqual([])
  expect(await texts('look at d')).toEqual([])
  expect(await texts('/markdown nowhere/x')).toEqual([])
})
