<script lang="ts">
/** 這次是不是從另一個分類切過來的（新的模式選單一建立就讀掉） */
let swapFlag = false
/** 在房間裡逛模式時，各分類最後停在哪一張（記下當時的房間模式；房間換了模式就不算，改停在新的房間模式） */
const browsed: Partial<Record<string, { id: string; room: string }>> = {}
</script>

<script setup lang="ts">
// 模式選單：左半邊是各模式的卡片，疊成一疊、可以左右滑（最前面那張就是選中的模式），
// 右半邊是選中模式的介紹、最常用的「開始遊戲」大按鈕，以及比較少用的小按鈕（教學、規則、設定）。
// 滑：手指（或滑鼠）按住最前面那張左右拖，放開後換下一張／上一張；也可以點後面露出來的卡片、按左右箭頭。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { back, go, replace } from '@/core/nav'
import { canChangeMode, changeMode, online, recommendMode } from '@/core/online'
import { sendRules } from '@/core/onlineMatch'
import { playSound } from '@/core/audio'
import { buzz } from '@/core/haptics'
import { launch as launchFx, startLaunch } from '@/core/launch'
import { isStaleChunk, reloadForUpdate } from '@/core/staleReload'
import { reducedMotion } from '@/core/motion'
import { fullscreenSettled } from '@/core/fullscreen'
import { gamePrefs, recentAt, settings, stats } from '@/core/settings'
import { S } from '@/data/strings'
import { resolveOptions } from '@/games/options'
import { gamesIn, getGame, seatsOf } from '@/games/registry'
import type { GameCategory } from '@/games/types'
import Icon from '@/ui/art/Icon.vue'
import Btn from '@/ui/Btn.vue'
import IconBtn from '@/ui/IconBtn.vue'
import OnlineDialog from '@/ui/OnlineDialog.vue'
import Tabs from '@/ui/Tabs.vue'

const props = defineProps<{ category: GameCategory }>()
const games = computed(() => gamesIn(props.category))
const n = computed(() => games.value.length)
// 在連線房間裡：一進來停在房間目前的模式；從規則設定、規則說明等頁回來時，停在剛剛看的那張
const seen = browsed[props.category]
// 一律從上次滑到的那張繼續（使用者要的）；房間裡還沒滑過才停在房間的模式
const startId = online.room ? (seen ? seen.id : online.room.gameId || settings.lastGame[props.category]) : settings.lastGame[props.category]
const start = games.value.findIndex((g) => g.id === startId)
/** 目前選中的是第幾張。不繞圈：前面的模式疊在左邊、後面的疊在右邊，到頭尾就停住。 */
const index = ref(start >= 0 ? start : 0)
const game = computed(() => games.value[index.value])
/** 從遊戲退回來：卡片堆不播進場上浮（過場層要量卡片的位置讓卡片飛回去，位置必須一開始就是定位） */
const returning = launchFx.active && launchFx.mode === 'exit'
/**
 * 從遊戲退回來：標題、右邊說明與按鈕不再播進場（上浮、從遮罩滑上來）——
 * 過場的色塊蓋著時就已經放好；不然上浮剛好在卡片飛回去時播完，按鈕會閃一下。
 * 右邊說明換成別的模式之後照常播。
 */
const calmId = ref(returning ? games.value[index.value]?.id ?? '' : '')
/** 從另一個分類切過來：卡片堆從右邊滑進來 */
const swappedIn = swapFlag
swapFlag = false
/** 左上角「換到撲克牌／棋盤」：卡片往左滑出去、右邊淡掉，再換成另一個分類 */
const other = computed<GameCategory>(() => (props.category === 'cards' ? 'board' : 'cards'))
const swapping = ref(false)
function swapCategory() {
  if (swapping.value || locked.value) return
  playSound(other.value === 'cards' ? 'shuffle' : 'stonePick')
  if (reducedMotion()) return replace({ name: 'category', category: other.value })
  swapping.value = true
  window.setTimeout(() => {
    swapFlag = true
    replace({ name: 'category', category: other.value })
  }, 300)
}

/** 難度這類常用設定：直接在這裡選，不用進「規則設定」 */
const quick = computed(() => {
  const d = game.value.settings.find((x) => x.key === 'difficulty')
  return d && d.type === 'choice' ? d : null
})
const quickTick = ref(0)
const quickValue = computed(() => {
  void quickTick.value
  return quick.value ? String(resolveOptions(game.value)[quick.value.key]) : ''
})
function setQuick(v: string) {
  if (!quick.value) return
  gamePrefs(game.value.id).options[quick.value.key] = v
  quickTick.value++
}
/** 近百場戰況：跟著目前選的難度（沒有難度的玩法看全部） */
const recent = computed(() => {
  void quickTick.value
  void stats.recent
  const r = recentAt(game.value.id, quick.value ? quickValue.value : 'all')
  if (!r.n) return S.lobby.recentNone
  return seatsOf(game.value) <= 1 ? S.lobby.recentSolo(r.n, r.w, r.l) : S.lobby.recent(r.n, r.w, r.l, r.d)
})
/** 最高分：跟著目前選的難度變 */
const bestNow = computed(() => {
  void quickTick.value
  return game.value.best ? game.value.best(resolveOptions(game.value)) : 0
})
/** 最高分跳數：每次顯示（換卡片、換難度、回到選單）都從 0 往上數到最高分；沒有最高分就是 0 */
const bestShown = ref(0)
let countRaf = 0
watch(
  [bestNow, () => game.value.id],
  ([to]) => {
    cancelAnimationFrame(countRaf)
    bestShown.value = 0
    if (!to || reducedMotion()) {
      bestShown.value = to
      return
    }
    // 分數越大數得越久一點（0.6～1.1 秒），先快後慢
    const dur = Math.min(1600, 900 + Math.log10(to + 1) * 180)
    // 等右邊的元件浮出來（約 0.25 秒）再開始數，才看得到從 0 開始
    const t0 = performance.now() + 250
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur))
      // 一開始跑很快，接近最高分時慢下來
      bestShown.value = p >= 1 ? to : Math.round(to * (1 - Math.pow(2, -10 * p)))
      if (p < 1) countRaf = requestAnimationFrame(step)
    }
    countRaf = requestAnimationFrame(step)
  },
  { immediate: true },
)
onBeforeUnmount(() => cancelAnimationFrame(countRaf))
const pad = (k: number) => String(k).padStart(2, '0')

/** 換到第 k 張 */
/** 卡片正在拿起來（進遊戲）或飛回來（離開遊戲）：先鎖住所有操作，免得卡片被換掉、動畫對不上 */
const locked = computed(() => launching.value || launchFx.active || !!viewAnim.value)

