import { VISUALIZERS } from '../visualizers'
import type { VisualizerDef } from '../visualizers/types'
import './TopPage.css'

interface Props {
  onSelect: (id: string) => void
}

export function TopPage({ onSelect }: Props) {
  return (
    <div className="top">
      <header className="top-header">
        <h1>AUDIO VISUAL</h1>
        <p>マイクの音に反応するアート</p>
      </header>

      <div className="card-grid">
        {VISUALIZERS.map((v: VisualizerDef) => (
          <button key={v.id} className="card" onClick={() => onSelect(v.id)} style={{ '--accent': v.accent } as React.CSSProperties}>
            <div className="card-icon">
              <CardIcon id={v.id} accent={v.accent} />
            </div>
            <div className="card-body">
              <span className="card-name">{v.name}</span>
              <span className="card-desc">{v.description}</span>
            </div>
            <span className="card-arrow">→</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function CardIcon({ id, accent }: { id: string; accent: string }) {
  const s = { stroke: accent, fill: 'none', strokeWidth: 1.5 }

  if (id === 'sumi') return (
    <svg viewBox="0 0 48 48" width="48" height="48">
      <rect x="4" y="4" width="40" height="40" rx="3" fill="hsl(44,16%,93%)" />
      {/* water line */}
      <line x1="4" y1="27" x2="44" y2="27" stroke="hsl(210,18%,68%)" strokeWidth="0.6" opacity={0.5} />
      {/* ink strokes above */}
      {[
        [11, 13, 4, 14, 0.82], [18, 10, 3, 17, 0.90], [25, 14, 3.5, 13, 0.78],
        [32, 11, 3, 16, 0.88], [38, 16, 2.5, 11, 0.72],
      ].map(([x, top, w, h, a], i) => (
        <rect key={i} x={x - (w as number)/2} y={top} width={w} height={h} fill="hsl(0,0%,6%)" opacity={a} rx={0.5} />
      ))}
      {/* reflections below */}
      {[
        [11, 27, 3, 9, 0.28], [18, 27, 2.5, 11, 0.32], [25, 27, 3, 8, 0.25],
        [32, 27, 2.5, 10, 0.30], [38, 27, 2, 7, 0.22],
      ].map(([x, y, w, h, a], i) => (
        <rect key={i} x={(x as number) - (w as number)/2 + (i%2===0?0.5:-0.5)} y={y} width={w} height={h} fill="hsl(0,0%,18%)" opacity={a} rx={0.5} />
      ))}
      {/* splatter dots */}
      {[[8,18],[15,8],[22,20],[35,9],[41,22]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r={0.8} fill="hsl(0,0%,5%)" opacity={0.5} />
      ))}
    </svg>
  )

  if (id === 'paint') return (
    <svg viewBox="0 0 48 48" width="48" height="48">
      <rect x="4" y="4" width="40" height="40" rx="3" fill="hsl(44,28%,91%)" />
      {[
        [8,  14, 0.6,  18, 4, 28, 90, 52, 0.85],
        [22, 10, 0.4,  22, 5, 38, 92, 60, 0.80],
        [36, 18,-0.5,  16, 3,  6, 82, 44, 0.80],
        [12, 26, 1.0,  20, 4, 28, 90, 52, 0.75],
        [30, 30,-0.3,  24, 5, 50, 95, 58, 0.82],
        [10, 38, 0.7,  18, 3,128, 58, 18, 0.78],
        [28, 22, 0.2,  14, 3, 45, 28, 90, 0.70],
        [40, 36,-0.8,  16, 4,  6, 82, 44, 0.75],
        [18, 20,-0.4,  12, 2, 45, 28, 92, 0.65],
        [34, 12, 0.9,  10, 3,140, 44, 42, 0.72],
      ].map(([x, y, a, l, w, h, s, lum, alpha], i) => {
        const cos = Math.cos(a as number), sin = Math.sin(a as number)
        const hx = (l as number)/2
        const x1 = (x as number) + cos*hx, y1 = (y as number) + sin*hx
        const x2 = (x as number) - cos*hx, y2 = (y as number) - sin*hx
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={`hsl(${h},${s}%,${lum}%)`} strokeWidth={w as number}
          strokeLinecap="round" opacity={alpha as number} />
      })}
    </svg>
  )

  if (id === 'breath') return (
    <svg viewBox="0 0 48 48" width="48" height="48">
      <circle cx="24" cy="24" r="13" {...s} opacity={0.5} />
      <circle cx="24" cy="24" r="7.5" {...s} opacity={0.35} />
      {Array.from({length: 12}, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        return <line key={i} x1={24+Math.cos(a)*13} y1={24+Math.sin(a)*13} x2={24+Math.cos(a)*(13+3+i%3*2)} y2={24+Math.sin(a)*(13+3+i%3*2)} stroke={accent} strokeWidth={1} strokeLinecap="round" />
      })}
      <circle cx="24" cy="24" r="3" fill={accent} opacity={0.85} />
    </svg>
  )

  if (id === 'mycelium') return (
    <svg viewBox="0 0 48 48" width="48" height="48">
      {[[-14,-10],[14,-12],[-12,14],[16,10]].map(([dx,dy],i) => (
        <line key={i} x1="24" y1="24" x2={24+dx} y2={24+dy} {...s} strokeLinecap="round" />
      ))}
      <line x1={24-14} y1={24-10} x2={24-20} y2={24-4} {...s} opacity={0.5} strokeLinecap="round" />
      <line x1={24-14} y1={24-10} x2={24-8} y2={24-18} {...s} opacity={0.5} strokeLinecap="round" />
      <line x1={24+14} y1={24-12} x2={24+20} y2={24-6} {...s} opacity={0.5} strokeLinecap="round" />
      {[[4,20],[16,6],[44,18],[4,38]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r={1.5} fill={accent} opacity={0.85} />
      ))}
    </svg>
  )

  if (id === 'membrane') return (
    <svg viewBox="0 0 48 48" width="48" height="48">
      {[0,1,2,3].map(row => [0,1,2,3,4].map(col => {
        const bx = 5 + col * 9.5, by = 11 + row * 8.5
        const wave = Math.sin(col * 1.3 + row * 0.9) * 4
        return <circle key={`${row}-${col}`} cx={bx} cy={by+wave} r={1.3} fill={accent} opacity={0.45+Math.abs(Math.sin(col+row))*0.45} />
      }))}
      {[0,1,2,3].map(row => [0,1,2,3].map(col => {
        const x1=5+col*9.5, y1=11+row*8.5+Math.sin(col*1.3+row*0.9)*4
        const x2=5+(col+1)*9.5, y2=11+row*8.5+Math.sin((col+1)*1.3+row*0.9)*4
        return <line key={`h${row}-${col}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={accent} strokeWidth={0.7} opacity={0.28} />
      }))}
    </svg>
  )

  if (id === 'swarm') return (
    <svg viewBox="0 0 48 48" width="48" height="48">
      {[[12,14],[18,10],[8,22],[16,26],[10,32],[36,12],[40,20],[34,28],[42,32],[30,36],[22,18],[26,24],[20,38],[28,40],[24,32]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r={1.8} fill={accent} opacity={0.35+(i%3)*0.22} />
      ))}
      {[[12,14,18,10],[8,22,16,26],[36,12,40,20],[34,28,42,32]].map(([x1,y1,x2,y2],i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={accent} strokeWidth={0.8} opacity={0.22} />
      ))}
    </svg>
  )

  if (id === 'neural') return (
    <svg viewBox="0 0 48 48" width="48" height="48">
      {[[10,12],[38,10],[8,30],[40,32],[24,22],[14,42],[36,44]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r={2.2} fill={accent} opacity={0.5+(i%3)*0.18} />
      ))}
      {[[10,12,24,22],[38,10,24,22],[8,30,24,22],[40,32,24,22],[24,22,14,42],[24,22,36,44],[10,12,8,30],[38,10,40,32]].map(([x1,y1,x2,y2],i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={accent} strokeWidth={0.8} opacity={0.2} />
      ))}
      <circle cx="24" cy="22" r="3" fill={accent} opacity={0.9} />
    </svg>
  )

  if (id === 'aurora') return (
    <svg viewBox="0 0 48 48" width="48" height="48">
      {[
        { y: 12, amps: [2,3,2], hOff: 0 },
        { y: 20, amps: [3,2,3], hOff: 30 },
        { y: 28, amps: [2,4,2], hOff: 60 },
        { y: 36, amps: [3,2,3], hOff: 90 },
      ].map((band, bi) => {
        const pts = [4,13,22,31,40].map((x,i) => `${x},${band.y + band.amps[Math.min(i,2)]*Math.sin(i*1.2+bi)*1.2}`)
        return <polyline key={bi} points={pts.join(' ')} fill="none" stroke={accent} strokeWidth={1.2} opacity={0.3+bi*0.18} strokeLinecap="round" strokeLinejoin="round" />
      })}
    </svg>
  )

  if (id === 'bloom') return (
    <svg viewBox="0 0 48 48" width="48" height="48">
      {[0,1,2,3,4,5,6,7].map(i => {
        const a = (i/8)*Math.PI*2
        const tx = 24+Math.cos(a)*16, ty = 24+Math.sin(a)*16
        const c1x = 24+Math.cos(a-0.35)*7, c1y = 24+Math.sin(a-0.35)*7
        const c2x = 24+Math.cos(a+0.35)*7, c2y = 24+Math.sin(a+0.35)*7
        return <path key={i} d={`M24,24 C${c1x},${c1y} ${c1x},${c1y} ${tx},${ty} C${c2x},${c2y} ${c2x},${c2y} 24,24Z`} fill={accent} stroke="none" opacity={0.28+i%2*0.15} />
      })}
      {[0,1,2,3].map(i => {
        const a = (i/4)*Math.PI*2+0.4
        const tx = 24+Math.cos(a)*9, ty = 24+Math.sin(a)*9
        return <path key={i} d={`M24,24 C${24+Math.cos(a-0.5)*4},${24+Math.sin(a-0.5)*4} ${24+Math.cos(a+0.5)*4},${24+Math.sin(a+0.5)*4} ${tx},${ty}Z`} fill={accent} stroke="none" opacity={0.5} />
      })}
      <circle cx="24" cy="24" r="2.5" fill={accent} opacity={0.95} />
    </svg>
  )

  // vascular
  return (
    <svg viewBox="0 0 48 48" width="48" height="48">
      {[[-Math.PI/2,-0.35],[Math.PI*0.1,0.35],[Math.PI*0.7,-0.35],[-Math.PI*0.9,0.35],[Math.PI*1.3,-0.35]].map(([a0,_], ti) => {
        const len1 = 10, len2 = 6, spread = 0.38
        const x1=24, y1=24
        const x2=x1+Math.cos(a0)*len1, y2=y1+Math.sin(a0)*len1
        const x3l=x2+Math.cos(a0-spread)*len2, y3l=y2+Math.sin(a0-spread)*len2
        const x3r=x2+Math.cos(a0+spread)*len2, y3r=y2+Math.sin(a0+spread)*len2
        return (
          <g key={ti}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={accent} strokeWidth={2} opacity={0.7} strokeLinecap="round" />
            <line x1={x2} y1={y2} x2={x3l} y2={y3l} stroke={accent} strokeWidth={1.1} opacity={0.45} strokeLinecap="round" />
            <line x1={x2} y1={y2} x2={x3r} y2={y3r} stroke={accent} strokeWidth={1.1} opacity={0.45} strokeLinecap="round" />
          </g>
        )
      })}
      <circle cx="24" cy="24" r="3" fill={accent} opacity={0.9} />
    </svg>
  )
}
