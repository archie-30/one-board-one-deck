<template>
  <!-- 全站共用的排線（鉛筆陰影）圖樣 -->
  <svg width="0" height="0" style="position: absolute" aria-hidden="true">
    <defs>
      <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">
        <path d="M0 2.500h5" stroke="var(--color-ink)" stroke-width="1" opacity=".5" />
      </pattern>
      <pattern id="hatch-x" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">
        <path d="M0 2.500h5M2.500 0v5" stroke="var(--color-ink)" stroke-width=".9" opacity=".5" />
      </pattern>
      <pattern id="hatch-w" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <path d="M0 3.500h7M3.500 0v7" stroke="var(--color-card)" stroke-width="1.100" opacity=".55" />
      </pattern>
      <pattern id="hatch-soft" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-52)">
        <path d="M0 2h4" stroke="var(--color-ink)" stroke-width=".7" opacity=".32" />
      </pattern>
      <pattern id="hatch-fine" width="1.500" height="1.500" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">
        <path d="M0 .75h1.500M.75 0v1.500" stroke="var(--color-ink)" stroke-width=".26" opacity=".5" />
      </pattern>
      <pattern id="hatch-fine-soft" width="1.200" height="1.200" patternUnits="userSpaceOnUse" patternTransform="rotate(-52)">
        <path d="M0 .6h1.200" stroke="var(--color-ink)" stroke-width=".2" opacity=".32" />
      </pattern>
    </defs>
  </svg>
</template>
