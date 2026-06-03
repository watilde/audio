import { useEffect, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

const NUM_LAYERS = 5

export function LiquidVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const hueRef = useRef(160)
  const timeRef = useRef(0)
  const smoothRef = useRef<number[]>(Array(64).fill(0))

  const draw = useCallback(
    (data: AnalyzerData) => {
      const svg = d3.select(svgRef.current)
      const { frequencyData, bass, mid, volume } = data

      timeRef.current += 0.008
      hueRef.current = (hueRef.current + 0.2 + mid * 1.2) % 360

      svg.select('.bg').attr('fill', `hsla(${hueRef.current + 180},25%,3%,0.15)`)

      // smooth frequency data
      const N = 64
      for (let i = 0; i < N; i++) {
        const idx = Math.floor((i / N) * frequencyData.length * 0.6)
        smoothRef.current[i] = smoothRef.current[i] * 0.75 + (frequencyData[idx] / 255) * 0.25
      }

      const line = d3.line<[number, number]>()
        .x((d) => d[0])
        .y((d) => d[1])
        .curve(d3.curveCatmullRom.alpha(0.5))

      for (let layer = 0; layer < NUM_LAYERS; layer++) {
        const t = timeRef.current + layer * 0.4
        const layerFrac = layer / (NUM_LAYERS - 1)
        const baseY = height * (0.25 + layerFrac * 0.5)
        const amp = (80 + volume * 120) * (1 - layerFrac * 0.4)
        const freqShift = layer * 8

        const points: [number, number][] = Array.from({ length: 80 }, (_, i) => {
          const x = (i / 79) * width
          const fi = Math.floor((i / 79) * (N - 1))
          const freqAmp = smoothRef.current[(fi + freqShift) % N]
          const wave =
            Math.sin(i * 0.18 + t * (1.2 + layer * 0.3)) * amp * 0.5 +
            Math.sin(i * 0.07 + t * 0.7 * (layer % 2 === 0 ? 1 : -1)) * amp * 0.35 +
            freqAmp * amp * (0.5 + bass * 0.5)
          return [x, baseY + wave]
        })

        const h = (hueRef.current + layer * 25) % 360
        const alpha = 0.15 + (1 - layerFrac) * 0.25

        svg.select(`.layer-${layer}`)
          .attr('d', line(points) ?? '')
          .attr('stroke', `hsla(${h},90%,${65 + layerFrac * 20}%,${alpha + volume * 0.3})`)
          .attr('stroke-width', 2 + (1 - layerFrac) * 3 + volume * 4)
      }
    },
    [width, height]
  )

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.append('rect').attr('class', 'bg').attr('width', width).attr('height', height).attr('fill', 'hsl(200,25%,3%)')
    for (let i = 0; i < NUM_LAYERS; i++) {
      svg.append('path').attr('class', `layer-${i}`).attr('fill', 'none')
    }
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
}
