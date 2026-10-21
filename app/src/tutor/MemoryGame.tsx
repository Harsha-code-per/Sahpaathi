import { useEffect, useRef, useState } from 'react'

const FACES = ['🍎', '🌻', '🐘', '🚌', '⭐', '🐟']

/** Fisher-Yates, so every game deals the cards differently. */
function deal(): string[] {
  const cards = [...FACES, ...FACES]
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

/** A break game on the screen: flip two cards, keep the pairs. Calls `onDone` once with the number of tries. */
export default function MemoryGame({ onDone }: { onDone: (tries: number) => void }) {
  const [cards] = useState(deal)
  const reported = useRef(false)
  const [open, setOpen] = useState<number[]>([]) // up to two face-up cards that are not matched
  const [matched, setMatched] = useState<Set<number>>(new Set())
  const [tries, setTries] = useState(0)
  const won = matched.size === cards.length

  useEffect(() => {
    if (won && !reported.current) {
      reported.current = true // tell the teacher once, however often the parent re-renders
      onDone(tries)
    }
  }, [won, tries, onDone])

  function flip(i: number) {
    if (open.length === 2 || open.includes(i) || matched.has(i)) return
    const next = [...open, i]
    setOpen(next)
    if (next.length < 2) return
    setTries((t) => t + 1)
    if (cards[next[0]] === cards[next[1]]) {
      setMatched((m) => new Set([...m, ...next]))
      setOpen([])
    } else {
      setTimeout(() => setOpen([]), 800)
    }
  }

  return (
    <section aria-label="Memory game" className="space-y-3 rounded-3xl border border-white/15 bg-white/5 p-4">
      <p className="text-center text-[#a9b8b3]">
        {won ? `You found every pair in ${tries} tries!` : 'Find the matching pairs'} · {matched.size / 2} of {FACES.length}
      </p>
      <div className="mx-auto grid max-w-xs grid-cols-4 gap-2">
        {cards.map((face, i) => {
          const up = open.includes(i) || matched.has(i)
          return (
            <button
              key={i}
              type="button"
              onClick={() => flip(i)}
              aria-label={up ? face : 'Hidden card'}
              className={`grid aspect-square place-items-center rounded-2xl text-3xl outline-none transition focus-visible:ring-2 focus-visible:ring-ring ${matched.has(i) ? 'bg-[#3fb8a0]/30' : up ? 'bg-[#f2efe6]' : 'bg-white/10 hover:bg-white/20'}`}
            >
              {up ? face : ''}
            </button>
          )
        })}
      </div>
    </section>
  )
}
