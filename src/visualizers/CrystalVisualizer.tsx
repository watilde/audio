import { useEffect, useRef, useCallback } from 'react'
import type { AnalyzerData } from '../hooks/useAudioAnalyzer'
import type { VisualizerProps } from './types'

type Vec3 = [number, number, number]

const dot3 = (a: Vec3, b: Vec3) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2]
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]]
const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0], a[1]+b[1], a[2]+b[2]]
const scale3 = (a: Vec3, s: number): Vec3 => [a[0]*s, a[1]*s, a[2]*s]
const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1]*b[2] - a[2]*b[1],
  a[2]*b[0] - a[0]*b[2],
  a[0]*b[1] - a[1]*b[0],
]
const norm3 = (v: Vec3): Vec3 => {
  const l = Math.sqrt(dot3(v, v))
  return l > 1e-6 ? [v[0]/l, v[1]/l, v[2]/l] : [0, 1, 0]
}
const rotX = (v: Vec3, a: number): Vec3 => {
  const c = Math.cos(a), s = Math.sin(a)
  return [v[0], v[1]*c - v[2]*s, v[1]*s + v[2]*c]
}
const rotY = (v: Vec3, a: number): Vec3 => {
  const c = Math.cos(a), s = Math.sin(a)
  return [v[0]*c + v[2]*s, v[1], -v[0]*s + v[2]*c]
}
const rotZ = (v: Vec3, a: number): Vec3 => {
  const c = Math.cos(a), s = Math.sin(a)
  return [v[0]*c - v[1]*s, v[0]*s + v[1]*c, v[2]]
}

function buildBipyramid(sides: number, topH: number, btmH: number, equatR: number) {
  const verts: Vec3[] = []
  verts.push([0, topH, 0])   // 0 top apex
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2
    verts.push([Math.cos(a) * equatR, 0, Math.sin(a) * equatR])
  }
  verts.push([0, -btmH, 0])  // sides+1 bottom apex

  const faces: [number, number, number][] = []
  for (let i = 0; i < sides; i++) {
    faces.push([0, 1 + i, 1 + (i + 1) % sides])
    faces.push([sides + 1, 1 + (i + 1) % sides, 1 + i])
  }
  return { verts, faces }
}

interface CrystalDef {
  pos: Vec3
  rot: Vec3
  rotSpd: Vec3
  scale: number
  sides: number
  hueBase: number
  freqIdx: number
}

const CRYSTALS: CrystalDef[] = [
  { pos: [0, 0, 0],      rot: [0.2, 0,    0], rotSpd: [0.003, 0.007,  0.002], scale: 1.00, sides: 6, hueBase: 260, freqIdx: 0.05 },
  { pos: [-1.6, 0.5, -0.8], rot: [0,   0.4, 0.3], rotSpd: [-0.005, 0.004, 0.006], scale: 0.58, sides: 5, hueBase: 200, freqIdx: 0.20 },
  { pos: [1.8, -0.4, -1.2], rot: [0.5, 0,   0.1], rotSpd: [0.006, -0.005, 0.003], scale: 0.50, sides: 4, hueBase: 300, freqIdx: 0.40 },
  { pos: [0.6, 1.2, -2.0],  rot: [0.1, 0.8, 0  ], rotSpd: [0.004, 0.003, -0.007], scale: 0.40, sides: 6, hueBase: 180, freqIdx: 0.60 },
  { pos: [-1.0, -1.1, -1.5],rot: [0.3, 0.2, 0.5], rotSpd: [-0.006, 0.006, 0.004], scale: 0.35, sides: 5, hueBase: 330, freqIdx: 0.80 },
]

function project(p: Vec3, eye: Vec3, axes: [Vec3, Vec3, Vec3], fov: number, cx: number, cy: number, size: number): [number, number, number] {
  const d = sub3(p, eye)
  const cx_ = dot3(d, axes[0])
  const cy_ = dot3(d, axes[1])
  const cz  = dot3(d, axes[2])
  if (cz >= 0) return [cx, cy, cz]  // behind camera
  const f = size / (2 * Math.tan(fov * 0.5))
  const iz = -1 / cz
  return [cx + cx_ * iz * f, cy + cy_ * iz * f, cz]
}

