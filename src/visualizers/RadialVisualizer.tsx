import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  hue: number
}

const NUM_BARS = 128
const MAX_PARTICLES = 300

export function RadialVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const hueRef = useRef(0)
  const timeRef = useRef(0)

  const spawnParticles = (bass: number, cx: number, cy: number, hue: number) => {
    const count = Math.floor(bass * 12)
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = (0.5 + Math.random() * 3) * (0.3 + bass)
      particlesRef.current.push({
        x: cx + (Math.random() - 0.5) * 20,
        y: cy + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 0.4 + Math.random() * 0.6,
        size: 1 + Math.random() * 3 * bass,
        hue: hue + (Math.random() - 0.5) * 40,
      })
    }
    if (particlesRef.current.length > MAX_PARTICLES) {
      particlesRef.current = particlesRef.current.slice(-MAX_PARTICLES)
    }
  }

  const draw = useCallback(
    (data: AnalyzerData) => {
      const svg = d3.select(svgRef.current)
      const cx = width / 2
      const cy = height / 2
      const { frequencyData, timeData, bass, mid, high, volume } = data

      timeRef.current += 0.01
      hueRef.current = (hueRef.current + 0.4 + mid * 2) % 360

      // -- background fade
      svg.select('.bg-rect')
        .attr('fill', `hsla(${hueRef.current + 200},20%,3%,0.18)`)

      // -- spawn particles on bass hit
      if (bass > 0.3) spawnParticles(bass, cx, cy, hueRef.current)

      // -- update & render particles
      particlesRef.current = particlesRef.current
        .map((p) => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.06,
          vx: p.vx * 0.98,
          life: p.life - 0.012 / p.maxLife,
        }))
        .filter((p) => p.life > 0)

      svg.select('.particles')
        .selectAll<SVGCircleElement, Particle>('circle')
        .data(particlesRef.current)
        .join('circle')
        .attr('cx', (p) => p.x)
        .attr('cy', (p) => p.y)
        .attr('r', (p) => p.size * p.life)
        .attr('fill', (p) => `hsla(${p.hue},90%,70%,${p.life * 0.8})`)

      // -- radial frequency bars
      const barData = Array.from({ length: NUM_BARS }, (_, i) => {
        const idx = Math.floor((i / NUM_BARS) * frequencyData.length * 0.7)
        return frequencyData[idx] / 255
      })

      const innerR = Math.min(width, height) * 0.15
      const outerRMax = Math.min(width, height) * 0.42
      const angleStep = (Math.PI * 2) / NUM_BARS

      const barPaths = barData.map((v, i) => {
        const angle = i * angleStep - Math.PI / 2
        const r0 = innerR * (1 + bass * 0.3)
        const r1 = r0 + v * (outerRMax - r0)
        const w = angleStep * 0.7
        const x0 = cx + Math.cos(angle - w / 2) * r0
        const y0 = cy + Math.sin(angle - w / 2) * r0
        const x1 = cx + Math.cos(angle + w / 2) * r0
        const y1 = cy + Math.sin(angle + w / 2) * r0
        const x2 = cx + Math.cos(angle + w / 2) * r1
        const y2 = cy + Math.sin(angle + w / 2) * r1
        const x3 = cx + Math.cos(angle - w / 2) * r1
        const y3 = cy + Math.sin(angle - w / 2) * r1
        return { d: `M${x0},${y0} L${x1},${y1} L${x2},${y2} L${x3},${y3}Z`, v }
      })

      svg.select('.bars')
        .selectAll<SVGPathElement, (typeof barPaths)[0]>('path')
        .data(barPaths)
        .join('path')
        .attr('d', (b) => b.d)
        .attr('fill', (b, i) => {
          const h = (hueRef.current + i * 1.5) % 360
          return `hsla(${h},90%,${50 + b.v * 40}%,0.85)`
        })

      // -- waveform ring (inner)
      const wavePoints = Array.from<number>(timeData).map((v, i) => {
        const angle = (i / timeData.length) * Math.PI * 2 - Math.PI / 2
        const deviation = ((v - 128) / 128) * innerR * 0.8
        const r = innerR * 0.85 + deviation
        return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r] as [number, number]
      })

      const waveLine = d3
        .line<[number, number]>()
        .x((d) => d[0])
        .y((d) => d[1])
        .curve(d3.curveCatmullRomClosed)

      svg.select('.wave')
        .attr('d', waveLine(wavePoints) ?? '')
        .attr('stroke', `hsla(${hueRef.current + 60},100%,80%,0.7)`)
        .attr('stroke-width', 1.5 + volume * 2)

      // -- center glow circle
      const glowR = innerR * 0.6 * (0.6 + bass * 0.8 + volume * 0.4)
      svg.select('.center-glow')
        .attr('r', glowR)
        .attr('fill', `hsla(${hueRef.current},80%,60%,${0.1 + bass * 0.25})`)
        .attr('cx', cx)
        .attr('cy', cy)

      // -- orbiting mid-energy rings
      const numRings = 3
      for (let r = 0; r < numRings; r++) {
        const orbitR = innerR * (1.3 + r * 0.25) * (1 + mid * 0.15)
        const orbitAngle = timeRef.current * (1 + r * 0.5) * (r % 2 === 0 ? 1 : -1)
        const dotX = cx + Math.cos(orbitAngle) * orbitR
        const dotY = cy + Math.sin(orbitAngle) * orbitR
        svg.select(`.orbit-dot-${r}`)
          .attr('cx', dotX)
          .attr('cy', dotY)
          .attr('r', 3 + mid * 6)
          .attr('fill', `hsla(${(hueRef.current + r * 80) % 360},100%,75%,${0.4 + mid * 0.5})`)
      }

      // -- high-frequency sparkle ring
      const sparkR = Math.min(width, height) * 0.44 * (1 + high * 0.1)
      svg.select('.sparkle-ring')
        .attr('r', sparkR)
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('stroke', `hsla(${hueRef.current + 120},100%,90%,${high * 0.6})`)
        .attr('stroke-width', 1 + high * 3)
    },
    [width, height]
  )

  // -- build SVG skeleton once
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // bg
    svg.append('rect').attr('class', 'bg-rect').attr('width', width).attr('height', height).attr('fill', 'hsl(220,20%,3%)')

    // layers
    svg.append('g').attr('class', 'particles')
    svg.append('g').attr('class', 'bars')
    svg.append('path').attr('class', 'wave').attr('fill', 'none')
    svg.append('circle').attr('class', 'center-glow')
    svg.append('circle').attr('class', 'sparkle-ring').attr('fill', 'none')
    for (let i = 0; i < 3; i++) svg.append('circle').attr('class', `orbit-dot-${i}`)
  }, [width, height])

  // -- animation loop
  useEffect(() => {
    if (!isListening) return
    const cleanup = onTick(draw)
    return cleanup
  }, [isListening, onTick, draw])

  return <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
}
