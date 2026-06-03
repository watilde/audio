import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

interface Hypha {
  pts: [number, number][]
  angle: number
  turnRate: number
  speed: number
  age: number
  maxLen: number
  hue: number
  spawned: boolean
}

const MAX_HYPHAE = 65
const BASE_SPEED = 1.4

export function MyceliumVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const hyphaeRef = useRef<Hypha[]>([])
  const tRef = useRef(0)
  const hueRef = useRef(100)
  const spawnCoolRef = useRef(0)

  const makeHypha = useCallback((x: number, y: number, angle: number, hue: number, speed = 1): Hypha => ({
    pts: [[x, y]],
    angle,
    turnRate: (Math.random() - 0.5) * 0.08,
    speed: BASE_SPEED * speed,
    age: 0,
    maxLen: 60 + Math.random() * 120,
    hue,
    spawned: false,
  }), [])

  useEffect(() => {
    const cx = width / 2, cy = height / 2
    hyphaeRef.current = Array.from({ length: 5 }, (_, i) => {
      const a = (i / 5) * Math.PI * 2 + Math.random() * 0.4
      return makeHypha(cx, cy, a, 80 + i * 25, 0.8)
    })
  }, [width, height, makeHypha])

  const draw = useCallback((data: AnalyzerData) => {
    const svg = d3.select(svgRef.current)
    const { frequencyData, bass, mid, volume } = data
    const cx = width / 2, cy = height / 2

    tRef.current += 1
    hueRef.current = (hueRef.current + 0.08 + mid * 0.5) % 360
    const hue = hueRef.current
    spawnCoolRef.current = Math.max(0, spawnCoolRef.current - 1)

    svg.select('.bg').attr('fill', `hsla(${hue + 150},25%,2%,0.07)`)

    // Grow hyphae
    hyphaeRef.current = hyphaeRef.current.map((h) => {
      if (h.pts.length > h.maxLen) return h
      const tip = h.pts[h.pts.length - 1]
      const fi = Math.floor((h.hue / 360) * frequencyData.length * 0.6)
      const fv = frequencyData[fi] / 255
      const speed = h.speed * (1 + fv * 2.5 + bass * 1.5)
      const wobble = h.turnRate + (Math.random() - 0.5) * 0.04
      const newAngle = h.angle + wobble
      const nx = tip[0] + Math.cos(newAngle) * speed
      const ny = tip[1] + Math.sin(newAngle) * speed
      // Bounce from edges
      const finalAngle = (nx < 30 || nx > width - 30 || ny < 30 || ny > height - 30)
        ? newAngle + Math.PI * (0.8 + Math.random() * 0.4)
        : newAngle
      return { ...h, pts: [...h.pts, [nx, ny] as [number, number]], angle: finalAngle, age: h.age + 1 }
    })

    // Spawn children at natural branching points
    hyphaeRef.current.forEach((h) => {
      if (!h.spawned && h.pts.length > h.maxLen * 0.65 && Math.random() < 0.012) {
        if (hyphaeRef.current.length < MAX_HYPHAE) {
          const tip = h.pts[h.pts.length - 1]
          const branchAngle = h.angle + (Math.random() < 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.5)
          hyphaeRef.current.push(makeHypha(tip[0], tip[1], branchAngle, (h.hue + 20) % 360, 0.7))
          h.spawned = true
        }
      }
    })

    // Bass hit: burst new hyphae from center
    if (bass > 0.35 && spawnCoolRef.current === 0 && hyphaeRef.current.length < MAX_HYPHAE - 3) {
      const n = 2 + Math.floor(bass * 3)
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        hyphaeRef.current.push(makeHypha(
          cx + (Math.random() - 0.5) * 40,
          cy + (Math.random() - 0.5) * 40,
          a, (hue + Math.random() * 60) % 360, 1.2
        ))
      }
      spawnCoolRef.current = 25
    }

    // Trim oldest when over limit
    if (hyphaeRef.current.length > MAX_HYPHAE) {
      hyphaeRef.current = hyphaeRef.current.slice(-MAX_HYPHAE)
    }

    // Draw
    const lineGen = d3.line<[number, number]>().x(d => d[0]).y(d => d[1]).curve(d3.curveCatmullRom)

    type PathD = { path: string; progress: number; hue: number; tip: [number, number] }
    const pathData: PathD[] = hyphaeRef.current.map((h) => {
      const progress = h.pts.length / h.maxLen
      return {
        path: lineGen(h.pts) ?? '',
        progress,
        hue: h.hue,
        tip: h.pts[h.pts.length - 1],
      }
    })

    svg.select('.hyphae')
      .selectAll<SVGPathElement, PathD>('path')
      .data(pathData)
      .join('path')
      .attr('d', d => d.path)
      .attr('fill', 'none')
      .attr('stroke', d => `hsla(${(hue + d.hue * 0.3) % 360},80%,${45 + d.progress * 35}%,${0.15 + d.progress * 0.55})`)
      .attr('stroke-width', d => 0.6 + (1 - d.progress) * 0.8)
      .attr('stroke-linecap', 'round')

    // Tip glows
    svg.select('.tips')
      .selectAll<SVGCircleElement, PathD>('circle')
      .data(pathData.filter(d => d.progress < 0.98))
      .join('circle')
      .attr('cx', d => d.tip[0]).attr('cy', d => d.tip[1])
      .attr('r', 2.5 + volume * 3)
      .attr('fill', d => `hsla(${(hue + d.hue * 0.3 + 30) % 360},100%,88%,${0.5 + volume * 0.4})`)

  }, [width, height, makeHypha])

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.append('rect').attr('class', 'bg').attr('width', width).attr('height', height).attr('fill', 'hsl(150,25%,2%)')
    svg.append('g').attr('class', 'hyphae')
    svg.append('g').attr('class', 'tips')
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
}
