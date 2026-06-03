import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

const N_BLOB = 72
const N_CILIA = 40
const N_ORGS = 7

interface Organelle {
  orbitR: number
  speed: number
  phase: number
  size: number
  hueOff: number
}

export function BreathVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const tRef = useRef(0)
  const hueRef = useRef(190)
  const pulseRef = useRef(0)
  const orgsRef = useRef<Organelle[]>([])

  useEffect(() => {
    orgsRef.current = Array.from({ length: N_ORGS }, () => ({
      orbitR: 0.18 + Math.random() * 0.48,
      speed: (0.12 + Math.random() * 0.28) * (Math.random() < 0.5 ? 1 : -1),
      phase: Math.random() * Math.PI * 2,
      size: 0.04 + Math.random() * 0.065,
      hueOff: (Math.random() - 0.5) * 90,
    }))
  }, [])

  const draw = useCallback((data: AnalyzerData) => {
    const svg = d3.select(svgRef.current)
    const { frequencyData, bass, mid, volume } = data
    const cx = width / 2, cy = height / 2

    tRef.current += 0.007
    const t = tRef.current
    hueRef.current = (hueRef.current + 0.12 + mid * 0.7) % 360
    const hue = hueRef.current

    pulseRef.current = pulseRef.current * 0.84 + bass * 0.5
    const pulse = pulseRef.current

    const baseR = Math.min(width, height) * 0.23
    // slow breathing: ~0.1 Hz
    const breathe = 1 + Math.sin(t * 0.62) * 0.04 + Math.sin(t * 0.27) * 0.018

    svg.select('.bg').attr('fill', `hsla(${hue + 205},30%,2%,0.11)`)

    // Outer aura
    for (let g = 0; g < 5; g++) {
      svg.select(`.aura-${g}`)
        .attr('cx', cx).attr('cy', cy)
        .attr('r', baseR * breathe * (1.08 + g * 0.13 + pulse * 0.18))
        .attr('fill', `hsla(${hue},85%,58%,${Math.max(0, 0.028 - g * 0.005 + pulse * 0.045)})`)
    }

    // Blob
    const blobPts: [number, number][] = Array.from({ length: N_BLOB }, (_, i) => {
      const a = (i / N_BLOB) * Math.PI * 2
      const fi = Math.floor(((i / N_BLOB) * 0.6 + 0.2) * frequencyData.length * 0.5)
      const fv = frequencyData[Math.min(fi, frequencyData.length - 1)] / 255

      const d =
        Math.sin(a * 2 + t * 0.85) * 0.07 +
        Math.sin(a * 3 - t * 1.25 + 1.1) * 0.045 +
        Math.sin(a * 5 + t * 0.55) * 0.028 +
        Math.sin(a * 7 - t * 0.38 + 2.3) * 0.016 +
        fv * 0.13 + pulse * 0.11

      return [cx + Math.cos(a) * baseR * breathe * (1 + d), cy + Math.sin(a) * baseR * breathe * (1 + d)]
    })

    const pathGen = d3.line<[number, number]>().x(d => d[0]).y(d => d[1]).curve(d3.curveCatmullRomClosed)
    const pd = pathGen(blobPts) ?? ''

    svg.select('.blob')
      .attr('d', pd)
      .attr('fill', `hsla(${hue},55%,16%,0.88)`)
    svg.select('.blob-edge')
      .attr('d', pd)
      .attr('stroke', `hsla(${hue + 35},100%,80%,${0.22 + pulse * 0.58 + volume * 0.18})`)
      .attr('stroke-width', 1.1 + pulse * 2.8)

    // Cilia
    type CiliaD = { x1: number; y1: number; x2: number; y2: number; v: number; w: number }
    const ciliaData: CiliaD[] = Array.from({ length: N_CILIA }, (_, i) => {
      const a = (i / N_CILIA) * Math.PI * 2
      const fi = Math.floor((i / N_CILIA) * frequencyData.length * 0.35)
      const v = frequencyData[fi] / 255
      const wave = Math.sin(a * 6 + t * 2.8) * 0.5 + 0.5
      const bend = 0.04 * wave
      const edgeR = baseR * breathe * (1.025 + wave * 0.045)
      const tipR = edgeR + 5 + v * 24 * (0.3 + wave * 0.7)
      return {
        x1: cx + Math.cos(a) * edgeR, y1: cy + Math.sin(a) * edgeR,
        x2: cx + Math.cos(a + bend) * tipR, y2: cy + Math.sin(a + bend) * tipR,
        v, w: 0.6 + v * 1.2,
      }
    })
    svg.select('.cilia').selectAll<SVGLineElement, CiliaD>('line')
      .data(ciliaData).join('line')
      .attr('x1', d => d.x1).attr('y1', d => d.y1)
      .attr('x2', d => d.x2).attr('y2', d => d.y2)
      .attr('stroke', d => `hsla(${hue + 65},100%,${62 + d.v * 32}%,${0.2 + d.v * 0.6})`)
      .attr('stroke-width', d => d.w)
      .attr('stroke-linecap', 'round')

    // Organelles
    orgsRef.current.forEach((o, idx) => {
      const a = o.phase + t * o.speed
      const r = baseR * o.orbitR * (0.82 + Math.sin(t * 1.15 + idx * 1.3) * 0.18)
      const sz = baseR * o.size * (0.75 + volume * 0.55)
      svg.select(`.org-${idx}`)
        .attr('cx', cx + Math.cos(a) * r).attr('cy', cy + Math.sin(a) * r).attr('r', sz)
        .attr('fill', `hsla(${(hue + o.hueOff + 185) % 360},52%,62%,${0.1 + volume * 0.2})`)
    })

    // Nucleus
    const nR = baseR * 0.105 * (1 + pulse * 0.65 + Math.sin(t * 1.55) * 0.09)
    svg.select('.nuc-glow').attr('cx', cx).attr('cy', cy).attr('r', nR * 3)
      .attr('fill', `hsla(${hue + 45},100%,68%,${0.035 + pulse * 0.11})`)
    svg.select('.nuc').attr('cx', cx).attr('cy', cy).attr('r', nR)
      .attr('fill', `hsla(${hue + 55},100%,90%,${0.5 + pulse * 0.38})`)
  }, [width, height])

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.append('rect').attr('class', 'bg').attr('width', width).attr('height', height)
    for (let g = 0; g < 5; g++) svg.append('circle').attr('class', `aura-${g}`)
    svg.append('path').attr('class', 'blob').attr('stroke', 'none')
    svg.append('path').attr('class', 'blob-edge').attr('fill', 'none')
    svg.append('g').attr('class', 'cilia')
    for (let i = 0; i < N_ORGS; i++) svg.append('circle').attr('class', `org-${i}`)
    svg.append('circle').attr('class', 'nuc-glow')
    svg.append('circle').attr('class', 'nuc')
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
}
