<script setup lang="ts">
// 規則選項清單：規則設定頁、暫停選單共用。依分組（規則／計分／其他）排好；難度在模式選單上選，不列在這裡。
// lockUnsafe：對局中（暫停選單）——會影響公平的選項反灰，顯示「請在局外設定」。
import { computed } from 'vue'
import { S } from '@/data/strings'
import type { GameDef, SettingDef, SettingGroup } from '@/games/types'
import Tabs from './Tabs.vue'

const props = defineProps<{ game: GameDef; values: Record<string, string | boolean>; lockUnsafe?: boolean }>()
const emit = defineEmits<{ set: [key: string, value: string | boolean] }>()

const ORDER: SettingGroup[] = ['rules', 'score', 'other']
const groups = computed(() => {
  const defs = props.game.settings.filter((d) => d.key !== 'difficulty')
  return ORDER.map((g) => ({ g, defs: defs.filter((d) => (d.group ?? 'rules') === g) })).filter((x) => x.defs.length)
})
const onOff = [
  { value: 'on', label: S.common.on },
  { value: 'off', label: S.common.off },
]
const locked = (d: SettingDef) => !!props.lockUnsafe && !d.live
/** 選項文字很長或很多個：改成等寬的格子，字在格子裡換行（不會一格擠到下一排） */
const even = (d: SettingDef) => d.type === 'choice' && (d.choices.length > 2 || d.choices.some((c) => c.label.length > 6))
</script>

<template>
  <div>
    <section v-for="(grp, gi) in groups" :key="grp.g" class="grp">
      <h3 v-if="groups.length > 1" class="t-label head rise" :style="{ '--i': gi }">{{ S.gameSettings.groups[grp.g] }}</h3>
      <ul>
        <li v-for="(def, i) in grp.defs" :key="def.key" class="item rise" :class="{ off: locked(def) }" :style="{ '--i': gi + i * 0.5 }">
          <div class="min-w-0 flex-1">
            <p class="t-black text-[1rem] leading-snug">
              {{ def.label }}<span v-if="values[def.key] !== def.default" class="dot" />
            </p>
            <p class="text-[0.78rem] leading-snug text-ink-2">{{ locked(def) ? S.gameSettings.lockedNow : def.help }}</p>
          </div>
          <Tabs
            v-if="def.type === 'choice'"
            :choices="def.choices"
            :value="String(values[def.key])"
            :even="even(def)"
            class="ctl"
            :class="{ wide: even(def) }"
            @change="(v) => !locked(def) && emit('set', def.key, v)"
          />
          <Tabs v-else :choices="onOff" :value="values[def.key] ? 'on' : 'off'" class="ctl" @change="(v) => !locked(def) && emit('set', def.key, v === 'on')" />
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.grp + .grp {
  margin-top: 0.9rem;
}
.head {
  padding: 0.2rem 0;
  color: var(--color-red);
}
.item {
  display: flex;
  align-items: center;
  gap: 1.4rem;
  padding: 0.55rem 0;
  border-bottom: 0.08rem solid var(--color-ink);
}
.item.off {
  opacity: 0.4;
}
.item.off .ctl {
  pointer-events: none;
}
.ctl {
  flex-shrink: 0;
  max-width: 26rem;
}
.ctl.wide {
  width: min(26rem, 52%);
}
.dot {
  display: inline-block;
  width: 0.45rem;
  height: 0.45rem;
  margin-left: 0.35rem;
  background: var(--color-red);
  vertical-align: middle;
}
</style>
