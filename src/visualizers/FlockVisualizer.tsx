import { useEffect, useRef, useCallback } from 'react'
import { Application, ParticleContainer, Particle, Texture, Rectangle } from 'pixi.js'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

// ── Flocking config (normalised world space, roughly [-1, 1]^3) ──────────────
const N = 720
const SPECIES = 6
const NEIGHBOR_R = 0.22
const SEP_R = 0.075
const BASE_SPEED = 0.0028
const MAX_FORCE = 0.00012        // steering acceleration cap
const W_SEP = 1.6                 // Reynolds rule weights
const W_ALI = 1.0
const W_COH = 0.9
const W_BOUND = 1.4
const W_FLEE = 2.2                // startle (flee-from-threat) steering weight
const ONSET_THRESH = 0.06        // loudness jump that frightens the flock

interface Boid {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  species: number
  phase: number
}

// HSL → 0xRRGGBB
function hslHex(h: number, s: number, l: number): number {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(1, s))
  l = Math.max(0, Math.min(1, l))
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x } else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c } else { r = c; b = x }
  return (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255)
}

// All shapes are drawn white→grey so the per-particle tint colours them, and
// lit from the upper-left so they read as 3D. ParticleContainer needs every
// particle to share one texture source, so we pack the shapes into a single
// sprite sheet and hand out one frame per shape.
const SHAPES = 6   // 0:sphere 1:cube 2:triangle 3:square 4:pentagon 5:hexagon

function drawSphere(ctx: CanvasRenderingContext2D, c: number, R: number) {
  ctx.save()
  ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.clip()
  const hx = c - R * 0.34, hy = c - R * 0.34
  const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, R * 1.85)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,1)')
  g.addColorStop(0.5, 'rgba(190,190,190,1)')
  g.addColorStop(0.8, 'rgba(90,90,90,1)')
  g.addColorStop(1, 'rgba(28,28,28,1)')
  ctx.fillStyle = g; ctx.fillRect(c - R * 2, c - R * 2, R * 4, R * 4)
  ctx.restore()
}

function drawCube(ctx: CanvasRenderingContext2D, c: number, R: number) {
  const s = R * 0.82
  // isometric projection of a unit cube
  const px = (x: number, z: number) => c + (x - z) * 0.866 * s
  const py = (x: number, y: number, z: number) => c + ((x + z) * 0.5 - y) * s
  const face = (pts: [number, number, number][], shade: number) => {
    ctx.beginPath()
    pts.forEach(([x, y, z], i) => {
      const X = px(x, z), Y = py(x, y, z)
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y)
    })
    ctx.closePath()
    const g = Math.round(shade * 255)
    ctx.fillStyle = `rgb(${g},${g},${g})`
    ctx.fill()
  }
  // top (brightest), left, right
  face([[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]], 0.95)
  face([[-1, 1, 1], [1, 1, 1], [1, -1, 1], [-1, -1, 1]], 0.42)
  face([[1, 1, -1], [1, 1, 1], [1, -1, 1], [1, -1, -1]], 0.62)
}

function drawGem(ctx: CanvasRenderingContext2D, c: number, R: number, sides: number) {
  const rot = -Math.PI / 2
  for (let i = 0; i < sides; i++) {
    const a0 = rot + (i / sides) * Math.PI * 2
    const a1 = rot + ((i + 1) / sides) * Math.PI * 2
    const am = (a0 + a1) / 2
    // facet normal vs. light from upper-left
    const lit = Math.cos(am) * -0.7 + Math.sin(am) * -0.7
    const b = Math.max(0.25, Math.min(1, 0.45 + 0.55 * (0.5 + 0.5 * lit)))
    const g = Math.round(b * 255)
    ctx.beginPath()
    ctx.moveTo(c, c)
    ctx.lineTo(c + Math.cos(a0) * R, c + Math.sin(a0) * R)
    ctx.lineTo(c + Math.cos(a1) * R, c + Math.sin(a1) * R)
    ctx.closePath()
    ctx.fillStyle = `rgb(${g},${g},${g})`
    ctx.fill()
  }
  // crisp centre highlight
  const hl = ctx.createRadialGradient(c, c, 0, c, c, R * 0.5)
  hl.addColorStop(0, 'rgba(255,255,255,0.9)')
  hl.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = hl
  ctx.beginPath(); ctx.arc(c, c, R * 0.5, 0, Math.PI * 2); ctx.fill()
}

