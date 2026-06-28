import { useEffect, useRef, useCallback } from 'react'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

// てかり(gloss) / 焼き目(sear) / みずみずしさ(juice) / 鮮やかさ(vivid)
// 照り輝く果実が拍に合わせて弾み、焦げ目が走り、雫が滴る。

interface OrbDef {
  hue: number
  freqIdx: number
  angle: number
  dist: number
  size: number
  grill: number // 焼き目の強さ 0..1
}

const ORBS: OrbDef[] = [
  { hue: 350, freqIdx: 0.03, angle: 0.0, dist: 0.0,  size: 0.20, grill: 1.0 }, // center: 苺
  { hue: 26,  freqIdx: 0.10, angle: 0.2, dist: 0.36, size: 0.125, grill: 0.7 }, // 橙
  { hue: 47,  freqIdx: 0.19, angle: 1.4, dist: 0.42, size: 0.105, grill: 0.0 }, // 杏
  { hue: 96,  freqIdx: 0.30, angle: 2.6, dist: 0.34, size: 0.100, grill: 0.45 }, // 青林檎
  { hue: 287, freqIdx: 0.46, angle: 3.7, dist: 0.44, size: 0.115, grill: 0.0 }, // 葡萄
  { hue: 208, freqIdx: 0.62, angle: 4.8, dist: 0.35, size: 0.095, grill: 0.0 }, // 鰭…青果
  { hue: 336, freqIdx: 0.80, angle: 5.7, dist: 0.42, size: 0.110, grill: 0.85 }, // 桜桃
]

interface Droplet { x: number; y: number; r: number }
interface OrbState { s: number; sv: number; droplets: Droplet[]; seed: number }

