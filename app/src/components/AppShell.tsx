import { MenuIcon, PanelLeftIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from 'cn'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { LogoMark, Wordmark } from './Logo'

const KEY = 'sahpaathi.sidebar'

function storedCollapsed() {
  try {
    return localStorage.getItem(KEY) === 'collapsed'
  } catch {
    return false // private mode or blocked storage: start open
  }
}

export interface SidebarApi {
  collapsed: boolean
  /** Opens a collapsed sidebar, e.g. when a rail icon is pressed. */
  expand: () => void
  /** Closes the phone menu after a choice; does nothing on wide screens. */
  close: () => void
}

/**
 * Dark sidebar + paper work area for the desk tools (Studio, Admin). The logo is also the collapse
 * button: it turns into a sidebar icon on hover and focus. Below 768 px the sidebar moves into a menu sheet.
 */
export function AppShell(props: { product: string; sidebar: (api: SidebarApi) => ReactNode; topbar?: ReactNode; children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(storedCollapsed)
  const [menu, setMenu] = useState(false)
  const setCollapsed = (c: boolean) => {
    setCollapsedState(c)
    try {
      localStorage.setItem(KEY, c ? 'collapsed' : 'open')
    } catch {
      // not remembered; fine
    }
  }
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar'

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col gap-4 overflow-x-hidden overflow-y-auto bg-sidebar [scrollbar-color:var(--sidebar-accent)_transparent] [scrollbar-width:thin] p-4 text-sidebar-foreground transition-[width] duration-200 ease-out md:flex',
          collapsed ? 'w-19' : 'w-76',
        )}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={label}
            aria-expanded={!collapsed}
            title={label}
            className="group grid size-11 shrink-0 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <LogoMark className="size-6 group-hover:hidden group-focus-visible:hidden" />
            <PanelLeftIcon className="hidden size-5 group-hover:block group-focus-visible:block" aria-hidden />
          </button>
          {!collapsed && <Wordmark product={props.product} />}
        </div>
        {props.sidebar({ collapsed, expand: () => setCollapsed(false), close: () => {} })}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex min-h-16 flex-wrap items-center gap-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur md:px-8">
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-label="Open menu"
            className="grid size-11 place-items-center rounded-xl outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            <MenuIcon className="size-5" aria-hidden />
          </button>
          {props.topbar}
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 lg:px-10">{props.children}</main>
      </div>

      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="w-76 gap-4 overflow-y-auto border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
          <SheetTitle className="flex items-center gap-3 text-sidebar-foreground">
            <span className="grid size-11 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
              <LogoMark className="size-6" />
            </span>
            <Wordmark product={props.product} />
          </SheetTitle>
          {props.sidebar({ collapsed: false, expand: () => {}, close: () => setMenu(false) })}
        </SheetContent>
      </Sheet>
    </div>
  )
}
