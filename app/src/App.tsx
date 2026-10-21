import { Suspense } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { lazyPage } from './lib/utils'
import Teacher from './teacher/Teacher'

// The desk tools load on demand, so the classroom app never downloads their code.
const Studio = lazyPage(() => import('./studio/Studio'))
const Admin = lazyPage(() => import('./admin/Admin'))
const Landing = lazyPage(() => import('./landing/Landing'))
const Tutor = lazyPage(() => import('./tutor/Tutor'))
const Evidence = lazyPage(() => import('./evidence/Evidence'))

// ponytail: pathname switch; add a router when a section needs nested routes.
const sections: Record<string, React.ComponentType> = {
  '/': Landing,
  '/teacher': Teacher,
  '/studio': Studio,
  '/admin': Admin,
  '/tutor': Tutor,
  '/evidence': Evidence,
}

/** While a section's code downloads (slow on 2G), show that something is happening instead of a blank page. */
function Loading() {
  return (
    <div role="status" className="grid min-h-dvh place-items-center bg-background">
      <span className="size-10 animate-spin rounded-full border-4 border-muted border-t-primary motion-reduce:animate-none" />
      <span className="sr-only">Loading</span>
    </div>
  )
}

export default function App() {
  const Section = sections[location.pathname] ?? Teacher
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Section />
      </Suspense>
    </ErrorBoundary>
  )
}
