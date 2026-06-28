import { useEffect, useRef, useCallback } from 'react'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

// 花火 = 火の花。3Dで咲く花(立体メッシュ)と、音で弾ける3Dパーティクルの花火。
// 立体的に開く花弁(陰影+艶) + 低音で炸裂する火花 + 衝撃波リング。

type Vec3 = [number, number, number]

const rotX = (v: Vec3, a: number): Vec3 => {
  const c = Math.cos(a), s = Math.sin(a)
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]
}
const rotY = (v: Vec3, a: number): Vec3 => {
  const c = Math.cos(a), s = Math.sin(a)
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// 視空間の固定ライト(左上手前)
const LIGHT: Vec3 = normalize([-0.4, 0.7, 0.8])
const HALF: Vec3 = normalize([LIGHT[0], LIGHT[1], LIGHT[2] + 1])

const FOCAL = 4.0
const CAM_DIST = 4.7
const NS = 5 // 花弁の長手方向の分割
const NW = 4 // 花弁の幅方向の分割

// ── 花の構成(同心の花弁レイヤー) ──
interface LayerCfg { count: number; r0: number; elev: number; len: number; w: number; hueOff: number }
const LAYERS: LayerCfg[] = [
  { count: 13, r0: 0.06, elev: 0.20, len: 1.05, w: 0.32, hueOff: -8 },  // 外側・大きく開く
  { count: 11, r0: 0.05, elev: 0.52, len: 0.86, w: 0.30, hueOff: 2 },
  { count: 9,  r0: 0.04, elev: 0.88, len: 0.66, w: 0.27, hueOff: 14 },
  { count: 7,  r0: 0.03, elev: 1.20, len: 0.48, w: 0.24, hueOff: 26 },
  { count: 5,  r0: 0.02, elev: 1.55, len: 0.33, w: 0.21, hueOff: 40 },  // 中心・直立
]
const GOLDEN = 2.39996

interface Petal { az: number; elev: number; len: number; w: number; r0: number; hueOff: number; seed: number }

function makePetals(): Petal[] {
  const petals: Petal[] = []
  let gi = 0
  LAYERS.forEach((L) => {
    for (let i = 0; i < L.count; i++) {
      petals.push({
        az: (i / L.count) * Math.PI * 2 + gi * GOLDEN,
        elev: L.elev,
        len: L.len,
        w: L.w,
        r0: L.r0,
        hueOff: L.hueOff,
        seed: gi * 12.9898,
      })
      gi++
    }
  })
  return petals
}

// 花弁ローカル座標(+Zへ伸び、Yで反り、幅方向にカップ状)
function petalLocal(s: number, w: number, len: number, ww: number, r0: number): Vec3 {
  const hw = ww * Math.pow(Math.sin(Math.PI * s), 0.7) // 先細りの雫形
  const upWidth = (1 - Math.cos(w * 1.45)) * (0.16 * len) // 縁が立つカップ
  const upLen = Math.sin(s * Math.PI * 0.92) * (0.22 * len) - s * s * (0.14 * len) // 反り+先端の垂れ
  return [w * hw, upLen + upWidth, r0 + s * len]
}

// ── 花火パーティクル ──
const MAX_P = 640
interface Particle {
  x: number; y: number; z: number
  px: number; py: number; pz: number
  vx: number; vy: number; vz: number
  life: number; max: number; hue: number; size: number; active: boolean
}
function makePool(): Particle[] {
  return Array.from({ length: MAX_P }, () => ({
    x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0,
    life: 0, max: 1, hue: 0, size: 0.012, active: false,
  }))
}

interface Ring { r: number; life: number; max: number; hue: number; x: number; y: number }

export function HanabiVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tRef = useRef(0)
  const camRef = useRef({ ay: 0.4, ax: 0.62, axVel: 0 })
  const hueRef = useRef(330)
  const petalsRef = useRef<Petal[]>(makePetals())
  const poolRef = useRef<Particle[]>(makePool())
  const cursorRef = useRef(0)
  const ringsRef = useRef<Ring[]>([])
  const bloomRef = useRef(0)
  const prevLoudRef = useRef(0)
  const cdRef = useRef(0)
  const flashRef = useRef(0)

  const draw = useCallback(
    (data: AnalyzerData) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { bass, mid, high, volume } = data

      tRef.current += 0.016
      const t = tRef.current
      const cx = width / 2
      const cy = height / 2
      const S = Math.min(width, height) * 0.55

      // --- 夜空の背景 ---
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.85)
      bg.addColorStop(0, `hsl(250, 45%, ${5 + volume * 4}%)`)
      bg.addColorStop(0.6, 'hsl(250, 50%, 3%)')
      bg.addColorStop(1, 'hsl(245, 60%, 1.5%)')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, width, height)

      // --- カメラ: 花を覗き込み、ゆっくり周回 ---
      const cam = camRef.current
      cam.ay += 0.003 + mid * 0.004
      cam.axVel += (bass - 0.14) * 0.008
      cam.axVel *= 0.9
      cam.ax = clamp(0.58 + Math.sin(t * 0.18) * 0.1 + cam.axVel, 0.1, 1.1)
      const camAy = cam.ay, camAx = cam.ax

      hueRef.current = (hueRef.current + 0.1 + mid * 0.4) % 360
      const hueBase = hueRef.current

      // 開花量(滑らかに音へ追従)
      const bloomTarget = clamp(volume * 1.6 + bass * 0.8, 0, 1)
      bloomRef.current += (bloomTarget - bloomRef.current) * 0.08
      const bloom = bloomRef.current

      // 視空間へ変換 + 投影
      const toCam = (p: Vec3): Vec3 => rotX(rotY(p, camAy), camAx)
      const project = (q: Vec3) => {
        const denom = CAM_DIST - q[2]
        const persp = FOCAL / denom
        return { x: cx + q[0] * persp * S, y: cy - q[1] * persp * S, z: q[2], persp, behind: denom < 0.2 }
      }

      const flowerScale = 0.92 * (1 + bass * 0.1)
      const globalSpin = t * 0.12

      interface Quad { poly: number[]; depth: number; fill: string; spec: number }
      const quads: Quad[] = []

      // ── 花弁メッシュ ──
      for (const petal of petalsRef.current) {
        const flutter = Math.sin(t * 3 + petal.seed) * high * 0.06
        const elev = Math.max(0.04, petal.elev - bloom * 0.55 + flutter) // 咲くと開く
        const az = petal.az + globalSpin
        const hue = hueBase + petal.hueOff

        const world = (s: number, w: number): Vec3 => {
          const lp = petalLocal(s, w, petal.len, petal.w, petal.r0)
          let p = rotX(lp, elev)
          p = rotY(p, az)
          return [p[0] * flowerScale, p[1] * flowerScale + 0.05, p[2] * flowerScale]
        }

        for (let is = 0; is < NS; is++) {
          const s0 = is / NS, s1 = (is + 1) / NS
          for (let iw = 0; iw < NW; iw++) {
            const w0 = -1 + (2 * iw) / NW, w1 = -1 + (2 * (iw + 1)) / NW
            const c0 = toCam(world(s0, w0))
            const c1 = toCam(world(s1, w0))
            const c2 = toCam(world(s1, w1))
            const c3 = toCam(world(s0, w1))

            const n = normalize(cross(
              [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]],
              [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]],
            ))
            // 花弁は両面見えるので、視点側へ法線を向ける
            const nv: Vec3 = n[2] < 0 ? [-n[0], -n[1], -n[2]] : n
            const diffuse = Math.abs(dot(n, LIGHT))
            const spec = Math.pow(Math.max(0, dot(nv, HALF)), 26) * (0.55 + high * 0.5)

            const p0 = project(c0), p1 = project(c1), p2 = project(c2), p3 = project(c3)
            if (p0.behind || p1.behind || p2.behind || p3.behind) continue

            const shade = 0.28 + 0.72 * diffuse
            const sLum = clamp((36 + s1 * 26) * shade, 6, 82)
            quads.push({
              depth: (c0[2] + c1[2] + c2[2] + c3[2]) / 4,
              poly: [p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y],
              fill: `hsl(${hue}, 88%, ${sLum}%)`,
              spec,
            })
          }
        }
      }

      // 奥から手前へ
      quads.sort((a, b) => a.depth - b.depth)
      ctx.lineJoin = 'round'
      for (const q of quads) {
        const p = q.poly
        ctx.beginPath()
        ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.lineTo(p[4], p[5]); ctx.lineTo(p[6], p[7])
        ctx.closePath()
        ctx.fillStyle = q.fill
        ctx.fill()
        ctx.strokeStyle = q.fill
        ctx.lineWidth = 1
        ctx.stroke()
        if (q.spec > 0.04) {
          ctx.fillStyle = `rgba(255,250,235,${Math.min(0.85, q.spec)})`
          ctx.fill()
        }
      }

      // ── 中心の蕊(光る粒) ──
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 40; i++) {
        const a = i * GOLDEN
        const rad = 0.02 * Math.sqrt(i) * flowerScale * (1 + bass * 0.3)
        const wp: Vec3 = [Math.cos(a) * rad, 0.06 + Math.sin(t * 2 + i) * 0.01, Math.sin(a) * rad]
        const sp = project(toCam(wp))
        if (sp.behind) continue
        const r = (1.2 + (i % 3)) * sp.persp * (1 + high * 0.8)
        const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, r * 3)
        g.addColorStop(0, `hsla(${48 + high * 20}, 100%, 80%, 0.9)`)
        g.addColorStop(1, 'hsla(45, 100%, 60%, 0)')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(sp.x, sp.y, r * 3, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'

      // ── 花火の発火検出(音量の立ち上がり) ──
      const pool = poolRef.current
      const spawn = (ox: number, oy: number, oz: number, vx: number, vy: number, vz: number, hue: number, size: number, life: number) => {
        const p = pool[cursorRef.current]
        cursorRef.current = (cursorRef.current + 1) % MAX_P
        p.x = ox; p.y = oy; p.z = oz; p.px = ox; p.py = oy; p.pz = oz
        p.vx = vx; p.vy = vy; p.vz = vz
        p.hue = hue; p.size = size; p.life = life; p.max = life; p.active = true
      }

      const loud = volume * 0.5 + bass * 0.5 + high * 0.2
      const onset = loud - prevLoudRef.current
      prevLoudRef.current = prevLoudRef.current * 0.8 + loud * 0.2
      cdRef.current = Math.max(0, cdRef.current - 1)

      if (onset > 0.03 && cdRef.current === 0) {
        cdRef.current = 4
        const intensity = clamp(0.3 + onset * 10, 0.3, 1.4)
        const count = Math.floor(50 + intensity * 90)
        const burstHue = (hueBase + 120 + Math.random() * 180) % 360
        // 発火点(花の上 + 少し散らす)
        const ox = (Math.random() - 0.5) * 0.8
        const oy = 0.3 + Math.random() * 0.7
        const oz = (Math.random() - 0.5) * 0.8
        const speed = 0.045 + intensity * 0.05
        const willow = Math.random() < 0.35 // 枝垂れ型
        for (let i = 0; i < count; i++) {
          // 球面ランダム方向
          const th = Math.random() * Math.PI * 2
          const ph = Math.acos(2 * Math.random() - 1)
          const sp = speed * (0.6 + Math.random() * 0.5)
          const dx = Math.sin(ph) * Math.cos(th)
          const dy = Math.cos(ph)
          const dz = Math.sin(ph) * Math.sin(th)
          spawn(
            ox, oy, oz,
            dx * sp, dy * sp + 0.01, dz * sp,
            (burstHue + Math.random() * 40 - 20) % 360,
            0.01 + Math.random() * 0.012,
            (willow ? 95 : 55) + Math.random() * 40,
          )
        }
        // 衝撃波リング
        const center = project(toCam([ox, oy, oz]))
        if (!center.behind) {
          ringsRef.current.push({ r: 4, life: 26, max: 26, hue: burstHue, x: center.x, y: center.y })
          if (ringsRef.current.length > 6) ringsRef.current.shift()
        }
        if (onset > 0.08) flashRef.current = Math.min(1, onset * 4)
      }

      // 高音のきらめき(花弁の先から舞う火の粉)
      if (high > 0.35 && Math.random() < high) {
        const petal = petalsRef.current[Math.floor(Math.random() * petalsRef.current.length)]
        const az = petal.az + globalSpin
        const tip = rotY(rotX(petalLocal(0.9, 0, petal.len, petal.w, petal.r0), Math.max(0.04, petal.elev - bloom * 0.55)), az)
        spawn(tip[0] * flowerScale, tip[1] * flowerScale + 0.05, tip[2] * flowerScale,
          (Math.random() - 0.5) * 0.01, 0.012 + Math.random() * 0.01, (Math.random() - 0.5) * 0.01,
          (hueBase + 40) % 360, 0.008, 40 + Math.random() * 30)
      }

      // ── パーティクル更新 & 描画(加算合成) ──
      ctx.globalCompositeOperation = 'lighter'
      const gravity = 0.0011
      // 奥行き順に並べるためインデックスを集める
      const draws: { sx: number; sy: number; pxs: number; pys: number; r: number; hue: number; lum: number; alpha: number; z: number }[] = []
      for (const p of pool) {
        if (!p.active) continue
        p.px = p.x; p.py = p.y; p.pz = p.z
        p.vy -= gravity
        p.vx *= 0.986; p.vy *= 0.986; p.vz *= 0.986
        p.x += p.vx; p.y += p.vy; p.z += p.vz
        p.life -= 1
        if (p.life <= 0) { p.active = false; continue }

        const cur = project(toCam([p.x, p.y, p.z]))
        if (cur.behind) continue
        const prev = project(toCam([p.px, p.py, p.pz]))
        const fr = p.life / p.max // 1→0
        const flick = 0.78 + 0.22 * Math.sin(p.life * 0.8 + p.x * 30) // ちらつき
        draws.push({
          sx: cur.x, sy: cur.y, pxs: prev.x, pys: prev.y,
          r: Math.max(0.8, p.size * cur.persp * S),
          hue: p.hue,
          lum: 55 + 35 * fr,
          alpha: clamp(fr * 1.1, 0, 1) * flick,
          z: cur.z,
        })
      }
      draws.sort((a, b) => a.z - b.z)
      for (const d of draws) {
        // 尾を引く軌跡
        ctx.strokeStyle = `hsla(${d.hue}, 100%, ${d.lum}%, ${d.alpha * 0.5})`
        ctx.lineWidth = d.r * 0.9
        ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(d.pxs, d.pys); ctx.lineTo(d.sx, d.sy); ctx.stroke()
        // 光核
        const g = ctx.createRadialGradient(d.sx, d.sy, 0, d.sx, d.sy, d.r * 3)
        g.addColorStop(0, `hsla(${d.hue}, 100%, ${Math.min(95, d.lum + 25)}%, ${d.alpha})`)
        g.addColorStop(0.4, `hsla(${d.hue}, 100%, ${d.lum}%, ${d.alpha * 0.6})`)
        g.addColorStop(1, `hsla(${d.hue}, 100%, ${d.lum}%, 0)`)
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(d.sx, d.sy, d.r * 3, 0, Math.PI * 2); ctx.fill()
      }

      // ── 衝撃波リング ──
      for (const ring of ringsRef.current) {
        ring.r += 6 + (1 - ring.life / ring.max) * 10
        ring.life -= 1
        const a = clamp(ring.life / ring.max, 0, 1)
        if (a <= 0) continue
        ctx.strokeStyle = `hsla(${ring.hue}, 100%, 75%, ${a * 0.6})`
        ctx.lineWidth = 2 + a * 3
        ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2); ctx.stroke()
      }
      ringsRef.current = ringsRef.current.filter((r) => r.life > 0)

      // ── 全画面フラッシュ ──
      if (flashRef.current > 0.01) {
        ctx.fillStyle = `rgba(255,250,240,${flashRef.current * 0.25})`
        ctx.fillRect(0, 0, width, height)
        flashRef.current *= 0.8
      }
      ctx.globalCompositeOperation = 'source-over'
    },
    [width, height],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = 'hsl(250,55%,2%)'
    ctx.fillRect(0, 0, width, height)
    poolRef.current = makePool()
    ringsRef.current = []
    cursorRef.current = 0
    bloomRef.current = 0
    camRef.current = { ay: 0.4, ax: 0.62, axVel: 0 }
    tRef.current = 0
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block' }} />
}