// ── 條列顯示：左半邊改成一列一列（設定記住，撲克牌、棋盤共用） ──
/** 現在畫的是哪一種 */
const listView = ref(settings.modeView === 'list')
/** 卡片／條列切換：按下去就立刻換格（畫面接著變形） */
const listSwitch = ref(listView.value)
const viewChoices = [
  { value: 'deck', label: S.lobby.deckView },
  { value: 'list', label: S.lobby.listView },
]
/** 切換中（morph）：動畫中整個模式選單鎖住 */
const viewAnim = ref<'' | 'morph'>('')
/** 切換過檢視方式：卡片堆／條列不再播進場上浮（拿掉後 CSS 會重播一次＝閃一下） */
const morphed = ref(false)
const listEl = ref<HTMLElement>()
const rowEls: (HTMLElement | null)[] = []
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, reducedMotion() ? 0 : ms))
const MORPH_MS = 560
/** 看得到的卡片／列：遊戲 id → 在畫面上的位置 */
function visibleRects(els: (HTMLElement | null)[], clip?: DOMRect): Map<string, DOMRect> {
  const out = new Map<string, DOMRect>()
  els.forEach((el, k) => {
    if (!el || !games.value[k]) return
    if (Number(getComputedStyle(el).opacity) < 0.05 || getComputedStyle(el).visibility === 'hidden') return
    const r = el.getBoundingClientRect()
    if (clip && (r.bottom < clip.top + 4 || r.top > clip.bottom - 4)) return
    out.set(games.value[k].id, r)
  })
  return out
}
/**
 * 從舊的位置（old）變形到現在的位置：在原本的 transform 前面加一段「平移＋縮放」，以元素看起來的中心為準，
 * 播完就是原本的樣子（卡片的 3D 位置照舊）。裡面的字先淡掉、後半段才浮出來，壓扁拉長時看不出變形。
 */
function morphFrom(el: HTMLElement, old: DOMRect, delay = 0) {
  const n = el.getBoundingClientRect()
  const parent = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect()
  if (!parent || !n.width || !n.height) return
  const scrollTop = (el.offsetParent as HTMLElement).scrollTop
  // 沒有 transform 時元素的中心（transform 的原點）
  const bx = parent.left + el.offsetLeft + el.offsetWidth / 2
  const by = parent.top + el.offsetTop - scrollTop + el.offsetHeight / 2
  const vx = n.left + n.width / 2 - bx
  const vy = n.top + n.height / 2 - by
  const dx = old.left + old.width / 2 - (n.left + n.width / 2)
  const dy = old.top + old.height / 2 - (n.top + n.height / 2)
  const final = el.style.transform || getComputedStyle(el).transform
  const end = final && final !== 'none' ? final : 'translate(0px, 0px)'
  const start = `translate(${vx + dx}px, ${vy + dy}px) scale(${old.width / n.width}, ${old.height / n.height}) translate(${-vx}px, ${-vy}px) ${end === 'translate(0px, 0px)' ? '' : end}`
  el.animate([{ transform: start }, { transform: end }], { duration: MORPH_MS, delay, easing: 'cubic-bezier(.22,.8,.24,1)', fill: 'backwards' })
  for (const c of el.querySelectorAll<HTMLElement>('.info, .no, .rt, .tags')) c.animate([{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }], { duration: MORPH_MS, delay, fill: 'backwards' })
}
function toggleView() {
  if (locked.value) return
  playSound('tap')
  void setListView(!listSwitch.value)
}
async function setListView(on: boolean) {
  if (locked.value || on === listView.value) return
  listSwitch.value = on
  settings.modeView = on ? 'list' : 'deck'
  viewAnim.value = 'morph'
  morphed.value = true
  // 先記下現在看得到的卡片（或列）在哪裡，換過去之後新的從那裡變形過來
  const before = on ? visibleRects(cardEls) : visibleRects(rowEls, listEl.value?.getBoundingClientRect())
  await nextTick()
  listView.value = on
  await nextTick()
  if (on) scrollToRow(false)
  else {
    cancelAnimationFrame(glideRaf)
    vis.value = index.value
    measure()
    await nextTick()
  }
  if (!reducedMotion()) {
    const els = on ? rowEls : cardEls
    let late = 0
    els.forEach((el, k) => {
      const g = games.value[k]
      if (!el || !g) return
      const old = before.get(g.id)
      if (old) morphFrom(el, old)
      // 原本看不到的：跟在後面淡淡浮上來
      else el.animate([{ opacity: 0, translate: '0 0.8rem' }, { opacity: 1, translate: '0 0' }], { duration: 380, delay: 160 + Math.min(late++, 8) * 40, easing: 'ease-out', fill: 'backwards' })
    })
  }
  await wait(MORPH_MS + 120)
  viewAnim.value = ''
}
// ── 條列的捲動：不用瀏覽器的自由捲動，跟卡片堆一樣用「轉到第幾列」（lp，可以是小數）算每一列的位置。
//    選中的那一列永遠在正中間；滑鼠、手指按住拖（有一點阻力），放手後吸到比較近的那一列並選起來；
//    滾輪一格換一列。列的高度跟著 lp 連續變（中間那列最高），換列時不會先掉下去再彈回來。 ──
const ROW_H = 3.9
const ROW_GROW = 1.7
const ROW_MARGIN = 0.5
const ROW_GAP = 0.6
const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
/** 條列轉到的位置（整數＝停在那一列） */
const lv = ref(index.value)
const listH = ref(0)
/** 拖曳中的位移（px，往上拖是負的） */
const listDrag = ref(0)
const listDragging = ref(false)
/** 中間那一列跟 lp 差多少：0～1 的「有多靠中間」 */
const nearW = (k: number, p: number) => Math.max(0, 1 - Math.abs(k - p))
/** 拖曳換算：手指移動多少 px 算一列（一般列＋間隔，拖起來比手指慢一點＝阻力） */
const rowStep = () => (ROW_H + ROW_GROW * 0.5 + ROW_MARGIN + ROW_GAP) * remPx() * 1.15
const lp = computed(() => {
  let p = lv.value - listDrag.value / rowStep()
  if (p < 0) p *= 0.3
  if (p > n.value - 1) p = n.value - 1 + (p - (n.value - 1)) * 0.3
  return p
})
/** 現在最靠中間的是第幾列（選中的樣式跟著它） */
const listNear = computed(() => Math.min(n.value - 1, Math.max(0, Math.round(lp.value))))
/** 每一列的高度、上下留白（rem） */
function rowStyle(k: number) {
  const w = nearW(k, lp.value)
  return { height: `${ROW_H + ROW_GROW * w}rem`, marginBlock: `${ROW_MARGIN * w}rem` }
}
/** 第 k 列的中心離整串最上面多遠（px） */
function rowCenter(k: number, p: number): number {
  const r = remPx()
  let y = 0
  for (let j = 0; j < k; j++) y += (ROW_H + (ROW_GROW + ROW_MARGIN * 2) * nearW(j, p) + ROW_GAP) * r
  return y + ((ROW_H + (ROW_GROW + ROW_MARGIN * 2) * nearW(k, p)) * r) / 2
}
/** 整串往上移多少，lp 那一列的中心才會在正中間 */
const trackY = computed(() => {
  const p = lp.value
  const a = Math.min(n.value - 1, Math.max(0, Math.floor(p)))
  const b = Math.min(n.value - 1, a + 1)
  const t = Math.min(1, Math.max(0, p - a))
  const c = rowCenter(a, p) * (1 - t) + rowCenter(b, p) * t + (p < 0 ? p : p > n.value - 1 ? p - (n.value - 1) : 0) * rowStep() / 1.15
  return listH.value / 2 - c
})
let listRaf = 0
/** 從現在的位置平順轉到第 target 列 */
function glideList(target: number, instant = false) {
  cancelAnimationFrame(listRaf)
  const from = lp.value
  listDrag.value = 0
  if (instant || reducedMotion() || Math.abs(from - target) < 0.001) {
    lv.value = target
    return
  }
  lv.value = from
  const t0 = performance.now()
  const dur = 380 + Math.min(3, Math.abs(target - from)) * 60
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / dur)
    lv.value = from + (target - from) * (1 - Math.pow(1 - t, 3))
    if (t < 1) listRaf = requestAnimationFrame(step)
  }
  listRaf = requestAnimationFrame(step)
}
onBeforeUnmount(() => cancelAnimationFrame(listRaf))
/** 條列：選中的那一列轉到正中間 */
function scrollToRow(smooth = true) {
  glideList(index.value, !smooth)
}
/** 放手：從放手的位置吸到比較近的那一列（甩得快就順勢多走幾列），選起來 */
function releaseList(vel = 0) {
  const p = lp.value
  const fling = Math.max(-3, Math.min(3, vel * 160))
  const target = Math.min(n.value - 1, Math.max(0, Math.round(p + fling)))
  lv.value = p
  listDrag.value = 0
  listDragging.value = false
  if (target !== index.value) show(target)
  glideList(target)
}
// 經過中間換了一列：輕輕震一下（跟拖卡片一樣）
watch(listNear, () => {
  if (listDragging.value) buzz('slide')
})
/** 按住拖（滑鼠、手指都一樣）；沒拖動就是點一下 */
let rowDragged = false
function onListDown(e: PointerEvent) {
  if ((e.pointerType === 'mouse' && e.button !== 0) || locked.value) return
  cancelAnimationFrame(listRaf)
  const y0 = e.clientY
  const id = e.pointerId
  let moved = false
  let lastY = y0
  let lastT = performance.now()
  let vel = 0
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return
    const dy = ev.clientY - y0
    if (!moved && Math.abs(dy) < 6) return
    if (!moved) {
      moved = true
      listDragging.value = true
    }
    const now = performance.now()
    const dt = Math.max(1, now - lastT)
    // 速度（列／毫秒，往下拖＝往前面的列），稍微平滑
    vel = vel * 0.6 + (-(ev.clientY - lastY) / rowStep() / dt) * 0.4
    lastY = ev.clientY
    lastT = now
    listDrag.value = dy
  }
  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    if (!moved) return
    // 拖過了：這一下不算點到某一列
    rowDragged = true
    window.setTimeout(() => (rowDragged = false), 0)
    // 放手前停了一下：不甩
    releaseList(performance.now() - lastT > 90 ? 0 : vel)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}
