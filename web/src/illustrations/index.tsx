/**
 * Thin-line vector illustrations: 1.5px monoline strokes with selective green
 * fills. Motifs: ECG pulse, droplets, hex lattice, concentric rings, document
 * cards, dotted grids. All decorative (aria-hidden) unless titled.
 */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export function EcgLine({ className, width = 1200, height = 60, animate = false }: { className?: string; width?: number; height?: number; animate?: boolean }) {
  const mid = height / 2
  const beat = (x: number) => `L${x} ${mid} L${x + 14} ${mid} L${x + 20} ${mid - 8} L${x + 26} ${mid} L${x + 34} ${mid} L${x + 40} ${mid + 10} L${x + 48} ${mid - 26} L${x + 56} ${mid + 16} L${x + 62} ${mid} L${x + 78} ${mid} L${x + 88} ${mid - 7} L${x + 100} ${mid}`
  let d = `M0 ${mid}`
  for (let x = 40; x < width - 120; x += 220) d += ` ${beat(x)}`
  d += ` L${width} ${mid}`
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d={d} {...S} vectorEffect="non-scaling-stroke" className={animate ? 'ecg-draw' : undefined} pathLength={animate ? 1 : undefined} />
    </svg>
  )
}

export function EcgDivider() {
  return (
    <div className="ecg-divider" aria-hidden="true">
      <EcgLine height={40} />
    </div>
  )
}

/** Hero: a dense grey document transforming into three clean cards with
 *  coloured status dots, joined by a green pulse line. */
export function HeroDocument({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 320 150" aria-hidden="true" focusable="false">
      {/* dotted grid */}
      <g fill="var(--border-strong)">
        {Array.from({ length: 6 }, (_, r) => Array.from({ length: 5 }, (_, c) => <circle key={`${r}-${c}`} cx={14 + c * 10} cy={20 + r * 10} r="1" />))}
      </g>
      {/* dense document */}
      <g stroke="var(--text-faint)" {...{ fill: 'none', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }}>
        <path d="M34 22h52l14 14v92H34Z" fill="var(--surface)" />
        <path d="M86 22v14h14" />
        {[46, 54, 62, 70, 78, 86, 94, 102, 110, 118].map((y, i) => (
          <path key={y} d={`M42 ${y}h${[40, 48, 34, 44, 50, 30, 46, 38, 48, 26][i]}`} strokeWidth="1.2" />
        ))}
      </g>
      {/* pulse line */}
      <path d="M104 76h22l6-12 8 26 7-20 5 6h24" fill="none" stroke="var(--green-700)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="hero-pulse" pathLength={1} />
      {/* three clean cards */}
      {[
        { y: 24, c: 'var(--status-normal)', w: 44 },
        { y: 62, c: 'var(--status-borderline)', w: 36 },
        { y: 100, c: 'var(--status-abnormal)', w: 50 },
      ].map((card, i) => (
        <g key={i} className="hero-card" style={{ animationDelay: `${0.25 + i * 0.12}s` }}>
          <rect x="182" y={card.y} width="112" height="30" rx="8" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="1.5" />
          <circle cx="197" cy={card.y + 15} r="5" fill={card.c} />
          <path d={`M209 ${card.y + 11}h${card.w}`} stroke="var(--green-900)" strokeWidth="1.8" strokeLinecap="round" />
          <path d={`M209 ${card.y + 19}h${card.w - 14}`} stroke="var(--text-faint)" strokeWidth="1.3" strokeLinecap="round" />
          <rect x="268" y={card.y + 12} width="18" height="6" rx="3" fill="var(--green-050)" stroke="var(--green-200)" />
        </g>
      ))}
      {/* droplet accent */}
      <path d="M306 16c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11Z" fill="var(--green-050)" stroke="var(--green-500)" strokeWidth="1.5" />
    </svg>
  )
}

export function EmptyTrendsArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 220 120" aria-hidden="true" focusable="false">
      <g fill="var(--border-strong)">
        {Array.from({ length: 5 }, (_, r) => Array.from({ length: 11 }, (_, c) => <circle key={`${r}-${c}`} cx={20 + c * 18} cy={18 + r * 20} r="1" />))}
      </g>
      <rect x="20" y="44" width="180" height="34" rx="6" fill="var(--green-050)" />
      <circle cx="150" cy="58" r="7" fill="var(--green-500)" />
      <circle cx="150" cy="58" r="13" fill="none" stroke="var(--green-200)" strokeWidth="1.5" />
      <path d="M60 60 L100 56 L150 58" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" strokeDasharray="3 5" strokeLinecap="round" />
      <circle cx="60" cy="60" r="5" fill="var(--surface)" stroke="var(--text-faint)" strokeWidth="1.5" strokeDasharray="2 2.5" />
      <circle cx="100" cy="56" r="5" fill="var(--surface)" stroke="var(--text-faint)" strokeWidth="1.5" strokeDasharray="2 2.5" />
      <path d="M20 100h180" stroke="var(--border-strong)" strokeWidth="1.5" />
    </svg>
  )
}

export function EmptyPeopleArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 110" aria-hidden="true" focusable="false">
      {[34, 52, 70].map((r, i) => <circle key={r} cx="100" cy="56" r={r} fill="none" stroke={i === 0 ? 'var(--green-200)' : 'var(--border)'} strokeWidth="1.5" />)}
      <circle cx="100" cy="46" r="12" fill="var(--green-050)" stroke="var(--green-700)" strokeWidth="1.5" />
      <path d="M78 80c3-12 12-18 22-18s19 6 22 18" fill="var(--green-050)" stroke="var(--green-700)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="156" cy="30" r="9" fill="var(--surface)" stroke="var(--green-500)" strokeWidth="1.5" />
      <path d="M156 26v8M152 30h8" stroke="var(--green-500)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function ErrorArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 120" aria-hidden="true" focusable="false">
      <path d="M62 14h58l18 18v76H62Z" fill="var(--surface)" stroke="var(--text-faint)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M120 14v18h18" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" />
      {[44, 54, 64].map((y, i) => <path key={y} d={`M74 ${y}h${[46, 38, 42][i]}`} stroke="var(--border-strong)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4 4" />)}
      <path d="M72 88h14l5-9 6 18 5-12 4 3h18" fill="none" stroke="var(--status-borderline)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="146" cy="92" r="16" fill="var(--tint-borderline)" stroke="var(--status-borderline)" strokeWidth="1.5" />
      <path d="M146 84v9" stroke="var(--ink-borderline)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="146" cy="99" r="1.2" fill="var(--ink-borderline)" />
    </svg>
  )
}

export function PrivacyArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 120" aria-hidden="true" focusable="false">
      <g fill="none" stroke="var(--border-strong)" strokeWidth="1.2">
        {[[40, 40], [60, 28], [80, 40], [60, 52], [100, 28], [120, 40], [100, 52], [140, 28], [160, 40], [140, 52]].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y - 8}l7 4v8l-7 4-7-4v-8Z`} />
        ))}
      </g>
      <path d="M100 30c14 8 26 9 34 9v26c0 20-16 32-34 38-18-6-34-18-34-38V39c8 0 20-1 34-9Z" fill="var(--green-050)" stroke="var(--green-700)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m88 66 8 8 17-18" fill="none" stroke="var(--green-700)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DropArt({ className }: { className?: string }) {
  return <HeroDocument className={className} />
}
