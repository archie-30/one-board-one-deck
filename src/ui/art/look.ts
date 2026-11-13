// 對手頭像的長相：幾何形狀＋顏色，加兩點眼睛（fill 保留給舊資料，畫面上已不使用）
export type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'half' | 'pill'
export type Tone = 'red' | 'blue' | 'yellow' | 'ink' | 'card'
export type Fill = 'solid' | 'dots' | 'stripes'
export interface Look {
  shape: Shape
  tone: Tone
  fill: Fill
}
export type Mood = 'idle' | 'think' | 'happy' | 'sad' | 'smug' | 'shock'
