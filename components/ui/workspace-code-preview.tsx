'use client'

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface WorkspaceCodePreviewProps {
  content: string
  fontSize: number
  language: string
  wrapLines: boolean
}

export function WorkspaceCodePreview({ content, fontSize, language, wrapLines }: WorkspaceCodePreviewProps) {
  return (
    <SyntaxHighlighter
      language={language}
      style={oneDark}
      showLineNumbers
      wrapLongLines={wrapLines}
      customStyle={{ margin: 0, minHeight: '100%', borderRadius: 0, background: '#171c22', fontSize: `${fontSize}px`, lineHeight: 1.7 }}
      lineNumberStyle={{ minWidth: '2.8em', paddingRight: '1em', color: '#667382', userSelect: 'none' }}
      codeTagProps={{ style: { fontFamily: 'var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace' } }}
    >{content}</SyntaxHighlighter>
  )
}
