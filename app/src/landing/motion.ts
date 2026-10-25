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

  // Hero animations run forever; pause them once the hero is off screen so the pinned scenes below get the GPU.
  const hero = root.querySelector<HTMLElement>('[data-hero]')
  const watch = new IntersectionObserver(([e]) => hero?.classList.toggle('cine-off', !e.isIntersecting))
  if (hero) watch.observe(hero)
  const ctx = gsap.context(() => {
    // Opening shot: the letterbox bars slide away, the speaker rises into the light.
    gsap.to('[data-bar]', { scaleY: 0, duration: 1.4, ease: 'expo.inOut', delay: 0.15, transformOrigin: (i: number) => (i === 0 ? 'top' : 'bottom') })
    gsap.from('[data-speaker]', { translate: '0px 80px', opacity: 0, duration: 1.6, ease: 'expo.out', delay: 0.3 })
    // Scores count up from zero as each number scrolls into view.
    gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
      const m = /^([\d,.]+)(.*)$/.exec(el.dataset.count ?? '')
      const to = m ? parseFloat(m[1].replace(/,/g, '')) : 0
      if (!m || !to) return
      const dec = m[1].includes('.') ? m[1].split('.')[1].length : 0
      const fmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: m[1].includes(',') })
      const n = { v: 0 }
      el.textContent = fmt.format(0) + m[2]
      gsap.to(n, {
        v: to,
        duration: 1.8,
        ease: 'power2.out',
        onUpdate: () => void (el.textContent = fmt.format(n.v) + m[2]),
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      })
    })
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
    // Hero: the speaker swells toward you and fades into the dark as you leave the hero.
    gsap.to('[data-orb]', { scale: 1.2, y: -50, opacity: 0.25, ease: 'none', scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: 0.6 } })
    // Scene: the phone tilts up out of the page, then turns a little; the level chips float in around it.
    gsap.set('[data-phone]', { transformPerspective: 1400 })
    const scene = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: '[data-scene]', start: 'top top', end: 'bottom bottom', scrub: 0.6 } })
    scene
      .fromTo('[data-phone]', { rotateX: 58, rotateZ: -10, scale: 0.7, y: 180, opacity: 0.4 }, { rotateX: 0, rotateZ: 0, scale: 1, y: 0, opacity: 1, duration: 1 })
      .fromTo('[data-scene-copy]', { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration: 0.6 }, 0.1)
      .fromTo('[data-float]', { opacity: 0, y: 70 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.2 }, 0.5)
      .to('[data-phone]', { rotateY: -16, rotateX: 8, duration: 1 })
    // The class score fills as you scroll through the scene: the ring and the number move together (87 % of 276.5 = 36 left uncovered).
    const score = { v: 0 }
    const dialNum = root.querySelector<HTMLElement>('[data-dialnum]')!
    gsap.set('[data-dial]', { strokeDashoffset: 276.5 })
    scene
      .to('[data-dial]', { strokeDashoffset: 36, duration: 1.2 }, 0.3)
      .to(score, { v: 87, duration: 1.2, onUpdate: () => void (dialNum.textContent = String(Math.round(score.v))) }, 0.3)
    // How it works: a line draws across the four steps as you scroll, and each step lights up as the line reaches it.
    const list = root.querySelector<HTMLElement>('[data-steps-list]')!
    const steps = gsap.utils.toArray<HTMLElement>('[data-step]')
    list.classList.add('steps-anim')
    gsap.fromTo(
      '[data-steps-fill]',
      { scaleX: 0 },
      {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: list,
          start: 'top 75%',
          end: 'bottom 70%',
          scrub: 0.6,
          onUpdate: (st) => steps.forEach((el) => el.classList.toggle('is-on', st.progress * list.offsetWidth >= el.offsetLeft - 1)),
        },
      },
    )
  }, root)

  return () => {
    watch.disconnect()
    ctx.revert()
    gsap.ticker.remove(tick)
    lenis.destroy()
  }
}
