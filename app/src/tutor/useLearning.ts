import { useCallback, useRef, useState } from 'react'
import type { Lang, Plan, Progress } from './api'
import { advance, isEnabled, load, newRecord, save, setEnabled, type LearningRecord } from './learning'

const store = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // storage blocked: the panel simply stays off
  }
}

/** The learner's own log, in this browser, only if they turn it on (see learning.ts). */
export function useLearning() {
  const [enabled, setOn] = useState(() => {
    const s = store()
    return s ? isEnabled(s) : false
  })
  const [records, setRecords] = useState<LearningRecord[]>(() => {
    const s = store()
    return s && isEnabled(s) ? load(s) : []
  })
  const current = useRef<string | null>(null) // the record of the lesson now under way

  const turn = useCallback((on: boolean) => {
    const s = store()
    if (!s) return
    setEnabled(s, on) // switching off deletes everything saved
    setOn(on)
    setRecords(on ? load(s) : [])
    current.current = null
  }, [])

  const begin = useCallback(
    (plan: Plan, language: Lang) => {
      const s = store()
      if (!enabled || !s) return
      const r = newRecord(plan, language)
      current.current = r.id
      setRecords((prev) => save(s, [r, ...prev]))
    },
    [enabled],
  )

  const update = useCallback(
    (progress: Progress) => {
      const s = store()
      const id = current.current
      if (!enabled || !s || !id) return
      setRecords((prev) =>
        save(
          s,
          prev.map((r) => (r.id === id ? advance(r, progress) : r)),
        ),
      )
    },
    [enabled],
  )

  return { enabled, records, turn, begin, update }
}