/** 滾輪：一格換一列（觸控板慢慢累積到一定量才換） */
let wheelAcc = 0
let wheelAt = 0
function onListWheel(e: WheelEvent) {
  if (locked.value) return
  const now = performance.now()
  if (now - wheelAt > 250) wheelAcc = 0
  wheelAt = now
  wheelAcc += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY
  if (Math.abs(wheelAcc) < 40) return
  const d = Math.sign(wheelAcc)
  wheelAcc = 0
  turn(d)
}

// ── 條列的捲動進度條（照轉到的位置畫，可以拖） ──
const bar = computed(() => {
  const r = remPx()
  const total = (n.value * (ROW_H + ROW_GAP) + ROW_GROW + ROW_MARGIN * 2) * r
  const h = listH.value ? Math.min(1, listH.value / total) : 1
  const p = Math.min(1, Math.max(0, lp.value / Math.max(1, n.value - 1)))
  return { h, top: p * (1 - h) }
})
let barRo: ResizeObserver | undefined
watch(listEl, (el) => {
  barRo?.disconnect()
  if (!el) return
  barRo = new ResizeObserver(() => (listH.value = el.clientHeight))
  barRo.observe(el)
  listH.value = el.clientHeight
})
onBeforeUnmount(() => barRo?.disconnect())
/** 拖把手（或點進度條某處）：照位置轉到那一列附近，放手吸到最近的一列 */
function barDown(e: PointerEvent) {
  const track = e.currentTarget as HTMLElement
  if (locked.value) return
  cancelAnimationFrame(listRaf)
  const rect = track.getBoundingClientRect()
  const thumbH = bar.value.h * rect.height
  const thumbTop = rect.top + bar.value.top * rect.height
  let grab = e.clientY - thumbTop
  if (grab < 0 || grab > thumbH) grab = thumbH / 2
  const to = (y: number) => {
    const f = Math.min(1, Math.max(0, (y - rect.top - grab) / Math.max(1, rect.height - thumbH)))
    lv.value = f * (n.value - 1)
  }
  listDrag.value = 0
  listDragging.value = true
  to(e.clientY)
  track.setPointerCapture(e.pointerId)
  const move = (ev: PointerEvent) => to(ev.clientY)
  const up = () => {
    releaseList(0)
    track.removeEventListener('pointermove', move)
    track.removeEventListener('pointerup', up)
    track.removeEventListener('pointercancel', up)
  }
  track.addEventListener('pointermove', move)
  track.addEventListener('pointerup', up)
  track.addEventListener('pointercancel', up)
}

watch(index, (k) => {
  if (!listView.value || listDragging.value) return
  glideList(k)
})
onMounted(() => listView.value && scrollToRow(false))
function tapRow(k: number) {
  if (locked.value || rowDragged) return
  if (k !== index.value) show(k)
  // 設定「點卡片開始遊戲」關掉時，只能按「開始遊戲」按鈕
  else if (settings.cardStarts) void launch()
}
function show(k: number) {
  if (locked.value) return
  const next = Math.min(n.value - 1, Math.max(0, k))
  if (next === index.value) return
  index.value = next
  settings.lastGame[props.category] = games.value[next].id
  if (online.room) browsed[props.category] = { id: games.value[next].id, room: online.room.gameId }
  playSound('slide')
}
/** 往右（+）或往左（−）換幾張 */
const turn = (d: number) => show(index.value + d)
function open(name: 'play' | 'tutorial' | 'rules' | 'settings') {
  if (name === 'play') playSound(props.category === 'cards' ? 'shuffle' : 'stonePick')
  go({ name, gameId: game.value.id })
}

// ── 一疊卡片：最前面那張完整顯示，後面的往右側露出一條、越後面越小越淡；
//    往左滑時前面那張整張滑出去，下一張放大補上。拖曳時跟著手指連續變化。 ──
const deckEl = ref<HTMLElement>()
const cardW = ref(220)
const dragX = ref(0)
const dragging = ref(false)
let x0 = 0
let pid = -1
let moved = false
let ro: ResizeObserver | undefined
const measure = () => {
  const el = deckEl.value?.querySelector<HTMLElement>('.card')
  if (el) cardW.value = el.offsetWidth
}
onMounted(() => {
  measure()
  ro = new ResizeObserver(measure)
  if (deckEl.value) ro.observe(deckEl.value)
})
// 從條列換回卡片堆：卡片堆是新的元素，重新量、重新觀察
watch(deckEl, (el) => {
  ro?.disconnect()
  if (el) (ro?.observe(el), measure())
})
onBeforeUnmount(() => ro?.disconnect())

// 停在某張卡片上時，封面的小動畫循環播放（每個遊戲的卡面各自有一段重複的動畫，見 games/covers/）

// 卡片疊實際轉到的位置：換卡片時不靠 CSS 補間，而是每一格畫面重算所有卡片的位置。
// 這樣「誰疊在上面」會剛好在兩張交錯的那一刻才換（以前是一開始就換，下一張會突然跳到上面、閃一下）。
const vis = ref(index.value)
let glideRaf = 0
function glideTo(target: number) {
  cancelAnimationFrame(glideRaf)
  const from = vis.value
  if (reducedMotion() || from === target) {
    vis.value = target
    return
  }
  const t0 = performance.now()
  const dur = 460 + Math.min(2, Math.abs(target - from) - 1) * 120
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / dur)
    vis.value = from + (target - from) * (1 - Math.pow(1 - t, 3))
    if (t < 1) glideRaf = requestAnimationFrame(step)
  }
  glideRaf = requestAnimationFrame(step)
}
watch(index, (k) => glideTo(k))
onBeforeUnmount(() => cancelAnimationFrame(glideRaf))

