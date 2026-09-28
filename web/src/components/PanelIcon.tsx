import { Bean, Droplet, Flame, FlaskRound, Gauge, HeartPulse, Hexagon, Sun, TestTube } from 'lucide-react'
import type { PanelId } from '../lib/types'

const ICONS = {
  cbc: Droplet,
  liver: FlaskRound,
  kidney: Bean,
  thyroid: Gauge,
  lipids: HeartPulse,
  diabetes: Hexagon,
  vitamins: Sun,
  inflammation: Flame,
  urine: TestTube,
} satisfies Record<PanelId, typeof Droplet>

export function PanelIcon({ panel, size = 22 }: { panel: PanelId; size?: number }) {
  const Icon = ICONS[panel]
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />
}
