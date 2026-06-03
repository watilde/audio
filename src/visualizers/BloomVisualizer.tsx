import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

const PETALS = 8
const LAYERS = 4

const petalPath = (cx: number, cy: number, angle: number, r: number, w: number): string => {
  const p = (a: number, d: number) => [cx + Math.cos(a) * d, cy + Math.sin(a) * d] as const
  const [tx, ty] = p(angle, r)
  const [c1x, c1y] = p(angle - w, r * 0.42)
  const [c2x, c2y] = p(angle - w * 0.5, r * 0.82)
  const [c3x, c3y] = p(angle + w * 0.5, r * 0.82)
  const [c4x, c4y] = p(angle + w, r * 0.42)
  return `M${cx},${cy} C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty} C${c3x},${c3y} ${c4x},${c4y} ${cx},${cy}Z`
}

const LAYER_CFG = [
  { rFrac: 0.09, maxEx: 0.055, freqFrac: 0.03, hOff: -25, rotSpd:  0.45, pWidth: 0.55 },
  { rFrac: 0.17, maxEx: 0.08,  freqFrac: 0.18, hOff:   0, rotSpd: -0.30, pWidth: 0.50 },
  { rFrac: 0.27, maxEx: 0.10,  freqFrac: 0.42, hOff:  25, rotSpd:  0.22, pWidth: 0.44 },
  { rFrac: 0.40, maxEx: 0.12,  freqFrac: 0.68, hOff:  50, rotSpd: -0.16, pWidth: 0.38 },
]

export function BloomVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const tRef = useRef(0)
  const hueRef = useRef(0)

  const draw = useCallback((data: AnalyzerData) => {
    const svg = d3.select(svgRef.current)
    const { frequencyData, bass, volume } = data
    const cx = width / 2, cy = height / 2

    tRef.current += 0.007
    const t = tRef.current
    hueRef.current = (hueRef.current + 0.15 + bass * 0.8) % 360
    const hue = hueRef.current

    svg.select('.bg').attr('fill', `hsla(${hue + 200},30%,2%,0.09)`)

    LAYER_CFG.forEach((cfg, li) => {
      const fi = Math.min(Math.floor(cfg.freqFrac * frequencyData.length * 0.8), frequencyData.length - 1)
      const fv = frequencyData[fi] / 255
      const baseR = Math.min(width, height) * cfg.rFrac
      const r = baseR + Math.min(width, height) * cfg.maxEx * fv
      const rotation = t * cfg.rotSpd
      const pw = (Math.PI * 2 / PETALS) * cfg.pWidth

      type PD = { d: string; fv: number; li: number; pi: number }
      const petalData: PD[] = Array.from({ length: PETALS }, (_, pi) => {
        const a = (pi / PETALS) * Math.PI * 2 + rotation + li * (Math.PI / (LAYERS * 2))
        const flutter = Math.sin(a * 4 + t * (2 + li * 0.6)) * 0.018
        const pr = r * (1 + flutter + volume * 0.12)
        return { d: petalPath(cx, cy, a, pr, pw), fv, li, pi }
      })

      svg.select(`.layer-${li}`)
        .selectAll<SVGPathElement, PD>('path')
        .data(petalData).join('path')
        .attr('d', d => d.d)
        .attr('fill', d => {
          const h = (hue + cfg.hOff + d.pi * 4) % 360
          return `hsla(${h},88%,${52 + fv * 32}%,${0.22 + fv * 0.42})`
        })
        .attr('stroke', d => {
          const h = (hue + cfg.hOff + d.pi * 4 + 20) % 360
          return `hsla(${h},100%,${72 + fv * 22}%,${0.08 + fv * 0.22})`
        })
        .attr('stroke-width', 0.6)
    })

    // Pistil
    const pistilR = Math.min(width, height) * 0.018 * (1 + bass * 0.8 + Math.sin(t * 1.8) * 0.12)
    svg.select('.pistil-glow').attr('cx', cx).attr('cy', cy).attr('r', pistilR * 3.5)
      .attr('fill', `hsla(${hue + 60},100%,75%,${0.04 + bass * 0.12})`)
    svg.select('.pistil').attr('cx', cx).attr('cy', cy).attr('r', pistilR)
      .attr('fill', `hsla(${hue + 55},100%,90%,${0.6 + bass * 0.35})`)
  }, [width, height])

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.append('rect').attr('class', 'bg').attr('width', width).attr('height', height).attr('fill', 'hsl(210,30%,2%)')
    for (let i = LAYERS - 1; i >= 0; i--) svg.append('g').attr('class', `layer-${i}`)
    svg.append('circle').attr('class', 'pistil-glow')
    svg.append('circle').attr('class', 'pistil')
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
}
