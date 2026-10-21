import { BookOpenIcon, CircleHelpIcon, UsersIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from 'cn'
import { useSync } from '../sync/useSync'
import Help from './Help'
import Library, { type OpenLesson } from './Library'
import LessonPlayer from './LessonPlayer'
import MyClass from './MyClass'
import { LangProvider, useT } from './i18n'

type Tab = 'lessons' | 'class' | 'help'

/** The three things a teacher does between lessons. The bar is hidden during a lesson: nothing may pull her away. */
function Home({ onOpen, pending }: { onOpen: (lesson: OpenLesson) => void; pending: number | null }) {
  const { t } = useT()
  const [tab, setTab] = useState<Tab>('lessons')
  const tabs = [
    { id: 'lessons', label: t.tabLessons, icon: BookOpenIcon },
    { id: 'class', label: t.tabClass, icon: UsersIcon },
    { id: 'help', label: t.tabHelp, icon: CircleHelpIcon },
  ] as const

  return (
    <>
      {tab === 'lessons' && <Library onOpen={onOpen} pending={pending} />}
      {tab !== 'lessons' && (
        <main className="theme-board min-h-dvh bg-background text-foreground">
          <div className="mx-auto max-w-xl px-5 pt-6 pb-28">{tab === 'class' ? <MyClass /> : <Help />}</div>
        </main>
      )}
      <nav aria-label={t.tabsLabel} className="theme-board fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
        <ul className="mx-auto grid max-w-xl grid-cols-3">
          {tabs.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={cn(
                  'flex min-h-16 w-full flex-col items-center justify-center gap-1 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  tab === id ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-6" aria-hidden />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}

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
      {lesson ? <LessonPlayer key={lesson.episode.id} {...lesson} pending={pending} onTapRecorded={sync} onExit={exit} /> : <Home onOpen={setLesson} pending={pending} />}
    </LangProvider>
  )
}
