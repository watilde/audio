import { useEffect, useRef, useCallback } from 'react'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

// Perspective corridor with vanishing-point illusion (だまし絵)
// Archway frames scroll continuously from far→near, looping seamlessly.

const FOCAL   = 1.6   // perspective focal length
const COR_HW  = 0.72  // corridor half-width (world units)
const COR_HH  = 0.55  // corridor half-height
const FRAME_DZ = 0.55 // world-space gap between archway frames
const N_FRAMES = 22   // total frame slots

export function HallVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const zOffRef   = useRef(0)
  const hueRef    = useRef(270)

  const draw = useCallback((data: AnalyzerData) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { frequencyData, bass, mid, high, volume } = data

    // Advance camera depth
    zOffRef.current += 0.002 + volume * 0.008 + bass * 0.01
    hueRef.current   = (hueRef.current + 0.08 + mid * 0.2) % 360

    const zOff = zOffRef.current
    const hue  = hueRef.current
    const cx   = width  / 2
    const cy   = height / 2
    const hw   = width  / 2
    const hh   = height / 2

    // Vanishing point (slightly above center – classic architectural perspective)
    const vx = cx
    const vy = cy - hh * 0.06

    // Background
    ctx.fillStyle = `hsla(${hue + 15},22%,3%,0.32)`
    ctx.fillRect(0, 0, width, height)

    // --- Build frame list ---
    interface Frame {
      z: number
      l: number; r: number; t: number; b: number
      fv: number
    }
    const frames: Frame[] = []

    for (let i = 0; i < N_FRAMES; i++) {
      const z = (i * FRAME_DZ) + (zOff % FRAME_DZ) + 0.18

      const px = (COR_HW * FOCAL / z) * hw
      const py = (COR_HH * FOCAL / z) * hh

      // Cull: too close (overflows) or too far (invisible)
      if (px > hw * 3 || px < 3) continue

      const l = vx - px, r = vx + px
      const t = vy - py, b = vy + py

      const tNorm = Math.min(z / (N_FRAMES * FRAME_DZ), 1)
      const fi = Math.min(Math.floor(tNorm * frequencyData.length * 0.72), frequencyData.length - 1)
      const fv = frequencyData[fi] / 255

      frames.push({ z, l, r, t, b, fv })
    }

    // Sort far → near for painter's algorithm
    frames.sort((a, b) => b.z - a.z)

    // --- Draw wall / floor / ceiling panels between adjacent frames ---
    for (let i = 0; i < frames.length - 1; i++) {
      const fa = frames[i]     // far frame
      const fn = frames[i + 1] // near frame

      const scaleNear = COR_HH * FOCAL / fn.z
      const fv = (fa.fv + fn.fv) * 0.5

      const brightness = Math.min(scaleNear * 90, 1)
      const audioBoost = fv * 28

      // Floor
      ctx.beginPath()
      ctx.moveTo(fn.l, fn.b); ctx.lineTo(fn.r, fn.b)
      ctx.lineTo(fa.r, fa.b); ctx.lineTo(fa.l, fa.b)
      ctx.closePath()
      ctx.fillStyle = `hsla(${hue + 5},42%,${7 + brightness * 22 + audioBoost}%,0.9)`
      ctx.fill()

      // Ceiling
      ctx.beginPath()
      ctx.moveTo(fn.l, fn.t); ctx.lineTo(fn.r, fn.t)
      ctx.lineTo(fa.r, fa.t); ctx.lineTo(fa.l, fa.t)
      ctx.closePath()
      ctx.fillStyle = `hsla(${hue + 25},32%,${5 + brightness * 18 + audioBoost}%,0.9)`
      ctx.fill()

      // Left wall
      ctx.beginPath()
      ctx.moveTo(fn.l, fn.t); ctx.lineTo(fn.l, fn.b)
      ctx.lineTo(fa.l, fa.b); ctx.lineTo(fa.l, fa.t)
      ctx.closePath()
      ctx.fillStyle = `hsla(${hue - 8},52%,${8 + brightness * 26 + audioBoost}%,0.9)`
      ctx.fill()

      // Right wall (mirror of left)
      ctx.beginPath()
      ctx.moveTo(fn.r, fn.t); ctx.lineTo(fn.r, fn.b)
      ctx.lineTo(fa.r, fa.b); ctx.lineTo(fa.r, fa.t)
      ctx.closePath()
      ctx.fillStyle = `hsla(${hue - 8},52%,${8 + brightness * 26 + audioBoost}%,0.9)`
      ctx.fill()

      // Floor grid (horizontal tile lines on floor panel)
      const TILES = 3
      ctx.strokeStyle = `hsla(${hue},28%,${12 + brightness * 22}%,0.45)`
      ctx.lineWidth = 0.5
      for (let k = 1; k < TILES; k++) {
        const frac = k / TILES
        const lx = fa.l + (fn.l - fa.l) * frac
        const rx = fa.r + (fn.r - fa.r) * frac
        const yy = fa.b + (fn.b - fa.b) * frac
        ctx.beginPath()
        ctx.moveTo(lx, yy); ctx.lineTo(rx, yy)
        ctx.stroke()
      }

      // Floor center spine (converging line toward vanish point)
      ctx.strokeStyle = `hsla(${hue},22%,${10 + brightness * 18}%,0.35)`
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(cx, fn.b); ctx.lineTo(cx, fa.b)
      ctx.stroke()
    }

    // --- Draw archway frames ---
    frames.forEach(f => {
      const scale = COR_HH * FOCAL / f.z
      const bright = Math.min(scale * 2.8, 1)
      const lum = 18 + bright * 62 + f.fv * 35
      const alpha = 0.25 + bright * 0.65 + f.fv * 0.1
      const fw = f.r - f.l
      const fh = f.b - f.t

      // Outer frame
      ctx.strokeStyle = `hsla(${hue + f.fv * 55},72%,${Math.min(lum, 90)}%,${Math.min(alpha, 0.95)})`
      ctx.lineWidth = 0.5 + scale * 6
      ctx.strokeRect(f.l, f.t, fw, fh)

      // Pillar left
      const pw = fw * 0.07
      ctx.lineWidth = 0.4 + scale * 4
      ctx.strokeStyle = `hsla(${hue + 20},65%,${Math.min(lum + 8, 92)}%,${Math.min(alpha * 0.8, 0.9)})`
      ctx.strokeRect(f.l, f.t, pw, fh)

      // Pillar right
      ctx.strokeRect(f.r - pw, f.t, pw, fh)

      // Lintel (top cross-beam)
      const lh = fh * 0.06
      ctx.strokeRect(f.l, f.t, fw, lh)
    })

    // --- High-freq shimmer on ceiling ---
    if (high > 0.15) {
      const shimmerAlpha = (high - 0.15) * 0.4
      const grd = ctx.createLinearGradient(0, 0, width, 0)
      for (let k = 0; k < 8; k++) {
        const v = frequencyData[Math.floor((0.6 + k * 0.05) * frequencyData.length)] / 255
        grd.addColorStop(k / 7, `hsla(${hue + 60},100%,80%,${shimmerAlpha * v})`)
      }
      ctx.fillStyle = grd
      ctx.fillRect(0, 0, width, vy)
    }

    // --- Vanishing point glow (bass-reactive) ---
    const glowR = 28 + bass * 65 + high * 15
    const grd = ctx.createRadialGradient(vx, vy, 0, vx, vy, glowR)
    grd.addColorStop(0,   `hsla(${hue + 55},100%,96%,${0.55 + bass * 0.42})`)
    grd.addColorStop(0.35,`hsla(${hue + 40},90%,72%,${0.18 + bass * 0.22})`)
    grd.addColorStop(1,   'rgba(0,0,0,0)')
    ctx.beginPath()
    ctx.arc(vx, vy, glowR, 0, Math.PI * 2)
    ctx.fillStyle = grd
    ctx.fill()

    // --- Vignette ---
    const vig = ctx.createRadialGradient(cx, cy, hh * 0.3, cx, cy, hh * 0.95)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, 'rgba(0,0,0,0.65)')
    ctx.fillStyle = vig
    ctx.fillRect(0, 0, width, height)

  }, [width, height])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = 'hsl(270,22%,3%)'
    ctx.fillRect(0, 0, width, height)
    zOffRef.current = 0
    hueRef.current  = 270
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block' }} />
}
