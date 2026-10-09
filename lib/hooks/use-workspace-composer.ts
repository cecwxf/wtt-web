'use client'

import { useCallback, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'

export interface WorkspaceComposerStore {
  values: Map<string, Map<string, unknown>>
  version: number
  listeners: Set<() => void>
}

// Owned by the account page, not the temporarily unmounted chat. No disk persistence.
export function useWorkspaceComposerStore(ownerId?: string): WorkspaceComposerStore | undefined {
  return useMemo(() => ownerId ? { values: new Map(), version: 0, listeners: new Set() } : undefined, [ownerId])
}

export function useWorkspaceComposerState<T>(store: WorkspaceComposerStore | undefined, scope: string, field: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const initialRef = useRef(initial)
  const [local, setLocal] = useState(initial)
  const subscribe = useCallback((listener: () => void) => {
    store?.listeners.add(listener)
    return () => { store?.listeners.delete(listener) }
  }, [store])
  const snapshot = useCallback(() => store?.version || 0, [store])
  useSyncExternalStore(subscribe, snapshot, () => 0)
  const fields = store?.values.get(scope)
  const value = store ? (fields?.has(field) ? fields.get(field) as T : initialRef.current) : local
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(next => {
    if (!store) { setLocal(next); return }
    let fields = store.values.get(scope)
    if (!fields) { fields = new Map(); store.values.set(scope, fields) }
    const previous = fields.has(field) ? fields.get(field) as T : initialRef.current
    // Late send/upload completions write to their original scope, never the new chat.
    fields.set(field, typeof next === 'function' ? (next as (value: T) => T)(previous) : next)
    store.version++
    store.listeners.forEach(listener => listener())
  }, [store, scope, field])
  return [value, setValue]
}
