import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

/** Scroll motion for the landing page only (code-split with it). Returns a cleanup; does nothing under reduced motion. */
export function setupMotion(root: HTMLElement): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}
  gsap.registerPlugin(ScrollTrigger)

  // One scroll loop: Lenis, ticked by gsap.
  const lenis = new Lenis({ lerp: 0.1, anchors: true })
  lenis.on('scroll', ScrollTrigger.update)
  const tick = (t: number) => lenis.raf(t * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)

  const ctx = gsap.context(() => {
    // Headline assembles word by word.
    gsap.from('[data-hero-word]', { opacity: 0, y: 48, filter: 'blur(14px)', duration: 0.9, ease: 'expo.out', stagger: 0.06 })
    // ...and lifts away as the page scrolls.
    gsap.to('[data-hero-copy]', {
      opacity: 0,
      y: -60,
      scale: 0.96,
      scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: 0.6 },
    })
    // Statement: each word brightens as it crosses the viewport.
    gsap.fromTo(
      '[data-statement] .w',
      { opacity: 0.15 },
      { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: '[data-statement]', start: 'top 80%', end: 'bottom 55%', scrub: 0.6 } },
    )
    // The line above the four steps draws itself as they come into view.
    gsap.fromTo(
      '[data-path]',
      { scaleX: 0 },
      { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '[data-flow]', start: 'top 75%', end: 'center 60%', scrub: 0.6 } },
    )
    gsap.from('[data-step]', { opacity: 0, y: 40, duration: 0.8, ease: 'power2.out', stagger: 0.12, scrollTrigger: { trigger: '[data-flow]', start: 'top 80%' } })
  }, root)

  return () => {
    ctx.revert()
    gsap.ticker.remove(tick)
    lenis.destroy()
  }
}
