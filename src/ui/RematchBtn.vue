<script setup lang="ts">
// 連線對局打完：「再玩一次」（大家都按了就直接開下一局）＋底下一個小的「回到房間」。
// 有人回到房間了就不能再玩一次（按鈕反灰）；自己按過了就顯示「等大家（2／3）」。觀戰的人只有「回到房間」。
import { computed, inject } from 'vue'
import { againState, voteAgain } from '@/core/online'
import { liveOver } from '@/core/onlineMatch'
import { S } from '@/data/strings'
import Btn from './Btn.vue'

defineOptions({ inheritAttrs: false })
defineProps<{ tone?: 'red' | 'ink' | 'blue' | 'yellow' | 'plain'; size?: 'lg' | 'md' | 'sm'; block?: boolean }>()
/** PlayScreen 給的：回到房間（走離開遊戲的過場） */
const exits = inject<{ toRoom: () => void } | null>('onlineExits', null)
const T = S.online
/** 這一局打完了、而且還沒有人回到房間 */
const open = computed(() => liveOver.value && againState.value.open)
</script>

<template>
  <span class="rm" :class="[$attrs.class, { block }]" :style="$attrs.style as never">
    <Btn v-if="!againState.watching" :tone="tone ?? 'red'" :size="size" :block="block" icon="again" :disabled="!open || againState.mine" @click="voteAgain">
      {{ !open ? T.againOff : againState.mine ? T.againWait(againState.voted, againState.total) : T.again }}
    </Btn>
    <button class="back t-label" type="button" @click="exits?.toRoom()">{{ T.backRoomShort }}</button>
  </span>
</template>

<style scoped>
.rm {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}
.rm.block {
  display: flex;
  width: 100%;
}
.back {
  position: relative;
  color: var(--color-ink-2);
  text-decoration: underline;
  text-underline-offset: 0.15rem;
}
/* 字很小：點擊範圍放大一圈 */
.back::after {
  content: '';
  position: absolute;
  inset: -0.4rem -0.6rem;
}
</style>
