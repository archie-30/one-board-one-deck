<script setup lang="ts">
// 教學說明卡：黃色色帶上寫第幾步，下面一段話；答對時出現打勾的一行，答錯時紅字
import { S } from '@/data/strings'
import Icon from './art/Icon.vue'

defineProps<{ step: number; total: number; text: string; ok?: string; solved?: boolean; misses?: number }>()

/**
 * 把一段說明拆成好讀的幾行：每一句（。！？）一行；冒號後面還有一段說明的，冒號後也換行。
 * 文字本身不用手動加換行，所有遊戲的教學都一樣。
 */
function lines(t: string): string[] {
  return t
    .split(/(?<=[。！？])/)
    .flatMap((s) => {
      const i = s.indexOf('：')
      return i > 0 && s.length - i > 10 ? [s.slice(0, i + 1), s.slice(i + 1)] : [s]
    })
    .map((s) => s.trim())
    .filter(Boolean)
}
</script>

<template>
  <div :key="step" class="note rise">
    <div class="band halftone">
      <span class="t-label">{{ S.tutorial.title }}</span>
      <span class="t-slab n">{{ String(step + 1).padStart(2, '0') }}<small>/{{ String(total).padStart(2, '0') }}</small></span>
    </div>
    <p class="text"><span v-for="(l, i) in lines(text)" :key="i" class="ln">{{ l }}</span></p>
    <p v-if="solved && ok" class="ok rise"><span class="tick"><Icon name="check" /></span><span><span v-for="(l, i) in lines(ok)" :key="i" class="ln">{{ l }}</span></span></p>
    <p v-else-if="misses" :key="misses" class="miss rise">{{ S.tutorial.tryAgain }}</p>
  </div>
</template>

<style scoped>
.note {
  border: 0.14rem solid var(--color-ink);
  background: var(--color-card);
  box-shadow: 0.3rem 0.3rem 0 var(--color-ink);
}
.band {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.15rem 0.8rem;
  border-bottom: 0.14rem solid var(--color-ink);
  background-color: var(--color-yellow);
  --dot: rgb(20 20 20 / 0.14);
}
.n {
  font-size: 1rem;
}
.n small {
  font-size: 0.65rem;
  opacity: 0.6;
}
.ln {
  display: block;
}
.ln + .ln {
  margin-top: 0.1rem;
}
.text {
  padding: 0.5rem 0.9rem 0;
  font-size: 0.9rem;
  line-height: 1.5;
  text-wrap: pretty;
}
.ok,
.miss {
  display: flex;
  gap: 0.45rem;
  margin: 0.5rem 0.9rem 0;
  font-size: 0.9rem;
  line-height: 1.55;
}
.text:last-child,
.ok,
.miss {
  padding-bottom: 0.75rem;
}
.tick {
  display: grid;
  flex-shrink: 0;
  width: 1.3rem;
  height: 1.3rem;
  place-items: center;
  background: var(--color-ink);
  color: var(--color-card);
}
.tick svg {
  width: 0.85rem;
}
.miss {
  color: var(--color-red);
  font-weight: 900;
}
</style>
