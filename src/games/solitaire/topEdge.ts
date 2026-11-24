// 三種接龍的牌桌：最上面一排牌離螢幕上緣多遠（px）。
// 手機上從螢幕最上緣往下滑＝拉出狀態列（系統手勢），牌太靠上的話，一拖牌就把狀態列叫出來（使用者回報）。
// 所以觸控裝置多留一點，讓手指按下去的地方在系統手勢的範圍外；有滑鼠的照舊。
export const TOP_EDGE_MOUSE = 14
export const TOP_EDGE_TOUCH = 38
export const topEdge = (): number =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? TOP_EDGE_TOUCH : TOP_EDGE_MOUSE
