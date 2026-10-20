import { useEffect, useState } from 'react'

const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Counts a whole number or percentage up from 0 once; anything else ("–") shows as is. */
export function CountUp({ value }: { value: string }) {
  const m = /^(\d+)(%?)$/.exec(value)
  const animate = m !== null && !still()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!animate) return
    const to = Number(m![1])
    const t0 = performance.now()
    let raf = requestAnimationFrame(function step(t) {
      const k = Math.min(1, (t - t0) / 900)
      setN(Math.round(to * (1 - 2 ** (-10 * k))))
      if (k < 1) raf = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(raf)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps -- animate and m derive from value
  return <span className="desk-num">{animate ? `${n}${m![2]}` : value}</span>
}
