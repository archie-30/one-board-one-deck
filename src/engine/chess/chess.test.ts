import { describe, expect, it } from 'vitest'
import { applyChess, at, createChess, fromBoard, inCheck, insufficientMaterial, legalMoves, perft, targetsFrom, type ChessState, type Move } from './rules'

function play(s: ChessState, ...moves: string[]): ChessState {
  for (const mv of moves) {
    const m: Move = { from: at(mv.slice(0, 2)), to: at(mv.slice(2, 4)) }
    if (mv.length > 4) m.promo = mv[4].toUpperCase() as Move['promo']
    const r = applyChess(s, { type: 'move', move: m })
    if (!r.ok) throw new Error(`${mv}: ${r.reason}`)
    s = r.state
  }
  return s
}
/** 用每一列 8 個字元畫棋盤（第 8 排在最上面） */
const board = (...rows: string[]) => rows.join('')

describe('西洋棋：走法產生', () => {
  it('開局：白方 20 種走法；往下數兩層 400、三層 8902（國際通用的核對數字）', () => {
    const s = createChess()
    expect(legalMoves(s)).toHaveLength(20)
    expect(perft(s, 2)).toBe(400)
    expect(perft(s, 3)).toBe(8902)
  })
  it('複雜局面（Kiwipete）往下數兩層是 2039，含易位、過路兵、升變', () => {
    const s = fromBoard(
      board('r...k..r', 'p.ppqpb.', 'bn..pnp.', '...PN...', '.p..P...', '..N..Q.p', 'PPPBBPPP', 'R...K..R'),
      'w',
      { wK: true, wQ: true, bK: true, bQ: true },
    )
    expect(legalMoves(s)).toHaveLength(48)
    expect(perft(s, 2)).toBe(2039)
  })
  it('馬走日字、可以跳過棋子', () => {
    expect(targetsFrom(createChess(), at('g1')).sort()).toEqual([at('f3'), at('h3')].sort())
  })
})

