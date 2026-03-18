'use client'

interface CircularProgressProps {
  /** 0–100 percent, or -1 for indeterminate spinner */
  progress: number
  /** Diameter in pixels (default 28) */
  size?: number
  /** Stroke width (default 3) */
  strokeWidth?: number
  /** Stroke color (default currentColor) */
  color?: string
  /** Track color (default transparent) */
  trackColor?: string
  /** Optional label inside the circle */
  label?: string
  className?: string
}

export function CircularProgress({
  progress,
  size = 28,
  strokeWidth = 3,
  color = 'currentColor',
  trackColor = 'rgba(148,163,184,0.2)',
  label,
  className,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const isIndeterminate = progress < 0

  const offset = isIndeterminate ? circumference * 0.75 : circumference - (circumference * Math.min(progress, 100)) / 100

  return (
    <div className={`relative inline-flex items-center justify-center ${className || ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className={isIndeterminate ? 'animate-spin' : ''} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>
      {label && (
        <span className="absolute text-[8px] font-semibold" style={{ color }}>
          {label}
        </span>
      )}
    </div>
  )
}
