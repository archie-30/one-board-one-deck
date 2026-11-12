<script setup lang="ts">
// 規則說明內文（規則頁與對局中的選單共用），最後列出目前的規則設定
import { computed } from 'vue'
import { S } from '@/data/strings'
import { resolveOptions } from '@/games/options'
import type { GameDef } from '@/games/types'

const props = defineProps<{ game: GameDef; options?: Record<string, string | boolean> }>()

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
  <div class="rules">
    <section v-for="section in game.rulesIntro" :key="section.title">
      <h3 class="font-display">{{ section.title }}</h3>
      <p v-for="line in section.body" :key="line">{{ line }}</p>
    </section>
    <section>
      <h3 class="font-display">{{ S.rules.current }}</h3>
      <dl class="current">
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
  max-width: 34rem;
  font-size: 0.980rem;
  line-height: 1.850;
  -webkit-user-select: text;
  user-select: text;
}
section {
  padding-bottom: 1.300rem;
}
h3 {
  font-size: 1.400rem;
  line-height: 1.300;
  padding-bottom: 0.250rem;
}
p {
  position: relative;
  padding-left: 1rem;
  text-wrap: pretty;
}
p::before {
  content: '';
  position: absolute;
  left: 0.150rem;
  top: 0.800em;
  width: 0.380rem;
  height: 0.380rem;
  border-radius: 50%;
  background: var(--color-ink);
}
.current {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.100rem 1.400rem;
}
dt {
  color: var(--color-ink-soft);
}
dd.changed {
  text-decoration: underline;
  text-decoration-color: var(--color-red);
  text-decoration-thickness: 0.140rem;
  text-underline-offset: 0.250em;
}
</style>
