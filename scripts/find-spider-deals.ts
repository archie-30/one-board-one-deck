// 產生蜘蛛接龍「保證解得開」的發牌（2 種、4 種花色），寫到 src/data/spiderDeals.ts。
// 用法：NODE_OPTIONS=--max-old-space-size=4096 npx tsx scripts/find-spider-deals.ts [每種幾副，預設 200]
// 每一副都是 engine/spider/solver.ts 的 buildSolvableSpider 做出來、並用真的規則照解法重玩驗證過的。
import { writeFileSync } from 'node:fs'
import { buildSolvableSpider } from '../src/engine/spider/solver'

const want = Number(process.argv[2] ?? 200)
const out: Record<string, string[]> = {}
for (const suits of [2, 4] as const) {
  const list: string[] = []
  let seed = 0
  const t0 = Date.now()
  while (list.length < want) {
    seed++
    const r = buildSolvableSpider(seed * 7919 + suits, suits, 60000, 3)
    if (!r) continue
    // 每張牌編號（0～103）寫成兩位 16 進位
    list.push(r.order.map((id) => id.toString(16).padStart(2, '0')).join(''))
    if (list.length % 20 === 0) console.log(`${suits} 種花色：${list.length}/${want}（試了 ${seed} 副，${((Date.now() - t0) / 1000).toFixed(0)} 秒）`)
  }
  out[suits] = list
}
const body = `// 蜘蛛接龍「保證解得開」的發牌（自動產生，請用 scripts/find-spider-deals.ts 重新產生，不要手改）。
// 每一副是 104 張牌的發牌順序（每張牌編號寫成兩位 16 進位），都用真的規則照解法重玩驗證過。
// 遊戲從裡面隨機挑一副、再把花色隨機換一換（engine/spider/rules.ts 的 dealFromBank；換花色不影響解不解得開）。
export const SPIDER_DEALS: Record<2 | 4, string[]> = {
  2: [
${out[2].map((s) => `    '${s}',`).join('\n')}
  ],
  4: [
${out[4].map((s) => `    '${s}',`).join('\n')}
  ],
}
`
writeFileSync(new URL('../src/data/spiderDeals.ts', import.meta.url), body)
console.log('寫好了 src/data/spiderDeals.ts')
