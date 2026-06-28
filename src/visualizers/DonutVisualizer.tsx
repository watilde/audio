import { useEffect, useRef, useCallback } from 'react'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

// 本物の3Dメッシュ(トーラス)を投影・深度ソートして陰影付け。
// 艶めく釉薬(てかり) / 焼けた生地(焼き目) / 揺れる照り(みずみずしさ) / 鮮烈な色(鮮やかさ)

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
const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 視空間の固定ライト(左上手前)とハーフベクトル
const L: Vec3 = normalize([-0.45, 0.65, 0.85])
const H: Vec3 = normalize([L[0], L[1], L[2] + 1]) // viewDir = (0,0,1)

const NU = 40 // メジャー方向の分割
const NV = 18 // マイナー(チューブ)方向の分割

interface DonutDef {
  pos: Vec3
  major: number
  minor: number
  hue: number
  freqIdx: number
  tilt: number
  spinSpd: number
}

const DONUTS: DonutDef[] = [
  { pos: [0, 0, 0],          major: 0.64, minor: 0.27, hue: 342, freqIdx: 0.05, tilt: 0.55, spinSpd: 0.010 }, // 苺
  { pos: [-1.05, 0.5, -0.7], major: 0.40, minor: 0.17, hue: 48,  freqIdx: 0.26, tilt: 0.95, spinSpd: -0.016 }, // 檸檬
  { pos: [1.00, -0.42, -1.0], major: 0.44, minor: 0.18, hue: 158, freqIdx: 0.52, tilt: 0.30, spinSpd: 0.014 }, // 抹茶
]

interface Sprinkle { u: number; v: number; hue: number; ang: number; len: number }
interface DonutState { spin: number; s: number; sv: number; sprinkles: Sprinkle[] }

const SPRINKLE_HUES = [0, 50, 120, 200, 280, 320]

function makeStates(): DonutState[] {
  return DONUTS.map((d, i) => {
    const rnd = mulberry32(i * 2657 + 11)
    const count = 22 + Math.floor(rnd() * 12)
    const sprinkles: Sprinkle[] = []
    for (let k = 0; k < count; k++) {
      sprinkles.push({
        u: rnd() * Math.PI * 2,
        v: Math.PI / 2 + (rnd() - 0.5) * 1.5, // チューブ上面寄り
        hue: SPRINKLE_HUES[Math.floor(rnd() * SPRINKLE_HUES.length)],
        ang: rnd() * Math.PI,
        len: d.minor * (0.4 + rnd() * 0.3),
      })
    }
    return { spin: rnd() * Math.PI * 2, s: 1, sv: 0, sprinkles }
  })
}

const FOCAL = 4.0
const CAM_DIST = 4.6

interface DrawItem {
  kind: 'quad' | 'sprinkle'
  depth: number
  poly: number[] // flattened x,y pairs
  fill: string
  spec: number // 0..1 highlight strength (quads)
  width: number // line width (sprinkles)
  stroke: string
}

