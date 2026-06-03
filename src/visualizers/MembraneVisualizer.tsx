import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

const COLS = 22
const ROWS = 16

export function MembraneVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const tRef = useRef(0)
  const hueRef = useRef(170)
  // Ripple ring buffers: outward wave from center
  const rippleRef = useRef(Array(COLS).fill(0))
  const rippleVelRef = useRef(Array(COLS).fill(0))

  const draw = useCallback((data: AnalyzerData) => {
    const svg = d3.select(svgRef.current)
    const { frequencyData, bass, mid, volume } = data
    const cx = width / 2, cy = height / 2

    tRef.current += 0.009
    const t = tRef.current
    hueRef.current = (hueRef.current + 0.15 + mid * 0.8) % 360
    const hue = hueRef.current

    svg.select('.bg').attr('fill', `hsla(${hue + 180},28%,2%,0.1)`)

    // Update outward ripple simulation
    if (bass > 0.25) rippleVelRef.current[0] += bass * 15
    for (let i = COLS - 1; i > 0; i--) {
      rippleVelRef.current[i] += (rippleRef.current[i - 1] - rippleRef.current[i]) * 0.3
    }
    for (let i = 0; i < COLS; i++) {
      rippleVelRef.current[i] *= 0.88
      rippleRef.current[i] += rippleVelRef.current[i]
      rippleRef.current[i] *= 0.96
    }

    const cellW = width / (COLS - 1)
    const cellH = height / (ROWS - 1)

    // Compute displaced positions
    type Node = { x: number; y: number; disp: number; col: number; row: number }
    const nodes: Node[] = []

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const bx = col * cellW
        const by = row * cellH
        const nx = (col / COLS) * 2 - 1  // -1..1
        const ny = (row / ROWS) * 2 - 1

        // Slow organic undulation
        const wave =
          Math.sin(nx * 4 + t * 0.9) * 0.4 +
          Math.sin(ny * 3 - t * 1.1 + 0.5) * 0.35 +
          Math.sin((nx + ny) * 2.5 + t * 0.7) * 0.25

        // Audio frequency content mapped to grid column
        const fi = Math.floor((col / COLS) * frequencyData.length * 0.8)
        const fv = frequencyData[fi] / 255

        // Outward ripple
        const dist = Math.sqrt(nx * nx + ny * ny)
        const rippleBin = Math.min(Math.floor(dist * (COLS / 2)), COLS - 1)
        const ripple = rippleRef.current[rippleBin]

        const amp = cellH * 0.28
        const totalDisp = wave * amp + fv * amp * 0.6 + ripple * 0.5

        nodes.push({
          x: bx + Math.sin(ny * 3 + t) * 3 * (1 + bass),
          y: by + totalDisp,
          disp: Math.abs(totalDisp) / amp,
          col, row,
        })
      }
    }

    // Horizontal edges
    type Edge = { x1: number; y1: number; x2: number; y2: number; d: number }
    const hEdges: Edge[] = []
    const vEdges: Edge[] = []

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS - 1; col++) {
        const a = nodes[row * COLS + col]
        const b = nodes[row * COLS + col + 1]
        hEdges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, d: (a.disp + b.disp) * 0.5 })
      }
    }
    for (let row = 0; row < ROWS - 1; row++) {
      for (let col = 0; col < COLS; col++) {
        const a = nodes[row * COLS + col]
        const b = nodes[(row + 1) * COLS + col]
        vEdges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, d: (a.disp + b.disp) * 0.5 })
      }
    }

    svg.select('.h-edges').selectAll<SVGLineElement, Edge>('line')
      .data(hEdges).join('line')
      .attr('x1', d => d.x1).attr('y1', d => d.y1)
      .attr('x2', d => d.x2).attr('y2', d => d.y2)
      .attr('stroke', d => `hsla(${hue + d.d * 60},80%,${40 + d.d * 45}%,${0.15 + d.d * 0.45})`)
      .attr('stroke-width', d => 0.5 + d.d * 1.2)

    svg.select('.v-edges').selectAll<SVGLineElement, Edge>('line')
      .data(vEdges).join('line')
      .attr('x1', d => d.x1).attr('y1', d => d.y1)
      .attr('x2', d => d.x2).attr('y2', d => d.y2)
      .attr('stroke', d => `hsla(${hue + d.d * 60},80%,${40 + d.d * 45}%,${0.12 + d.d * 0.38})`)
      .attr('stroke-width', d => 0.4 + d.d * 0.9)

    svg.select('.nodes').selectAll<SVGCircleElement, Node>('circle')
      .data(nodes).join('circle')
      .attr('cx', d => d.x).attr('cy', d => d.y)
      .attr('r', d => 0.8 + d.disp * 2.5 + volume * 1.5)
      .attr('fill', d => `hsla(${hue + d.disp * 80},90%,${55 + d.disp * 40}%,${0.3 + d.disp * 0.65})`)

    // Center pulse ring
    const pulseR = Math.min(width, height) * 0.06 * (1 + rippleRef.current[0] * 0.08)
    svg.select('.center-pulse')
      .attr('cx', cx).attr('cy', cy).attr('r', Math.max(1, pulseR))
      .attr('fill', `hsla(${hue + 30},100%,80%,${Math.min(0.8, 0.05 + Math.abs(rippleRef.current[0]) * 0.04)})`)
  }, [width, height])

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.append('rect').attr('class', 'bg').attr('width', width).attr('height', height).attr('fill', 'hsl(180,28%,2%)')
    svg.append('g').attr('class', 'h-edges')
    svg.append('g').attr('class', 'v-edges')
    svg.append('g').attr('class', 'nodes')
    svg.append('circle').attr('class', 'center-pulse')
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
}
