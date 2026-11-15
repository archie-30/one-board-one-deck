// 進入遊戲的過場：整張模式卡片拿起來移到中間 → 翻面 → 背面（分類色＋遊戲名稱）展開成整個畫面
// → 等遊戲畫面真的準備好 → 往上揭開。
// 過場層放在 App 最上層（不跟著換頁消失），所以不會出現「動畫跑完了遊戲還沒出來」的空白。
// 離開遊戲時反過來：色塊由上往下蓋住畫面 → 換回模式選單 → 縮成卡片背面 → 翻回正面 → 飛回卡片堆裡。
import { markRaw, shallowReactive, watch } from 'vue'

interface Launch {
  active: boolean
  /** enter = 進入遊戲；exit = 離開遊戲 */
  mode: 'enter' | 'exit'
  /** 離開時要飛回去的那張卡片是哪個遊戲（模式選單會先把它藏起來） */
  gameId: string
  key: number
  rect: { left: number; top: number; width: number; height: number }
  color: string
  /** 被點的那張卡片（複製一份來做動畫） */
  card: HTMLElement | null
  name: string
  label: string
}

export const launch = shallowReactive<Launch>({ active: false, mode: 'enter', gameId: '', key: 0, rect: { left: 0, top: 0, width: 0, height: 0 }, color: '', card: null, name: '', label: '' })

let grown: (() => void) | null = null
let reveal: (() => void) | null = null

/** 開始過場；回傳的 Promise 在卡片背面展開到整個畫面時完成 */
export function startLaunch(card: HTMLElement, color: string, name: string, label: string): Promise<void> {
  const r = card.getBoundingClientRect()
  Object.assign(launch, { active: true, mode: 'enter', gameId: '', key: launch.key + 1, rect: { left: r.left, top: r.top, width: r.width, height: r.height }, color, card: markRaw(card), name, label })
  return new Promise((resolve) => (grown = resolve))
}

let covered: (() => void) | null = null
/**
 * 離開遊戲；回傳的 Promise 在色塊蓋滿畫面時完成（呼叫的人這時候換頁），
 * 換頁後過場層會自己找到模式選單上那張卡片，縮小、翻面、飛回去。
 */
export function startExit(gameId: string, color: string, name: string, label: string): Promise<void> {
  Object.assign(launch, { active: true, mode: 'exit', gameId, key: launch.key + 1, color, card: null, name, label })
  return new Promise((resolve) => (covered = resolve))
}
export function notifyCovered() {
  covered?.()
  covered = null
}

/** 過場層呼叫：已經放滿 */
export function notifyGrown() {
  grown?.()
  grown = null
}

/** 過場層呼叫：註冊「揭開」要做的事 */
export function onReveal(fn: (() => void) | null) {
  reveal = fn
}

/** 對局畫面準備好時呼叫：揭開過場 */
export function revealLaunch() {
  if (launch.active) reveal?.()
}

/** 等進場的色塊揭開、看得到遊戲畫面之後才繼續（開局的發牌動畫要讓玩家看得到） */
export function afterReveal(): Promise<void> {
  if (!launch.active || launch.mode !== 'enter') return Promise.resolve()
  return new Promise((resolve) => {
    const stop = watch(
      () => launch.active,
      (on) => {
        if (on) return
        stop()
        resolve()
      },
    )
  })
}

export function endLaunch() {
  launch.active = false
}
