import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export type Pulse = { secs: number; color: string }
type Word = { lang: string; text: string }

const R = 0.92 // speaker radius; height H. Units are arbitrary, the camera frames them.
const H = 2.45
const MARIGOLD = '#f4b23e'

/** A canvas drawn once and used as a texture. */
function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!, size)
  return new THREE.CanvasTexture(c)
}

const radial = (stops: [number, string][]) =>
  canvasTexture(256, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    for (const [at, col] of stops) grad.addColorStop(at, col)
    g.fillStyle = grad
    g.fillRect(0, 0, s, s)
  })

/** The outline of the speaker, bottom to top: rounded foot, straight fabric wall, rounded metal top. */
function profile(): THREE.Vector2[] {
  const pts: THREE.Vector2[] = []
  const arc = (cx: number, cy: number, r: number, from: number, to: number) => {
    for (let i = 0; i <= 10; i++) {
      const a = from + ((to - from) * i) / 10
      pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)))
    }
  }
  pts.push(new THREE.Vector2(0.001, 0))
  arc(R - 0.12, 0.12, 0.12, -Math.PI / 2, 0)
  pts.push(new THREE.Vector2(R, H - 0.17), new THREE.Vector2(R, H - 0.1)) // H - 0.17 is the cloth/metal seam
  arc(R - 0.1, H - 0.1, 0.1, 0, Math.PI / 2)
  pts.push(new THREE.Vector2(0.001, H))
  return pts
}

const lathe = (pts: THREE.Vector2[], from: number, to: number) =>
  new THREE.LatheGeometry(
    pts.filter((p) => p.y >= from && p.y <= to),
    128,
  )

/**
 * The hero: a real-time WebGL speaker in a dark studio. Fabric body, metal top with a marigold light ring,
 * sound rings spreading across the floor at the pace the class needs, and the number words orbiting it
 * (HTML, so they stay crisp and readable; they pass behind the speaker by swapping layers with the canvas).
 */
