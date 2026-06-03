import { useEffect, useRef, useCallback } from 'react'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

// Palette from the painting: orange, yellow, red, dark green, light green, white/cream, near-black
const PALETTE: [number, number, number, number][] = [
  // [h, s, l, weight]
  [28,  90, 52, 18],   // orange
  [38,  92, 60, 12],   // amber-yellow
  [50,  95, 58,  8],   // yellow
  [6,   82, 44, 12],   // red
  [14,  86, 50, 10],   // orange-red
  [128, 58, 18,  7],   // dark green
  [140, 44, 42,  5],   // mid green
  [45,  28, 90, 18],   // cream/white
  [40,  18, 95,  7],   // near white
  [15,   8, 12,  3],   // near black
]

// Build weighted color pool once
const COLOR_POOL: [number, number, number][] = []
for (const [h, s, l, w] of PALETTE) {
  for (let i = 0; i < w; i++) COLOR_POOL.push([h, s, l])
}

function pickColor(jitter = 14): string {
  const [h, s, l] = COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)]
  return `hsl(${h + (Math.random() - 0.5) * jitter},${s}%,${l}%)`
}

function stroke(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  angle: number,
  len: number, thick: number,
  color: string, alpha: number
) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.rect(-len / 2, -thick / 2, len, thick)
  ctx.fill()
  // Thin highlight edge (simulate impasto)
  if (thick > 5 && Math.random() < 0.5) {
    ctx.globalAlpha = alpha * 0.3
    ctx.fillStyle = `hsl(45,20%,95%)`
    ctx.beginPath()
    ctx.rect(-len / 2, -thick / 2, len, thick * 0.22)
    ctx.fill()
  }
  ctx.restore()
}

export function PaintVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const initCanvas = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = 'hsl(44, 28%, 91%)'
    ctx.fillRect(0, 0, width, height)
    for (let i = 0; i < 120; i++) {
      stroke(ctx,
        Math.random() * width, Math.random() * height,
        Math.random() * Math.PI,
        8 + Math.random() * 20, 2 + Math.random() * 4,
        `hsl(40,15%,${82 + Math.random() * 10}%)`, 0.15 + Math.random() * 0.18
      )
    }
  }, [width, height])

  useEffect(() => { initCanvas() }, [initCanvas])

  const draw = useCallback((data: AnalyzerData) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    const { frequencyData, bass, mid, high, volume } = data

    const energy = bass * 0.5 + mid * 0.3 + high * 0.2

    // Even in silence: occasional faint ghost marks (canvas "waiting")
    if (volume < 0.01) {
      if (Math.random() < 0.03) {
        stroke(ctx,
          Math.random() * width, Math.random() * height,
          Math.random() * Math.PI,
          5 + Math.random() * 15, 1 + Math.random() * 2,
          `hsl(44,18%,88%)`, 0.08 + Math.random() * 0.08
        )
      }
      return
    }

    // Number of new marks this frame
    const n = Math.floor(0.08 + energy * 1.2 + bass * 0.8)

    for (let i = 0; i < n; i++) {
      const x = Math.random() * width
      const y = Math.random() * height

      // Angle: bias toward ±45° and ±135° (like the painting)
      const angleBase = (Math.floor(Math.random() * 4) * Math.PI / 4)
        + (Math.random() - 0.5) * 0.55
      const angle = angleBase + (Math.random() < 0.2 ? Math.random() * Math.PI : 0)

      // Frequency band for this stroke (mapped to y position)
      const fi = Math.min(
        Math.floor(((y / height) * 0.6 + 0.2) * frequencyData.length),
        frequencyData.length - 1
      )
      const fv = frequencyData[fi] / 255

      // Length: short for high freq, long for bass
      const freqLenBias = (1 - fi / frequencyData.length)  // 1=bass, 0=high
      const len = (12 + Math.random() * 38) * (0.5 + bass * freqLenBias * 1.8 + fv * 0.7)
      const thick = (3 + Math.random() * 9) * (0.5 + bass * 0.8)

      // White/cream marks increase with high frequencies (air and light in painting)
      const colorRoll = Math.random()
      let color: string
      if (high > 0.3 && colorRoll < 0.35) {
        color = `hsl(${42 + (Math.random()-0.5)*12},${22+Math.random()*18}%,${86+Math.random()*10}%)`
      } else {
        color = pickColor(18)
      }

      const alpha = 0.38 + Math.random() * 0.52 + bass * 0.12

      const roll = Math.random()
      if (roll < 0.05) {
        // Triangle mark
        const r = (5 + Math.random() * 16) * (0.5 + fv * 0.8)
        const a = Math.random() * Math.PI * 2
        ctx.save()
        ctx.globalAlpha = alpha * 0.8
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
        ctx.lineTo(x + Math.cos(a + Math.PI * 2 / 3) * r, y + Math.sin(a + Math.PI * 2 / 3) * r)
        ctx.lineTo(x + Math.cos(a + Math.PI * 4 / 3) * r, y + Math.sin(a + Math.PI * 4 / 3) * r)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      } else if (roll < 0.30) {
        // Circle mark
        const r = (4 + Math.random() * 18) * (0.5 + fv * 0.8)
        ctx.save()
        ctx.globalAlpha = alpha * 0.75
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
        // Hollow ring variant
        if (Math.random() < 0.3) {
          ctx.globalAlpha = alpha * 0.4
          ctx.strokeStyle = pickColor(12)
          ctx.lineWidth = 1 + Math.random() * 3
          ctx.beginPath()
          ctx.arc(x, y, r * (1.1 + Math.random() * 0.5), 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.restore()
      } else {
        stroke(ctx, x, y, angle, len, thick, color, alpha)

        // Sometimes overlap with a second thinner mark (texture layering)
        if (Math.random() < 0.28 && len > 18) {
          stroke(ctx,
            x + (Math.random() - 0.5) * 6,
            y + (Math.random() - 0.5) * 6,
            angle + (Math.random() - 0.5) * 0.2,
            len * (0.5 + Math.random() * 0.4), thick * 0.4,
            pickColor(10), alpha * 0.55
          )
        }
      }
    }
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block' }} />
}
