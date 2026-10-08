export type NativeNotificationPreferences = { enabled: boolean; sound: boolean; preview: boolean; granted: boolean }
export type NativeChatNotice = { userId: string; messageId: string; topicId: string; agentId: string; title: string; body: string; focused: boolean }
export type NativeNotifications = {
  version: 1
  preferences(userId: string): Promise<NativeNotificationPreferences>
  setPreferences(userId: string, value: Omit<NativeNotificationPreferences, 'granted'>): Promise<NativeNotificationPreferences>
  show(value: NativeChatNotice): Promise<{ shown: boolean }>
}

export function getNativeNotifications(): NativeNotifications | null {
  if (typeof window === 'undefined') return null
  const bridge = (window as Window & { __WTT_NATIVE_NOTIFICATIONS__?: NativeNotifications }).__WTT_NATIVE_NOTIFICATIONS__
  return bridge?.version === 1 ? bridge : null
}
