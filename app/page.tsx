'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function Home() {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    // 首页仅用于根据登录态做分流，不渲染业务内容。
    if (status === 'authenticated') {
      // 已登录用户跳转到信息流首页。
      router.push('/feed')
    } else if (status === 'unauthenticated') {
      // 未登录用户跳转到登录页。
      router.push('/login')
    }
    // status === 'loading' 时保持当前页面，展示下方 loading 动画。
  }, [status, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      {/* 会话状态判定期间的全屏加载指示器 */}
      <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-500" />
    </div>
  )
}
