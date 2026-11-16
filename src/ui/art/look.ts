// 對手頭像的長相：幾何形狀＋顏色＋花紋，加兩點眼睛
export type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'half' | 'pill' | 'hex' | 'drop'
export type Tone = 'red' | 'blue' | 'yellow' | 'ink' | 'card'
export type Fill = 'solid' | 'dots' | 'stripes' | 'checker' | 'grid' | 'split'
/** 頭像飾品（玩家自己的頭像才有；對手沒有） */
export type Acc = 'none' | 'blush' | 'glasses' | 'mustache' | 'bow' | 'party' | 'shades' | 'headphones' | 'monocle' | 'halo' | 'crown'
export interface Look {
  shape: Shape
  tone: Tone
  fill: Fill
  acc?: Acc
}
export type Mood = 'idle' | 'think' | 'happy' | 'sad' | 'smug' | 'shock'
