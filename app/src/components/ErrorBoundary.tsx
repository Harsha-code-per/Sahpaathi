import { Component, type ReactNode } from 'react'

/** Last line of defence: a crash in any section shows a way back instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Sahpaathi crashed:', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
        <div role="alert" className="max-w-md space-y-4 text-center">
          <h1 className="font-heading text-2xl font-bold">Something went wrong on this page.</h1>
          <p className="text-muted-foreground">Reloading usually fixes it. Lessons saved on this phone are safe.</p>
          <button
            type="button"
            autoFocus
            onClick={() => location.reload()}
            className="inline-flex h-12 items-center rounded-2xl bg-primary px-6 font-bold text-primary-foreground outline-none hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring"
          >
            Reload
          </button>
        </div>
      </main>
    )
  }
}
