import { BookOpenIcon, CalendarDaysIcon, CircleHelpIcon, LibraryBigIcon, UsersIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from 'cn'
import { useSync } from '../sync/useSync'
import './teacher.css'
import Help from './Help'
import Library, { type OpenLesson } from './Library'
import LessonPlayer from './LessonPlayer'
import MyClass from './MyClass'
import Shelf from './Shelf'
import Timetable from './Timetable'
import { LangProvider, useT } from './i18n'

type Tab = 'lessons' | 'plan' | 'shelf' | 'class' | 'help'

/** The three things a teacher does between lessons. The bar is hidden during a lesson: nothing may pull her away. */
function Home({ onOpen, pending }: { onOpen: (lesson: OpenLesson) => void; pending: number | null }) {
  const { t } = useT()
  const [tab, setTab] = useState<Tab>('lessons')
  const tabs = [
    { id: 'lessons', label: t.tabLessons, icon: BookOpenIcon },
    { id: 'plan', label: t.tabPlan, icon: CalendarDaysIcon },
    { id: 'shelf', label: t.tabShelf, icon: LibraryBigIcon },
    { id: 'class', label: t.tabClass, icon: UsersIcon },
    { id: 'help', label: t.tabHelp, icon: CircleHelpIcon },
  ] as const

  return (
    <>
      {tab === 'lessons' && <Library onOpen={onOpen} pending={pending} />}
      {tab !== 'lessons' && (
        <main className="theme-board board-bg min-h-dvh text-foreground">
          <div className="rise mx-auto max-w-xl px-5 pt-6 pb-32">{tab === 'plan' ? <Timetable /> : tab === 'shelf' ? <Shelf /> : tab === 'class' ? <MyClass /> : <Help />}</div>
        </main>
      )}
      <nav aria-label={t.tabsLabel} className="theme-board dock fixed inset-x-3 bottom-3 z-20 mx-auto max-w-md rounded-3xl">
        <ul className="grid grid-cols-5 gap-1 p-1.5">
          {tabs.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={cn(
                  'press flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  tab === id ? 'bg-primary text-primary-foreground shadow-[0_8px_18px_-8px_rgb(244_178_62/0.8)]' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden />
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
