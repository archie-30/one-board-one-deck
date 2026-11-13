<script setup lang="ts">
// 規則說明：兩欄，每一段有編號；最後列出目前的規則設定
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
    <section v-for="(section, i) in game.rulesIntro" :key="section.title" class="rise" :style="{ '--i': i * 0.6 }">
      <h3><span class="t-slab num">{{ String(i + 1).padStart(2, '0') }}</span><span class="t-black">{{ section.title }}</span></h3>
      <p v-for="line in section.body" :key="line">{{ line }}</p>
    </section>
    <section class="rise current-box" :style="{ '--i': game.rulesIntro.length * 0.6 }">
      <h3><span class="t-slab num red">✓</span><span class="t-black">{{ S.rules.current }}</span></h3>
      <dl>
        <template v-for="row in current" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd :class="{ changed: row.changed }">{{ row.text }}</dd>
        </template>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.rules {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: start;
  gap: 0 2.2rem;
  font-size: 0.9rem;
  line-height: 1.7;
  -webkit-user-select: text;
  user-select: text;
}
.rules.single {
  grid-template-columns: 1fr;
}
section {
  margin-bottom: 0.9rem;
  padding: 0.8rem 1rem 0.7rem;
  border-radius: var(--radius);
  background: var(--color-card);
  box-shadow: var(--shadow-1);
}
h3 {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
  padding-bottom: 0.2rem;
  margin-bottom: 0.3rem;
  font-size: 1.02rem;
}
.num {
  font-size: 0.95rem;
  color: var(--color-red);
}
p {
  position: relative;
  padding-left: 0.9rem;
  color: var(--color-ink);
  text-wrap: pretty;
}
p::before {
  content: '';
  position: absolute;
  left: 0.15rem;
  top: 0.72em;
  width: 0.32rem;
  height: 0.32rem;
  border-radius: 50%;
  background: var(--color-ink-3);
}
dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.05rem 1rem;
}
dt {
  color: var(--color-ink-2);
}
dd {
  font-weight: 900;
}
dd.changed {
  color: var(--color-red);
}
</style>
