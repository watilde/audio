import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

const N = 200
const MAX_SPEED = 3.2
const NEIGHBOR_R = 70
const SCATTER_FORCE = 4.5

interface Boid {
  x: number
  y: number
  vx: number
  vy: number
  band: number  // 0-3
}

export function SwarmVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const boidsRef = useRef<Boid[]>([])
  const tRef = useRef(0)
  const hueRef = useRef(220)

  useEffect(() => {
    const cx = width / 2, cy = height / 2
    boidsRef.current = Array.from({ length: N }, (_, i) => ({
      x: cx + (Math.random() - 0.5) * width * 0.4,
      y: cy + (Math.random() - 0.5) * height * 0.4,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      band: Math.floor((i / N) * 4),
    }))
  }, [width, height])

  const draw = useCallback((data: AnalyzerData) => {
    const svg = d3.select(svgRef.current)
    const { frequencyData, bass, mid, high, volume } = data
    const cx = width / 2, cy = height / 2

    tRef.current += 1
    hueRef.current = (hueRef.current + 0.18 + mid * 0.9) % 360
    const hue = hueRef.current

    // Band energies [bass, mid-low, mid-high, high]
    const N_FREQ = frequencyData.length
    const bandEnergy = [
      bass,
      Array.from(frequencyData.slice(Math.floor(N_FREQ * 0.07), Math.floor(N_FREQ * 0.25))).reduce((s, v) => s + v, 0) / (N_FREQ * 0.18 * 255),
      mid,
      high,
    ]

    svg.select('.bg').attr('fill', `hsla(${hue + 200},25%,2%,0.1)`)

    const boids = boidsRef.current

    // Boid update
    for (let i = 0; i < N; i++) {
      const b = boids[i]
      let sepX = 0, sepY = 0
      let aliX = 0, aliY = 0
      let cohX = 0, cohY = 0
      let count = 0

      for (let j = 0; j < N; j++) {
        if (i === j) continue
        const dx = boids[j].x - b.x
        const dy = boids[j].y - b.y
        const d2 = dx * dx + dy * dy
        if (d2 < NEIGHBOR_R * NEIGHBOR_R) {
          const d = Math.sqrt(d2) + 0.001
          // Only strong separation, weak alignment/cohesion
          if (d < 22) { sepX -= dx / d * (22 - d) * 0.08; sepY -= dy / d * (22 - d) * 0.08 }
          aliX += boids[j].vx; aliY += boids[j].vy
          cohX += boids[j].x; cohY += boids[j].y
          count++
        }
      }

      if (count > 0) {
        aliX = (aliX / count - b.vx) * 0.012
        aliY = (aliY / count - b.vy) * 0.012
        cohX = ((cohX / count - b.x)) * 0.003
        cohY = ((cohY / count - b.y)) * 0.003
      }

      // Gentle drift toward loose home region
      const homeAngle = (b.band / 4) * Math.PI * 2 + tRef.current * 0.002
      const homeX = cx + Math.cos(homeAngle) * Math.min(width, height) * 0.18
      const homeY = cy + Math.sin(homeAngle) * Math.min(width, height) * 0.18
      const toHomeX = (homeX - b.x) * 0.0006
      const toHomeY = (homeY - b.y) * 0.0006

      // Audio scatter: strong beat pushes away from center
      const energy = bandEnergy[b.band]
      const scatterX = (b.x - cx) / (Math.min(width, height) * 0.5) * energy * SCATTER_FORCE
      const scatterY = (b.y - cy) / (Math.min(width, height) * 0.5) * energy * SCATTER_FORCE

      // Slight noise for liveliness
      const noiseX = (Math.random() - 0.5) * 0.2
      const noiseY = (Math.random() - 0.5) * 0.2

      b.vx += sepX + aliX + cohX + toHomeX + scatterX + noiseX
      b.vy += sepY + aliY + cohY + toHomeY + scatterY + noiseY

      // Speed limit
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy)
      const maxSpd = MAX_SPEED * (0.6 + energy * 1.4 + volume * 0.8)
      if (spd > maxSpd) { b.vx = b.vx / spd * maxSpd; b.vy = b.vy / spd * maxSpd }

      b.x += b.vx; b.y += b.vy

      // Soft boundary
      const margin = 40
      if (b.x < margin) b.vx += 0.4
      if (b.x > width - margin) b.vx -= 0.4
      if (b.y < margin) b.vy += 0.4
      if (b.y > height - margin) b.vy -= 0.4
    }

    // Draw connection lines for nearby same-band boids
    type Line = { x1: number; y1: number; x2: number; y2: number; d: number; band: number }
    const lines: Line[] = []
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (boids[i].band !== boids[j].band) continue
        const dx = boids[j].x - boids[i].x
        const dy = boids[j].y - boids[i].y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < 45) lines.push({ x1: boids[i].x, y1: boids[i].y, x2: boids[j].x, y2: boids[j].y, d, band: boids[i].band })
      }
    }

    const BAND_HUES = [0, 90, 200, 280]
    svg.select('.lines')
      .selectAll<SVGLineElement, Line>('line')
      .data(lines)
      .join('line')
      .attr('x1', d => d.x1).attr('y1', d => d.y1)
      .attr('x2', d => d.x2).attr('y2', d => d.y2)
      .attr('stroke', d => `hsla(${(hue + BAND_HUES[d.band]) % 360},80%,65%,${(1 - d.d / 45) * 0.35})`)
      .attr('stroke-width', d => (1 - d.d / 45) * 1.2)

    svg.select('.boids')
      .selectAll<SVGCircleElement, Boid>('circle')
      .data(boids)
      .join('circle')
      .attr('cx', d => d.x).attr('cy', d => d.y)
      .attr('r', d => 2 + bandEnergy[d.band] * 4)
      .attr('fill', d => {
        const e = bandEnergy[d.band]
        return `hsla(${(hue + BAND_HUES[d.band]) % 360},90%,${60 + e * 30}%,${0.45 + e * 0.45})`
      })

  }, [width, height])

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.append('rect').attr('class', 'bg').attr('width', width).attr('height', height).attr('fill', 'hsl(220,25%,2%)')
    svg.append('g').attr('class', 'lines')
    svg.append('g').attr('class', 'boids')
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
}
