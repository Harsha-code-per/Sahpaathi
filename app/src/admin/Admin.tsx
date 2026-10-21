import { LayoutDashboardIcon, LogOutIcon, PackageIcon, PhoneCallIcon, SchoolIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from 'cn'
import { AppShell, type SidebarApi } from '@/components/AppShell'
import { LoginCard } from '@/components/LoginCard'
import { Button } from '@/components/ui/button'
import { adminApi, ApiError, session, type DataView } from './api'
import Calls from './Calls'
import Classes from './Classes'
import Dashboard from './Dashboard'
import Packs from './Packs'

const TABS = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboardIcon },
  { id: 'classes', label: 'Classes', icon: SchoolIcon },
  { id: 'packs', label: 'Lesson packs', icon: PackageIcon },
  { id: 'calls', label: 'Catch-up calls', icon: PhoneCallIcon },
] as const
type Tab = (typeof TABS)[number]['id']

export default function Admin() {
  const [signedIn, setSignedIn] = useState(() => session.get() !== null)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [view, setView] = useState<DataView>('all') // real data, sample data, or both

  const logout = () => {
    session.clear()
    setSignedIn(false)
  }

  if (!signedIn)
    return (
      <LoginCard
        product="Admin"
        demo={[{ role: 'Admin', email: 'admin@sahpaathi.test' }]}
        blurb="How classrooms are using the lessons, and the packs that go to them."
        login={async (email, password) => {
          const res = await adminApi.login(email, password)
          if (res.role !== 'admin') throw new ApiError('The admin pages need an admin account.', 403)
          session.set(res.token)
          setSignedIn(true)
        }}
      />
    )

  const sidebar = ({ collapsed, close }: SidebarApi) => (
    <nav aria-label="Admin sections" className="flex flex-col gap-1">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => (setTab(t.id), close())}
          aria-current={tab === t.id ? 'page' : undefined}
          aria-label={collapsed ? t.label : undefined}
          title={collapsed ? t.label : undefined}
          className={cn(
            'flex min-h-11 items-center gap-3 rounded-xl px-3.5 font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
            tab === t.id ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground',
          )}
        >
          <t.icon className={cn('size-5 shrink-0', tab === t.id && 'text-sidebar-primary')} aria-hidden />
          {!collapsed && t.label}
        </button>
      ))}
    </nav>
  )

  const current = TABS.find((t) => t.id === tab)!
  const topbar = (
    <>
      <h1 className="font-heading text-xl font-bold">{current.label}</h1>
      <div className="flex-1" />
      <Button variant="ghost" onClick={logout}>
        <LogOutIcon aria-hidden /> <span className="max-sm:sr-only">Log out</span>
      </Button>
    </>
  )

  return (
    <AppShell product="Admin" sidebar={sidebar} topbar={topbar}>
      <div className="space-y-5">
        {tab === 'dashboard' && <Dashboard view={view} onView={setView} onSignedOut={logout} />}
        {tab === 'classes' && <Classes view={view} onView={setView} onSignedOut={logout} />}
        {tab === 'packs' && <Packs onSignedOut={logout} />}
        {tab === 'calls' && <Calls onSignedOut={logout} />}
      </div>
    </AppShell>
  )
}
