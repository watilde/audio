import { useEffect, useRef, useState, useCallback } from 'react'

export interface AnalyzerData {
  frequencyData: Uint8Array
  timeData: Uint8Array
  bass: number
  mid: number
  high: number
  volume: number
}

export function useAudioAnalyzer(fftSize = 2048) {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyzerRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number>(0)
  const dataRef = useRef<AnalyzerData>({
    frequencyData: new Uint8Array(fftSize / 2),
    timeData: new Uint8Array(fftSize),
    bass: 0,
    mid: 0,
    high: 0,
    volume: 0,
  })

  const getAverageInRange = (data: Uint8Array, start: number, end: number) => {
    let sum = 0
    for (let i = start; i < end; i++) sum += data[i]
    return sum / (end - start) / 255
  }

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const ctx = new AudioContext()
      audioCtxRef.current = ctx

      const analyzer = ctx.createAnalyser()
      analyzer.fftSize = fftSize
      analyzer.smoothingTimeConstant = 0.8
      analyzerRef.current = analyzer

      const source = ctx.createMediaStreamSource(stream)
      source.connect(analyzer)
      sourceRef.current = source

      setIsListening(true)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Microphone access denied')
    }
  }, [fftSize])

  const stop = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    sourceRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    analyzerRef.current = null
    setIsListening(false)
  }, [])

  const tick = useCallback((cb: (data: AnalyzerData) => void) => {
    const analyzer = analyzerRef.current
    if (!analyzer) return

    const bufLen = analyzer.frequencyBinCount
    const freqData = new Uint8Array(bufLen)
    const timeData = new Uint8Array(analyzer.fftSize)

    const loop = () => {
      analyzer.getByteFrequencyData(freqData)
      analyzer.getByteTimeDomainData(timeData)

      const bass = getAverageInRange(freqData, 0, Math.floor(bufLen * 0.07))
      const mid = getAverageInRange(freqData, Math.floor(bufLen * 0.07), Math.floor(bufLen * 0.4))
      const high = getAverageInRange(freqData, Math.floor(bufLen * 0.4), bufLen)

      let sum = 0
      for (let i = 0; i < freqData.length; i++) sum += freqData[i]
      const volume = sum / freqData.length / 255

      dataRef.current = { frequencyData: freqData, timeData, bass, mid, high, volume }
      cb(dataRef.current)
      frameRef.current = requestAnimationFrame(loop)
    }

    loop()
    return () => cancelAnimationFrame(frameRef.current)
  }, [])

  useEffect(() => () => stop(), [stop])

  return { isListening, error, start, stop, tick }
}
