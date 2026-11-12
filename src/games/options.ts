import { gamePrefs } from '@/core/settings'
import type { GameDef } from './types'

/** 把存檔裡的選項和預設值合併，回傳這一局要用的規則 */
export function resolveOptions(game: GameDef): Record<string, string | boolean> {
  const saved = gamePrefs(game.id).options
  const out: Record<string, string | boolean> = {}
  for (const def of game.settings) {
    const value = saved[def.key]
    if (def.type === 'toggle') out[def.key] = typeof value === 'boolean' ? value : def.default
    else out[def.key] = def.choices.some((c) => c.value === value) ? (value as string) : def.default
  }
  return out
}
