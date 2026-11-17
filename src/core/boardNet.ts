// 棋類連線對局的共用部分（五子棋、圍棋、黑白棋、西洋棋、象棋、暗棋）。
//   猜拳：自己出拳送給伺服器，兩邊都出了伺服器送回結果；贏的人先走（引擎的 0 號）。
//   之後伺服器送來的每一步照順序交給畫面（apply）；畫面播完動畫再呼叫 next() 拿下一步。
//   悔棋：申請（askUndo）→ 對方跳視窗同意或不同意（answerUndo）；同意的話伺服器送來 undo，畫面退回去。
//   認輸：送 resign，伺服器送回來後畫面結算。
// 引擎的座位（side）：0 = 先走、1 = 後走。mySide 是自己這一邊（猜拳之後才知道）。
import { reactive, ref } from 'vue'
import type { RpsHand } from '@/engine/common/rps'
import type { RemoteRps } from '@/ui/RpsDuel.vue'
import { joinLiveMatch, matchOpponents, sendAct, type LiveMatch } from './onlineMatch'

export interface BoardNetHooks {
  /** 一步棋（落子、走子、虛手、逾時…）：畫面套用、播完動畫後呼叫 next() */
  apply(ev: { type: string; player: number } & Record<string, unknown>): void
  /** 悔棋：by 這一方退回到他上一手之前（畫面算好、播完動畫後呼叫 next()） */
  undo(by: number): void
  /** 認輸：player 這一方認輸 */
  resign?(player: number): void
  /** 結束攤牌（圍棋要用伺服器算的死活）；沒給就不管 */
  end?(final: unknown): void
}

export function useBoardNet(gameId: string, hooks: BoardNetHooks) {
  const net = joinLiveMatch(gameId)
  if (!net) return null
  const m: LiveMatch = net
  const opponent = matchOpponents(m)[0]
  /** 自己這一邊（0 先走、1 後走；猜拳前 -1） */
  const mySide = ref(-1)
  const rps = reactive<RemoteRps>({ round: 0, theirPicked: false, result: null })
  /** 對方在問能不能悔棋 */
  const undoAsked = ref(false)
  /** 自己申請了悔棋，在等對方回答 */
  const undoWaiting = ref(false)
  /** 對方不同意（顯示一下） */
  const undoRefused = ref(0)
  const undoUsed = ref(false)
  /** 等伺服器確認自己送的動作 */
  const sending = ref(false)

  let waiting = false
  m.onEvent = () => {
    if (!waiting) return
    waiting = false
    next()
  }
  m.onReject = () => {
    sending.value = false
  }

  /** 拿下一個伺服器送來的動作；還沒有就等 */
  function next(): void {
    const e = m.queue.shift()
    if (!e) {
      waiting = true
      return
    }
    if (e.end) {
      hooks.end?.(e.ev)
      return next()
    }
    const ev = e.ev as { type: string; player: number; seat?: number; by?: number; winner?: number; hands?: (RpsHand | null)[] } & Record<string, unknown>
    switch (ev.type) {
      case 'rpsPicked':
        if (ev.seat !== m.seat) rps.theirPicked = true
        return next()
      case 'rps': {
        const hands = ev.hands ?? [null, null]
        const mine = hands[m.seat] ?? null
        const theirs = hands[1 - m.seat] ?? null
        const w = ev.winner ?? -1
        rps.result = { mine, theirs, outcome: w < 0 ? 0 : w === m.seat ? 1 : -1 }
        rps.round++
        rps.theirPicked = false
        if (w < 0) return next()
        // 贏的人先走：自己是不是引擎的 0 號。畫面看完猜拳結果（startAfterRps）再呼叫 next()
        mySide.value = w === m.seat ? 0 : 1
        return
      }
      case 'undoAsk':
        if (ev.by === mySide.value) undoWaiting.value = true
        else undoAsked.value = true
        return next()
      case 'undoNo':
        undoAsked.value = false
        if (ev.by === mySide.value) {
          undoWaiting.value = false
          undoRefused.value++
        }
        return next()
      case 'undo':
        undoAsked.value = false
        if (ev.by === mySide.value) ((undoWaiting.value = false), (undoUsed.value = true))
        return hooks.undo(ev.by!)
      case 'resign':
        sending.value = false
        if (hooks.resign) return hooks.resign(ev.player)
        return next()
      default:
        if (ev.player === mySide.value) sending.value = false
        return hooks.apply(ev)
    }
  }

  /** 送出自己的一步（伺服器確認後會送回來，那時才真的走） */
  function send(a: Record<string, unknown>): boolean {
    if (sending.value) return false
    sending.value = true
    sendAct(a)
    return true
  }
  // 一開局就開始聽（猜拳的結果也是伺服器送來的）
  next()
  return {
    net: m,
    opponent,
    mySide,
    rps,
    undoAsked,
    undoWaiting,
    undoRefused,
    undoUsed,
    sending,
    next,
    send,
    pickRps: (hand: RpsHand) => sendAct({ type: 'rps', hand }),
    askUndo: () => !undoWaiting.value && !undoUsed.value && sendAct({ type: 'undo' }),
    answerUndo(ok: boolean) {
      undoAsked.value = false
      sendAct({ type: 'undoReply', ok })
    },
    resign: () => sendAct({ type: 'resign' }),
    stop() {
      m.onEvent = m.onReject = null
    },
  }
}
export type BoardNet = NonNullable<ReturnType<typeof useBoardNet>>
