import type { Component } from 'vue'

export type GameCategory = 'cards' | 'board'

export interface RuleSection {
  title: string
  body: string[]
}

/** 一個規則選項。設定頁依這份資料自動產生畫面。 */
export type SettingDef =
  | { key: string; type: 'toggle'; label: string; help: string; default: boolean }
  | {
      key: string
      type: 'choice'
      label: string
      help: string
      default: string
      choices: { value: string; label: string }[]
    }

export interface GameDef {
  id: string
  category: GameCategory
  name: string
  summary: string
  players: string
  /** 選單卡片上的插圖（active = 卡片被選起時） */
  cover: Component
  /** 卡片上的小標籤，例如人數、一局多久 */
  tags: string[]
  /** 大廳顯示的戰績一行字（沒有就不顯示） */
  record?: () => string
  /** 文字版規則說明 */
  rulesIntro: RuleSection[]
  /** 互動式教學的畫面 */
  tutorial: Component
  /** 規則選項 */
  settings: SettingDef[]
  /** 對局畫面 */
  component: Component
}
