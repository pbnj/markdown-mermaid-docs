/** A document `/markdown` showed, as it read when the command ran. */
export type Doc = { path: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    'markdown-mermaid-docs': { docs: StateFamily<Doc> }
  }
}
