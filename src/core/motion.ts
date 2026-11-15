// 減少動畫：跟著手機／電腦系統的「減少動態」設定（遊戲裡不另外提供開關）。
// 舊存檔裡的 settings.reduceMotion 保留但不再使用，避免以前開過的人關不掉。
export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
