import { useState } from 'react'
import { useSync } from '../sync/useSync'
import Library, { type OpenLesson } from './Library'
import LessonPlayer from './LessonPlayer'
import { LangProvider } from './i18n'

/** Teacher section: pick a lesson, play it. Sync runs here so it keeps going across lessons. */
export default function Teacher() {
  const { pending, sync } = useSync()
  const [lesson, setLesson] = useState<OpenLesson | null>(null)

  const exit = () => {
    Object.values(lesson?.audio ?? {}).forEach((url) => URL.revokeObjectURL(url))
    setLesson(null)
  }

  return (
    <LangProvider>
      {lesson ? (
        <LessonPlayer key={lesson.episode.id} {...lesson} pending={pending} onTapRecorded={sync} onExit={exit} />
      ) : (
        <Library onOpen={setLesson} pending={pending} />
      )}
    </LangProvider>
  )
}
