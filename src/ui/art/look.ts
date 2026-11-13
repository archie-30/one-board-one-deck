// 對手頭像的長相：幾何形狀＋顏色＋花紋，加兩點眼睛
export type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'half' | 'pill'
export type Tone = 'red' | 'blue' | 'yellow' | 'ink' | 'card'
export type Fill = 'solid' | 'dots' | 'stripes'
export interface Look {
  shape: Shape
  tone: Tone
  fill: Fill
}
export type Mood = 'idle' | 'think' | 'happy' | 'sad' | 'smug' | 'shock'
