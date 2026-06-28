import { CrystalVisualizer } from './CrystalVisualizer'
import { HallVisualizer } from './HallVisualizer'
import { PaintVisualizer } from './PaintVisualizer'
import { SumiVisualizer } from './SumiVisualizer'
import { BreathVisualizer } from './BreathVisualizer'
import { MyceliumVisualizer } from './MyceliumVisualizer'
import { MembraneVisualizer } from './MembraneVisualizer'
import { SwarmVisualizer } from './SwarmVisualizer'
import { NeuralVisualizer } from './NeuralVisualizer'
import { AuroraVisualizer } from './AuroraVisualizer'
import { BloomVisualizer } from './BloomVisualizer'
import { VascularVisualizer } from './VascularVisualizer'
import { FlockVisualizer } from './FlockVisualizer'
import { GlazeVisualizer } from './GlazeVisualizer'
import type { VisualizerDef } from './types'

export const VISUALIZERS: VisualizerDef[] = [
  {
    id: 'glaze',
    name: 'GLAZE',
    description: '照りと焼き目、滴るみずみずしい果実',
    accent: '#fb7185',
    component: GlazeVisualizer,
  },
  {
    id: 'flock',
    name: 'FLOCK',
    description: '3D空間を舞う極彩色の鳥の群れ',
    accent: '#22d3ee',
    component: FlockVisualizer,
  },
  {
    id: 'hall',
    name: 'HALL',
    description: '奥へと続く無限の幻廊',
    accent: '#e879f9',
    component: HallVisualizer,
  },
  {
    id: 'crystal',
    name: 'CRYSTAL',
    description: '光源とカメラで輝く3Dクリスタル',
    accent: '#a78bfa',
    component: CrystalVisualizer,
  },
  {
    id: 'sumi',
    name: 'SUMI',
    description: '墨が水面に落ち、静かに反射する',
    accent: '#374151',
    component: SumiVisualizer,
  },
  {
    id: 'paint',
    name: 'PAINT',
    description: '音で筆が走る抽象表現主義の絵画',
    accent: '#f97316',
    component: PaintVisualizer,
  },
  {
    id: 'breath',
    name: 'BREATH',
    description: '呼吸し、脈打つ一つの細胞',
    accent: '#60a5fa',
    component: BreathVisualizer,
  },
  {
    id: 'mycelium',
    name: 'MYCELIUM',
    description: '音で成長する菌糸のネットワーク',
    accent: '#34d399',
    component: MyceliumVisualizer,
  },
  {
    id: 'membrane',
    name: 'MEMBRANE',
    description: '音の振動が伝わる生体膜',
    accent: '#2dd4bf',
    component: MembraneVisualizer,
  },
  {
    id: 'swarm',
    name: 'SWARM',
    description: '音に散乱・収束する群れ',
    accent: '#c084fc',
    component: SwarmVisualizer,
  },
  {
    id: 'neural',
    name: 'NEURAL',
    description: '充電・発火するニューロン網',
    accent: '#38bdf8',
    component: NeuralVisualizer,
  },
  {
    id: 'aurora',
    name: 'AURORA',
    description: '周波数帯が描くオーロラの帯',
    accent: '#4ade80',
    component: AuroraVisualizer,
  },
  {
    id: 'bloom',
    name: 'BLOOM',
    description: '音とともに開く重なる花弁',
    accent: '#fb923c',
    component: BloomVisualizer,
  },
  {
    id: 'vascular',
    name: 'VASCULAR',
    description: '拍動が広がる血管ネットワーク',
    accent: '#f87171',
    component: VascularVisualizer,
  },
]
