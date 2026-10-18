import { useCallback, useEffect, useRef, useState } from 'react'
import type { Tap } from '../lib/types'
import { ChoralMic } from './mic'

export type ChoralState = 'off' | 'starting' | 'on' | 'denied'

/**
 * Opt-in choral hint for the lesson player. The teacher enables it with a tap (so the browser's mic prompt
 * is never a surprise); after that the player brackets each response pause with startAnswer/stopAnswer and
 * asks for the suggestion at the checkpoint. Everything is a no-op until enabled.
 */
export function useChoralHint() {
  const mic = useRef<ChoralMic | null>(null)
  const [state, setState] = useState<ChoralState>('off')
  const alive = useRef(true)

  const enable = useCallback(async () => {
    setState('starting')
    const m = new ChoralMic()
    if (!(await m.open())) return setState('denied')
    await m.calibrate()
    if (!alive.current) return m.close() // the teacher left the lesson while we were calibrating
    mic.current = m
    setState('on')
  }, [])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      mic.current?.close()
      mic.current = null
    }
  }, [])

  const startAnswer = useCallback(() => mic.current?.startAnswer(), [])
  const stopAnswer = useCallback(() => mic.current?.stopAnswer(), [])
  const resetAnswer = useCallback(() => mic.current?.resetAnswer(), [])
  const takeHint = useCallback((): Tap | null => mic.current?.takeHint()?.tap ?? null, [])

  return { state, enable, startAnswer, stopAnswer, resetAnswer, takeHint }
}