function makeShapeFrames(): Texture[] {
  const cell = 128
  const c = cell / 2
  const R = cell * 0.42
  const cv = document.createElement('canvas')
  cv.width = cell * SHAPES
  cv.height = cell
  const ctx = cv.getContext('2d')!
  for (let i = 0; i < SHAPES; i++) {
    ctx.save()
    ctx.translate(i * cell, 0)
    if (i === 0) drawSphere(ctx, c, R)
    else if (i === 1) drawCube(ctx, c, R)
    else drawGem(ctx, c, R, i + 1)   // 2→triangle, 3→square, 4→pentagon, 5→hexagon
    ctx.restore()
  }
  const sheet = Texture.from(cv)
  return Array.from({ length: SHAPES }, (_, i) =>
    new Texture({ source: sheet.source, frame: new Rectangle(i * cell, 0, cell, cell) }),
  )
}

// Rotated-Z depth per particle, used to sort draw order each frame
const depthOf = new WeakMap<object, number>()

// Reynolds-style steering: write (setMag(desired,maxSpeed) − vel), limited to maxForce
const _steer: [number, number, number] = [0, 0, 0]
function steerTo(
  dx: number, dy: number, dz: number,
  vx: number, vy: number, vz: number,
  maxSpeed: number, maxForce: number,
): [number, number, number] {
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (len < 1e-9) { _steer[0] = _steer[1] = _steer[2] = 0; return _steer }
  const k = maxSpeed / len
  let sx = dx * k - vx, sy = dy * k - vy, sz = dz * k - vz
  const sl = Math.sqrt(sx * sx + sy * sy + sz * sz)
  if (sl > maxForce) { const m = maxForce / sl; sx *= m; sy *= m; sz *= m }
  _steer[0] = sx; _steer[1] = sy; _steer[2] = sz
  return _steer
}

