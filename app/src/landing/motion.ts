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
    // Hero: the speaker orb tips back in 3D and swells as you leave the hero.
    gsap.to('[data-orb]', {
      transformPerspective: 900,
      rotateX: 38,
      rotateZ: 10,
      scale: 1.25,
      y: -30,
      ease: 'none',
      scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: 0.6 },
    })
    // Scene: the phone tilts up out of the page, then turns a little; the level chips float in around it.
    gsap.set('[data-phone]', { transformPerspective: 1400 })
    const scene = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: '[data-scene]', start: 'top top', end: 'bottom bottom', scrub: 0.6 } })
    scene
      .fromTo('[data-phone]', { rotateX: 58, rotateZ: -10, scale: 0.7, y: 180, opacity: 0.4 }, { rotateX: 0, rotateZ: 0, scale: 1, y: 0, opacity: 1, duration: 1 })
      .fromTo('[data-scene-copy]', { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration: 0.6 }, 0.1)
      .fromTo('[data-float]', { opacity: 0, y: 70 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.2 }, 0.5)
      .to('[data-phone]', { rotateY: -16, rotateX: 8, duration: 1 })
    // How it works: on desktop the steps pin and slide sideways, each turning flat as it arrives.
    gsap.matchMedia().add('(min-width: 1024px)', () => {
      const track = root.querySelector<HTMLElement>('[data-track]')!
      const dist = () => track.scrollWidth - (window.innerWidth - track.getBoundingClientRect().left) + 48
      const slide = gsap.to(track, {
        x: () => -dist(),
        ease: 'none',
        scrollTrigger: { trigger: '[data-hscroll]', start: 'top top', end: () => `+=${dist()}`, pin: true, scrub: 0.6, invalidateOnRefresh: true },
      })
      gsap.utils.toArray<HTMLElement>('[data-step]').forEach((el) =>
        gsap.fromTo(el, { rotateY: -35, transformPerspective: 1000, opacity: 0.4 }, { rotateY: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: el, containerAnimation: slide, start: 'left 95%', end: 'left 55%', scrub: true } }),
      )
    })
  }, root)

  return () => {
    ctx.revert()
    gsap.ticker.remove(tick)
    lenis.destroy()
  }
}
