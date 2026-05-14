declare module 'mermaid' {
  type MermaidConfig = Record<string, unknown>

  const mermaid: {
    initialize: (config: MermaidConfig) => void
    render: (id: string, text: string) => Promise<{ svg: string; bindFunctions?: (element: Element) => void }>
  }

  export default mermaid
}
