// 第一次玩的歡迎畫面（ui/WelcomeScreen.vue）：還沒取名字、一局都沒玩過、也沒看過歡迎畫面的人才會看到。
// 輸入名字（跟個人資料同一個）才能按「開始遊戲」進主畫面。存檔 obod.welcome.v1 記住看過了。
import { ref } from 'vue'
import { markNewsSeen } from './news'
import { loadSave, writeSave } from './storage'
import { profile, tidyName } from './profile'

const saved = loadSave<{ done: boolean }>('welcome', { done: false })
/** 歡迎畫面開著嗎 */
export const welcomeOpen = ref(!saved.done && !profile.name && profile.played === 0)
/** 歡迎畫面還擋著主畫面（主畫面先不放開點擊、不跳公告）；紙開始往上捲時就放開 */
export const welcomeGate = ref(welcomeOpen.value)
/** 紙開始往上捲時加一：底下的主畫面整個重新進場一次（跟捲走的紙接在一起） */
export const welcomeDone = ref(0)

/** 名字能不能用（有不雅字眼、只有空白都不行）；回傳整理好的名字，不能用就是空字串 */
export const usableName = (raw: string) => tidyName(raw)

/** 按「開始遊戲」：存名字、記住看過了。新玩家不用再看「新玩法上架」公告 */
export function finishWelcome(raw: string) {
  const name = usableName(raw)
  if (!name) return false
  profile.name = name
  saved.done = true
  writeSave('welcome', saved)
  markNewsSeen()
  return true
}

/** 收場動畫：紙開始往上捲（主畫面同時重新進場） */
export function revealTitle() {
  welcomeGate.value = false
  welcomeDone.value++
}
/** 收場動畫播完：拿掉歡迎畫面 */
export function closeWelcome() {
  welcomeOpen.value = false
}
