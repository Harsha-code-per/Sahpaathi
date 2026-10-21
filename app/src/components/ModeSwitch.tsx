import { cn } from 'cn'
import { MODES, type ModeId } from '@/lib/modes'

/** Two links that move between the modes, with the current one marked. `tone` follows the page behind it. */
export function ModeSwitch({ current, tone = 'light' }: { current: ModeId; tone?: 'light' | 'dark' }) {
  return (
    <nav aria-label="Mode" className={cn('inline-flex rounded-full border p-1 text-sm font-semibold', tone === 'dark' ? 'border-white/20 bg-white/5' : 'border-border bg-card')}>
      {(Object.keys(MODES) as ModeId[]).map((id) => {
        const active = id === current
        return (
          <a
            key={id}
            href={MODES[id].path}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-full px-3 py-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? (tone === 'dark' ? 'bg-[#f2efe6] text-[#0b1413]' : 'bg-foreground text-background') : tone === 'dark' ? 'text-[#a9b8b3] hover:text-[#f2efe6]' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="max-sm:hidden">{MODES[id].label}</span>
            <span className="sm:hidden">{MODES[id].short}</span>
          </a>
        )
      })}
    </nav>
  )
}
