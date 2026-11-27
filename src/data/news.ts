// 「新玩法」公告：在期限前第一次進到這個版本時跳一次（core/news.ts）。
// id 換一個新的就會再跳一次（例如下次又加了新玩法）。
export const NEWS = {
  id: 'modes-2026-11-pyramid-hex-morris-junqi',
  /** 截止時間：手機自己的時間，2026/11/28 23:59 之前（含）才跳（使用者定的） */
  until: new Date(2026, 10, 28, 23, 59, 59).getTime(),
  /** 介紹哪幾個玩法（註冊表的 id，照這個順序） */
  games: ['pyramid', 'hex', 'morris', 'junqi'],
}
