/** Mark A: a speaker with two sound waves, in currentColor, cropped like favicon.svg. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="14 11 42 42" aria-hidden="true" className={className}>
      <circle cx="25" cy="32" r="10" fill="currentColor" />
      <path d="M38 22a14 14 0 0 1 0 20M45 15a24 24 0 0 1 0 34" fill="none" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" />
    </svg>
  )
}

/** "Sahpaathi Studio": the product name in marigold. */
export function Wordmark({ product }: { product: string }) {
  return (
    <p className="font-heading text-lg font-bold whitespace-nowrap">
      Sahpaathi <span className="text-sidebar-primary">{product}</span>
    </p>
  )
}
