import { useState, useEffect } from 'react'
import { TopPage } from './pages/TopPage'
import { VisualizerPage } from './pages/VisualizerPage'
import { VISUALIZERS } from './visualizers'
import './App.css'

function getHashId(): string | null {
  const id = window.location.hash.slice(1)
  return VISUALIZERS.some(v => v.id === id) ? id : null
}

export default function App() {
  const [selected, setSelected] = useState<string | null>(getHashId)

  useEffect(() => {
    const onHash = () => setSelected(getHashId())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const select = (id: string) => {
    window.location.hash = id
    setSelected(id)
  }

  const back = () => {
    history.replaceState(null, '', window.location.pathname)
    setSelected(null)
  }

  if (selected) {
    return <VisualizerPage id={selected} onBack={back} />
  }

  return <TopPage onSelect={select} />
}
