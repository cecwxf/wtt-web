'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, Loader2, RefreshCw } from 'lucide-react'
import { getNativeNotifications, type NativeNotificationPreferences, type NativeNotifications } from '@/lib/native-notifications'
import { useI18n } from '@/lib/i18n-provider'

export function MobileNotificationSettings({ userId }: { userId?: string }) {
  const { locale } = useI18n()
  const en = locale === 'en'
  const owner = useRef(userId)
  owner.current = userId
  const [bridge, setBridge] = useState<NativeNotifications | null>(null)
  const [preferences, setPreferences] = useState<NativeNotificationPreferences | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const refresh = () => setBridge(getNativeNotifications())
    refresh()
    window.addEventListener('wtt-native-notifications-ready', refresh)
    return () => window.removeEventListener('wtt-native-notifications-ready', refresh)
  }, [])
  useEffect(() => {
    let active = true
    setPreferences(null); setError(false); setBusy(false)
    if (bridge && userId) void bridge.preferences(userId).then(value => {
      if (active && owner.current === userId) setPreferences(value)
    }).catch(() => { if (active && owner.current === userId) setError(true) })
    return () => { active = false }
  }, [bridge, userId, revision])
  if (!bridge || !userId) return null
  async function save(change: Partial<NativeNotificationPreferences>) {
    if (!bridge || !preferences || !userId || busy) return
    const user = userId
    setBusy(true); setError(false)
    try {
      const value = await bridge.setPreferences(user, { enabled: preferences.enabled, sound: preferences.sound, preview: preferences.preview, ...change })
      if (owner.current === user) setPreferences(value)
    } catch { if (owner.current === user) setError(true) }
    finally { if (owner.current === user) setBusy(false) }
  }
  return <section className="border-y border-zinc-200 py-4 dark:border-zinc-800" aria-label={en ? 'Notifications' : '通知'}>
    <h2 className="flex items-center gap-2 text-sm font-semibold"><Bell size={18} />{en ? 'Notifications' : '通知'}</h2>
    {!preferences && !error && <Loader2 className="mt-3 animate-spin" size={18} />}
    {error && <p role="alert" className="mt-3 flex items-center justify-between gap-2 text-sm text-red-600 dark:text-red-400">
      {en ? 'Notification settings unavailable.' : '通知设置暂不可用。'}
      <button onClick={() => setRevision(value => value + 1)} title={en ? 'Retry' : '重试'} aria-label={en ? 'Retry' : '重试'} className="p-2"><RefreshCw size={16} /></button>
    </p>}
    {preferences && <fieldset disabled={busy} className="mt-3 space-y-3 text-sm disabled:opacity-50">
      <label className="flex items-center justify-between gap-3"><span>{en ? 'Message notifications' : '消息提醒'}</span><input type="checkbox" checked={preferences.enabled} onChange={event => void save({ enabled: event.target.checked })} /></label>
      <label className="flex items-center justify-between gap-3"><span>{en ? 'Sound' : '声音'}</span><input type="checkbox" disabled={!preferences.enabled} checked={preferences.sound} onChange={event => void save({ sound: event.target.checked })} /></label>
      <label className="flex items-center justify-between gap-3"><span>{en ? 'Show reply preview' : '显示回复摘要'}</span><input type="checkbox" disabled={!preferences.enabled} checked={preferences.preview} onChange={event => void save({ preview: event.target.checked })} /></label>
    </fieldset>}
    {preferences?.enabled && !preferences.granted && <p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-400">{en ? 'Allow WTT notifications in system settings.' : '请在系统设置中允许 WTT 通知。'}</p>}
    {preferences?.enabled && preferences.granted && preferences.pushStatus === 'not_configured' && <p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-400">{en ? 'Background notifications are not configured.' : '后台通知尚未配置。'}</p>}
    {preferences?.enabled && preferences.granted && preferences.pushStatus === 'unavailable' && <p role="status" className="mt-3 flex items-center justify-between gap-2 text-sm text-amber-700 dark:text-amber-400">
      {en ? 'Background notification registration failed.' : '后台通知注册失败。'}
      <button onClick={() => void save({})} title={en ? 'Retry' : '重试'} aria-label={en ? 'Retry background notifications' : '重试后台通知'} className="p-2"><RefreshCw size={16} /></button>
    </p>}
  </section>
}
