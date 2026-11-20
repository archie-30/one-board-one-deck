// 星形跳棋彈珠跳的速度：照實際走的距離算時間，整條路線從頭到尾同一個速度（長跳不會比短跳快）。
import { CELLS, hexDistance } from '@/engine/starcheckers/rules'

/** 走一格的距離要多久（毫秒）：別人（電腦、對手）走的慢一點，看得清楚 */
export const cellMs = (slow?: boolean) => (slow ? 150 : 70)
/** 路線每一段有幾格長（跳一定是直線，格數就是距離） */
export const segLens = (path: readonly number[]) => path.slice(1).map((p, k) => hexDistance(CELLS[path[k]], CELLS[p]))
/** 整條路線要動多久 */
export const pathMs = (path: readonly number[], slow?: boolean) => segLens(path).reduce((a, b) => a + b, 0) * cellMs(slow)