/** 目前轉到的位置：整數 = 停在某張；拖曳、換卡片途中是小數（往左拖 = 往下一張轉） */
const pos = computed(() => {
  let p = vis.value - dragX.value / (cardW.value * 0.75)
  // 頭尾拉不過去，會有一點阻力
  if (p < 0) p = p * 0.3
  if (p > n.value - 1) p = n.value - 1 + (p - (n.value - 1)) * 0.3
  return p
})
/** 第 k 張相對中間的位置：0 = 正中間，負的在左、正的在右 */
const rel = (k: number) => k - pos.value

function onDown(e: PointerEvent) {
  if (locked.value) return
  if (e.button !== undefined && e.button > 0) return
  pid = e.pointerId
  x0 = e.clientX
  moved = false
  // 上一次換卡片還在滑：停在現在的位置，從這裡接著拖
  cancelAnimationFrame(glideRaf)
  lastNear = Math.min(n.value - 1, Math.max(0, Math.round(pos.value)))
  dragging.value = true
  deckEl.value?.setPointerCapture(e.pointerId)
}
function onMove(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== pid) return
  dragX.value = e.clientX - x0
  if (Math.abs(dragX.value) > 6) moved = true
  // 拖著卡片經過一張就輕輕震一下（像轉盤的段落感）
  const near = Math.min(n.value - 1, Math.max(0, Math.round(pos.value)))
  if (near !== lastNear) {
    lastNear = near
    buzz('slide')
  }
}
let lastNear = -1
function onUp(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== pid) return
  dragging.value = false
  if (!moved) {
    // 沒有拖：當作點一下（拖曳時抓住了指標，點擊事件不會傳到卡片上，所以在這裡找點到哪一張）
    dragX.value = 0
    glideTo(index.value)
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find((el) => cardEls.includes(el as HTMLElement))
    if (hit) tapCard(cardEls.indexOf(hit as HTMLElement))
    return
  }
  const target = Math.round(pos.value - Math.sign(dragX.value) * 0.25 * (Math.abs(dragX.value) > 30 ? 1 : 0))
  // 從放手的位置接著滑到目標（沒換卡片時滑回原位）
  vis.value = pos.value
  dragX.value = 0
  show(target)
  glideTo(index.value)
}
function tapCard(k: number) {
  if (k !== index.value) show(k)
  // 設定「點卡片開始遊戲」關掉時，只能按「開始遊戲」按鈕
  else if (settings.cardStarts) void launch()
}
/** 鍵盤（Enter／空白鍵）按卡片 */
function onClick(k: number, e: MouseEvent) {
  if (e.detail === 0) tapCard(k)
}
/** iPhone、iPad（包括上面的 Chrome、LINE，底下都是 Safari 的引擎）：圖形記憶體比較少，一堆 3D 卡片又加模糊時，
 *  再開連線視窗、換到房間頁，瀏覽器會整個被系統關掉。這些裝置不加模糊，只蓋一層紙色的霧 */
const lowGpu = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
function cardStyle(k: number) {
  const r = rel(k)
  const a = Math.abs(r)
  const sg = Math.sign(r)
  const w = cardW.value
  // 中間那張正面朝前；前面的模式疊在左邊、後面的疊在右邊，往後退、轉個角度朝向中間
  // 第一張側卡露出約四成、第二張再往外露出一截，兩張都看得到
  const x = sg * (Math.min(a, 1) * w * 0.42 + Math.max(0, Math.min(a, 2) - 1) * w * 0.27 + Math.max(0, a - 2) * w * 0.12)
  const z = -Math.min(a, 2.5) * w * 0.45
  const rot = -sg * Math.min(a, 1) * 52
  // 左右最多各看得到兩張；更後面的淡出，改用灰色陰影表示「還有」
  const op = Math.max(0, Math.min(1, (2.6 - a) * 1.7))
  // 兩張卡片交錯（離中間半張）時蒙上一層霧：微微模糊＋多蓋一點紙色，在交錯點最濃，
  // 換上下層的那一瞬間被霧遮住，看起來是接續過去，不是閃一下
  // 停下來之後，兩側沒選中的卡片也一直帶著一層淡霧（中間那張清清楚楚）
  const mist = a <= 0.5 ? Math.max(0, 1 - (0.5 - a) / 0.38) : 1 - 0.3 * Math.min(1, (a - 0.5) / 0.5)
  const style: Record<string, string | number> = {
    zIndex: 100 - Math.round(a * 10),
    opacity: op,
    '--fade': Math.min(0.78, a * 0.5 + mist * (a <= 0.5 ? 0.32 : 0.18)),
    transform: `translateX(-50%) translateX(${x}px) translateZ(${z}px) rotateY(${rot}deg)`,
  }
  // 看不到的卡片（左右第三張以後）：整張藏起來、不加模糊，不佔圖形記憶體
  if (op <= 0.01) return { ...style, opacity: 0, visibility: 'hidden' }
  if (mist > 0.02 && !lowGpu) style.filter = `blur(${(mist * 2.4).toFixed(2)}px)`
  return style
}

// ── 點最前面的卡片（或按「開始遊戲」）：卡片放大到整個畫面，同時先把遊戲載好，接著直接開始遊戲 ──
const cardEls: (HTMLElement | null)[] = []
const launching = ref(false)
/** 連線對戰的彈窗（右上角「連線」按鈕） */
const onlineOpen = ref(false)
// ── 在連線房間裡：大家都在房間外逛模式。「開始遊戲」變成「更改房間模式」（能改的人）或「推薦此模式」（不能改的人） ──
const inRoom = computed(() => !!online.room)
/** 這張卡片在房間裡能不能按：單人玩法不能連線；已經是房間模式就不用再按 */
const roomAction = computed<'change' | 'recommend' | 'solo' | 'current'>(() => {
  if (seatsOf(game.value) <= 1) return 'solo'
  if (online.room?.gameId === game.value.id) return 'current'
  return canChangeMode.value ? 'change' : 'recommend'
})
const recommendedId = ref('')
const roomLabel = computed(() => {
  const a = roomAction.value
  if (a === 'solo') return S.online.solo
  if (a === 'current') return S.online.isCurrent
  if (a === 'change') return S.online.change
  return recommendedId.value === game.value.id ? S.online.recommended : S.online.recommend
})
function roomPick() {
  const a = roomAction.value
  if (a === 'change') {
    playSound('tap')
    changeMode(game.value.id, seatsOf(game.value))
    // 房主的規則設定一起送給伺服器（開局照這份）
    sendRules(game.value.id)
    go({ name: 'room' })
  } else if (a === 'recommend' && recommendedId.value !== game.value.id) {
    playSound('tap')
    recommendMode(game.value.id)
    recommendedId.value = game.value.id
  }
}
async function launch() {
  if (inRoom.value) return roomPick()
  if (launching.value) return
  const els = listView.value ? rowEls : cardEls
  if (!els[index.value] || reducedMotion()) return open('play')
  launching.value = true
  // 這一下點擊剛好讓畫面恢復全螢幕的話，先等畫面重排完再拿起卡片（不然翻面動畫會被吃掉）
  await fullscreenSettled()
  const el = els[index.value]
  if (!el) return ((launching.value = false), open('play'))
  const g = game.value
  const color = getComputedStyle(el.querySelector('.cv') ?? el).backgroundColor
  playSound(props.category === 'cards' ? 'shuffle' : 'stonePick')
  // 放大的同時先下載遊戲畫面，兩件事都好了才換頁
  const loader = (g.component as { __asyncLoader?: () => Promise<unknown> }).__asyncLoader
  let stale = false
  await Promise.all([startLaunch(el, color, g.name, g.players), loader?.().catch((e) => (stale = isStaleChunk(e)))])
  // 網站更新過、舊頁面拿不到遊戲檔：重新整理載入最新版（回來時停在這個玩法的卡片上）
  if (stale && reloadForUpdate({ category: props.category, gameId: g.id })) return
  go({ name: 'play', gameId: g.id })
}

