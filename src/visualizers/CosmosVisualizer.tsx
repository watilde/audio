import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

interface Star {
  angle: number
  radius: number
  baseRadius: number
  speed: number
  size: number
  band: number
  hue: number
}

const NUM_STARS = 220
const NUM_RINGS = 6

export function CosmosVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const starsRef = useRef<Star[]>([])
  const hueRef = useRef(260)
  const timeRef = useRef(0)
  const bandSmooth = useRef(Array(NUM_RINGS).fill(0))

  useEffect(() => {
    starsRef.current = Array.from({ length: NUM_STARS }, (_, i) => {
      const band = Math.floor((i / NUM_STARS) * NUM_RINGS)
      const ringFrac = (band + 0.5) / NUM_RINGS
      return {
        angle: Math.random() * Math.PI * 2,
        radius: 0,
        baseRadius: (0.06 + ringFrac * 0.38) * Math.min(width, height),
        speed: (0.002 + Math.random() * 0.004) * (band % 2 === 0 ? 1 : -1),
        size: 0.8 + Math.random() * 2.2,
        band,
        hue: Math.random() * 60,
      }
    })
  }, [width, height])

  const draw = useCallback(
    (data: AnalyzerData) => {
      const svg = d3.select(svgRef.current)
      const { frequencyData, bass, volume } = data
      const cx = width / 2
      const cy = height / 2

      timeRef.current += 0.01
      hueRef.current = (hueRef.current + 0.25 + bass * 1.0) % 360

      svg.select('.bg').attr('fill', `hsla(${hueRef.current + 200},20%,2%,0.18)`)

      // band energies
      for (let b = 0; b < NUM_RINGS; b++) {
        const start = Math.floor((b / NUM_RINGS) * frequencyData.length * 0.7)
        const end = Math.floor(((b + 1) / NUM_RINGS) * frequencyData.length * 0.7)
        let sum = 0
        for (let i = start; i < end; i++) sum += frequencyData[i]
        const v = sum / (end - start) / 255
        bandSmooth.current[b] = bandSmooth.current[b] * 0.8 + v * 0.2
      }

      // orbit rings (visual guide)
      for (let b = 0; b < NUM_RINGS; b++) {
        const r = ((b + 0.5) / NUM_RINGS) * Math.min(width, height) * 0.44
        const energy = bandSmooth.current[b]
        svg.select(`.ring-${b}`)
          .attr('cx', cx).attr('cy', cy)
          .attr('r', r * (1 + energy * 0.08))
          .attr('stroke', `hsla(${(hueRef.current + b * 30) % 360},70%,60%,${0.04 + energy * 0.12})`)
          .attr('stroke-width', 1 + energy * 2)
      }

      // update stars
      starsRef.current = starsRef.current.map((s) => {
        const energy = bandSmooth.current[s.band]
        const newAngle = s.angle + s.speed * (1 + energy * 6)
        const pulse = s.baseRadius * (1 + energy * 0.3 + bass * 0.15)
        return { ...s, angle: newAngle, radius: pulse }
      })

      svg.select('.stars')
        .selectAll<SVGCircleElement, Star>('circle')
        .data(starsRef.current)
        .join('circle')
        .attr('cx', (s) => cx + Math.cos(s.angle) * s.radius)
        .attr('cy', (s) => cy + Math.sin(s.angle) * s.radius)
        .attr('r', (s) => s.size * (1 + bandSmooth.current[s.band] * 2))
        .attr('fill', (s) => {
          const h = (hueRef.current + s.hue + s.band * 20) % 360
          const energy = bandSmooth.current[s.band]
          return `hsla(${h},90%,${70 + energy * 25}%,${0.5 + energy * 0.5})`
        })

      // center sun
      const sunR = Math.min(width, height) * 0.04 * (1 + bass * 1.2 + volume * 0.5)
      svg.select('.sun')
        .attr('cx', cx).attr('cy', cy).attr('r', sunR)
        .attr('fill', `hsla(${hueRef.current + 40},100%,85%,${0.7 + bass * 0.3})`)

      svg.select('.sun-glow')
        .attr('cx', cx).attr('cy', cy).attr('r', sunR * 2.5)
        .attr('fill', `hsla(${hueRef.current + 40},100%,70%,${0.08 + bass * 0.15})`)
    },
    [width, height]
  )

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.append('rect').attr('class', 'bg').attr('width', width).attr('height', height).attr('fill', 'hsl(240,20%,2%)')
    for (let i = 0; i < NUM_RINGS; i++) svg.append('circle').attr('class', `ring-${i}`).attr('fill', 'none')
    svg.append('g').attr('class', 'stars')
    svg.append('circle').attr('class', 'sun-glow')
    svg.append('circle').attr('class', 'sun')
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
}
