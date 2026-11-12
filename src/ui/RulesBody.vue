<script setup lang="ts">
// 規則說明內文（規則頁與對局中的選單共用）：橫向畫面排成兩欄，最後列出目前的規則設定
import { computed } from 'vue'
import { S } from '@/data/strings'
import { resolveOptions } from '@/games/options'
import type { GameDef } from '@/games/types'

const props = defineProps<{ game: GameDef; options?: Record<string, string | boolean>; single?: boolean }>()

const current = computed(() => {
  const opts = props.options ?? resolveOptions(props.game)
  return props.game.settings.map((def) => {
    const value = opts[def.key]
    const text = def.type === 'toggle' ? (value ? S.common.on : S.common.off) : (def.choices.find((c) => c.value === value)?.label ?? '')
    return { label: def.label, text, changed: value !== def.default }
  })
})
</script>

<template>
  <div class="rules" :class="{ single }">
    <section v-for="(section, i) in game.rulesIntro" :key="section.title" class="slide-in" :style="{ '--i': i * 0.5 }">
      <h3 class="font-display"><span class="num">{{ i + 1 }}</span>{{ section.title }}</h3>
      <p v-for="line in section.body" :key="line">{{ line }}</p>
    </section>
    <section class="slide-in" :style="{ '--i': game.rulesIntro.length * 0.5 }">
      <h3 class="font-display"><span class="num red">✓</span>{{ S.rules.current }}</h3>
      <dl class="current">
        <template v-for="row in current" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd class="font-display" :class="{ changed: row.changed }">{{ row.text }}</dd>
        </template>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.rules {
  columns: 2;
  column-gap: 2.4rem;
  font-size: 0.96rem;
  line-height: 1.75;
  -webkit-user-select: text;
  user-select: text;
}
.rules.single {
  columns: 1;
}
section {
  break-inside: avoid;
  padding-bottom: 1.1rem;
}
h3 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.15rem;
  line-height: 1.3;
  padding-bottom: 0.2rem;
}
.num {
  display: grid;
  width: 1.5rem;
  height: 1.5rem;
  place-items: center;
  border-radius: 50%;
  background: var(--color-ink);
  color: var(--color-paper);
  font-size: 0.8rem;
}
.num.red {
  background: var(--color-red);
}
p {
  position: relative;
  padding-left: 1rem;
  text-wrap: pretty;
}
p::before {
  content: '';
  position: absolute;
  left: 0.2rem;
  top: 0.78em;
  width: 0.36rem;
  height: 0.12rem;
  background: var(--color-ink);
}
.current {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.05rem 1.2rem;
  padding-left: 0.4rem;
}
dt {
  color: var(--color-ink-soft);
}
dd {
  font-size: 0.9rem;
}
dd.changed {
  color: var(--color-red);
}
</style>