export function DonutVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tRef = useRef(0)
  const camRef = useRef({ ay: 0.3, ax: 0.0, axVel: 0 })
  const statesRef = useRef<DonutState[]>(makeStates())

  const draw = useCallback(
    (data: AnalyzerData) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { frequencyData, bass, mid, high, volume } = data

      tRef.current += 0.016
      const t = tRef.current
      const cx = width / 2
      const cy = height / 2
      const S = Math.min(width, height) * 0.55

      // --- 背景: 温かい卓上 ---
      const bgHue = 28 + mid * 16
      const bg = ctx.createRadialGradient(cx, cy * 0.8, 0, cx, cy, Math.max(width, height) * 0.8)
      bg.addColorStop(0, `hsl(${bgHue}, 32%, ${8 + volume * 5}%)`)
      bg.addColorStop(0.6, `hsl(${bgHue - 10}, 38%, 4.5%)`)
      bg.addColorStop(1, 'hsl(18, 28%, 2%)')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, width, height)

      // --- カメラ: ゆるやかに周回、低音で煽る ---
      const cam = camRef.current
      cam.ay += 0.0035 + mid * 0.006
      cam.axVel += (bass - 0.12) * 0.01
      cam.axVel *= 0.9
      cam.ax = clamp(0.32 + Math.sin(t * 0.2) * 0.12 + cam.axVel, -0.2, 0.9)

      const items: DrawItem[] = []

      DONUTS.forEach((d, di) => {
        const st = statesRef.current[di]

        const fi = Math.min(Math.floor(d.freqIdx * frequencyData.length * 0.85), frequencyData.length - 1)
        const fv = frequencyData[fi] / 255

        // 弾むスカッシュ&ストレッチ
        const target = 1 + fv * 0.3 + bass * 0.14
        st.sv += (target - st.s) * 0.2
        st.sv *= 0.78
        st.s += st.sv
        const stretch = clamp(st.sv * 2.0, -0.2, 0.32)
        const sqx = st.s * (1 - stretch * 0.5)
        const sqy = st.s * (1 + stretch)

        st.spin += d.spinSpd * (1 + bass * 1.5)
        const spin = st.spin
        const phase = di * 1.7
        const bob = Math.sin(t * 0.8 + di * 2) * 0.04 * (1 + volume)
        const pos: Vec3 = [d.pos[0], d.pos[1] + bob, d.pos[2]]

        const camAy = cam.ay
        const camAx = cam.ax

        // チューブ半径(膨らみ + うねり)
        const minorBase = d.minor * (1 + volume * 0.2 + fv * 0.22)
        const undul = (u: number) => 1 + 0.1 * volume * Math.sin(u * 5 + t * 2.5 + phase)

        const surfacePoint = (u: number, v: number): Vec3 => {
          const rr = minorBase * undul(u)
          const ring = d.major + rr * Math.cos(v)
          return [ring * Math.cos(u), rr * Math.sin(v), ring * Math.sin(u)]
        }

        const transformPoint = (p: Vec3) => {
          let q: Vec3 = [p[0] * sqx, p[1] * sqy, p[2]]
          q = rotY(q, spin)
          q = rotX(q, d.tilt)
          q = [q[0] + pos[0], q[1] + pos[1], q[2] + pos[2]]
          q = rotY(q, camAy)
          q = rotX(q, camAx)
          const denom = CAM_DIST - q[2]
          const persp = FOCAL / denom
          return { x: cx + q[0] * persp * S, y: cy - q[1] * persp * S, z: q[2], behind: denom < 0.2 }
        }

        const transformNormal = (n: Vec3): Vec3 => {
          let q: Vec3 = [n[0] / sqx, n[1] / sqy, n[2]]
          q = rotY(q, spin)
          q = rotX(q, d.tilt)
          q = rotY(q, camAy)
          q = rotX(q, camAx)
          return normalize(q)
        }

        // 頂点を投影しておく
        const px = new Float32Array(NU * NV)
        const py = new Float32Array(NU * NV)
        const pz = new Float32Array(NU * NV)
        const pb = new Uint8Array(NU * NV)
        for (let iu = 0; iu < NU; iu++) {
          const u = (iu / NU) * Math.PI * 2
          for (let iv = 0; iv < NV; iv++) {
            const v = (iv / NV) * Math.PI * 2
            const sp = transformPoint(surfacePoint(u, v))
            const idx = iu * NV + iv
            px[idx] = sp.x; py[idx] = sp.y; pz[idx] = sp.z; pb[idx] = sp.behind ? 1 : 0
          }
        }

        const glazeHue = d.hue + mid * 25

        // 面(クアッド)を生成
        for (let iu = 0; iu < NU; iu++) {
          const u = (iu / NU) * Math.PI * 2
          const uc = u + Math.PI / NU
          for (let iv = 0; iv < NV; iv++) {
            const i0 = iu * NV + iv
            const i1 = ((iu + 1) % NU) * NV + iv
            const i2 = ((iu + 1) % NU) * NV + ((iv + 1) % NV)
            const i3 = iu * NV + ((iv + 1) % NV)
            if (pb[i0] || pb[i1] || pb[i2] || pb[i3]) continue

            const v = (iv / NV) * Math.PI * 2
            const vc = v + Math.PI / NV
            // 面中心の法線(視空間)
            const n = transformNormal([
              Math.cos(vc) * Math.cos(uc),
              Math.sin(vc),
              Math.cos(vc) * Math.sin(uc),
            ])
            if (n[2] <= 0.02) continue // 裏面カリング

            const diffuse = Math.max(0, dot(n, L))
            const depth = (pz[i0] + pz[i1] + pz[i2] + pz[i3]) / 4

            // 釉薬の範囲: 上面 + 垂れ(ドリップ)
            const drip = Math.max(0, Math.sin(uc * 7 + phase * 2)) ** 2
            const glazed = Math.sin(vc) > -0.12 - 0.55 * drip

            let fill: string
            let stroke: string
            let spec: number
            if (glazed) {
              const lum = 26 + diffuse * 44
              fill = `hsl(${glazeHue}, 88%, ${lum}%)`
              stroke = fill
              spec = Math.pow(Math.max(0, dot(n, H)), 48) * (0.85 + high * 0.4) // 強い艶
            } else {
              // 生地。底ほど焼き目が濃い
              const browned = clamp((-Math.sin(vc) - 0.1) * 1.2, 0, 1)
              const dh = 32 - browned * 14
              const dl = (34 + diffuse * 26) * (1 - browned * 0.5)
              fill = `hsl(${dh}, ${48 + browned * 14}%, ${dl}%)`
              stroke = fill
              spec = Math.pow(Math.max(0, dot(n, H)), 8) * 0.18
            }

            items.push({
              kind: 'quad',
              depth,
              poly: [px[i0], py[i0], px[i1], py[i1], px[i2], py[i2], px[i3], py[i3]],
              fill,
              spec,
              width: 1,
              stroke,
            })
          }
        }

        // --- スプリンクル(3Dの小片) ---
        const lift = minorBase * (0.04 + bass * 0.12)
        for (const sp of st.sprinkles) {
          const { u, v } = sp
          const nLocal: Vec3 = [Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u)]
          if (transformNormal(nLocal)[2] <= 0.05) continue // 裏は隠れる

          const rr = minorBase * undul(u)
          const ring = d.major + rr * Math.cos(v)
          const base: Vec3 = [
            ring * Math.cos(u) + nLocal[0] * lift,
            rr * Math.sin(v) + nLocal[1] * lift,
            ring * Math.sin(u) + nLocal[2] * lift,
          ]
          // 表面に沿う接線2本を合成して向きを決める
          const Tu = normalize([-ring * Math.sin(u), 0, ring * Math.cos(u)])
          const Tv = normalize([-rr * Math.sin(v) * Math.cos(u), rr * Math.cos(v), -rr * Math.sin(v) * Math.sin(u)])
          const ca = Math.cos(sp.ang), sa = Math.sin(sp.ang)
          const dir: Vec3 = normalize([
            Tu[0] * ca + Tv[0] * sa,
            Tu[1] * ca + Tv[1] * sa,
            Tu[2] * ca + Tv[2] * sa,
          ])
          const half = sp.len * 0.5
          const a = transformPoint([base[0] - dir[0] * half, base[1] - dir[1] * half, base[2] - dir[2] * half])
          const b = transformPoint([base[0] + dir[0] * half, base[1] + dir[1] * half, base[2] + dir[2] * half])
          if (a.behind || b.behind) continue

          const persp = FOCAL / (CAM_DIST - (a.z + b.z) / 2)
          items.push({
            kind: 'sprinkle',
            depth: (a.z + b.z) / 2 + 0.015, // 表面の少し上
            poly: [a.x, a.y, b.x, b.y],
            fill: `hsl(${sp.hue}, 95%, 72%)`,
            spec: 0,
            width: Math.max(1.5, minorBase * persp * S * 0.09),
            stroke: `hsl(${sp.hue}, 95%, 72%)`,
          })
        }
      })

      // 画家のアルゴリズム: 奥から手前へ
      items.sort((a, b) => a.depth - b.depth)

      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      for (const it of items) {
        const p = it.poly
        if (it.kind === 'quad') {
          ctx.beginPath()
          ctx.moveTo(p[0], p[1])
          ctx.lineTo(p[2], p[3])
          ctx.lineTo(p[4], p[5])
          ctx.lineTo(p[6], p[7])
          ctx.closePath()
          ctx.fillStyle = it.fill
          ctx.fill()
          // 継ぎ目を埋める同色ストローク
          ctx.strokeStyle = it.stroke
          ctx.lineWidth = it.width
          ctx.stroke()
          // 鏡面ハイライト(てかり)
          if (it.spec > 0.03) {
            ctx.fillStyle = `rgba(255,252,240,${Math.min(0.9, it.spec)})`
            ctx.fill()
          }
        } else {
          ctx.beginPath()
          ctx.moveTo(p[0], p[1])
          ctx.lineTo(p[2], p[3])
          ctx.strokeStyle = it.stroke
          ctx.lineWidth = it.width
          ctx.stroke()
          // スプリンクルの照り
          ctx.strokeStyle = 'rgba(255,255,255,0.5)'
          ctx.lineWidth = it.width * 0.35
          ctx.stroke()
        }
      }
    },
    [width, height],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = 'hsl(20,28%,3%)'
    ctx.fillRect(0, 0, width, height)
    statesRef.current = makeStates()
    camRef.current = { ay: 0.3, ax: 0.0, axVel: 0 }
    tRef.current = 0
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block' }} />
}
