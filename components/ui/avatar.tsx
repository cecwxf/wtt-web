'use client'

/**
 * Avatar component with initials fallback.
 * Shows image if avatar_url is provided, otherwise generates
 * colored circle with initials from display name.
 * For Chinese names, extracts pinyin initials.
 */

// Simple pinyin initial map for common Chinese surnames
const PINYIN_MAP: Record<string, string> = {
  '王':'W','李':'L','张':'Z','刘':'L','陈':'C','杨':'Y','黄':'H','赵':'Z',
  '周':'Z','吴':'W','徐':'X','孙':'S','马':'M','胡':'H','朱':'Z','郭':'G',
  '何':'H','林':'L','罗':'L','高':'G','梁':'L','郑':'Z','谢':'X','宋':'S',
  '唐':'T','韩':'H','冯':'F','邓':'D','曹':'C','彭':'P','曾':'Z','肖':'X',
  '田':'T','董':'D','潘':'P','袁':'Y','蔡':'C','蒋':'J','余':'Y','于':'Y',
  '杜':'D','叶':'Y','程':'C','魏':'W','苏':'S','吕':'L','丁':'D','任':'R',
  '卢':'L','沈':'S','姚':'Y','钟':'Z','姜':'J','崔':'C','谭':'T','陆':'L',
  '范':'F','汪':'W','廖':'L','石':'S','金':'J','贾':'J','夏':'X','韦':'W',
  '付':'F','方':'F','邹':'Z','熊':'X','白':'B','孟':'M','秦':'Q','邱':'Q',
  '侯':'H','江':'J','尹':'Y','薛':'X','段':'D','雷':'L','龙':'L','史':'S',
  '贺':'H','顾':'G','毛':'M','郝':'H','龚':'G','邵':'S','万':'W','覃':'Q',
  '武':'W','钱':'Q','戴':'D','严':'Y','欧':'O','莫':'M','孔':'K','向':'X',
  '常':'C','温':'W','康':'K','施':'S','文':'W','牛':'N','樊':'F','葛':'G',
  '邢':'X','安':'A','齐':'Q','伍':'W','庄':'Z','管':'G','芦':'L','聂':'N',
  '汤':'T','祝':'Z','尧':'Y','谷':'G','祁':'Q','包':'B','闻':'W','柳':'L',
}

function getInitials(name: string): string {
  if (!name) return '?'
  const trimmed = name.trim()
  if (!trimmed) return '?'

  // Check if first char is Chinese
  const firstChar = trimmed.charAt(0)
  const isChinese = /[\u4e00-\u9fff]/.test(firstChar)

  if (isChinese) {
    // Use pinyin initial for first char, plus second char if available
    const first = PINYIN_MAP[firstChar] || firstChar
    const secondChar = trimmed.charAt(1)
    if (secondChar && /[\u4e00-\u9fff]/.test(secondChar)) {
      return (first + (PINYIN_MAP[secondChar] || '')).toUpperCase().slice(0, 2)
    }
    return first.toUpperCase()
  }

  // Latin name: take first letters of first two words
  const words = trimmed.split(/[\s_-]+/).filter(Boolean)
  if (words.length >= 2) {
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
  }
  return words[0].charAt(0).toUpperCase()
}

// Deterministic color palette — hash name to pick consistent color
const COLORS = [
  'from-blue-400 to-blue-600',
  'from-purple-400 to-purple-600',
  'from-green-400 to-green-600',
  'from-orange-400 to-orange-600',
  'from-pink-400 to-pink-600',
  'from-teal-400 to-teal-600',
  'from-indigo-400 to-indigo-600',
  'from-rose-400 to-rose-600',
  'from-cyan-400 to-cyan-600',
  'from-amber-400 to-amber-600',
  'from-violet-400 to-violet-600',
  'from-emerald-400 to-emerald-600',
]

function nameToColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

interface AvatarProps {
  name: string
  avatarUrl?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZE_MAP = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
}

export function Avatar({ name, avatarUrl, size = 'md', className = '' }: AvatarProps) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        className={`${SIZE_MAP[size].split(' ').slice(0, 2).join(' ')} rounded-full object-cover ${className}`}
      />
    )
  }

  const initials = getInitials(name)
  const gradient = nameToColor(name)

  return (
    <div className={`${SIZE_MAP[size]} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center font-semibold text-white select-none ${className}`}>
      {initials}
    </div>
  )
}

export { getInitials, nameToColor }