// 在房間外逛模式時：房間換了模式，右上角提示「已切換模式」；房主還會看到有人推薦了什麼
const roomHint = ref('')
let hintTimer = 0
function hint(text: string) {
  roomHint.value = text
  playSound('tap')
  window.clearTimeout(hintTimer)
  hintTimer = window.setTimeout(() => (roomHint.value = ''), 3200)
}
watch(
  () => online.room?.gameId,
  (now, before) => {
    if (online.room && now && before !== undefined && now !== before) hint(S.online.switchedTo(getGame(now).name))
  },
)
watch(
  () => (online.room ? online.room.recommends.map((r) => `${r.playerId}:${r.gameId}`) : []),
  (now, before) => {
    const room = online.room
    const me = room?.players.find((p) => p.me)
    if (!room || !me?.host) return
    const added = now.find((k) => !before.includes(k))
    if (!added) return
    const [pid, gid] = added.split(':')
    if (pid === me.id) return
    hint(S.online.newRecommend(room.players.find((p) => p.id === pid)?.name ?? S.online.someone, getGame(gid).name))
  },
)
onBeforeUnmount(() => window.clearTimeout(hintTimer))

function onKey(e: KeyboardEvent) {
  if (locked.value) return
  if (e.key === 'ArrowRight') turn(1)
  else if (e.key === 'ArrowLeft') turn(-1)
}
onMounted(() => window.addEventListener('keydown', onKey))
// 保險：右邊的遊戲名稱（大字）是從遮罩下面滑上來的；萬一動畫被卡住（有時從對局回來會發生），停在遮罩下面看不到，
// 過一下還沒到定位就直接放到定位
const panelRoot = ref<HTMLElement>()
let titleGuard = 0
function guardTitle() {
  window.clearTimeout(titleGuard)
  titleGuard = window.setTimeout(() => {
    for (const el of panelRoot.value?.querySelectorAll<HTMLElement>('.name .mask > span') ?? []) {
      if (getComputedStyle(el).transform === 'none') continue
      el.getAnimations().forEach((a) => a.finish?.())
      if (getComputedStyle(el).transform !== 'none') el.style.animation = 'none'
    }
  }, 1600)
}
onMounted(guardTitle)
watch(game, (g) => {
  if (g.id !== calmId.value) calmId.value = ''
  guardTitle()
})
onBeforeUnmount(() => window.clearTimeout(titleGuard))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <section class="mode" :class="[`c-${category}`, { locked, swapping, calm: returning }]">
    <div class="corner"><IconBtn icon="home" :label="S.common.home" @click="back()" /></div>
    <header class="head">
      <h1 class="t-black title"><span class="mask"><span>{{ S.category[category].title }}</span></span></h1>
      <button class="swap rise" :class="`to-${other}`" style="--i: 1" :aria-label="S.lobby.switchTo(S.category[other].title)" @click="swapCategory">
        <Icon name="swap" class="si" />
        <span class="t-black">{{ S.category[other].title }}</span>
      </button>
      <p class="t-label rise pk" style="--i: 1">{{ S.lobby.pickGame }}</p>
      <!-- 右上角：在房間裡＝房號（點了回房間）；不在房間＝連線（開房、加入） -->
      <!-- 在房間裡：兩行——房間模式、準備狀況（點了回房間） -->
      <button v-if="online.room" class="room-tag rise" style="--i: 2" :aria-label="S.online.backRoom" @click="go({ name: 'room' })">
        <Icon name="online" class="ri" />
        <span class="rt">
          <b class="t-black">{{ online.room.gameId ? getGame(online.room.gameId).name : S.online.noMode }}</b>
          <span class="t-label">{{ S.online.readyLine(online.room.players.filter((p) => p.ready).length, online.room.players.length, !!online.room.players.find((p) => p.me)?.ready) }}</span>
        </span>
      </button>
      <Btn v-else class="on-btn" size="sm" icon="online" @click="onlineOpen = true">{{ S.online.short }}</Btn>
      <!-- 房間換了模式／有人推薦：在右上角按鈕下面冒一下 -->
      <Transition name="rhint">
        <p v-if="roomHint" :key="roomHint" class="room-hint t-black" role="status">{{ roomHint }}</p>
      </Transition>
    </header>
    <div class="rule wipe" style="--i: 1" />

    <div class="body">
      <div class="deck-wrap" :class="{ morph: morphed }">
        <!-- 條列：一列一列，上下滑動；點一列選它，選中的再點一下開始 -->
        <div v-if="listView" class="list-box" :class="{ swapin: swappedIn }">
        <div
          ref="listEl"
          class="list"
          :class="{ settled: returning }"
          role="listbox"
          :aria-activedescendant="`mode-${game.id}`"
          @pointerdown="onListDown"
          @wheel.prevent="onListWheel"
        >
        <div class="track" :style="{ transform: `translateY(${trackY}px)` }">
          <button
            v-for="(g, k) in games"
            :id="`mode-${g.id}`"
            :key="g.id"
            :ref="(el) => (rowEls[k] = el as HTMLElement | null)"
            class="row"
            :style="{ ...rowStyle(k), '--i': k }"
            :class="{ front: k === listNear, lifted: (launching && k === index) || (launchFx.active && launchFx.mode === 'exit' && launchFx.gameId === g.id) }"
            role="option"
            :aria-selected="k === index"
            @click="tapRow(k)"
          >
            <span class="cv halftone"><component :is="g.cover" :active="k === index && !locked" /></span>
            <span class="t-slab no">{{ pad(k + 1) }}</span>
            <span class="rt">
              <span class="nm t-black">{{ g.name }}</span>
              <span class="sm">{{ g.summary }}</span>
            </span>
            <span class="tags">
              <span v-for="t in g.tags" :key="t" class="tag">{{ t }}</span>
            </span>
          </button>
        </div>
        </div>
        <!-- 正中間那一列上下各一條淡灰線，像相框框住選中的 -->
        <span class="frame" aria-hidden="true" />
        <!-- 捲動進度條：黑框膠囊、分類色的把手（瀏覽器自己的捲軸藏起來），可以拖 -->
        <div v-show="bar.h < 1" class="sbar" @pointerdown="barDown">
          <span class="thumb" :style="{ top: `${bar.top * 100}%`, height: `${bar.h * 100}%` }" />
        </div>
        </div>
        <div
          v-else
          ref="deckEl"
          class="deck"
          :class="{ settled: returning, swapin: swappedIn }"
          role="listbox"
          :aria-activedescendant="`mode-${game.id}`"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
        >
          <button
            v-for="(g, k) in games"
            :id="`mode-${g.id}`"
            :key="g.id"
            :ref="(el) => (cardEls[k] = el as HTMLElement | null)"
            class="card"
            :class="{ front: k === index, lifted: (launching && k === index) || (launchFx.active && launchFx.mode === 'exit' && launchFx.gameId === g.id) }"
            :style="cardStyle(k)"
            role="option"
            :aria-selected="k === index"
            :tabindex="k === index ? 0 : -1"
            @click="onClick(k, $event)"
          >
            <span class="cv halftone"><component :is="g.cover" :active="k === index && !locked" /></span>
            <span class="info">
              <span class="t-slab no">{{ pad(k + 1) }}</span>
              <span class="nm t-black">{{ g.name }}</span>
              <span class="sm">{{ g.summary }}</span>
              <span class="tags">
                <span v-for="t in g.tags" :key="t" class="tag">{{ t }}</span>
              </span>
            </span>
          </button>
        </div>
        <div class="pager" :class="{ vert: listSwitch }">
          <button class="arrow prev" :disabled="index === 0" :aria-label="S.common.back" @click="turn(-1)"><Icon name="arrow" /></button>
          <button class="arrow" :disabled="index === games.length - 1" :aria-label="S.common.next" @click="turn(1)"><Icon name="arrow" /></button>
          <span class="t-slab count">{{ pad(index + 1) }} <i>/</i> {{ pad(games.length) }}</span>
          <!-- 條列顯示：左半邊換成一列一列（記住，撲克牌、棋盤共用） -->
          <!-- 點兩格裡任何一格都會切換（點已經選中的那格也換到另一邊） -->
          <button type="button" class="vsw" :aria-label="S.lobby.listViewLabel" @click="toggleView"><Tabs class="small" :choices="viewChoices" :value="listSwitch ? 'list' : 'deck'" /></button>
        </div>
      </div>

      <aside ref="panelRoot" class="panel">
        <div :key="game.id" class="detail" :class="{ calm: game.id === calmId }">
          <p class="t-label rise">{{ game.players }}</p>
          <h2 class="t-black name"><span class="mask"><span>{{ game.name }}</span></span></h2>
          <p class="summary rise" style="--i: 2">{{ game.summary }}</p>
          <div v-if="game.best && !inRoom" class="stats rise" style="--i: 3">
            <p class="best">
              <span class="t-label">{{ game.bestLabel ?? S.lobby.best }}</span>
              <!-- 寬度先照最高分的位數留好，跳數時不會把旁邊的東西擠來擠去；最少步數還沒有紀錄時顯示「－」 -->
              <b class="t-slab" :style="{ minWidth: `${String(bestNow).length * 0.78}em` }">{{ game.bestLabel && !bestNow ? '－' : bestShown }}</b>
            </p>
          </div>
        </div>
        <div class="acts">
          <!-- 難度：固定在「開始遊戲」上面 -->
          <p v-if="inRoom" class="recent rise solo" style="--i: 3">{{ seatsOf(game) > 1 ? S.online.seatsFor(seatsOf(game)) : S.online.solo }}</p>
          <div v-else-if="quick" class="quick rise" style="--i: 3" :title="quick.help">
            <span class="t-label">{{ quick.label }}</span>
            <Tabs class="small" :choices="quick.choices" :value="quickValue" hot="master" @change="setQuick" />
            <!-- 近百場戰況：放在難度右邊同一排，不多佔一行（不然下面的小按鈕會被擠出畫面） -->
            <span class="recent">{{ recent }}</span>
          </div>
          <p v-else class="recent rise solo" style="--i: 3">{{ recent }}</p>
          <Btn v-if="inRoom" class="rise" style="--i: 3" :tone="roomAction === 'change' ? 'red' : roomAction === 'recommend' ? 'blue' : 'plain'" size="lg" :arrow="roomAction === 'change'" :icon="roomAction === 'recommend' ? 'online' : undefined" block :disabled="roomAction === 'solo' || roomAction === 'current' || recommendedId === game.id" @click="roomPick">{{ roomLabel }}</Btn>
          <Btn v-else class="rise" style="--i: 3" tone="red" size="lg" arrow block @click="launch">{{ S.lobby.start }}</Btn>
          <div class="minor rise" style="--i: 4">
            <button class="link" @click="open('tutorial')"><span>{{ S.lobby.tutorial }}</span><Icon name="arrow" class="ar" /></button>
            <button class="link" @click="open('rules')"><span>{{ S.lobby.rules }}</span><Icon name="arrow" class="ar" /></button>
            <button v-if="game.settings.some((d) => d.key !== quick?.key)" class="link" @click="open('settings')"><span>{{ S.lobby.settings }}</span><Icon name="arrow" class="ar" /></button>
          </div>
        </div>
      </aside>
    </div>

    <OnlineDialog :open="onlineOpen" :category="category" @close="onlineOpen = false" />
  </section>
