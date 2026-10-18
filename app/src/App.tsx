import Admin from './admin/Admin'
import Studio from './studio/Studio'
import Teacher from './teacher/Teacher'

// ponytail: pathname switch; add a router when a section needs nested routes.
const sections: Record<string, () => React.JSX.Element> = {
  '/teacher': Teacher,
  '/studio': Studio,
  '/admin': Admin,
}

export default function App() {
  const Section = sections[location.pathname] ?? Teacher
  return <Section />
}
