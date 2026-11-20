<script setup lang="ts">
// 連線對局打完：「再玩一次」（大家都按了就直接開下一局）＋底下一行小字「幾人已按再玩一次」
// （回到房間旁邊已經有按鈕，這裡不再放）。有人回到房間了就不能再玩一次（按鈕反灰）；自己按過了就顯示「等大家（2／3）」。觀戰的人只看得到人數。
import { computed } from 'vue'
import { againState, voteAgain } from '@/core/online'
import { liveOver } from '@/core/onlineMatch'
import { S } from '@/data/strings'
import Btn from './Btn.vue'

defineOptions({ inheritAttrs: false })
defineProps<{ tone?: 'red' | 'ink' | 'blue' | 'yellow' | 'plain'; size?: 'lg' | 'md' | 'sm'; block?: boolean }>()
const T = S.online
/** 這一局打完了、而且還沒有人回到房間 */
const open = computed(() => liveOver.value && againState.value.open)
</script>

<template>
  <span class="rm" :class="[$attrs.class, { block }]" :style="$attrs.style as never">
    <Btn v-if="!againState.watching" :tone="tone ?? 'red'" :size="size" :block="block" icon="again" :disabled="!open || againState.mine" @click="voteAgain">
      {{ !open ? T.againOff : againState.mine ? T.againWait(againState.voted, againState.total) : T.again }}
    </Btn>
    <span v-if="open" class="count t-label">{{ T.againCount(againState.voted, againState.total) }}</span>
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
.count {
  color: var(--color-ink-2);
  white-space: nowrap;
}
</style>