</template>

<style scoped>
.mode {
  position: relative;
  display: flex;
  height: 100%;
  flex-direction: column;
  padding: 0.7rem 1.6rem 1rem 1.4rem;
}
.mode.locked {
  pointer-events: none;
}
/* 從遊戲退回來：不播進場（見 calmId） */
.mode.calm .head .rise,
.mode.calm .head .mask > span,
.mode.calm .wipe,
.mode.calm .acts .rise,
.detail.calm .rise,
.detail.calm .mask > span {
  animation: none;
}
.mode.c-cards {
  --tone: var(--color-red);
}
.mode.c-board {
  --tone: var(--color-blue);
}
.head {
  position: relative;
  display: flex;
  min-height: 2.4rem;
  align-items: center;
  gap: 0.9rem;
  /* 左邊讓出左上角返回鍵的位置（返回鍵和遊戲裡的選單鍵在同一個地方） */
  padding-left: calc(0.9rem + 2.4rem + 0.9rem - 1.4rem + 0.9rem - 0.9rem);
}
.title {
  font-size: 2rem;
  line-height: 1.15;
  letter-spacing: -0.04em;
}
/* 換到另一個分類：小膠囊按鈕，邊框用對方分類的顏色提示 */
.swap {
  position: relative;
  display: flex;
  height: 2rem;
  align-items: center;
  gap: 0.35rem;
  border: 0.13rem solid var(--color-ink);
  border-radius: 999px;
  background: var(--color-card);
  padding: 0 0.75rem 0 0.55rem;
  font-size: 0.82rem;
  box-shadow: 0.15rem 0.15rem 0 var(--to);
  transition:
    transform 110ms var(--ease-out),
    box-shadow 110ms var(--ease-out);
}
.swap.to-cards {
  --to: var(--color-red);
}
.swap.to-board {
  --to: var(--color-blue);
}
.swap::after {
  content: '';
  position: absolute;
  inset: -0.4rem;
}
.swap:active {
  transform: translate(0.15rem, 0.15rem);
  box-shadow: 0 0 0 var(--to);
}
.swap .si {
  width: 1rem;
  height: 1rem;
  transition: transform 300ms var(--ease-back);
}
.swapping .swap .si {
  transform: rotate(180deg);
}
@media (hover: hover) and (pointer: fine) {
  .swap:hover .si {
    transform: rotate(180deg);
  }
}
/* 切換分類：卡片堆往左滑出去、右邊的介紹往下淡掉，換頁後新的卡片堆從右邊滑進來 */
.mode.swapping {
  pointer-events: none;
}
.mode.swapping .deck,
.mode.swapping .list-box {
  animation: swap-out 300ms var(--ease-in-out) forwards;
}
.mode.swapping .panel,
.mode.swapping .title {
  transition:
    opacity 260ms,
    transform 260ms var(--ease-in-out);
  opacity: 0;
  transform: translateY(0.6rem);
}
.deck.swapin,
.list-box.swapin {
  animation: swap-in 560ms var(--ease-out) both;
}
/* 卡片堆 ↔ 條列：每張卡片直接變形成它那一列（反過來也一樣，見 morphFrom）；變形中不播一般的進場 */
.deck-wrap.morph .deck,
.deck-wrap.morph .row {
  animation: none;
}
@keyframes swap-out {
  to {
    opacity: 0;
    transform: translateX(-35%);
  }
}
@keyframes swap-in {
  from {
    opacity: 0;
    transform: translateX(35%);
  }
}
/* 房間裡換遊戲：右上角的房號，點了回房間 */
.room-hint {
  position: absolute;
  right: 0;
  top: calc(100% + 0.5rem);
  z-index: 40;
  max-width: 18rem;
  border: 0.13rem solid var(--color-ink);
  background: var(--color-yellow);
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink);
  padding: 0.3rem 0.65rem;
  font-size: 0.8rem;
  line-height: 1.35;
  pointer-events: none;
}
.room-hint::before {
  content: '';
  position: absolute;
  right: 1.2rem;
  top: -0.42rem;
  width: 0.7rem;
  height: 0.7rem;
  background: var(--color-yellow);
  border-left: 0.13rem solid var(--color-ink);
  border-top: 0.13rem solid var(--color-ink);
  rotate: 45deg;
}
.rhint-enter-active {
  transition:
    opacity 180ms ease,
    transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.rhint-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease-in;
}
.rhint-enter-from,
.rhint-leave-to {
  opacity: 0;
  transform: translateY(-0.4rem) scale(0.95);
}
.room-tag {
  display: flex;
  min-height: 2.4rem;
  align-items: center;
  gap: 0.5rem;
  border: 0.13rem solid var(--color-ink);
  background: var(--color-card);
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink);
  padding: 0 0.7rem;
}
.room-tag:active {
  transform: translate(0.15rem, 0.15rem);
  box-shadow: none;
}
.rt {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.2;
  text-align: left;
}
.rt b {
  font-size: 0.82rem;
}
.rt .t-label {
  font-size: 0.5rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--color-ink-3);
}
.ri {
  width: 1rem;
  height: 1rem;
  color: var(--color-blue);
}
.pk {
  margin-left: auto;
}
/* 條列顯示的開關：翻頁列最右邊 */
.vsw {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
}
.vsw {
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
}
/* 兩格只是顯示，點哪裡都由外層切換 */
.vsw :deep(.tabs) {
  pointer-events: none;
}
.vsw .small :deep(.tab) {
  padding: 0.12rem 0.65rem;
  font-size: 0.72rem;
}
.rule {
  height: 0.22rem;
  margin-top: 0.45rem;
  background: var(--color-ink);
}
.body {
  display: flex;
  min-height: 0;
  flex: 1;
  gap: 1.8rem;
  padding-top: 0.7rem;
}
/* 左半邊：一疊卡片（或條列）＋下面的翻頁列 */
.deck-wrap {
  container-type: inline-size;
  display: flex;
  min-width: 0;
  flex: 1.1;
  flex-direction: column;
  gap: 0.45rem;
}
.deck {
  position: relative;
  display: flex;
  min-height: 0;
  flex: 1;
  align-items: center;
  touch-action: pan-y;
  user-select: none;
  animation: rise 520ms var(--ease-out) 80ms both;
}
/* 3D 透視：兩側的卡片轉個角度往後退 */
.deck.settled {
  animation: none;
}
.deck {
  perspective: 900px;
  perspective-origin: 50% 45%;
}
/* 直式卡片：米白底、黑框、右下實心陰影。位置由 cardStyle 算（往右後方疊、滑過的往左出去）。 */
.card {
  position: absolute;
  left: 50%;
  /* 大螢幕不要跟著放到超大：高度最多 24rem，上下留白置中 */
  top: calc((100% - min(100%, 24rem)) / 2);
  display: flex;
  height: min(100%, 24rem);
  aspect-ratio: 0.72;
  flex-direction: column;
  border: 0.14rem solid var(--color-ink);
  border-radius: 0.5rem;
  background: var(--color-card);
  padding: 0;
  text-align: left;
  box-shadow: 0.25rem 0.25rem 0 var(--color-ink);
  transform-origin: 50% 50%;
  /* 位置、透明度每一格畫面由 cardStyle 算（見 glideTo），不用 CSS 補間 */
  transition: box-shadow 220ms var(--ease-out);
}
.card:not(.front) {
  cursor: pointer;
}
.card.front {
  box-shadow: 0.4rem 0.45rem 0 var(--color-ink);
  cursor: grab;
}
/* 進入遊戲時，這張卡片已經被「拿起來」（過場層有一份複製） */
.card.lifted {
  visibility: hidden;
}
/* 越後面的卡片蓋上越濃的紙色 */
.card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 0.36rem;
  background: var(--color-paper);
  opacity: var(--fade, 0);
  pointer-events: none;
}
.deck:active .card::after {
  transition: none;
}
.deck:active .card.front {
  cursor: grabbing;
}
/* 卡片上半部的插圖區：叫 .cv（不能叫 .cover，會和封面插圖本身的 class 撞名，
   卡片的樣式就會套到插圖上，有些手機瀏覽器插圖會整個放大蓋住卡片）。
   高度固定佔卡片的 46%，色塊到分隔線的位置不會跟著下面說明文字的長短變動 */
