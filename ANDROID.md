# Android 打包說明

套件名（appId）：`com.archie.oneboardonedeck`（**上架後不能改**，`capacitor.config.json` 與 `android/app/build.gradle` 都寫著它，不要動）。

## 需要安裝
- Node.js 22 以上
- Android Studio（內含 JDK 與 Android SDK）

## 第一次
```
git clone https://github.com/archie-30/one-board-one-deck.git
cd one-board-one-deck
npm install
npm run sync
npm run open
```
- `npm run sync`：把遊戲版本寫進 Android → 建置網頁版 → 複製到 Android 專案。
- `npm run open`：用 Android Studio 開啟 `android/`。第一次開會自動下載 Gradle，等它跑完。
- 按上方綠色三角形執行（模擬器，或開了 USB 偵錯的實體手機）。

## 之後每次更新
```
git pull
npm run sync
```
再回 Android Studio 重新執行。

## 版本號
- 跟著遊戲版本自動走（唯一來源 `src/data/version.ts`）：`npm run sync` 會寫好 `versionName`、`versionCode`。
  例如 `v0.29.0` → `versionName "0.29.0"`、`versionCode 29000`。
- **同一個遊戲版本要重新上傳**（只是重新打包）：把 `package.json` 的 `androidBuild` 加 1（0～9），再 `npm run sync`。

## 上架用的簽署金鑰
1. Android Studio：Build → Generate Signed App Bundle → Create new… 建一把金鑰（.jks），**另外備份**，弄丟就不能更新 App。
2. 複製 `android/keystore.properties.example` 成 `android/keystore.properties`，填上金鑰位置與密碼。
3. `keystore.properties`、`*.jks` 已經被 Git 忽略，**絕對不要提交進 GitHub**。
4. Build → Generate Signed App Bundle → release，產出 `.aab` 上傳 Play Console。

## App 版跟網頁版不一樣的地方
- 一律橫向（`sensorLandscape`）、全螢幕（狀態列、導覽列藏起來，從邊緣滑一下會暫時出現）；設定裡沒有「全螢幕」開關。
- 返回鍵／返回手勢＝網頁版的 Esc：關掉最上面的視窗、對局中暫停、回上一頁；在主畫面再按就關掉 App。
- 保持螢幕恆亮、鏡頭防遮擋由 App 端做（`android/…/ObodPlugin.java`；遊戲那邊在 `src/core/native.ts`）。
- 切到別的 App 會自動暫停並存進度；回來時連線房間馬上重連。
- 手機開深色模式也不會把遊戲變暗。
- 自動檢查更新：開 App 後問 Google Play 有沒有新版本，有就跳「有新版本了」。只有從 Play 安裝的 App 才查得到（用 Android Studio 直接裝的不會跳）；要測的話用 Play Console 的「內部應用程式分享」或封閉測試裝舊版，再上傳一個版本號更大的新版。
- 圖示、開機畫面：`npm run icons` 重新產生（需要 Playwright 的 Chromium），平常不用跑。

## 上架前檢查
- 實機試玩：每款遊戲開一局、新手教學、連線開房間（兩台手機或手機＋電腦網頁）。
- 返回鍵：主畫面、模式選單、對局中、設定視窗都按按看。
- 有瀏海／挖孔鏡頭的手機：鏡頭防遮擋開、關各看一次。
- 商店文案、資料安全表單的建議填法：`store/listing.md`；隱私權政策：`public/privacy.html`。
