import { useEffect, useState } from 'react'

/** Shown while a request is pending: after a few seconds, explain that the free-tier server is waking up. */
export function Waking({ className = '' }: { className?: string }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 8000)
    return () => clearTimeout(id)
  }, [])
  if (!slow) return null
  return (
    <p role="status" className={`text-sm text-muted-foreground ${className}`}>
      Waking the server. The first request after a quiet spell can take up to a minute.
    </p>
  )
}
