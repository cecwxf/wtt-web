'use client'

import { useEffect, useState } from 'react'

export interface ViewportClass {
  width: number
  height: number
  isCompact: boolean
  isShort: boolean
  isNarrow: boolean
  isWide: boolean
}

function readViewport(): ViewportClass {
  if (typeof window === 'undefined') {
    return { width: 1440, height: 900, isCompact: false, isShort: false, isNarrow: false, isWide: false }
  }
  const width = window.innerWidth
  const height = window.innerHeight
  return {
    width,
    height,
    isCompact: width < 1440 || height < 850,
    isShort: height < 820,
    isNarrow: width < 1180,
    isWide: width >= 1800,
  }
}

export function useViewportClass(): ViewportClass {
  const [viewport, setViewport] = useState<ViewportClass>(() => readViewport())

  useEffect(() => {
    const update = () => setViewport(readViewport())
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return viewport
}
