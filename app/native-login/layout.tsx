import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In to WTT', referrer: 'no-referrer', robots: { index: false, follow: false },
}

export default function NativeLoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
