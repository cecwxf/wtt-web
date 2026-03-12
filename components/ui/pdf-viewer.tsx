'use client'

import { useState, useRef, useCallback, useEffect, memo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface PdfViewerProps {
  url: string
  expanded?: boolean
}

/** Lazy page — only renders when near the viewport */
const LazyPage = memo(function LazyPage({ pageNumber, width }: { pageNumber: number; width: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); io.disconnect() } },
      { rootMargin: '600px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} className="mb-2 mx-auto" style={{ minHeight: visible ? undefined : Math.round(width * 1.414) }}>
      {visible && (
        <Page
          pageNumber={pageNumber}
          width={width}
          className="shadow-sm"
          renderTextLayer={true}
          renderAnnotationLayer={true}
          loading={
            <div className="flex items-center justify-center bg-white rounded" style={{ height: Math.round(width * 1.414) }}>
              <span className="text-slate-300 text-xs">Page {pageNumber}</span>
            </div>
          }
        />
      )}
    </div>
  )
})

export default function PdfViewer({ url, expanded }: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0)
  const [pageWidth, setPageWidth] = useState(800)
  const containerRef = useRef<HTMLDivElement>(null)

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setPageWidth(entry.contentRect.width - 16)
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
            <svg className="animate-spin h-5 w-5 mr-2 text-indigo-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
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
          <LazyPage key={i + 1} pageNumber={i + 1} width={pageWidth} />
        ))}
      </Document>
    </div>
  )
}
