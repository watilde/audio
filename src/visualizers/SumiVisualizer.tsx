import { useEffect, useRef, useCallback } from 'react'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

const N_COLS = 32
const THRESHOLD = 0.06

function inkMark(
  ctx: CanvasRenderingContext2D,
  x: number, topY: number, h: number, w: number,
  dark: number, alpha: number
) {
  ctx.save()
  ctx.globalAlpha = alpha
  for (let i = 0; i < 3; i++) {
    const ox = (Math.random() - 0.5) * w * 0.45
    const ow = w * (0.45 + Math.random() * 0.65)
    const oh = h * (0.82 + Math.random() * 0.18)
    ctx.fillStyle = `hsl(0,0%,${dark}%)`
    ctx.fillRect(x + ox - ow / 2, topY, ow, oh)
  }
  ctx.restore()
}

function reflMark(
  ctx: CanvasRenderingContext2D,
  x: number, waterY: number, h: number, w: number,
  dark: number, alpha: number, t: number
) {
  const reflH = h * 0.72
  const step = 5
  ctx.save()
  for (let dy = 0; dy < reflH; dy += step) {
    const fade = 1 - dy / reflH
    if (fade < 0.04) break
    const ripple = Math.sin(dy * 0.13 + t * 1.8 + x * 0.025) * (1.5 + dy * 0.025)
    const rw = w * fade * (0.55 + Math.random() * 0.35)
    ctx.globalAlpha = alpha * 0.38 * fade
    ctx.fillStyle = `hsl(0,0%,${dark + (1 - fade) * 22}%)`
    ctx.fillRect(x + ripple - rw / 2, waterY + dy, rw, step)
  }
  ctx.restore()
}

function inkSplatter(ctx: CanvasRenderingContext2D, bass: number, width: number, waterY: number) {
  const n = Math.floor(bass * 10)
  for (let i = 0; i < n; i++) {
    const sx = Math.random() * width
    const sy = waterY * (0.05 + Math.random() * 0.88)
    const r = 0.4 + Math.random() * 2.8 * bass
    ctx.save()
    ctx.globalAlpha = 0.35 + Math.random() * 0.55
    ctx.fillStyle = `hsl(0,0%,${2 + Math.random() * 10}%)`
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    ctx.fill()
    if (Math.random() < 0.45) {
      ctx.fillRect(sx, sy - 0.5, (Math.random() - 0.3) * 10 * bass, 0.9)
    }
    ctx.restore()
  }
}

export function SumiVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tRef = useRef(0)

  const initCanvas = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    // Aged washi paper
    ctx.fillStyle = 'hsl(44, 16%, 93%)'
    ctx.fillRect(0, 0, width, height)

    // Paper grain
    for (let i = 0; i < 300; i++) {
      ctx.globalAlpha = 0.015 + Math.random() * 0.025
      ctx.fillStyle = `hsl(38,12%,${50 + Math.random() * 35}%)`
      ctx.fillRect(Math.random() * width, Math.random() * height, Math.random() * 3, Math.random() * 2)
    }
    ctx.globalAlpha = 1

    // Faint water horizon
    const wy = height * 0.54
    ctx.save()
    ctx.globalAlpha = 0.12
    ctx.strokeStyle = 'hsl(210, 18%, 62%)'
    ctx.lineWidth = 0.6
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.moveTo(0, wy + i * 1.8)
      ctx.lineTo(width, wy + i * 1.5 + Math.random() * 1.2)
      ctx.stroke()
    }
    ctx.restore()
  }, [width, height])

  useEffect(() => { initCanvas() }, [initCanvas])

  const draw = useCallback((data: AnalyzerData) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { frequencyData, bass, high, volume } = data

    tRef.current += 0.014
    const t = tRef.current
    const waterY = height * 0.54

    if (volume < 0.007) return

    const colW = width / N_COLS

    for (let ci = 0; ci < N_COLS; ci++) {
      // Map columns logarithmically — more bass columns, fewer high
      const logFrac = Math.pow(ci / N_COLS, 1.4)
      const fi = Math.min(Math.floor(logFrac * frequencyData.length * 0.75), frequencyData.length - 1)
      const energy = frequencyData[fi] / 255

      if (energy < THRESHOLD) continue

      // Slight x jitter for gestural feel
      const x = (ci + 0.5) * colW + (Math.random() - 0.5) * colW * 0.4

      const maxH = waterY * 0.9
      const h = energy * maxH * (0.45 + bass * 0.75)
      if (h < 4) continue

      const w = colW * (0.28 + energy * 0.65 + Math.random() * 0.25)
      const dark = 2 + Math.random() * 10
      const alpha = 0.05 + energy * 0.14 + Math.random() * 0.05

      inkMark(ctx, x, waterY - h, h, w, dark, alpha)
      reflMark(ctx, x, waterY, h, w, dark, alpha, t)
    }

    // Bass splatter
    if (bass > 0.42) inkSplatter(ctx, bass, width, waterY)

    // High-freq fine calligraphic lines
    if (high > 0.18 && Math.random() < 0.25) {
      const lx = Math.random() * width
      const ly = waterY * (0.05 + Math.random() * 0.8)
      const lh = 4 + Math.random() * 28
      ctx.save()
      ctx.globalAlpha = 0.1 + Math.random() * 0.18
      ctx.strokeStyle = `hsl(0,0%,${3 + Math.random() * 10}%)`
      ctx.lineWidth = 0.4 + Math.random() * 1.2
      ctx.beginPath()
      ctx.moveTo(lx, ly)
      ctx.lineTo(lx + (Math.random() - 0.5) * 3, ly + lh)
      ctx.stroke()
      ctx.restore()
    }

    // Horizontal water shimmer near reflection line
    if (Math.random() < 0.15) {
      ctx.save()
      ctx.globalAlpha = 0.04 + Math.random() * 0.06
      ctx.strokeStyle = 'hsl(210,20%,40%)'
      ctx.lineWidth = 0.5
      const wx = Math.random() * width
      const wy2 = waterY + (Math.random() - 0.5) * 10
      ctx.beginPath()
      ctx.moveTo(wx, wy2)
      ctx.lineTo(wx + 10 + Math.random() * 40, wy2 + (Math.random() - 0.5) * 1.5)
      ctx.stroke()
      ctx.restore()
    }
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block' }} />
}