.cv {
  position: relative;
  display: block;
  flex: none;
  height: 44%;
  overflow: hidden;
  padding: 0.8rem 1rem 0.4rem;
  border-bottom: 0.14rem solid var(--color-ink);
  border-radius: 0.36rem 0.36rem 0 0;
  background-color: var(--color-paper-2);
  --dot: rgb(20 20 20 / 0.1);
  transition: background-color 260ms ease;
  pointer-events: none;
}
.cv {
  background-color: var(--tone);
  --dot: rgb(251 248 241 / 0.18);
}
.info {
  position: relative;
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.5rem 0.9rem 0.7rem;
  pointer-events: none;
}
/* 卡片下半部每一行都不被壓縮（被壓縮時說明會和標籤疊在一起）；標籤固定貼在最下面 */
.info > * {
  flex: none;
}
.info .tags {
  margin-top: auto;
  padding-top: 0.3rem;
}
.no {
  font-size: 0.85rem;
  color: var(--color-red);
}
.nm {
  font-size: 1.5rem;
  line-height: 1.2;
}
.sm {
  /* 說明最多兩行，再多就用「…」收掉，卡片版面不會被撐開 */
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--color-ink-2);
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.35rem;
}
.tag {
  padding: 0 0.4rem;
  border: 0.08rem solid var(--color-ink);
  font-size: 0.6rem;
  font-weight: 900;
}
.front .tag {
  background: var(--color-yellow);
}
/* ── 條列：一列一列，上下滑動 ── */
.list-box {
  position: relative;
  display: flex;
  min-height: 0;
  flex: 1;
}
.list {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  padding: 0 1.8rem 0 0.15rem;
  /* 不用瀏覽器的捲動：拖、滑、滾輪都自己算（CategoryScreen 的 lp） */
  touch-action: none;
  user-select: none;
}
/* 整串列：照轉到的位置往上下移，中間那一列對準正中間 */
.track {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  will-change: transform;
}
/* 相框線：選中的那一列（5.6rem 高）上下各一條，落在列與列的空隙裡 */
.frame {
  position: absolute;
  top: calc(50% - 3.35rem);
  right: 1.8rem;
  left: 0;
  height: 6.85rem;
  border-block: 0.1rem solid color-mix(in srgb, var(--color-ink) 16%, transparent);
  pointer-events: none;
}
@media (hover: hover) and (pointer: fine) {
  .list {
    cursor: grab;
  }
  .list:active {
    cursor: grabbing;
  }
}
/* 捲動進度條：黑框膠囊、米白底，把手是分類色（跟按鈕一樣有一點偏移陰影） */
.sbar {
  position: absolute;
  top: 0.3rem;
  right: 0.15rem;
  bottom: 0.7rem;
  width: 0.95rem;
  border: 0.12rem solid var(--color-ink);
  border-radius: 999px;
  background: var(--color-paper-2);
  box-shadow: 0.12rem 0.12rem 0 var(--color-ink);
  cursor: pointer;
  touch-action: none;
}
/* 看不見的點擊範圍大一圈，手指好按 */
.sbar::after {
  content: '';
  position: absolute;
  inset: 0 -0.5rem;
}
.thumb {
  position: absolute;
  left: 0.12rem;
  right: 0.12rem;
  min-height: 1.6rem;
  border-radius: 999px;
  background: var(--tone);
  box-shadow: inset 0 0 0 0.1rem var(--color-ink);
}
.row {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.7rem;
  overflow: hidden;
  border: 0.14rem solid var(--color-ink);
  border-radius: 0.45rem;
  background: var(--color-card);
  padding: 0 0.8rem 0 0;
  text-align: left;
  box-shadow: 0.2rem 0.2rem 0 var(--color-ink);
  cursor: pointer;
  /* 換選的時候：高度、陰影、底色、明暗一起慢慢變（不要一下子跳過去） */
  transition:
    transform 420ms cubic-bezier(0.22, 0.8, 0.24, 1),
    box-shadow 420ms cubic-bezier(0.22, 0.8, 0.24, 1),
    background-color 320ms ease,
    filter 320ms ease;
  animation: rise 460ms var(--ease-out) both;
  animation-delay: calc(min(var(--i), 12) * 35ms);
}
.list.settled .row,
.mode.calm .row {
  animation: none;
}
/* 沒選中的調暗、褪色一點，一眼看出選了哪個 */
.row:not(.front) {
  filter: brightness(0.86) saturate(0.6);
}
/* 選中的那一列：變高、插圖和字放大、往右推一點、陰影拉長、底色帶一點分類色 */
.row.front {
  /* 高度、上下留白由 rowStyle 照轉到的位置算（中間那列 5.6rem、上下各多 0.5rem 給相框線） */
  background: color-mix(in srgb, var(--color-card) 88%, var(--tone));
  box-shadow: 0.34rem 0.34rem 0 var(--color-ink);
  transform: translateX(0.3rem);
}
.row.lifted {
  visibility: hidden;
}
.row .cv {
  width: 5.6rem;
  height: 100%;
  transition: width 420ms cubic-bezier(0.22, 0.8, 0.24, 1);
  padding: 0.2rem 0.4rem;
  border-bottom: 0;
  border-right: 0.14rem solid var(--color-ink);
  border-radius: 0.32rem 0 0 0.32rem;
}
.row .no {
  flex: none;
  font-size: 0.8rem;
}
.row .rt {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.row .nm {
  font-size: 1.1rem;
  line-height: 1.25;
  transition: font-size 420ms cubic-bezier(0.22, 0.8, 0.24, 1);
}
.row.front .cv {
  width: 8rem;
}
.row.front .nm {
  font-size: 1.45rem;
}
.row .sm {
  -webkit-line-clamp: 1;
  font-size: 0.7rem;
}
.row .tags {
  flex: none;
  flex-wrap: nowrap;
  margin: 0;
}
/* 左半邊太窄（手機）：標籤收起來，名字和說明才放得下 */
@container (max-width: 30rem) {
  .row .tags {
    display: none;
  }
}
@media (hover: hover) and (pointer: fine) {
  .row:not(.front):hover {
    transform: translateX(0.15rem);
  }
}
.pager {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.arrow {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border: 0.13rem solid var(--color-ink);
  border-radius: 50%;
  background: var(--color-card);
  padding: 0;
  box-shadow: 0.12rem 0.12rem 0 var(--color-ink);
  transition: transform 110ms var(--ease-out);
}
.arrow svg {
  width: 0.9rem;
}
.arrow svg {
  transition: rotate 320ms var(--ease-out);
}
.arrow.prev svg {
  rotate: 180deg;
}
/* 條列時箭頭轉成「上」「下」 */
.pager.vert .arrow.prev svg {
  rotate: 270deg;
}
.pager.vert .arrow:not(.prev) svg {
  rotate: 90deg;
}
.arrow:disabled {
  opacity: 0.3;
}
/* 按下時整顆往右下移；多一圈看不見的點擊範圍，放開的位置才不會落在按鈕外面（不然要按兩次） */
.arrow {
  position: relative;
}
.arrow::after {
  content: '';
  position: absolute;
  inset: -0.3rem;
}
.arrow:active:not(:disabled) {
  transform: translate(0.12rem, 0.12rem);
  box-shadow: none;
}
.count {
  font-size: 0.95rem;
}
.count i {
  font-style: normal;
  color: var(--color-ink-3);
}
.panel {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
}
.name {
  margin-top: 0.1rem;
  font-size: 2.7rem;
  line-height: 1;
  letter-spacing: -0.04em;
}
.summary {
  margin-top: 0.45rem;
  font-size: 0.9rem;
  color: var(--color-ink-2);
}
.acts {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
/* 少用的按鈕：一排細線分隔的小字列，滑鼠移上去箭頭往前推 */
.minor {
  display: flex;
  border-top: 0.14rem solid var(--color-ink);
  border-bottom: 0.08rem solid var(--color-ink);
}
.link {
  position: relative;
  display: inline-flex;
  flex: 1;
  align-items: center;
  gap: 0.35rem;
  border: 0;
  background: none;
  padding: 0.5rem 0.6rem;
  font-size: 0.8rem;
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
}
.link + .link {
  border-left: 0.08rem solid var(--color-ink);
}
.link::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--color-ink);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 240ms var(--ease-out);
}
.link > * {
  position: relative;
}
.ar {
  width: 0.9rem;
  margin-left: auto;
  transition: transform 220ms var(--ease-out);
}
.link:active::before {
  transform: none;
}
.link:active {
  color: var(--color-card);
}
.stats {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.4rem 1.4rem;
  margin-top: 0.5rem;
}
.best {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.best b {
  /* 跳數時每個數字一樣寬，才不會左右晃 */
  font-variant-numeric: tabular-nums;
  font-size: 2.4rem;
  line-height: 1;
  color: var(--color-red);
}
.recent {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.66rem;
  line-height: 1.3;
  color: var(--color-ink-3);
  font-variant-numeric: tabular-nums;
}
.recent.solo {
  margin: -0.2rem 0 0.35rem;
}
.quick-help {
  margin-top: 0.25rem;
  font-size: 0.7rem;
  color: var(--color-ink-3);
}
/* 還有更多卡片時：在那一側最外面加一團柔和的灰色影子（像後面還疊著卡片） */
.quick {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
}
.quick .small :deep(.tab) {
  padding: 0.12rem 0.65rem;
  font-size: 0.72rem;
}
.best b {
  display: inline-block;
}
@media (hover: hover) and (pointer: fine) {
  .card {
    transition:
      translate 200ms var(--ease-out),
      box-shadow 220ms var(--ease-out);
  }
  .link:hover .ar {
    transform: translateX(0.3rem);
  }
  .link:hover {
    color: var(--color-red);
  }
  .arrow:hover:not(:disabled) {
    background: var(--color-yellow);
  }
}
</style>
