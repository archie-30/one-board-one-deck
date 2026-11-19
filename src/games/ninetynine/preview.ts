// 九九：選起一張牌時，說明這張牌打出去會怎樣（狀態列、教學都用）。純計算＋文字，不碰畫面。
import { S } from '@/data/strings'
import { canPlay, kindOf, RANK_LABELS, rankOf, SPADE_ACE, totalAfter, type Card } from '@/engine/ninetynine/rules'

const P = S.ninetynine.preview

/** bad：這張現在出不了（加上去會超過 99） */
export function cardPreview(total: number, c: Card): { text: string; bad: boolean } {
  const label = c === SPADE_ACE ? P.spadeAce : RANK_LABELS[rankOf(c)]
  switch (kindOf(c)) {
    case 'reverse':
      return { text: P.reverse, bad: false }
    case 'target':
      return { text: P.target, bad: false }
    case 'pass':
      return { text: P.pass, bad: false }
    case 'max':
      return { text: P.max(total), bad: false }
    case 'zero':
      return { text: P.zero(total), bad: false }
    case 'ten':
    case 'twenty': {
      const v = kindOf(c) === 'ten' ? 10 : 20
      const down = totalAfter(total, c, true)
      return canPlay(total, c) ? { text: P.sign(label, v, totalAfter(total, c), down), bad: false } : { text: P.signDownOnly(label, v, down), bad: false }
    }
    default: {
      const to = totalAfter(total, c)
      return canPlay(total, c) ? { text: P.num(label, total, to), bad: false } : { text: P.over(label, to), bad: true }
    }
  }
}
