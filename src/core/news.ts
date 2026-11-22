// 「新玩法」公告視窗：期限前第一次進到主畫面（加載畫面、進場動畫都跑完）時跳一次，看過就記住不再跳。
// 存檔 obod.news.v1：看過的公告 id。
import { ref } from 'vue'
import { NEWS } from '@/data/news'
import { loadSave, writeSave } from './storage'

const saved = loadSave<{ seen: string[] }>('news', { seen: [] })
/** 公告視窗開著嗎 */
export const newsOpen = ref(false)

/** 主畫面可以點了的時候叫：該跳就跳，並記住已經看過 */
export function checkNews(now = Date.now()) {
  if (now > NEWS.until || saved.seen.includes(NEWS.id)) return
  saved.seen = [...saved.seen, NEWS.id]
  writeSave('news', saved)
  newsOpen.value = true
}
