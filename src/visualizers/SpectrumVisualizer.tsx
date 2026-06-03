import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

const NUM_BARS = 80

export function SpectrumVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const peaksRef = useRef<number[]>(Array(NUM_BARS).fill(0))
  const peakVelRef = useRef<number[]>(Array(NUM_BARS).fill(0))
  const hueRef = useRef(200)

  const draw = useCallback(
    (data: AnalyzerData) => {
      const svg = d3.select(svgRef.current)
      const { frequencyData, volume, bass } = data
      const pad = width * 0.04
      const w = (width - pad * 2) / NUM_BARS
      const maxH = height * 0.45

      hueRef.current = (hueRef.current + 0.3 + bass * 1.5) % 360

      svg.select('.bg').attr('fill', `hsla(${hueRef.current + 200},20%,3%,0.2)`)

      const bars = Array.from({ length: NUM_BARS }, (_, i) => {
        const idx = Math.floor((i / NUM_BARS) * frequencyData.length * 0.75)
        return frequencyData[idx] / 255
      })

      // update peaks
      bars.forEach((v, i) => {
        if (v * maxH > peaksRef.current[i]) {
          peaksRef.current[i] = v * maxH
          peakVelRef.current[i] = 0
        } else {
          peakVelRef.current[i] += 0.3
          peaksRef.current[i] = Math.max(0, peaksRef.current[i] - peakVelRef.current[i])
        }
      })

      const barData = bars.map((v, i) => ({ v, i, peak: peaksRef.current[i] }))

      // main bars
      svg.select('.bars')
        .selectAll<SVGRectElement, (typeof barData)[0]>('rect')
        .data(barData)
        .join('rect')
        .attr('x', (d) => pad + d.i * w + w * 0.1)
        .attr('y', (d) => height / 2 - d.v * maxH)
        .attr('width', w * 0.8)
        .attr('height', (d) => d.v * maxH)
        .attr('fill', (d) => {
          const h = (hueRef.current + d.i * 1.8) % 360
          return `hsla(${h},90%,${55 + d.v * 30}%,0.9)`
        })
        .attr('rx', 2)

      // mirror bars (bottom)
      svg.select('.bars-mirror')
        .selectAll<SVGRectElement, (typeof barData)[0]>('rect')
        .data(barData)
        .join('rect')
        .attr('x', (d) => pad + d.i * w + w * 0.1)
        .attr('y', height / 2)
        .attr('width', w * 0.8)
        .attr('height', (d) => d.v * maxH * 0.5)
        .attr('fill', (d) => {
          const h = (hueRef.current + d.i * 1.8) % 360
          return `hsla(${h},90%,${55 + d.v * 30}%,0.25)`
        })
        .attr('rx', 2)

      // peak dots
      svg.select('.peaks')
        .selectAll<SVGRectElement, (typeof barData)[0]>('rect')
        .data(barData)
        .join('rect')
        .attr('x', (d) => pad + d.i * w + w * 0.1)
        .attr('y', (d) => height / 2 - d.peak - 3)
        .attr('width', w * 0.8)
        .attr('height', 2)
        .attr('fill', (d) => {
          const h = (hueRef.current + d.i * 1.8) % 360
          return `hsla(${h},100%,85%,${0.4 + d.peak / maxH * 0.6})`
        })

      // center line glow
      svg.select('.centerline')
        .attr('stroke', `hsla(${hueRef.current},80%,70%,${0.2 + volume * 0.5})`)
        .attr('stroke-width', 1 + volume * 3)
    },
    [width, height]
  )

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.append('rect').attr('class', 'bg').attr('width', width).attr('height', height).attr('fill', 'hsl(220,20%,3%)')
    svg.append('g').attr('class', 'bars-mirror')
    svg.append('g').attr('class', 'bars')
    svg.append('g').attr('class', 'peaks')
    svg.append('line').attr('class', 'centerline')
      .attr('x1', 0).attr('y1', height / 2)
      .attr('x2', width).attr('y2', height / 2)
      .attr('fill', 'none')
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
}