// 軽量な決定論的乱数。雫の配置を毎フレーム安定させる。
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeState(): OrbState[] {
  return ORBS.map((_, i) => {
    const rnd = mulberry32(i * 1973 + 7)
    const count = 6 + Math.floor(rnd() * 5)
    const droplets: Droplet[] = []
    for (let d = 0; d < count; d++) {
      // 上半分に偏らせると結露っぽくなる
      const a = rnd() * Math.PI * 2
      const rad = 0.18 + rnd() * 0.6
      droplets.push({
        x: Math.cos(a) * rad,
        y: Math.sin(a) * rad - 0.08,
        r: 0.04 + rnd() * 0.07,
      })
    }
    return { s: 1, sv: 0, droplets, seed: rnd() * 1000 }
  })
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function GlazeVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tRef = useRef(0)
  const stateRef = useRef<OrbState[]>(makeState())

  const drawOrb = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      R: number,
      sx: number,
      sy: number,
      orb: OrbDef,
      st: OrbState,
      fv: number,
      bass: number,
      high: number,
      t: number,
    ) => {
      const hue = orb.hue

      // --- 接地影 ---
      ctx.save()
      const sh = ctx.createRadialGradient(cx, cy + R * 0.98, 0, cx, cy + R * 0.98, R * 0.95)
      sh.addColorStop(0, 'rgba(0,0,0,0.45)')
      sh.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = sh
      ctx.beginPath()
      ctx.ellipse(cx, cy + R * 0.98, R * 0.82, R * 0.24, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // --- ぷるんと波打つ輪郭(ゼリー的変形) ---
      const N = 56
      const body = new Path2D()
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2
        const wob =
          1 +
          (0.025 + fv * 0.045) * Math.sin(a * 3 - t * 3 + st.seed) +
          0.018 * Math.sin(a * 5 + t * 2.2 + st.seed * 0.5)
        const r = R * wob
        const x = cx + Math.cos(a) * r * sx
        const y = cy + Math.sin(a) * r * sy
        if (i === 0) body.moveTo(x, y)
        else body.lineTo(x, y)
      }
      body.closePath()

      // 光源は左上から
      const hx = cx - R * 0.3 * sx
      const hy = cy - R * 0.34 * sy

      ctx.save()
      ctx.clip(body)

      // --- 本体: 鮮やかな球面シェーディング ---
      const g = ctx.createRadialGradient(hx, hy, R * 0.05, hx, hy, R * 2.0)
      g.addColorStop(0.0, `hsl(${hue + 8}, 92%, 84%)`)
      g.addColorStop(0.22, `hsl(${hue}, 96%, 62%)`)
      g.addColorStop(0.5, `hsl(${hue}, 95%, 46%)`)
      g.addColorStop(0.78, `hsl(${hue - 12}, 88%, 28%)`)
      g.addColorStop(1.0, `hsl(${hue - 18}, 82%, 14%)`)
      ctx.fillStyle = g
      ctx.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4)

      // 反射光(底側のバウンス)で立体感
      ctx.globalCompositeOperation = 'screen'
      const rim = ctx.createRadialGradient(
        cx + R * 0.45 * sx, cy + R * 0.52 * sy, 0,
        cx + R * 0.45 * sx, cy + R * 0.52 * sy, R * 0.8,
      )
      rim.addColorStop(0, `hsla(${hue + 35}, 95%, 60%, 0.35)`)
      rim.addColorStop(1, `hsla(${hue + 35}, 95%, 60%, 0)`)
      ctx.fillStyle = rim
      ctx.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4)
      ctx.globalCompositeOperation = 'source-over'

      // --- 焼き目: 拍で焦げ目が走る ---
      if (orb.grill > 0) {
        const burn = orb.grill * (0.18 + bass * 1.0)
        if (burn > 0.04) {
          ctx.save()
          ctx.translate(cx, cy)
          ctx.rotate(-0.5)
          const span = R * 2.4
          const gap = R * 0.62
          for (let pass = 0; pass < 2; pass++) {
            // 2方向のグリル網
            for (let x = -span; x <= span; x += gap) {
              ctx.beginPath()
              ctx.moveTo(x, -span)
              ctx.lineTo(x, span)
              ctx.lineWidth = R * 0.15
              ctx.strokeStyle = `rgba(38,16,6,${clamp(burn * 0.85, 0, 0.92)})`
              ctx.stroke()
              // 縁の熾火
              if (bass > 0.35) {
                ctx.lineWidth = R * 0.05
                ctx.strokeStyle = `rgba(255,120,30,${clamp((bass - 0.3) * burn * 0.9, 0, 0.7)})`
                ctx.stroke()
              }
            }
            ctx.rotate(Math.PI / 2)
          }
          ctx.restore()
        }
      }

      // --- みずみずしさ: 上面のしっとりした照りと雫 ---
      ctx.globalCompositeOperation = 'screen'
      const sheen = ctx.createRadialGradient(
        cx - R * 0.25 * sx, cy - R * 0.5 * sy, 0,
        cx - R * 0.25 * sx, cy - R * 0.5 * sy, R * 1.1,
      )
      sheen.addColorStop(0, `rgba(255,255,255,${0.12 + high * 0.18})`)
      sheen.addColorStop(0.5, `rgba(255,255,255,${0.04 + high * 0.06})`)
      sheen.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = sheen
      ctx.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4)
      ctx.globalCompositeOperation = 'source-over'

      // 雫(結露) — 高域で艶やかさが増す
      const dropAlpha = 0.4 + high * 0.45
      for (const d of st.droplets) {
        const wx = cx + d.x * R * sx
        const wy = cy + d.y * R * sy
        const dr = d.r * R * (0.7 + high * 0.7)
        // 雫本体: 屈折した果肉の色
        const dg = ctx.createRadialGradient(wx - dr * 0.3, wy - dr * 0.3, 0, wx, wy, dr)
        dg.addColorStop(0, `hsla(${hue + 6}, 95%, 88%, ${dropAlpha})`)
        dg.addColorStop(0.55, `hsla(${hue}, 90%, 55%, ${dropAlpha * 0.55})`)
        dg.addColorStop(1, `hsla(${hue - 20}, 80%, 22%, ${dropAlpha * 0.7})`)
        ctx.fillStyle = dg
        ctx.beginPath()
        ctx.arc(wx, wy, dr, 0, Math.PI * 2)
        ctx.fill()
        // 雫の底に落ちる影で盛り上がりを出す
        ctx.fillStyle = `rgba(0,0,0,${dropAlpha * 0.25})`
        ctx.beginPath()
        ctx.arc(wx + dr * 0.18, wy + dr * 0.32, dr * 0.7, 0, Math.PI * 2)
        ctx.fill()
        // 雫の小さなてかり
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = `rgba(255,255,255,${0.6 + high * 0.3})`
        ctx.beginPath()
        ctx.arc(wx - dr * 0.32, wy - dr * 0.36, dr * 0.3, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
      }

      // --- てかり: 強いハイライト ---
      ctx.globalCompositeOperation = 'screen'
      const glowR = R * 0.55
      const soft = ctx.createRadialGradient(hx, hy, 0, hx, hy, glowR)
      soft.addColorStop(0, `rgba(255,255,255,${0.55 + high * 0.4})`)
      soft.addColorStop(0.4, `rgba(255,255,255,${0.18 + high * 0.15})`)
      soft.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = soft
      ctx.beginPath()
      ctx.arc(hx, hy, glowR, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'

      // 鋭い白点(光沢のコア)
      ctx.save()
      ctx.translate(cx - R * 0.32 * sx, cy - R * 0.36 * sy)
      ctx.rotate(-0.6)
      ctx.fillStyle = `rgba(255,255,255,${0.85 + high * 0.15})`
      ctx.beginPath()
      ctx.ellipse(0, 0, R * 0.14, R * 0.08, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      ctx.restore() // clip

      // --- 鮮やかな縁取り(リムライト) ---
      ctx.globalCompositeOperation = 'screen'
      ctx.strokeStyle = `hsla(${hue + 20}, 100%, 70%, ${0.18 + fv * 0.3})`
      ctx.lineWidth = 1.4
      ctx.stroke(body)
      ctx.globalCompositeOperation = 'source-over'
    },
    [],
  )

  const draw = useCallback(
    (data: AnalyzerData) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { frequencyData, bass, mid, high, volume } = data

      tRef.current += 0.016
      const t = tRef.current
      const minDim = Math.min(width, height)
      const W2 = width / 2
      const H2 = height / 2

      // --- 背景: 温かみのある照りのある面 ---
      const bgHue = 22 + mid * 18
      const bg = ctx.createRadialGradient(W2, H2 * 0.85, 0, W2, H2, Math.max(width, height) * 0.75)
      bg.addColorStop(0, `hsl(${bgHue}, 35%, ${9 + volume * 5}%)`)
      bg.addColorStop(0.6, `hsl(${bgHue - 8}, 40%, 5%)`)
      bg.addColorStop(1, 'hsl(20, 30%, 2%)')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, width, height)

      // 奥行きのため小→大の順で描画(中心の大玉が手前)
      const order = ORBS.map((_, i) => i).sort((a, b) => ORBS[a].size - ORBS[b].size)

      for (const i of order) {
        const orb = ORBS[i]
        const st = stateRef.current[i]

        const fi = Math.min(
          Math.floor(orb.freqIdx * frequencyData.length * 0.85),
          frequencyData.length - 1,
        )
        const fv = frequencyData[fi] / 255

        // ばね運動で弾む拡縮
        const target = 1 + fv * 0.42 + bass * 0.12
        st.sv += (target - st.s) * 0.2
        st.sv *= 0.78
        st.s += st.sv

        // スカッシュ&ストレッチ(伸び縮みの勢いから)
        const stretch = clamp(st.sv * 2.0, -0.22, 0.34)
        const sx = st.s * (1 - stretch * 0.6)
        const sy = st.s * (1 + stretch)

        const R = orb.size * minDim

        // ゆるやかな公転と上下の揺れ
        const ang = orb.angle + Math.sin(t * 0.2 + i) * 0.16
        const dist = orb.dist * (1 + Math.sin(t * 0.5 + i) * 0.04)
        const bob = Math.sin(t * 1.6 + i * 1.3) * R * 0.06 * (1 + volume)
        const cx = W2 + Math.cos(ang) * dist * minDim
        const cy = H2 + Math.sin(ang) * dist * minDim + bob

        drawOrb(ctx, cx, cy, R, sx, sy, orb, st, fv, bass, high, t)
      }
    },
    [width, height, drawOrb],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = 'hsl(20,30%,3%)'
    ctx.fillRect(0, 0, width, height)
    stateRef.current = makeState()
    tRef.current = 0
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block' }} />
}
