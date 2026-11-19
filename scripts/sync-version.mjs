// 讓 Android 的版本跟遊戲版本一致（唯一來源：src/data/version.ts）
//   versionName = "0.28.8"
//   versionCode = (主版×10000 + 次版×100 + 修訂) × 10 + androidBuild   → 2880
// Play 每次上傳 versionCode 都要變大。同一個遊戲版本要重新上傳（例如只是重新打包）時，把 package.json 的 androidBuild（0～9）加 1。
import { readFileSync, writeFileSync } from 'node:fs'

const src = readFileSync('src/data/version.ts', 'utf8')
const m = /number:\s*'v(\d+)\.(\d+)\.(\d+)'/.exec(src)
if (!m) throw new Error('src/data/version.ts 裡找不到版本號')
const [major, minor, patch] = [+m[1], +m[2], +m[3]]
if (minor > 99 || patch > 99) throw new Error('次版與修訂不能超過 99（versionCode 的算法）')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const build = pkg.androidBuild ?? 0
if (!Number.isInteger(build) || build < 0 || build > 9) throw new Error('package.json 的 androidBuild 要是 0～9 的整數')
const name = `${major}.${minor}.${patch}`
const code = (major * 10000 + minor * 100 + patch) * 10 + build

const gradlePath = 'android/app/build.gradle'
const g = readFileSync(gradlePath, 'utf8')
const next = g.replace(/versionCode\s+\d+/, `versionCode ${code}`).replace(/versionName\s+"[^"]*"/, `versionName "${name}"`)
if (next !== g) writeFileSync(gradlePath, next)
if (pkg.version !== name) {
  pkg.version = name
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
}
console.log(`Android 版本 ${name}（versionCode ${code}）`)