describe('西洋棋：特殊規則', () => {
  it('王車易位：短易位後王在 g1、車在 f1；中間有子或被攻擊就不行', () => {
    let s = play(createChess(), 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6')
    expect(targetsFrom(s, at('e1'))).toContain(at('g1'))
    s = play(s, 'e1g1')
    expect(s.board[at('g1')]).toBe('K')
    expect(s.board[at('f1')]).toBe('R')
    expect(s.castling.wK).toBe(false)
    // f1 被黑象攻擊時不能易位
    const t = fromBoard(board('....k...', '........', '........', '........', '..b.....', '........', '........', '....K..R'), 'w', { wK: true, wQ: false, bK: false, bQ: false })
    expect(targetsFrom(t, at('e1'))).not.toContain(at('g1'))
  })
  it('被將軍時不能易位；王或車動過就失去易位權', () => {
    const t = fromBoard(board('....r..k', '........', '........', '........', '........', '........', '........', 'R...K..R'), 'w', { wK: true, wQ: true, bK: false, bQ: false })
    expect(targetsFrom(t, at('e1'))).not.toContain(at('g1'))
    let s = play(createChess(), 'h2h4', 'a7a6', 'h1h3', 'a6a5', 'h3h1')
    expect(s.castling.wK).toBe(false)
    expect(s.castling.wQ).toBe(true)
    s = play(s, 'a5a4')
    expect(s.castling.wK).toBe(false)
  })
  it('吃過路兵：只有對方剛走兩步的下一步才能吃', () => {
    let s = play(createChess(), 'e2e4', 'a7a6', 'e4e5', 'd7d5')
    expect(targetsFrom(s, at('e5'))).toContain(at('d6'))
    const r = play(s, 'e5d6')
    expect(r.board[at('d5')]).toBe('')
    expect(r.captured).toEqual(['p'])
    s = play(s, 'h2h3', 'h7h6')
    expect(targetsFrom(s, at('e5'))).not.toContain(at('d6'))
  })
  it('兵升變：沒選要升成什麼會被擋下；可以選后、車、象、馬', () => {
    const s = fromBoard(board('.......k', 'P.......', '........', '........', '........', '........', '........', '....K...'), 'w')
    expect(applyChess(s, { type: 'move', move: { from: at('a7'), to: at('a8') } })).toEqual({ ok: false, reason: 'needPromotion' })
    expect(play(s, 'a7a8n').board[at('a8')]).toBe('N')
    expect(play(s, 'a7a8q').board[at('a8')]).toBe('Q')
  })
  it('不能走會讓自己的王被將的棋（被牽制的子不能動）', () => {
    const s = fromBoard(board('....r..k', '........', '........', '........', '........', '........', '....B...', '....K...'), 'w')
    expect(targetsFrom(s, at('e2'))).toEqual([])
  })
})

describe('西洋棋：結束', () => {
  it('將死（愚人殺）：黑方贏', () => {
    const s = play(createChess(), 'f2f3', 'e7e5', 'g2g4', 'd8h4')
    expect(s.status).toBe('checkmate')
    expect(s.winner).toBe('b')
    expect(inCheck(s, 'w')).toBe(true)
    expect(applyChess(s, { type: 'move', move: { from: at('a2'), to: at('a3') } })).toEqual({ ok: false, reason: 'over' })
  })
  it('逼和：沒被將但沒有合法的步 → 和棋', () => {
    const s = fromBoard(board('k.......', '........', '.Q......', '........', '........', '........', '........', '.......K'), 'w')
    const r = play(s, 'b6c7')
    expect(r.status).toBe('stalemate')
    expect(r.winner).toBeNull()
  })
  it('同一局面第三次出現 → 和棋', () => {
    const s = play(createChess(), 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8')
    expect(s.status).toBe('repetition')
  })
  it('50 回合沒吃子也沒動兵 → 和棋', () => {
    const s = fromBoard(board('k.......', '........', '........', '........', '........', '........', 'R.......', '.......K'), 'w')
    s.halfmove = 99
    expect(play(s, 'a2b2').status).toBe('fifty')
  })
  it('子力不夠將死：王對王、王＋馬對王、同色格的象 → 和棋；有兵就不算', () => {
    expect(insufficientMaterial(fromBoard(board('k.......', '........', '........', '........', '........', '........', '........', '.......K')).board)).toBe(true)
    expect(insufficientMaterial(fromBoard(board('k.......', '........', '........', '...N....', '........', '........', '........', '.......K')).board)).toBe(true)
    // d5 和 e4 是同色格 → 和；d5 和 d4 不同色 → 還有可能將死
    expect(insufficientMaterial(fromBoard(board('k.......', '........', '........', '...B....', '....b...', '........', '........', '.......K')).board)).toBe(true)
    expect(insufficientMaterial(fromBoard(board('k.......', '........', '........', '...B....', '...b....', '........', '........', '.......K')).board)).toBe(false)
    expect(insufficientMaterial(fromBoard(board('k.......', '........', '........', '...P....', '........', '........', '........', '.......K')).board)).toBe(false)
  })
  it('認輸：對方贏', () => {
    const r = applyChess(createChess(), { type: 'resign', color: 'w' })
    expect(r.ok && r.state.winner).toBe('b')
  })
})

describe('西洋棋：電腦對手', () => {
  it('看得到一步將死（深度 2 以上的人）', async () => {
    const { chooseChessMove } = await import('./ai')
    const { seedRng } = await import('../common/rng')
    // 白后 h5、象 c4，黑方剛走錯：Qxf7 將死
    const s = play(createChess(), 'e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6')
    const [m] = chooseChessMove(s, { depth: 2, attack: 0.5, safety: 0.5, noise: 0, blunder: 0 }, seedRng(1))
    expect(m).toEqual({ from: at('h5'), to: at('f7') })
  })
  it('會吃掉白送的后', async () => {
    const { chooseChessMove } = await import('./ai')
    const { seedRng } = await import('../common/rng')
    const s = play(createChess(), 'e2e4', 'd7d5', 'd1g4')
    const [m] = chooseChessMove(s, { depth: 1, attack: 0.5, safety: 0.5, noise: 0, blunder: 0 }, seedRng(2))
    expect(m).toEqual({ from: at('c8'), to: at('g4') })
  })
  it('20 位對手都能走完一盤（不會走不合法的步），而且每步不會算太久', async () => {
    const { chooseChessMove } = await import('./ai')
    const { seedRng } = await import('../common/rng')
    const { PERSONAS } = await import('../common/personas')
    for (const p of [0, 7, 13, 19]) {
      let s = createChess()
      let rng = seedRng(p + 1)
      let worst = 0
      for (let i = 0; i < 40 && s.status === 'playing'; i++) {
        const t0 = performance.now()
        let m
        ;[m, rng] = chooseChessMove(s, PERSONAS[(p + i) % 20].chess, rng)
        worst = Math.max(worst, performance.now() - t0)
        const r = applyChess(s, { type: 'move', move: { ...m!, promo: m!.promo ?? (m && (s.board[m.from] === 'P' || s.board[m.from] === 'p') && (m.to < 8 || m.to >= 56) ? 'Q' : undefined) } })
        expect(r.ok).toBe(true)
        if (r.ok) s = r.state
      }
      expect(worst).toBeLessThan(4000)
    }
  }, 120000)
})
