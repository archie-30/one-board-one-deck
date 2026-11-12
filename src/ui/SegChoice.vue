<script setup lang="ts">
// 幾選一：選中的那格用色鉛筆塗滿
defineProps<{ choices: { value: string; label: string }[]; value: string }>()
const emit = defineEmits<{ change: [value: string] }>()
</script>

<template>
  <div class="seg" role="radiogroup">
    <button
      v-for="c in choices"
      :key="c.value"
      class="seg-item"
      :class="{ on: c.value === value }"
      role="radio"
      :aria-checked="c.value === value"
      @click="c.value !== value && emit('change', c.value)"
    >
      {{ c.label }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.400rem;
}
.seg-item {
  border: 0.130rem solid var(--color-ink);
  border-radius: 0.500rem 0.350rem 0.550rem 0.300rem;
  background: var(--color-card);
  padding: 0.200rem 0.800rem;
  font-size: 0.950rem;
  line-height: 1.500;
  transition:
    background-color 160ms ease,
    transform 160ms var(--ease-out);
}
.seg-item.on {
  background: var(--color-sun);
}
.seg-item:active {
  transform: scale(0.960);
}
</style>
