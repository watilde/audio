import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

const N_PTS = 90
const BANDS = [
  { yFrac: 0.10, freqFrac: 0.04, hOff:  0,  spd:  0.35, thick: 0.10 },
  { yFrac: 0.22, freqFrac: 0.10, hOff: 28,  spd: -0.28, thick: 0.12 },
  { yFrac: 0.36, freqFrac: 0.20, hOff: 55,  spd:  0.42, thick: 0.14 },
  { yFrac: 0.50, freqFrac: 0.35, hOff: 80,  spd: -0.38, thick: 0.13 },
  { yFrac: 0.64, freqFrac: 0.52, hOff: 110, spd:  0.30, thick: 0.12 },
  { yFrac: 0.78, freqFrac: 0.70, hOff: 140, spd: -0.45, thick: 0.10 },
  { yFrac: 0.90, freqFrac: 0.85, hOff: 165, spd:  0.38, thick: 0.09 },
]

export function AuroraVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const tRef = useRef(0)
  const hueRef = useRef(140)

  const draw = useCallback((data: AnalyzerData) => {
    const svg = d3.select(svgRef.current)
    const { frequencyData, bass, volume } = data

    tRef.current += 0.006
    const t = tRef.current
    hueRef.current = (hueRef.current + 0.12 + bass * 0.4) % 360
    const hue = hueRef.current

    svg.select('.bg').attr('fill', `hsla(${hue + 190},35%,2%,0.08)`)

    const lineGen = d3.line<[number, number]>()
      .x(d => d[0]).y(d => d[1]).curve(d3.curveCatmullRom)

    BANDS.forEach((cfg, bi) => {
      const fi = Math.min(Math.floor(cfg.freqFrac * frequencyData.length * 0.85), frequencyData.length - 1)
      const fv = frequencyData[fi] / 255
      const energy = fv * 0.65 + bass * 0.25 + volume * 0.1
      const baseY = height * cfg.yFrac
      const bandH = height * cfg.thick * (0.4 + energy * 1.6)

      const topPts: [number, number][] = Array.from({ length: N_PTS }, (_, i) => {
        const x = (i / (N_PTS - 1)) * width
        const nx = i / N_PTS
        const y = baseY
          + Math.sin(nx * 4.5 + t * cfg.spd * 2.2) * bandH * 0.55
          + Math.sin(nx * 2.8 - t * cfg.spd * 1.4 + bi) * bandH * 0.35
          + Math.sin(nx * 7.2 + t * cfg.spd * 3.5 + bi * 0.7) * bandH * 0.12
          + energy * bandH * 0.4 * Math.sin(nx * Math.PI)
        return [x, y]
      })

      const botPts: [number, number][] = topPts.map(([x, y]) => [x, y + bandH * (0.6 + energy * 0.4)])

      const areaPts = [...topPts, ...[...botPts].reverse()]
      const areaD = areaPts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + 'Z'

      const h = (hue + cfg.hOff) % 360
      svg.select(`.aurora-fill-${bi}`).attr('d', areaD)
        .attr('fill', `hsla(${h},90%,${55 + energy * 28}%,${0.055 + energy * 0.16})`)
      svg.select(`.aurora-edge-${bi}`)
        .attr('d', lineGen(topPts) ?? '')
        .attr('stroke', `hsla(${h},100%,${72 + energy * 22}%,${0.12 + energy * 0.52})`)
        .attr('stroke-width', 1 + energy * 2.2)
    })
  }, [width, height])

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.append('rect').attr('class', 'bg').attr('width', width).attr('height', height).attr('fill', 'hsl(195,35%,2%)')
    BANDS.forEach((_, bi) => {
      svg.append('path').attr('class', `aurora-fill-${bi}`).attr('stroke', 'none')
      svg.append('path').attr('class', `aurora-edge-${bi}`).attr('fill', 'none')
    })
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
}
