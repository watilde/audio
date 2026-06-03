import type { AnalyzerData } from '../hooks/useAudioAnalyzer'

export interface VisualizerProps {
  width: number
  height: number
  onTick: (cb: (data: AnalyzerData) => void) => (() => void) | undefined
  isListening: boolean
}

export interface VisualizerDef {
  id: string
  name: string
  description: string
  accent: string
  component: React.ComponentType<VisualizerProps>
}