export function FlockVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const pcRef = useRef<ParticleContainer | null>(null)
  const partsRef = useRef<Particle[]>([])
  const boidsRef = useRef<Boid[]>([])
  const sizeRef = useRef({ w: width, h: height })
  const camRef = useRef({ ay: 0, ax: 0 })
  const hueRef = useRef(200)
  const tRef = useRef(0)
  const prevLoudRef = useRef(0)                                  // smoothed loudness baseline
  const startleRef = useRef({ s: 0, tx: 1.6, ty: 0, tz: 0 })     // fright strength + threat point

  // Seed boids once (normalised space — independent of pixel size)
  if (boidsRef.current.length === 0) {
    boidsRef.current = Array.from({ length: N }, (_, i) => {
      const r = 0.3 + Math.random() * 0.5
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      return {
        x: r * Math.sin(ph) * Math.cos(th),
        y: r * Math.sin(ph) * Math.sin(th),
        z: r * Math.cos(ph),
        vx: (Math.random() - 0.5) * 0.01,
        vy: (Math.random() - 0.5) * 0.01,
        vz: (Math.random() - 0.5) * 0.01,
        species: i % SPECIES,
        phase: Math.random() * Math.PI * 2,
      }
    })
  }

  // ── Pixi bootstrap (runs once) ─────────────────────────────────────────────
  useEffect(() => {
    let disposed = false
    const app = new Application()
    app.init({
      width: sizeRef.current.w,
      height: sizeRef.current.h,
      background: 0x05060d,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
    }).then(() => {
      if (disposed) { app.destroy(true, { children: true, texture: true }); return }
      appRef.current = app
      hostRef.current?.appendChild(app.canvas)

      const frames = makeShapeFrames()
      const pc = new ParticleContainer({
        dynamicProperties: { position: true, scale: true, color: true, rotation: false },
      })
      pcRef.current = pc
      app.stage.addChild(pc)

      const parts = boidsRef.current.map((b) => {
        const p = new Particle({ texture: frames[b.species % SHAPES], anchorX: 0.5, anchorY: 0.5, alpha: 0.9 })
        pc.addParticle(p)
        return p
      })
      partsRef.current = parts
    })

    return () => {
      disposed = true
      partsRef.current = []
      pcRef.current = null
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true })
        appRef.current = null
      }
    }
  }, [])

  // Keep renderer sized to the window
  useEffect(() => {
    sizeRef.current = { w: width, h: height }
    appRef.current?.renderer.resize(width, height)
  }, [width, height])

  // ── Per-frame simulation (driven by the audio rAF) ─────────────────────────
  const draw = useCallback((data: AnalyzerData) => {
    const pc = pcRef.current
    const app = appRef.current
    if (!pc || !app) return
    const parts = partsRef.current
    const boids = boidsRef.current
    const { w, h } = sizeRef.current
    const cx = w / 2, cy = h / 2
    const S = Math.min(w, h) * 0.46

    tRef.current += 1
    const { bass, mid, high, volume } = data

    // Camera slowly orbits; bass nudges the tumble
    const cam = camRef.current
    cam.ay += 0.0013 + mid * 0.0025
    cam.ax = Math.sin(tRef.current * 0.0007) * 0.4 + bass * 0.18
    const cay = Math.cos(cam.ay), say = Math.sin(cam.ay)
    const cax = Math.cos(cam.ax), sax = Math.sin(cam.ax)

    hueRef.current = (hueRef.current + 0.06 + mid * 0.35) % 360
    const baseHue = hueRef.current

    // Subtle reactive background
    app.renderer.background.color = hslHex(baseHue + 180, 0.5, 0.025 + volume * 0.03)

    // Spatial hash for neighbour queries
    const cell = NEIGHBOR_R
    const grid = new Map<number, number[]>()
    const key = (gx: number, gy: number, gz: number) =>
      ((gx + 64) * 256 + (gy + 64)) * 256 + (gz + 64)
    for (let i = 0; i < N; i++) {
      const b = boids[i]
      const gx = Math.floor(b.x / cell), gy = Math.floor(b.y / cell), gz = Math.floor(b.z / cell)
      const k = key(gx, gy, gz)
      const arr = grid.get(k)
      if (arr) arr.push(i); else grid.set(k, [i])
    }

    // ── Startle reflex: a sudden rise in loudness frightens the flock ───────
    // Detect a transient (onset) as loudness rising above its smoothed baseline.
    const startle = startleRef.current
    const loud = volume * 0.5 + bass * 0.5
    const onset = loud - prevLoudRef.current
    prevLoudRef.current = prevLoudRef.current * 0.6 + loud * 0.4
    if (onset > ONSET_THRESH && startle.s < 0.35) {
      // a fresh threat appears in a new random direction → the flock bolts away
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      startle.tx = Math.sin(ph) * Math.cos(th) * 1.6
      startle.ty = Math.sin(ph) * Math.sin(th) * 1.6
      startle.tz = Math.cos(ph) * 1.6
      startle.s = Math.min(1, onset * 7)
    }
    startle.s *= 0.93   // adrenaline fades; the flock settles back into a glide
    const fright = startle.s

    // startled birds briefly fly faster and turn harder (sharper steering)
    const maxSpeed = BASE_SPEED * (0.7 + volume * 1.0 + bass * 0.7 + fright * 2.4)
    const sep2 = SEP_R * SEP_R
    const nb2 = NEIGHBOR_R * NEIGHBOR_R

    const maxForce = MAX_FORCE * (1 + bass * 1.5 + fright * 7)

    for (let i = 0; i < N; i++) {
      const b = boids[i]
      // Reynolds accumulators
      let sepx = 0, sepy = 0, sepz = 0          // separation desired (away)
      let alix = 0, aliy = 0, aliz = 0          // alignment: Σ neighbour velocity
      let cohx = 0, cohy = 0, cohz = 0          // cohesion: Σ neighbour position
      let count = 0

      const bgx = Math.floor(b.x / cell), bgy = Math.floor(b.y / cell), bgz = Math.floor(b.z / cell)
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++)
          for (let oz = -1; oz <= 1; oz++) {
            const arr = grid.get(key(bgx + ox, bgy + oy, bgz + oz))
            if (!arr) continue
            for (let n = 0; n < arr.length; n++) {
              const j = arr[n]
              if (j === i) continue
              const o = boids[j]
              const dx = o.x - b.x, dy = o.y - b.y, dz = o.z - b.z
              const d2 = dx * dx + dy * dy + dz * dz
              if (d2 > nb2 || d2 < 1e-9) continue
              if (d2 < sep2) {
                // steer away, weighted by 1/distance (closer ⇒ stronger)
                const inv = 1 / d2
                sepx -= dx * inv; sepy -= dy * inv; sepz -= dz * inv
              }
              alix += o.vx; aliy += o.vy; aliz += o.vz
              cohx += o.x; cohy += o.y; cohz += o.z
              count++
            }
          }

      // acceleration from the three rules, each a limited steering force
      let accx = 0, accy = 0, accz = 0
      if (count > 0) {
        let s = steerTo(sepx, sepy, sepz, b.vx, b.vy, b.vz, maxSpeed, maxForce)
        accx += s[0] * W_SEP; accy += s[1] * W_SEP; accz += s[2] * W_SEP

        s = steerTo(alix / count, aliy / count, aliz / count, b.vx, b.vy, b.vz, maxSpeed, maxForce)
        accx += s[0] * W_ALI; accy += s[1] * W_ALI; accz += s[2] * W_ALI

        s = steerTo(cohx / count - b.x, cohy / count - b.y, cohz / count - b.z, b.vx, b.vy, b.vz, maxSpeed, maxForce)
        accx += s[0] * W_COH; accy += s[1] * W_COH; accz += s[2] * W_COH
      }

      // Spherical containment as a steering force back toward the centre
      const r = Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z) + 1e-6
      if (r > 0.9) {
        const s = steerTo(-b.x, -b.y, -b.z, b.vx, b.vy, b.vz, maxSpeed, maxForce)
        const wb = W_BOUND * (r - 0.9) * 10
        accx += s[0] * wb; accy += s[1] * wb; accz += s[2] * wb
      }

      // Startle: flee from the threat point (Reynolds "flee" steering),
      // scaled by how frightened the flock currently is.
      if (fright > 0.01) {
        const s = steerTo(b.x - startle.tx, b.y - startle.ty, b.z - startle.tz,
          b.vx, b.vy, b.vz, maxSpeed, maxForce)
        const wf = W_FLEE * fright
        accx += s[0] * wf; accy += s[1] * wf; accz += s[2] * wf
      }

      // Ambient: a faint tangential swirl keeps the calm flock alive
      const swirl = 0.0001 + mid * 0.0002
      accx += -b.z * swirl
      accz += b.x * swirl

      // integrate (Reynolds: velocity += acceleration, clamp to maxSpeed)
      b.vx += accx; b.vy += accy; b.vz += accz
      const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz)
      if (sp > maxSpeed) { const k = maxSpeed / sp; b.vx *= k; b.vy *= k; b.vz *= k }

      b.x += b.vx; b.y += b.vy; b.z += b.vz

      // ── Project to screen ────────────────────────────────────────────────
      // rotate around Y then X
      const rx = b.x * cay - b.z * say
      let rz = b.x * say + b.z * cay
      const ry = b.y * cax - rz * sax
      rz = b.y * sax + rz * cax

      const fov = 2.6
      const persp = fov / (fov + rz)
      const p = parts[i]
      p.x = cx + rx * persp * S
      p.y = cy + ry * persp * S
      depthOf.set(p, rz)   // for painter's-order sorting below

      const depth = (persp - fov / (fov + 1)) / (fov / (fov - 1) - fov / (fov + 1))
      const energy = b.species % 2 === 0 ? bass + mid : mid + high
      const pulse = 1 + energy * 0.35
      const sc = persp * (0.05 + energy * 0.05) * pulse * (Math.min(w, h) / 900 + 0.45)
      p.scaleX = sc
      p.scaleY = sc

      const hue = baseHue + b.species * (300 / SPECIES) + rz * 30
      p.tint = hslHex(hue, 0.78, 0.55 + energy * 0.2)
      p.alpha = 0.5 + depth * 0.5   // far spheres fade into the dark
    }

    // Painter's algorithm: draw far (large rz) first so near spheres occlude them
    pc.particleChildren.sort((a, b) => (depthOf.get(b) ?? 0) - (depthOf.get(a) ?? 0))
    pc.update()
  }, [])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <div ref={hostRef} style={{ width, height, overflow: 'hidden' }} />
}
