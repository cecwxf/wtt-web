import Image from 'next/image'

interface WttLogoProps {
  size?: number
  className?: string
  rounded?: boolean
}

export function WttLogo({ size = 28, className = '', rounded = true }: WttLogoProps) {
  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden ${rounded ? 'rounded-[22%]' : ''} ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Image src="/icon.png" alt="WTT" width={size} height={size} className="h-full w-full" priority={false} />
    </span>
  )
}
