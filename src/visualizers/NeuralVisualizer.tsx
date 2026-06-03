import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

const N_NODES = 48
const EDGE_DIST_FRAC = 0.22
const PULSE_SPEED = 0.022

interface NNode { x: number; y: number; charge: number; firedAt: number }
interface NEdge { i: number; j: number; x1: number; y1: number; x2: number; y2: number }
interface NPulse { x1: number; y1: number; x2: number; y2: number; t: number; hue: number }

export function NeuralVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const nodesRef = useRef<NNode[]>([])
  const edgesRef = useRef<NEdge[]>([])
  const pulsesRef = useRef<NPulse[]>([])
  const hueRef = useRef(210)
  const frameRef = useRef(0)

  useEffect(() => {
    const minD = Math.min(width, height) * 0.11
    const margin = 0.08
    const nodes: NNode[] = []
    let attempts = 0
    while (nodes.length < N_NODES && attempts < 8000) {
      const x = margin * width + Math.random() * width * (1 - 2 * margin)
      const y = margin * height + Math.random() * height * (1 - 2 * margin)
      if (!nodes.some(n => Math.hypot(n.x - x, n.y - y) < minD)) {
        nodes.push({ x, y, charge: Math.random() * 0.4, firedAt: -999 })
      }
      attempts++
    }
    nodesRef.current = nodes

    const edgeDist = Math.min(width, height) * EDGE_DIST_FRAC
    const edges: NEdge[] = []
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (Math.hypot(nodes[j].x - nodes[i].x, nodes[j].y - nodes[i].y) < edgeDist) {
          edges.push({ i, j, x1: nodes[i].x, y1: nodes[i].y, x2: nodes[j].x, y2: nodes[j].y })
        }
      }
    }
    edgesRef.current = edges
    pulsesRef.current = []
  }, [width, height])

  const draw = useCallback((data: AnalyzerData) => {
    const svg = d3.select(svgRef.current)
    const { frequencyData, volume } = data

    frameRef.current++
    hueRef.current = (hueRef.current + 0.18) % 360
    const hue = hueRef.current
    const frame = frameRef.current

    svg.select('.bg').attr('fill', `hsla(${hue + 200},30%,2%,0.1)`)

    const nodes = nodesRef.current
    const edges = edgesRef.current

    nodes.forEach((n, ni) => {
      const fi = Math.min(Math.floor((n.x / width) * frequencyData.length * 0.75), frequencyData.length - 1)
      n.charge += 0.0018 + (frequencyData[fi] / 255) * 0.032
      if (n.charge >= 1) {
        n.charge = 0
        n.firedAt = frame
        edges.forEach((e) => {
          if (e.i !== ni && e.j !== ni) return
          const [px1, py1, px2, py2] = e.i === ni
            ? [e.x1, e.y1, e.x2, e.y2]
            : [e.x2, e.y2, e.x1, e.y1]
          pulsesRef.current.push({ x1: px1, y1: py1, x2: px2, y2: py2, t: 0, hue: (hue + Math.random() * 50 - 25 + 360) % 360 })
        })
      }
    })

    pulsesRef.current = pulsesRef.current
      .map(p => ({ ...p, t: p.t + PULSE_SPEED }))
      .filter(p => p.t < 1)
    if (pulsesRef.current.length > 400) pulsesRef.current = pulsesRef.current.slice(-400)

    svg.select('.edges')
      .selectAll<SVGLineElement, NEdge>('line').data(edges).join('line')
      .attr('x1', d => d.x1).attr('y1', d => d.y1).attr('x2', d => d.x2).attr('y2', d => d.y2)
      .attr('stroke', `hsla(${hue + 40},55%,42%,0.11)`).attr('stroke-width', 0.6)

    svg.select('.nodes')
      .selectAll<SVGCircleElement, NNode>('circle').data(nodes).join('circle')
      .attr('cx', d => d.x).attr('cy', d => d.y)
      .attr('r', d => 2 + d.charge * 5 + volume * 2)
      .attr('fill', d => {
        const fresh = Math.max(0, 1 - (frame - d.firedAt) * 0.04)
        return `hsla(${hue + 30},100%,${48 + d.charge * 38 + fresh * 28}%,${0.25 + d.charge * 0.55 + fresh * 0.45})`
      })

    svg.select('.pulses')
      .selectAll<SVGCircleElement, NPulse>('circle').data(pulsesRef.current).join('circle')
      .attr('cx', d => d.x1 + (d.x2 - d.x1) * d.t)
      .attr('cy', d => d.y1 + (d.y2 - d.y1) * d.t)
      .attr('r', d => 3.5 * (1 - d.t) + 0.5)
      .attr('fill', d => `hsla(${d.hue},100%,88%,${0.75 * (1 - d.t)})`)
  }, [width, height])

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.append('rect').attr('class', 'bg').attr('width', width).attr('height', height).attr('fill', 'hsl(230,30%,2%)')
    svg.append('g').attr('class', 'edges')
    svg.append('g').attr('class', 'nodes')
    svg.append('g').attr('class', 'pulses')
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
}