export default function Speaker3D({ pulse, words }: { pulse: Pulse; words: Word[] }) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const chips = useRef<(HTMLSpanElement | null)[]>([])
  const pulseRef = useRef(pulse)
  useEffect(() => {
    pulseRef.current = pulse
  }, [pulse])

  useEffect(() => {
    const box = host.current!
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let renderer: THREE.WebGLRenderer | null = null
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas.current!, antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      renderer = null // no WebGL: the words still orbit the backlight
    }
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50)
    const look = new THREE.Vector3(0, 1.1, 0)
    const disposables: { dispose(): void }[] = []
    const keep = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d)

    // Studio light: a dim room for reflections, a warm key, and two rims that draw the silhouette.
    if (renderer) {
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.05
      const pmrem = keep(new THREE.PMREMGenerator(renderer))
      scene.environment = keep(pmrem.fromScene(new RoomEnvironment(), 0.04).texture)
      scene.environmentIntensity = 0.3
    }
    const key = new THREE.DirectionalLight('#ffe1b3', 1.5)
    key.position.set(-4.5, 5, 2.5)
    const rimCool = new THREE.DirectionalLight('#5fe0c4', 5)
    rimCool.position.set(4, 2.5, -3)
    const rimWarm = new THREE.DirectionalLight(MARIGOLD, 4)
    rimWarm.position.set(-4.5, 1.5, -2)
    scene.add(key, rimCool, rimWarm)

    const speaker = new THREE.Group()
    scene.add(speaker)
    const pts = profile()

    // Speaker cloth: a perforated knit, used as colour and bump so the light rakes across it.
    const knit = keep(
      canvasTexture(128, (g, s) => {
        g.fillStyle = '#9aa6a3'
        g.fillRect(0, 0, s, s)
        const step = s / 8
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            const cx = (x + (y % 2) * 0.5) * step
            const grad = g.createLinearGradient(0, y * step, 0, (y + 1) * step)
            grad.addColorStop(0, '#5d6a67')
            grad.addColorStop(0.5, '#e4ebe9')
            grad.addColorStop(1, '#5d6a67')
            g.fillStyle = grad
            g.beginPath()
            g.ellipse(cx + step / 2, y * step + step / 2, step * 0.46, step * 0.36, 0, 0, Math.PI * 2)
            g.fill()
          }
      }),
    )
    knit.wrapS = knit.wrapT = THREE.RepeatWrapping
    knit.repeat.set(52, 22)
    knit.colorSpace = THREE.SRGBColorSpace
    if (renderer) knit.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const fabric = keep(
      new THREE.MeshPhysicalMaterial({ color: '#3c534e', map: knit, bumpMap: knit, bumpScale: 1.6, roughness: 0.9, sheen: 1, sheenColor: '#8fd0bf', sheenRoughness: 0.35 }),
    )
    const metal = keep(new THREE.MeshPhysicalMaterial({ color: '#3b4a47', metalness: 0.85, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 2.5 }))
    const rubber = keep(new THREE.MeshStandardMaterial({ color: '#070c0b', roughness: 0.95 }))
    const glow = keep(new THREE.MeshStandardMaterial({ color: '#000', emissive: MARIGOLD, emissiveIntensity: 2.4 }))

    const part = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.Mesh(keep(geo), mat)
      speaker.add(m)
      return m
    }
    part(lathe(pts, 0, 0.12), rubber)
    part(lathe(pts, 0.12, H - 0.17), fabric)
    part(lathe(pts, H - 0.17, H), metal)
    // A thin seam between cloth and metal, and the top: a recessed matte disc inside a light ring.
    const seam = part(new THREE.TorusGeometry(R * 0.998, 0.008, 8, 128), rubber)
    seam.rotation.x = Math.PI / 2
    seam.position.y = H - 0.17
    const inner = part(new THREE.CylinderGeometry(0.58, 0.58, 0.012, 96), keep(new THREE.MeshStandardMaterial({ color: '#0c1413', roughness: 0.6 })))
    inner.position.y = H + 0.002
    const ring = part(new THREE.TorusGeometry(0.64, 0.022, 16, 160), glow)
    ring.rotation.x = Math.PI / 2
    ring.position.y = H + 0.01
    const led = part(new THREE.CapsuleGeometry(0.016, 0.14, 4, 12), glow)
    led.rotation.z = Math.PI / 2
    led.position.set(0, 0.34, R + 0.004)
    // Soft halo over the light ring.
    const halo = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(1.9, 1.9)),
      keep(
        new THREE.MeshBasicMaterial({
          map: keep(
            radial([
              [0, 'rgba(244,178,62,0)'],
              [0.55, 'rgba(244,178,62,0)'],
              [0.68, 'rgba(244,178,62,0.55)'],
              [0.82, 'rgba(244,178,62,0)'],
            ]),
          ),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    )
    halo.rotation.x = -Math.PI / 2
    halo.position.y = H + 0.03
    speaker.add(halo)

    // The floor: a contact shadow, a warm pool of light, and the sound rings.
    const flat = (size: number, mat: THREE.Material, y: number) => {
      const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(size, size)), mat)
      m.rotation.x = -Math.PI / 2
      m.position.y = y
      scene.add(m)
      return m
    }
    flat(
      3.4,
      keep(
        new THREE.MeshBasicMaterial({
          map: keep(
            radial([
              [0, 'rgba(0,0,0,0.85)'],
              [0.45, 'rgba(0,0,0,0.5)'],
              [1, 'rgba(0,0,0,0)'],
            ]),
          ),
          transparent: true,
          depthWrite: false,
        }),
      ),
      0.002,
    )
    const poolMat = keep(
      new THREE.MeshBasicMaterial({
        map: keep(
          radial([
            [0, 'rgba(255,255,255,0.5)'],
            [1, 'rgba(255,255,255,0)'],
          ]),
        ),
        color: MARIGOLD,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    flat(6, poolMat, 0.001)
    const ringGeo = keep(new THREE.RingGeometry(0.97, 1, 160))
    const waves = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(
        ringGeo,
        keep(new THREE.MeshBasicMaterial({ color: pulseRef.current.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
      )
      m.rotation.x = -Math.PI / 2
      m.position.y = 0.004
      scene.add(m)
      return m
    })
    const waveColor = new THREE.Color(pulseRef.current.color)
    const target = new THREE.Color()

    // Pointer parallax: the camera drifts a little around the speaker.
    const aim = { yaw: 0, pitch: 0 }
    const cam = { yaw: 0, pitch: 0 }
    const onPointer = (e: PointerEvent) => {
      aim.yaw = (e.clientX / innerWidth - 0.5) * 0.5
      aim.pitch = (e.clientY / innerHeight - 0.5) * 0.18
    }
    if (!still) addEventListener('pointermove', onPointer, { passive: true })

    let w = 1
    let h = 1
    let half: number[] = [] // half of each chip's width, to keep it inside the frame
    const resize = () => {
      w = box.clientWidth
      h = box.clientHeight
      half = chips.current.map((c) => (c?.offsetWidth ?? 0) / 2 + 6)
      renderer?.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(() => {
      resize()
      if (still) frame(performance.now()) // reduced motion draws one still frame, so redraw it at the new size
    })
    ro.observe(box)
    resize()
    let gone = false
    void document.fonts.ready.then(() => {
      if (gone) return
      resize()
      if (still) frame(performance.now())
    })

    const v = new THREE.Vector3()
    let orbit = 0.6
    let phase = 0.3
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const { secs, color } = pulseRef.current

      cam.yaw += (aim.yaw - cam.yaw) * 0.04
      cam.pitch += (aim.pitch - cam.pitch) * 0.04
      const dist = w < 520 ? 9.8 : 8.4 // phones: step back so the orbit fits
      const el = 0.3 + cam.pitch
      camera.position.set(Math.sin(cam.yaw) * Math.cos(el) * dist, look.y + Math.sin(el) * dist, Math.cos(cam.yaw) * Math.cos(el) * dist)
      camera.lookAt(look)
      camera.updateMatrixWorld() // project() below needs this frame's camera, not last frame's
      speaker.rotation.y = Math.sin(now / 4000) * 0.3

      // One wave leaves every secs/3; the ring and the floor brighten as each one leaves, as if it spoke.
      phase = (phase + dt / secs) % 1
      target.set(color)
      waveColor.lerp(target, 0.06)
      waves.forEach((m, i) => {
        const p = (phase + i / 3) % 1
        m.scale.setScalar(1.15 + p * 1.55)
        const mat = m.material as THREE.MeshBasicMaterial
        mat.opacity = Math.pow(1 - p, 1.6) * 0.95
        mat.color.copy(waveColor)
      })
      const kick = Math.exp(-((phase * 3) % 1) * 6)
      glow.emissiveIntensity = 1.8 + kick * 2.2
      poolMat.opacity = 0.22 + kick * 0.18

      // Words: orbit, project to the screen, and sit in front of or behind the canvas by depth.
      orbit += dt * 0.16
      words.forEach((_, i) => {
        const chip = chips.current[i]
        if (!chip) return
        const a = orbit + (i * Math.PI * 2) / words.length
        v.set(Math.cos(a) * 1.75, 1.15 + Math.sin(a) * 0.14, Math.sin(a) * 1.75)
        const depth = (v.z / 1.75 + 1) / 2 // 0 at the back, 1 at the front
        v.project(camera)
        const x = Math.min(Math.max(((v.x + 1) / 2) * w, half[i]), w - half[i])
        const y = ((1 - v.y) / 2) * h
        chip.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${0.82 + depth * 0.22})`
        chip.style.opacity = String(0.4 + depth * 0.6)
        chip.style.zIndex = depth > 0.5 ? '3' : '1'
      })
      renderer?.render(scene, camera)
    }

    let raf = 0
    const loop = (now: number) => {
      frame(now)
      raf = requestAnimationFrame(loop)
    }
    const io = new IntersectionObserver(([e]) => {
      cancelAnimationFrame(raf)
      if (e.isIntersecting && !still) {
        last = performance.now()
        raf = requestAnimationFrame(loop)
      }
    })
    if (!still) io.observe(box)

    return () => {
      gone = true
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      removeEventListener('pointermove', onPointer)
      disposables.forEach((d) => d.dispose())
      renderer?.dispose()
    }
  }, [words])

  return (
    <div ref={host} className="spk3d absolute inset-0">
      <canvas ref={canvas} className="spk3d-canvas absolute inset-0 z-[2] size-full" />
      {words.map((wd, i) => (
        <span
          key={wd.lang}
          ref={(el) => {
            chips.current[i] = el
          }}
          lang={wd.lang}
          className="spk-word absolute top-0 left-0"
        >
          {wd.text}
        </span>
      ))}
    </div>
  )
}
