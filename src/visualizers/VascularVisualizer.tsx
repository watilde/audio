import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

interface Seg {
  x1: number; y1: number
  x2: number; y2: number
  depth: number
  distFromRoot: number
  len: number
}

const MAX_DEPTH = 5
const PULSE_SPEED = 2.8   // px per frame
const PULSE_WIDTH = 90    // px
const HEART_INTERVAL = 95 // frames between autonomous beats

function buildTree(
  x: number, y: number, angle: number,
  length: number, depth: number,
  dist: number, out: Seg[]
): void {
  if (depth <= 0 || length < 7) return
  const x2 = x + Math.cos(angle) * length
  const y2 = y + Math.sin(angle) * length
  out.push({ x1: x, y1: y, x2, y2, depth, distFromRoot: dist, len: length })
  const spread = 0.32 + Math.random() * 0.14
  const shrink = 0.60 + Math.random() * 0.08
  buildTree(x2, y2, angle - spread, length * shrink, depth - 1, dist + length, out)
  buildTree(x2, y2, angle + spread, length * shrink, depth - 1, dist + length, out)
}

export function VascularVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const segsRef = useRef<Seg[]>([])
  const frameRef = useRef(0)
  const lastBeatRef = useRef(0)
  const hueRef = useRef(0)
  const beat2Ref = useRef(30) // second beat offset (systole + diastole)

  useEffect(() => {
    const cx = width / 2, cy = height / 2
    const segs: Seg[] = []
    const trunkLen = Math.min(width, height) * 0.17
    const N_TRUNKS = 5
    for (let i = 0; i < N_TRUNKS; i++) {
      const a = (i / N_TRUNKS) * Math.PI * 2 - Math.PI / 2 + (Math.random() - 0.5) * 0.25
      buildTree(cx, cy, a, trunkLen, MAX_DEPTH, 0, segs)
    }
    segsRef.current = segs
  }, [width, height])

  const pulseIntensity = (seg: Seg, frame: number, beatFrame: number): number => {
    const travel = (frame - beatFrame) * PULSE_SPEED
    if (travel < seg.distFromRoot - PULSE_WIDTH || travel > seg.distFromRoot + seg.len + PULSE_WIDTH) return 0
    const mid = seg.distFromRoot + seg.len * 0.5
    const dist = Math.abs(travel - mid)
    return Math.max(0, 1 - dist / (PULSE_WIDTH * 0.7))
  }

  const draw = useCallback((data: AnalyzerData) => {
    const svg = d3.select(svgRef.current)
    const { bass, volume } = data

    frameRef.current++
    const frame = frameRef.current
    hueRef.current = (hueRef.current + 0.08) % 360

    // Trigger beat
    const sinceLastBeat = frame - lastBeatRef.current
    if (bass > 0.4 || sinceLastBeat > HEART_INTERVAL) {
      if (bass > 0.4 || sinceLastBeat > HEART_INTERVAL) lastBeatRef.current = frame
    }
    const beat1 = lastBeatRef.current
    const beat2 = beat1 + beat2Ref.current

    svg.select('.bg').attr('fill', `hsla(355,40%,1%,0.12)`)

    type SegD = { seg: Seg; intensity: number }
    const segData: SegD[] = segsRef.current.map(seg => {
      const i1 = pulseIntensity(seg, frame, beat1)
      const i2 = pulseIntensity(seg, frame, beat2) * 0.6
      return { seg, intensity: Math.min(1, i1 + i2) }
    })

    svg.select('.segs')
      .selectAll<SVGLineElement, SegD>('line')
      .data(segData).join('line')
      .attr('x1', d => d.seg.x1).attr('y1', d => d.seg.y1)
      .attr('x2', d => d.seg.x2).attr('y2', d => d.seg.y2)
      .attr('stroke', d => {
        const k = d.intensity
        const l = 12 + k * 55 + volume * 10
        const a = 0.3 + k * 0.65
        return `hsla(${358 + k * 8},${70 + k * 28}%,${l}%,${a})`
      })
      .attr('stroke-width', d => Math.max(0.5, (d.seg.depth / MAX_DEPTH) * 6 * (0.7 + d.intensity * 0.6)))
      .attr('stroke-linecap', 'round')

    // Beating center dot
    const beatPhase = Math.max(0, 1 - (frame - beat1) * 0.06)
    const r = Math.min(width, height) * 0.018 * (1 + beatPhase * 1.2)
    svg.select('.heart').attr('cx', width / 2).attr('cy', height / 2).attr('r', r)
      .attr('fill', `hsla(5,100%,${65 + beatPhase * 30}%,${0.5 + beatPhase * 0.45})`)
    svg.select('.heart-glow').attr('cx', width / 2).attr('cy', height / 2).attr('r', r * 3.5)
      .attr('fill', `hsla(5,100%,55%,${0.03 + beatPhase * 0.1})`)
  }, [width, height])

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.append('rect').attr('class', 'bg').attr('width', width).attr('height', height).attr('fill', 'hsl(355,40%,1%)')
    svg.append('g').attr('class', 'segs')
    svg.append('circle').attr('class', 'heart-glow')
    svg.append('circle').attr('class', 'heart')
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
}
