export const ANDROID_APK_ABI = 'universal · arm64-v8a / x86_64'

export type AndroidApkDownload = {
  id: 'wtt-android' | 'wtt-arena' | 'wtt-studio'
  title: string
  version: string
  versionCode: number
  abi: string
  href: string
  capabilityZh: string
  capabilityEn: string
  limitationZh?: string
  limitationEn?: string
}

export const ANDROID_APK_DOWNLOADS: AndroidApkDownload[] = [
  {
    id: 'wtt-android',
    title: 'WTT Android',
    version: '1.2.3',
    versionCode: 15,
    abi: ANDROID_APK_ABI,
    href: '/downloads/wtt-android-v1.2.3-universal.apk',
    capabilityZh: '移动端用于和远端 Agent Chat，以及控制远端 Agent 进行 remote work。',
    capabilityEn: 'The mobile app is for chatting with remote agents and controlling remote agents for remote work.',
    limitationZh: '局限：Agent 绑定、云端 Agent 创建、终生学习和若水广场请在 WTT Web 端使用。',
    limitationEn: 'Limitations: use WTT Web for agent binding, cloud agent creation, Arena learning, and Ruoshui Square.',
  },
  {
    id: 'wtt-arena',
    title: 'WTT Arena',
    version: '1.0.3',
    versionCode: 4,
    abi: ANDROID_APK_ABI,
    href: '/downloads/wtt-arena-v1.0.3-universal.apk',
    capabilityZh: '教育与面试专项 App，用于题库练习、复盘、Arena Chat 和 AI 面试训练。',
    capabilityEn: 'Education and interview app for practice sets, review, Arena Chat, and AI interview training.',
  },
  {
    id: 'wtt-studio',
    title: 'WTT Studio',
    version: '1.0.3',
    versionCode: 4,
    abi: ANDROID_APK_ABI,
    href: '/downloads/wtt-studio-v1.0.3-universal.apk',
    capabilityZh: '网站、应用和 APK 生产 App，用 Cloud Agent 生成项目并通过 Preview URL 预览。',
    capabilityEn: 'Site, app, and APK production app for generating projects with Cloud Agents and previewing via Preview URL.',
  },
]

export const WTT_ANDROID_APK = ANDROID_APK_DOWNLOADS[0]

export const ANDROID_APK_VERSION = WTT_ANDROID_APK.version
export const ANDROID_APK_VERSION_CODE = WTT_ANDROID_APK.versionCode
export const ANDROID_APK_HREF = WTT_ANDROID_APK.href

export const ANDROID_APK_CAPABILITY_ZH = WTT_ANDROID_APK.capabilityZh
export const ANDROID_APK_CAPABILITY_EN = WTT_ANDROID_APK.capabilityEn

export const ANDROID_APK_LIMITATION_ZH = WTT_ANDROID_APK.limitationZh ?? ''
export const ANDROID_APK_LIMITATION_EN = WTT_ANDROID_APK.limitationEn ?? ''
