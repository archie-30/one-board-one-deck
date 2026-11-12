// 對手的名字、一句話個性與長相。順序對應 src/engine/common/personas.ts 的打法。
import type { KidLook } from '@/ui/art/kid'

export interface OpponentProfile {
  name: string
  /** 顯示在名字下方的個性 */
  tag: string
  look: KidLook
}

export const OPPONENTS: OpponentProfile[] = [
  { name: '阿明', tag: '中規中矩', look: { head: 'round', hair: 'tuft', eyes: 'dot', tone: 'gray', extra: 'none' } },
  { name: '小美', tag: '精打細算', look: { head: 'round', hair: 'bob', eyes: 'pill', tone: 'indigo', extra: 'glasses' } },
  { name: '老王', tag: '見牌就壓', look: { head: 'square', hair: 'bald', eyes: 'angry', tone: 'kraft', extra: 'mustache' } },
  { name: '阿豪', tag: '炸彈狂', look: { head: 'square', hair: 'spike', eyes: 'dot', tone: 'red', extra: 'band' } },
  { name: '小花', tag: '佛系', look: { head: 'round', hair: 'bun', eyes: 'sleepy', tone: 'moss', extra: 'flower' } },
  { name: '阿土伯', tag: '老派', look: { head: 'round', hair: 'bald', eyes: 'sleepy', tone: 'kraft', extra: 'cap' } },
  { name: '美玲', tag: '穩紮穩打', look: { head: 'round', hair: 'long', eyes: 'pill', tone: 'gray', extra: 'none' } },
  { name: '志明', tag: '一把梭', look: { head: 'square', hair: 'tuft', eyes: 'dot', tone: 'indigo', extra: 'none' } },
  { name: '春嬌', tag: '先聲奪人', look: { head: 'round', hair: 'pony', eyes: 'pill', tone: 'red', extra: 'bow' } },
  { name: '阿福', tag: '憑運氣', look: { head: 'round', hair: 'cone', eyes: 'cross', tone: 'marker', extra: 'none' } },
  { name: '小胖', tag: '慢熟', look: { head: 'wide', hair: 'tuft', eyes: 'dot', tone: 'marker', extra: 'none' } },
  { name: '阿珠', tag: '見縫插針', look: { head: 'round', hair: 'bob', eyes: 'angry', tone: 'moss', extra: 'none' } },
  { name: '阿雄', tag: '硬碰硬', look: { head: 'square', hair: 'spike', eyes: 'angry', tone: 'gray', extra: 'band' } },
  { name: '秀琴', tag: '細心', look: { head: 'round', hair: 'long', eyes: 'pill', tone: 'indigo', extra: 'glasses' } },
  { name: '建國', tag: '照本宣科', look: { head: 'square', hair: 'part', eyes: 'dot', tone: 'gray', extra: 'tie' } },
  { name: '淑芬', tag: '高手', look: { head: 'round', hair: 'bun', eyes: 'pill', tone: 'ink', extra: 'glasses' } },
  { name: '阿寶', tag: '新手', look: { head: 'wide', hair: 'tuft', eyes: 'big', tone: 'moss', extra: 'none' } },
  { name: '小黑', tag: '深藏不露', look: { head: 'round', hair: 'hood', eyes: 'pill', tone: 'ink', extra: 'none' } },
  { name: '阿達', tag: '急性子', look: { head: 'square', hair: 'spike', eyes: 'big', tone: 'red', extra: 'none' } },
  { name: '阿蓮', tag: '溫柔難纏', look: { head: 'round', hair: 'pony', eyes: 'sleepy', tone: 'indigo', extra: 'flower' } },
]

export const OPPONENT_NAMES = OPPONENTS.map((o) => o.name)

/** 玩家自己的塗鴉小人（INKRAGE 主角的親戚：尖帽、直立的眼睛、紅圍巾） */
export const PLAYER_LOOK: KidLook = { head: 'tall', hair: 'cone', eyes: 'pill', tone: 'gray', extra: 'scarf' }
