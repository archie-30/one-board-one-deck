#!/usr/bin/env python3
"""
把中文字型切成「只有遊戲用到的字」的小檔案，開機就不用等兩個約 1MB 的完整字型。

- 掃 src/ 底下所有 .ts／.vue 和 index.html 裡出現的字（加上常用標點），切出 500、900 兩個字重。
- 產生 src/assets/fonts/ 裡的 woff2 和 subset.css（@font-face 帶 unicode-range）。
- 小字型叫 'Noto Sans TC'；完整字型改叫 'Noto Sans TC Full'，排在字型清單第二順位（style.css 的 --font-sans）。
  小字型裡沒有的字（例如玩家自己輸入的罕見字）會自動改用完整字型，所以不會缺字，只有那時才下載完整字型。
  （兩個用同一個名字的話，瀏覽器載入字型時會連完整的一起下載，開機就會等很久。）

需要 fonttools 和 brotli（只在要重新產生時用，不是專案的套件）：
    python3 -m pip install fonttools brotli
    python3 scripts/subset-fonts.py
新增了很多新的文字之後重跑一次即可；沒重跑也不會壞，只是新字會改用完整字型。
"""
import pathlib
import re

from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_FONTS = ROOT / "node_modules/@fontsource/noto-sans-tc/files"
OUT = ROOT / "src/assets/fonts"
WEIGHTS = [500, 900]
# 常用標點、全形符號（就算現在的文字沒用到也先放進來）
EXTRA = "，。、；：？！「」『』（）《》〈〉…—～・．／＋－＝％＃＆＊＠　０１２３４５６７８９"


def collect() -> set[str]:
    chars: set[str] = set(EXTRA)
    files = list((ROOT / "src").rglob("*.ts")) + list((ROOT / "src").rglob("*.vue")) + [ROOT / "index.html"]
    for f in files:
        chars.update(f.read_text(encoding="utf-8"))
    # 只留非 ASCII 的字（英數字由 @fontsource 的 latin 檔負責）
    return {c for c in chars if ord(c) > 0x7F and not c.isspace() and not (0xD800 <= ord(c) <= 0xDFFF)}


def ranges(codes: list[int]) -> str:
    out, start, prev = [], None, None
    for c in codes:
        if start is None:
            start = prev = c
        elif c == prev + 1:
            prev = c
        else:
            out.append((start, prev))
            start = prev = c
    if start is not None:
        out.append((start, prev))
    return ", ".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in out)


def main() -> None:
    chars = collect()
    OUT.mkdir(parents=True, exist_ok=True)
    codes = sorted(ord(c) for c in chars)
    css = [
        "/* 由 scripts/subset-fonts.py 產生，不要手改。只含遊戲用到的字；其他字會自動改用完整字型。 */",
    ]
    for w in WEIGHTS:
        src = SRC_FONTS / f"noto-sans-tc-chinese-traditional-{w}-normal.woff2"
        dst = OUT / f"noto-sans-tc-{w}-subset.woff2"
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        font = subset.load_font(str(src), opts)
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=codes)
        sub.subset(font)
        subset.save_font(font, str(dst), opts)
        print(f"{dst.name}: {dst.stat().st_size // 1024} KB（原本 {src.stat().st_size // 1024} KB）")
        css.append(
            "@font-face {\n"
            "  font-family: 'Noto Sans TC';\n"
            "  font-style: normal;\n"
            "  font-display: swap;\n"
            f"  font-weight: {w};\n"
            f"  src: url(./{dst.name}) format('woff2');\n"
            f"  unicode-range: {ranges(codes)};\n"
            "}"
        )
        # 完整字型：另一個名字，只有小字型沒有的字才會用到（才會下載）
        css.append(
            "@font-face {\n"
            "  font-family: 'Noto Sans TC Full';\n"
            "  font-style: normal;\n"
            "  font-display: swap;\n"
            f"  font-weight: {w};\n"
            f"  src: url(../../../node_modules/@fontsource/noto-sans-tc/files/noto-sans-tc-chinese-traditional-{w}-normal.woff2) format('woff2');\n"
            "}"
        )
    (OUT / "subset.css").write_text("\n".join(css) + "\n", encoding="utf-8")
    print(f"共 {len(codes)} 個字")


if __name__ == "__main__":
    main()