export function CrystalVisualizer({ width, height, onTick, isListening }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tRef = useRef(0)
  const rotRef = useRef(CRYSTALS.map(c => [...c.rot] as Vec3))
  const camRef = useRef({
    phi: 0.35, theta: 0,
    thetaVel: 0.004,   // horizontal orbit velocity
    phiVel: 0,         // vertical tilt velocity
    rVel: 0,           // zoom velocity
    r: 5.5,            // current camera distance
  })

  const draw = useCallback((data: AnalyzerData) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { frequencyData, bass, mid, high, volume } = data

    tRef.current += 0.007
    const t = tRef.current

    // Audio-reactive camera
    const cam = camRef.current

    // Bass → sudden zoom-in burst
    cam.rVel += (bass - 0.15) * -0.18
    cam.rVel *= 0.82
    cam.r = Math.max(3.2, Math.min(8.0, cam.r + cam.rVel))

    // Mid → horizontal orbit accelerates/decelerates
    cam.thetaVel += (mid - 0.1) * 0.012
    cam.thetaVel = cam.thetaVel * 0.94 + 0.004 * (1 - cam.thetaVel / 0.06) * 0.1  // drift back to base speed
    cam.thetaVel = Math.max(-0.04, Math.min(0.06, cam.thetaVel))
    cam.theta += cam.thetaVel

    // High → vertical tilt oscillation
    cam.phiVel += (high - 0.08) * 0.015
    cam.phiVel *= 0.88
    cam.phi = Math.max(0.15, Math.min(1.2, cam.phi + cam.phiVel))

    const { phi, theta, r: camR } = cam

    // Camera shake on big bass hits
    const shakeAmt = Math.max(0, bass - 0.5) * 6
    const shakeX = (Math.random() - 0.5) * shakeAmt
    const shakeY = (Math.random() - 0.5) * shakeAmt

    const eye: Vec3 = [
      camR * Math.sin(phi) * Math.sin(theta) + shakeX,
      camR * Math.cos(phi) + shakeY,
      camR * Math.sin(phi) * Math.cos(theta),
    ]
    const target: Vec3 = [0, 0, 0]
    const up: Vec3 = [0, 1, 0]
    const zAxis = norm3(sub3(eye, target))
    const xAxis = norm3(cross3(up, zAxis))
    const yAxis = cross3(zAxis, xAxis)
    const axes: [Vec3, Vec3, Vec3] = [xAxis, yAxis, zAxis]

    const lightPos: Vec3 = [
      3 * Math.cos(t * 0.4),
      3 + Math.sin(t * 0.25),
      3 * Math.sin(t * 0.4),
    ]

    const cx = width / 2, cy = height / 2
    const size = Math.min(width, height)
    const fov = Math.PI / 3.5

    // Fade background
    ctx.fillStyle = `rgba(8, 4, 18, 0.18)`
    ctx.fillRect(0, 0, width, height)

    // Collect all faces across all crystals for depth sorting
    interface DrawFace {
      poly: [number, number][]
      depth: number
      hue: number
      diffuse: number
      specular: number
      alpha: number
    }
    const drawFaces: DrawFace[] = []

    CRYSTALS.forEach((c, ci) => {
      // Update rotation
      const r = rotRef.current[ci]
      r[0] += c.rotSpd[0] * (1 + bass * 2)
      r[1] += c.rotSpd[1] * (1 + mid * 1.5)
      r[2] += c.rotSpd[2] * (1 + volume * 1.5)

      const fi = Math.min(Math.floor(c.freqIdx * frequencyData.length * 0.8), frequencyData.length - 1)
      const fv = frequencyData[fi] / 255
      const sc = c.scale * (1 + fv * 0.35 + bass * 0.08)

      const { verts, faces } = buildBipyramid(c.sides, 1.3 + fv * 0.3, 1.0 + fv * 0.2, 0.9)

      // Transform vertices: scale → rotate → translate
      const worldVerts: Vec3[] = verts.map(v => {
        let w: Vec3 = [v[0] * sc, v[1] * sc, v[2] * sc]
        w = rotX(w, r[0])
        w = rotY(w, r[1])
        w = rotZ(w, r[2])
        return add3(w, c.pos)
      })

      // Project vertices
      const screenVerts = worldVerts.map(wv => project(wv, eye, axes, fov, cx, cy, size))

      faces.forEach(([i0, i1, i2]) => {
        const s0 = screenVerts[i0], s1 = screenVerts[i1], s2 = screenVerts[i2]
        // Cull if any vertex is behind camera
        if (s0[2] >= 0 || s1[2] >= 0 || s2[2] >= 0) return

        // Back-face cull (screen-space winding)
        const ex = s1[0] - s0[0], ey = s1[1] - s0[1]
        const fx = s2[0] - s0[0], fy = s2[1] - s0[1]
        if (ex * fy - ey * fx < 0) return

        // World-space face normal
        const e1 = sub3(worldVerts[i1], worldVerts[i0])
        const e2 = sub3(worldVerts[i2], worldVerts[i0])
        const n = norm3(cross3(e1, e2))

        // Face center
        const fc: Vec3 = scale3(add3(add3(worldVerts[i0], worldVerts[i1]), worldVerts[i2]), 1/3)

        // Lighting
        const lightDir = norm3(sub3(lightPos, fc))
        const viewDir = norm3(sub3(eye, fc))
        const diffuse = Math.max(0, dot3(n, lightDir))

        const halfVec = norm3(add3(lightDir, viewDir))
        const specular = Math.pow(Math.max(0, dot3(n, halfVec)), 32)

        const depth = (s0[2] + s1[2] + s2[2]) / 3

        drawFaces.push({
          poly: [[s0[0], s0[1]], [s1[0], s1[1]], [s2[0], s2[1]]],
          depth,
          hue: c.hueBase + fv * 40,
          diffuse,
          specular,
          alpha: 0.55 + fv * 0.3,
        })
      })
    })

    // Painter's algorithm: back to front
    drawFaces.sort((a, b) => a.depth - b.depth)

    drawFaces.forEach(f => {
      const lum = 18 + f.diffuse * 52
      const sat = 70 + f.diffuse * 25
      const alpha = f.alpha * (0.4 + f.diffuse * 0.6)

      ctx.beginPath()
      ctx.moveTo(f.poly[0][0], f.poly[0][1])
      ctx.lineTo(f.poly[1][0], f.poly[1][1])
      ctx.lineTo(f.poly[2][0], f.poly[2][1])
      ctx.closePath()

      // Face fill: diffuse shading
      ctx.fillStyle = `hsla(${f.hue},${sat}%,${lum}%,${alpha})`
      ctx.fill()

      // Edge with slight glow
      ctx.strokeStyle = `hsla(${f.hue + 30},90%,${55 + f.diffuse * 35}%,${0.25 + f.diffuse * 0.35})`
      ctx.lineWidth = 0.6
      ctx.stroke()

      // Specular highlight overlay
      if (f.specular > 0.05) {
        ctx.beginPath()
        ctx.moveTo(f.poly[0][0], f.poly[0][1])
        ctx.lineTo(f.poly[1][0], f.poly[1][1])
        ctx.lineTo(f.poly[2][0], f.poly[2][1])
        ctx.closePath()
        ctx.fillStyle = `rgba(255,255,255,${f.specular * 0.55})`
        ctx.fill()
      }
    })

    // Light source glow indicator
    const lp = project(lightPos, eye, axes, fov, cx, cy, size)
    if (lp[2] < 0) {
      const grd = ctx.createRadialGradient(lp[0], lp[1], 0, lp[0], lp[1], 28 + bass * 18)
      grd.addColorStop(0, `rgba(255,230,160,${0.55 + bass * 0.3})`)
      grd.addColorStop(1, 'rgba(255,180,80,0)')
      ctx.beginPath()
      ctx.arc(lp[0], lp[1], 28 + bass * 18, 0, Math.PI * 2)
      ctx.fillStyle = grd
      ctx.fill()
    }
  }, [width, height])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = 'hsl(260,30%,4%)'
    ctx.fillRect(0, 0, width, height)
    rotRef.current = CRYSTALS.map(c => [...c.rot] as Vec3)
    camRef.current = { phi: 0.35, theta: 0, thetaVel: 0.004, phiVel: 0, rVel: 0, r: 5.5 }
    tRef.current = 0
  }, [width, height])

  useEffect(() => {
    if (!isListening) return
    return onTick(draw)
  }, [isListening, onTick, draw])

  return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block' }} />
}
