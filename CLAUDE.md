# One-Board-One-Deck 專案指令

## 專案簡介
《One-Board-One-Deck》是一款乾淨、不眼花的小遊戲合集：一個棋盤、一副牌。
- 主畫面二選一：**撲克牌**／**棋盤**，進入後再選遊戲。
- 首發遊戲：**大老二**（撲克牌）、**五子棋**（棋盤）。
- 單人對 AI。連線功能未來再做，現在不做，但架構必須留好擴充空間。
- 主要目標是 **Google Play 的 Android App**；GitHub Pages 只用來預覽。
- 不賺錢：無廣告、無內購。

## 與使用者溝通
- 一律使用**繁體中文**，語氣簡短直接。
- 使用者不熟前端框架：說明用白話，不要丟一堆術語。
- 改動前先說明「會動哪些檔案」；修改時只動需要動的地方，不順手重構無關程式碼。
- 使用者常給精準的局部修改指令，照指令範圍做，不要擴大。
- **每次改完東西，回覆的結尾都要附上兩個連結**：
  - 合併連結：該次改動所在分支的 PR（沒有就開一個，已合併就開新的）。
  - 預覽連結：<https://archie-30.github.io/one-board-one-deck/>（合併進 `main` 並部署完成後才會更新，要一併說明）。

## 技術棧
- **TypeScript + Vue 3 + Vite + Tailwind CSS**
- **Capacitor** 打包 Android（沿用 INKRAGE 專案的流程）
- **Vitest** 測試規則引擎
- **GitHub Actions** 部署 GitHub Pages
- 套件名（appId）：`com.archie.oneboardonedeck`（上架後不可更改，請勿修改）
- 螢幕方向：**全部橫向**，Android 端鎖定橫向

## 目錄結構
```
src/
  engine/            純 TypeScript 規則引擎，完全不依賴 Vue 或瀏覽器 API
    common/          共用型別、亂數（可指定 seed）
    bigtwo/          大老二：牌型判定、比大小、規則選項、AI
    gomoku/          五子棋：落子、勝負判定、AI
  games/             遊戲註冊表與各遊戲的 UI
    registry.ts      所有遊戲的註冊資料
    bigtwo/          大老二的畫面（Vue 元件）
    gomoku/          五子棋的畫面（Vue 元件）
  core/              存檔、設定、音效、版本、Play 應用程式內更新
  data/              文字（strings.ts）、版本（version.ts）、數值
  ui/                共用元件（按鈕、對話框、畫面框架）
  assets/            圖與音效
scripts/             建置工具（同步版本號到 Android 等）
android/             Capacitor 產生的 Android 專案
store/               Play 商店素材與文案
public/privacy.html  隱私權政策頁（Play 商店會連到這裡）
.github/workflows/   Pages 部署
```

## 架構規則（最重要）
1. **規則引擎必須是純函式**：`(state, action) → newState`。
   - 狀態可序列化成 JSON。
   - 隨機一律透過可指定 seed 的亂數函式，方便測試與重播。
   - `src/engine/` 內**禁止** import Vue、DOM、localStorage。
   - 這是為了未來接連線時，同一套引擎可直接給伺服器共用。
2. **AI 也放在引擎層**：輸入狀態，輸出動作，不碰 UI。
3. **遊戲註冊表**：每款遊戲註冊為
   `{ id, category: 'cards' | 'board', name, summary, rulesIntro, tutorial, settings, component }`。
   主畫面、分類頁、設定頁都只讀註冊表。新增遊戲不應該需要改導覽程式。
4. **資料與行為分離**：文字、數值放 `src/data/`，行為放其他地方。所有顯示文字都從 `strings.ts` 取，不要在元件裡寫死中文。
5. **每新增一個玩法，必須同時提供**：
   - 文字版規則說明（新手看得懂）
   - 互動式教學
   - 單元測試（至少覆蓋規則判定的邊界情況）

## 首發遊戲規格

### 大老二
- 1 位玩家 + 3 個 AI。
- 預設採**台灣規則**，以下做成可開關的規則選項（設定頁）：
  - 花色大小順序
  - 順子的 A、2 處理方式
  - 同花順是否算大牌型
  - 四條（鐵支）帶一張／五張牌型的處理
  - 其他爭議規則在實作前先向使用者確認，不要自行決定
- AI：先做簡單啟發式（能出就出最小可贏的牌），分「簡單／普通」兩種即可。

### 五子棋
- 1 位玩家對 1 個 AI，15×15。
- 預設自由規則（無禁手）。是否加入禁手、長連是否算贏，做成選項。
- AI：先做評分式（依連線型態打分），分「簡單／普通」。

## 視覺與體驗原則
**核心：乾淨、不眼花、輕鬆玩。**
> 新增任何視覺元素前先問：這會讓畫面更難一眼看懂嗎？會就不加。

