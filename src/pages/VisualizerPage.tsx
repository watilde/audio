import { useEffect, useState } from 'react'
import { useAudioAnalyzer } from '../hooks/useAudioAnalyzer'
import { VISUALIZERS } from '../visualizers'
import './VisualizerPage.css'

interface Props {
  id: string
  onBack: () => void
}

function useWindowSize() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const handler = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return size
}

export function VisualizerPage({ id, onBack }: Props) {
  const def = VISUALIZERS.find((v) => v.id === id)!
  const { isListening, error, start, tick } = useAudioAnalyzer(2048)
  const { w, h } = useWindowSize()
  const Component = def.component

  useEffect(() => { start() }, [start])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onBack])

  return (
    <div className="viz-page">
      <Component width={w} height={h} onTick={tick} isListening={isListening} />
      <button className="back-btn" onClick={onBack} title="トップへ戻る (Esc)">
        ← BACK
      </button>
      {error && <p className="viz-error">{error}</p>}
    </div>
  )
}
