// 對手的名字、一句話個性與頭像（幾何形狀＋顏色＋花紋）。順序對應 src/engine/common/personas.ts 的打法。
import type { Look } from '@/ui/art/look'

export interface OpponentProfile {
  name: string
  /** 顯示在名字下方的個性 */
  tag: string
  look: Look
}

export const OPPONENTS: OpponentProfile[] = [
  { name: '阿明', tag: '中規中矩', look: { shape: 'circle', tone: 'red', fill: 'solid' } },
  { name: '小美', tag: '精打細算', look: { shape: 'pill', tone: 'blue', fill: 'dots' } },
  { name: '老王', tag: '見牌就壓', look: { shape: 'square', tone: 'ink', fill: 'solid' } },
  { name: '阿豪', tag: '炸彈狂', look: { shape: 'triangle', tone: 'red', fill: 'stripes' } },
  { name: '小花', tag: '佛系', look: { shape: 'half', tone: 'yellow', fill: 'dots' } },
  { name: '阿土伯', tag: '老派', look: { shape: 'square', tone: 'yellow', fill: 'stripes' } },
  { name: '美玲', tag: '穩紮穩打', look: { shape: 'pill', tone: 'card', fill: 'dots' } },
  { name: '志明', tag: '一把梭', look: { shape: 'diamond', tone: 'blue', fill: 'solid' } },
  { name: '春嬌', tag: '先聲奪人', look: { shape: 'circle', tone: 'yellow', fill: 'solid' } },
  { name: '阿福', tag: '憑運氣', look: { shape: 'triangle', tone: 'card', fill: 'dots' } },
  { name: '小胖', tag: '慢熟', look: { shape: 'half', tone: 'red', fill: 'dots' } },
  { name: '阿珠', tag: '見縫插針', look: { shape: 'diamond', tone: 'yellow', fill: 'dots' } },
  { name: '阿雄', tag: '硬碰硬', look: { shape: 'triangle', tone: 'ink', fill: 'solid' } },
  { name: '秀琴', tag: '細心', look: { shape: 'circle', tone: 'blue', fill: 'stripes' } },
  { name: '建國', tag: '照本宣科', look: { shape: 'square', tone: 'card', fill: 'solid' } },
  { name: '淑芬', tag: '高手', look: { shape: 'diamond', tone: 'ink', fill: 'dots' } },
  { name: '阿寶', tag: '新手', look: { shape: 'circle', tone: 'card', fill: 'stripes' } },
  { name: '小黑', tag: '深藏不露', look: { shape: 'pill', tone: 'ink', fill: 'stripes' } },
  { name: '阿達', tag: '急性子', look: { shape: 'triangle', tone: 'yellow', fill: 'solid' } },
  { name: '阿蓮', tag: '溫柔難纏', look: { shape: 'half', tone: 'blue', fill: 'stripes' } },
]

export const OPPONENT_NAMES = OPPONENTS.map((o) => o.name)

/** 玩家自己的頭像：黑色圓形 */
export const PLAYER_LOOK: Look = { shape: 'circle', tone: 'ink', fill: 'solid' }
