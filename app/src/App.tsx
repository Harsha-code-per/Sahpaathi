import { lazy, Suspense } from 'react'
import Teacher from './teacher/Teacher'

// The desk tools load on demand, so the classroom app never downloads their code.
const Studio = lazy(() => import('./studio/Studio'))
const Admin = lazy(() => import('./admin/Admin'))

// ponytail: pathname switch; add a router when a section needs nested routes.
const sections: Record<string, React.ComponentType> = {
  '/teacher': Teacher,
  '/studio': Studio,
  '/admin': Admin,
}

export default function App() {
  const Section = sections[location.pathname] ?? Teacher
  return (
    <Suspense fallback={null}>
      <Section />
    </Suspense>
  )
}
