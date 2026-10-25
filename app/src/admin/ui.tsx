import type { ReactNode } from 'react'
import { CountUp } from '@/components/CountUp'
import { card } from './theme'

const TINT = {
  mint: ['bg-[var(--tint-mint)]!', 'text-[var(--lagoon)]'],
  sun: ['bg-[var(--tint-sun)]!', 'text-[#8a5a00]'],
  sky: ['bg-[var(--tint-sky)]!', 'text-[var(--indigo)]'],
} as const

export function Tile(props: { label: string; value: string; note: ReactNode; lead?: boolean; tint?: keyof typeof TINT; children?: ReactNode }) {
  const { lead } = props
  const [fill, ink] = props.tint ? TINT[props.tint] : ['', '']
  return (
    <div className={`${card} flex flex-col gap-1 ${lead ? 'border-transparent bg-sidebar text-sidebar-foreground' : `${fill} border-black/5`}`}>
      <p className={`text-sm font-semibold ${lead ? 'text-sidebar-muted' : 'text-muted-foreground'}`}>{props.label}</p>
      <div className="flex items-end justify-between gap-3">
        <p className={`font-heading text-5xl leading-none font-bold ${lead ? 'text-sidebar-primary' : ink}`}>
          <CountUp value={props.value} />
        </p>
        {props.children}
      </div>
      <p className={`text-[0.8125rem] ${lead ? 'text-sidebar-muted' : 'text-muted-foreground'}`}>{props.note}</p>
    </div>
  )
}

export function Panel({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`${card} flex min-w-0 flex-col gap-3 ${className}`} aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-bold">{title}</h2>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  )
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="grid min-h-40 place-items-center content-center gap-4 text-center text-muted-foreground">
    <span aria-hidden className="relative grid size-14 place-items-center">
      <span className="desk-ping absolute inset-0 rounded-full border-2 border-[#f4b23e]" />
      <span className="desk-ping absolute inset-0 rounded-full border-2 border-[#f4b23e] [animation-delay:-1.4s]" />
      <span className="size-4 rounded-full bg-[#f4b23e]" />
    </span>
    <p className="max-w-xs">{children}</p>
  </div>
)
