'use client'

interface CircularProgressProps {
  /** 0-100 for determinate, undefined for indeterminate spinner */
  value?: number
  /** @deprecated Use `value` instead. -1 for indeterminate, 0-100 for determinate. */
  progress?: number
  /** Diameter in pixels (default: 24) */
  size?: number
  /** Stroke width (default: 3) */
  strokeWidth?: number
  /** Track color */
  trackColor?: string
  /** Active color */
  color?: string
  /** Label text inside the circle (overrides showText) */
  label?: string
  /** Show percentage text inside */
  showText?: boolean
  className?: string
}

export function CircularProgress({
  value,
  progress,
  size = 24,
  strokeWidth = 3,
  trackColor = 'rgba(148,163,184,0.25)',
  color = '#6366F1',
  label,
  showText = false,
  className = '',
}: CircularProgressProps) {
  // Backward compat: old `progress` prop (-1 = indeterminate, 0-100 = determinate)
  const resolved = value !== undefined ? value : (progress !== undefined && progress >= 0 ? progress : undefined)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const isDeterminate = resolved !== undefined

  const offset = isDeterminate
    ? circumference - (Math.min(100, Math.max(0, resolved)) / 100) * circumference
    : circumference * 0.75

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`${isDeterminate ? '' : 'animate-spin'} ${className}`}
      style={{ display: 'inline-block' }}
    >
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={isDeterminate ? 'transition-all duration-300' : ''}
      />
      {/* Label or percentage text */}
      {(label || (showText && isDeterminate)) && size >= 20 && (
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize={size * 0.28}
          fontWeight="600"
        >
          {label ?? `${Math.round(resolved!)}%`}
        </text>
      )}
    </svg>
  )
}
