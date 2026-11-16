import type { Component } from 'vue'

export type GameCategory = 'cards' | 'board'

export interface RuleSection {
  title: string
  body: string[]
}

/** 一個規則選項。設定頁依這份資料自動產生畫面。 */
/** 規則設定的分組：規則、計分、其他 */
export type SettingGroup = 'rules' | 'score' | 'other'
interface SettingBase {
  key: string
  label: string
  help: string
  /** 規則設定頁上放在哪一組（沒寫就是「規則」） */
  group?: SettingGroup
  /** 對局中途改了也不影響公平（例如棋子的樣式）；沒有標的選項在暫停選單裡反灰，要在局外設定 */
  live?: boolean
}
export type SettingDef =
  | (SettingBase & { type: 'toggle'; default: boolean })
  | (SettingBase & { type: 'choice'; default: string; choices: { value: string; label: string }[] })

export interface GameDef {
  id: string
  category: GameCategory
  name: string
  summary: string
  players: string
  /** 幾個人一起玩（連線房間的座位數）；沒填就照分類：撲克牌 4 人、棋盤 2 人。1＝單人，不能連線 */
  seats?: number
  /** 選單卡片上的插圖（active = 卡片被選起時） */
  cover: Component
  /** 卡片上的小標籤，例如人數、一局多久 */
  tags: string[]
  /** 模式選單上大大顯示的最高分（沒有分數的玩法不填） */
  /** 模式選單上顯示的最高分（依目前選的規則，例如難度） */
  best?: (options: Record<string, string | boolean>) => number
  /** 文字版規則說明 */
  rulesIntro: RuleSection[]
  /** 互動式教學的畫面 */
  tutorial: Component
  /** 規則選項 */
  settings: SettingDef[]
  /** 對局畫面 */
  component: Component
}