- 風格：沿用 INKRAGE 的**手繪感**，但克制使用。
- 配色：米白紙感底色 + 一個主色 + 一個強調色，**全專案約 4～5 色**。
- 撲克牌只用**紅、黑**兩色，花色靠符號形狀分辨，不用四色花色。
- 手繪感只用在邊框、牌與棋子的輪廓（略不規則的線條，可用 SVG）。**不做**抖動動畫、粒子特效、複雜背景。
- 牌面的點數與花色必須一眼看清，優先於任何裝飾。
- 一個畫面只做一件事，留白要多。
- 動畫只做必要的：出牌、落子、勝負，各一個簡短動作。
- 設定項目越少越好：音量與規則選項即可。
- 主畫面只有兩個大按鈕：撲克牌、棋盤。
- 對局畫面只顯示牌桌／棋盤與必要按鈕，其他資訊收進選單。
- 全部為**繁體中文**，目前不做多語系切換，但文字仍集中放 `strings.ts` 以便日後擴充。
- 目前不做：主題切換、成就、牌背解鎖、殘局解謎。

## 存檔
- 使用 `localStorage`，鍵名一律加前綴與版本：`obod.<名稱>.v1`。
- 每次寫入前，若舊資料可讀，先存入 `.bak` 備份；主檔損壞時改讀備份。
- **不要更改既有鍵名**。需要改格式時，必須先寫好從舊鍵遷移的程式。
- 讀取時用預設值補齊缺少的欄位，舊存檔不得報錯。
- 目前不做雲端存檔，但存檔結構要保持乾淨，日後方便上傳。

## 版本號
- 唯一來源：`src/data/version.ts`。
- `npm run sync` 把版本寫入 Android：
  - `versionName` = 遊戲版本（例如 `0.1.0`）
  - `versionCode` = `(主版×10000 + 次版×100 + 修訂) × 10 + androidBuild`
- 次版與修訂不得超過 99。重複上傳同一版本時，把 `package.json` 的 `androidBuild`（0～9）加 1。
- 每次更新版本，同步在 `更新日誌.md` 記一筆。

## 指令
- `npm install`：安裝套件
- `npm run dev`：本機開發（Vite）
- `npm run test`：跑規則引擎測試
- `npm run build`：建置網頁版到 `dist/`
- `npm run sync`：同步版本號 → 建置 → `cap sync android`
- `npm run open`：用 Android Studio 開啟 `android/`

## 部署與發佈
### GitHub Pages
- 推送到 `main` 時由 GitHub Actions 自動部署。
- **只部署 `dist/`**，不要上傳整個專案根目錄。
- 網頁版路徑為 `/one-board-one-deck/`，Vite 的 `base` 要依環境切換：Pages 用 `/one-board-one-deck/`，Capacitor 打包用 `./`。
- `public/privacy.html` 會跟著部署，Play 商店的隱私權政策網址指向它。

### Android／Google Play
- 流程：`npm run sync` → Android Studio 簽署 AAB → 上傳 Play Console。
- 網頁版與 Android 版是兩份拷貝：網頁更新不會讓已安裝的 App 更新，必須重新上傳 AAB。
- Play Console 建議填法：隱私權政策填 Pages 上的 `privacy.html`；無須登入；不含廣告；不蒐集任何資料；目標對象 13 歲以上。
- 審核提醒：這是 Capacitor 包網頁的 App，曾有「WebView／最低功能」退件風險。要確保離線可玩、內容完整，並準備好申訴說明。

## 絕對不要做的事
- **不要把簽署金鑰（`.jks`）、`keystore.properties` 或任何密碼提交進 Git。** 確認 `.gitignore` 已排除。
- 不要更改 `appId`、既有存檔鍵名。
- 不要在 `src/engine/` 引入 UI 或瀏覽器相依。
- 不要在使用者未要求時新增套件、新功能或視覺特效。
- 不要自行決定有爭議的遊戲規則，先問使用者。

## 工作流程
1. 動手前，用幾句白話說明要做什麼、會動哪些檔案。
2. 小步提交：每完成一個可運作的小單位就 commit，訊息簡短清楚。
3. 改規則引擎時，同步補或改測試，並確認 `npm run test` 通過。
4. 做完後說明：改了什麼、怎麼在 Pages 預覽或本機看到結果。

## 開發順序（Phase 1）
1. 專案骨架：Vite + Vue 3 + TypeScript + Tailwind、Pages 部署流程、`CLAUDE.md` 所述目錄。
2. 遊戲註冊表與導覽：主畫面（撲克牌／棋盤）→ 遊戲列表 → 設定 → 對局。
3. 五子棋：引擎＋測試 → 簡單 AI → UI → 規則說明與教學。
4. 大老二：引擎＋測試（牌型判定、比大小、規則選項）→ 簡單 AI → UI → 規則說明與教學。
5. 存檔、設定、音效。
6. 手繪風格視覺調整（遵守上方「乾淨」原則）。
7. Capacitor 打包 Android、內部測試、封閉測試。
