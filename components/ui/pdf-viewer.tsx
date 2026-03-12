'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PdfViewerProps {
  url: string
  expanded?: boolean
}

export default function PdfViewer({ url, expanded }: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0)
  const [pageWidth, setPageWidth] = useState(800)
  const containerRef = useRef<HTMLDivElement>(null)

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
  }, [])

  // Measure container width for responsive page sizing
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setPageWidth(entry.contentRect.width - 8)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto bg-slate-100 rounded ${expanded ? 'h-full' : ''}`}
      style={expanded ? undefined : { height: '75vh' }}
    >
      <Document
        file={url}
        onLoadSuccess={onDocumentLoadSuccess}
        loading={
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
            Loading PDF…
          </div>
        }
        error={
          <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm gap-2">
            <p>Unable to render PDF inline.</p>
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-indigo-500 underline text-xs">
              Open in new tab ↗
            </a>
          </div>
        }
      >
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={i + 1}
            pageNumber={i + 1}
            width={pageWidth}
            className="mb-2 mx-auto shadow-sm"
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        ))}
      </Document>
    </div>
  )
}
