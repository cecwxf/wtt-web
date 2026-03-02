'use client'

import { useEffect } from 'react'

interface KeyboardShortcutsProps {
  onSearch?: () => void
  onCompose?: () => void
  onDiscover?: () => void
}

export function KeyboardShortcuts({ onSearch, onCompose, onDiscover }: KeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K: Focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onSearch?.()
      }

      // Cmd/Ctrl + N: New message
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        onCompose?.()
      }

      // Cmd/Ctrl + D: Discover
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault()
        onDiscover?.()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onSearch, onCompose, onDiscover])

  return null
}
