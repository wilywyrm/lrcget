<template>
  <div
    ref="segmentElement"
    class="word-segment absolute flex items-center justify-center px-1 py-1 text-sm select-none h-full overflow-visible"
    :class="segmentClass"
    :style="segmentStyle"
    :title="`${word.text} (${formatTimestampMs(startMs)} - ${formatTimestampMs(endMs)})`"
    @mouseenter="handleSegmentHover"
    @mousemove="handleSegmentHover"
    @mouseleave="handleSegmentLeave"
    @click="handleSegmentClick"
    @dblclick.stop="handleSegmentDoubleClick"
  >
    <!-- Active editor: a single reading field for the focused word. It floats
         up into the lane's transliteration track (top: -1.75rem) so the input
         visually occupies this word's slot in that track row. Stored readings
         for non-active words are rendered by the lane's track, not here. -->
    <input
      v-if="isActiveWord"
      ref="readingInput"
      class="ruby-reading-input border border-hoa-1100 bg-white text-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
      :value="wordReading"
      :placeholder="word.text"
      spellcheck="false"
      autocomplete="off"
      @input="updateReading($event.target.value)"
      @blur="deactivateEditor"
      @keydown.tab.prevent="jumpToNextNeedsReading"
      @keydown.enter.prevent="jumpToNextNeedsReading"
      @keydown.esc.prevent="deactivateEditor"
      @click.stop
      @mousedown.stop
      @dblclick.stop
    />

    <div
      ref="previewContainerElement"
      class="relative flex items-center justify-center w-full h-full min-w-0 overflow-hidden"
    >
      <span
        ref="textElement"
        class="relative z-10 block max-w-full overflow-hidden whitespace-nowrap text-clip"
      >
        {{ word.text }}
      </span>

      <div
        v-if="hoverPreview"
        class="absolute inset-y-0 pointer-events-none z-20"
        :style="{ left: `${hoverPreview.splitX}px` }"
      >
        <div
          class="absolute top-0 bottom-0 w-[2px] -translate-x-1/2 bg-neutral-500/80 dark:bg-neutral-200/90 ring-1 ring-neutral-500/20"
        />
      </div>
    </div>

    <div
      v-if="showNextWordHint"
      class="absolute left-1/2 top-full z-40 mt-1 -translate-x-1/2 px-2 py-0.5 rounded-md border border-hoa-1100/40 bg-hoa-1100 text-xs font-medium leading-4 text-white shadow-sm whitespace-nowrap pointer-events-none"
      :style="{ left: 0 }"
      :title="`Next word: ${nextWordHintText}`"
    >
      {{ nextWordHintText }}
    </div>

    <div
      v-if="hasStartAfterEndWarning"
      class="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 z-40 flex items-center justify-center text-amber-500"
      title="word start is after end"
    >
      <Alert class="w-3.5 h-3.5" />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import Alert from '~icons/mdi/alert'
import { formatTimestampMs } from '@/utils/lyricsfile.js'
import { needsTransliteration } from '@/utils/word-tokenizer.js'

const emit = defineEmits([
  'split-at',
  'activate-editor',
  'deactivate-editor',
  'update-reading',
  'jump-next',
])

const props = defineProps({
  word: {
    type: Object,
    required: true,
  },
  wordIndex: {
    type: Number,
    required: true,
  },
  startMs: {
    type: Number,
    default: 0,
  },
  endMs: {
    type: Number,
    default: 0,
  },
  lineStartMs: {
    type: Number,
    default: 0,
  },
  lineEndMs: {
    type: Number,
    default: 0,
  },
  timelineWidth: {
    type: Number,
    default: 0,
  },
  progressMs: {
    type: Number,
    default: 0,
  },
  nextWordText: {
    type: String,
    default: '',
  },
  nextWordStartMs: {
    type: Number,
    default: null,
  },
  nextWordEndMs: {
    type: Number,
    default: null,
  },
  selectedBoundaryIndex: {
    type: Number,
    default: -1,
  },
  selectedBoundaryIndices: {
    type: Array,
    default: () => [],
  },
  selectedTransliterationSystem: {
    type: Object,
    default: null,
  },
  activeWordIndex: {
    type: Number,
    default: null,
  },
})

const segmentElement = ref(null)
const previewContainerElement = ref(null)
const textElement = ref(null)
const hoverPreview = ref(null)
const readingInput = ref(null)

const nextWordHintText = computed(() => (props.nextWordText || '').trim())

const nextSegmentWidthPx = computed(() => {
  if (!Number.isFinite(props.timelineWidth) || props.timelineWidth <= 0) {
    return 0
  }

  if (
    !Number.isFinite(props.lineStartMs) ||
    !Number.isFinite(props.lineEndMs) ||
    props.lineEndMs <= props.lineStartMs
  ) {
    return 0
  }

  if (!Number.isFinite(props.nextWordStartMs) || !Number.isFinite(props.nextWordEndMs)) {
    return 0
  }

  const lineDuration = props.lineEndMs - props.lineStartMs
  const nextDuration = Math.max(0, props.nextWordEndMs - props.nextWordStartMs)
  return (nextDuration / lineDuration) * props.timelineWidth
})

const currentSegmentWidthPx = computed(() => {
  if (!Number.isFinite(props.timelineWidth) || props.timelineWidth <= 0) {
    return 0
  }

  if (
    !Number.isFinite(props.lineStartMs) ||
    !Number.isFinite(props.lineEndMs) ||
    props.lineEndMs <= props.lineStartMs
  ) {
    return 0
  }

  if (!Number.isFinite(props.startMs) || !Number.isFinite(props.endMs)) {
    return 0
  }

  const lineDuration = props.lineEndMs - props.lineStartMs
  const currentDuration = Math.max(0, props.endMs - props.startMs)
  return (currentDuration / lineDuration) * props.timelineWidth
})

const doesNextWordOverflow = computed(() => {
  if (!nextWordHintText.value || nextSegmentWidthPx.value <= 0) {
    return false
  }

  const font = textElement.value ? getComputedStyle(textElement.value).font : '14px sans-serif'
  const textWidth = measureTextWidth(nextWordHintText.value, font)

  // Segment uses horizontal padding (px-1), so reserve a small visual margin.
  const availableWidth = Math.max(0, nextSegmentWidthPx.value - 8)
  return textWidth > availableWidth + 1
})

const isSelectedDividerForNextSegment = computed(() => {
  if (!Number.isFinite(props.nextWordStartMs)) {
    return false
  }

  const nextBoundaryIndex = props.wordIndex

  if (props.selectedBoundaryIndex === nextBoundaryIndex) {
    return true
  }

  return Array.isArray(props.selectedBoundaryIndices)
    ? props.selectedBoundaryIndices.includes(nextBoundaryIndex)
    : false
})

const showNextWordHint = computed(() => {
  return (
    isSelectedDividerForNextSegment.value &&
    nextWordHintText.value.length > 0
  )
})

const splitTextByGrapheme = text => {
  if (!text || typeof text !== 'string') {
    return []
  }

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' })
    return Array.from(segmenter.segment(text), item => item.segment)
  }

  return Array.from(text)
}

const measureTextWidth = (text, font) => {
  if (typeof document === 'undefined') {
    return 0
  }

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    return 0
  }

  context.font = font
  return context.measureText(text).width
}

const getSplitPreview = clientX => {
  if (!segmentElement.value || !previewContainerElement.value || !textElement.value) {
    return null
  }

  const text = props.word.text || ''
  const graphemes = splitTextByGrapheme(text)
  if (graphemes.length <= 1) {
    return null
  }

  const segmentRect = segmentElement.value.getBoundingClientRect()
  const previewContainerRect = previewContainerElement.value.getBoundingClientRect()
  const textRect = textElement.value.getBoundingClientRect()
  if (segmentRect.width <= 0 || previewContainerRect.width <= 0 || textRect.width <= 0) {
    return null
  }

  const textNode = textElement.value.firstChild
  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    const pointerClientX = Math.max(textRect.left, Math.min(textRect.right, clientX))
    const range = document.createRange()
    const boundaries = []

    for (let index = 1; index < graphemes.length; index++) {
      const offset = graphemes.slice(0, index).join('').length

      range.setStart(textNode, 0)
      range.setEnd(textNode, offset)

      const boundaryRect = range.getBoundingClientRect()
      const boundaryClientX = boundaryRect.right

      if (!Number.isFinite(boundaryClientX)) {
        continue
      }

      boundaries.push({
        splitIndex: index,
        measuredWidth: Math.max(0, boundaryClientX - textRect.left),
        splitX: boundaryClientX - previewContainerRect.left,
      })
    }

    if (boundaries.length > 0) {
      let nearestBoundary = boundaries[0]
      let nearestDistance = Math.abs(pointerClientX - (previewContainerRect.left + nearestBoundary.splitX))

      for (const boundary of boundaries.slice(1)) {
        const distance = Math.abs(pointerClientX - (previewContainerRect.left + boundary.splitX))
        if (distance < nearestDistance) {
          nearestBoundary = boundary
          nearestDistance = distance
        }
      }

      const splitRatio = Math.max(0, Math.min(1, nearestBoundary.measuredWidth / textRect.width))

      return {
        splitIndex: nearestBoundary.splitIndex,
        splitRatio,
        splitX: nearestBoundary.splitX,
      }
    }
  }

  const font = getComputedStyle(textElement.value).font
  const graphemeWidths = graphemes.map(grapheme => measureTextWidth(grapheme, font))
  const totalMeasuredWidth = graphemeWidths.reduce((sum, width) => sum + width, 0)

  if (totalMeasuredWidth <= 0) {
    return null
  }

  const cumulativeBoundaries = []
  let runningWidth = 0
  for (let index = 0; index < graphemeWidths.length - 1; index++) {
    runningWidth += graphemeWidths[index]
    cumulativeBoundaries.push({
      splitIndex: index + 1,
      measuredWidth: runningWidth,
    })
  }

  const pointerOffset = Math.max(0, Math.min(textRect.width, clientX - textRect.left))
  const scaledOffset = (pointerOffset / textRect.width) * totalMeasuredWidth

  let nearestBoundary = cumulativeBoundaries[0]
  let nearestDistance = Math.abs(scaledOffset - nearestBoundary.measuredWidth)

  for (const boundary of cumulativeBoundaries.slice(1)) {
    const distance = Math.abs(scaledOffset - boundary.measuredWidth)
    if (distance < nearestDistance) {
      nearestBoundary = boundary
      nearestDistance = distance
    }
  }

  const splitX =
    (nearestBoundary.measuredWidth / totalMeasuredWidth) * textRect.width +
    (textRect.left - previewContainerRect.left)

  return {
    splitIndex: nearestBoundary.splitIndex,
    splitRatio: nearestBoundary.measuredWidth / totalMeasuredWidth,
    splitX,
  }
}

const isPlaying = computed(() => {
  // The word is playing when: startMs <= currentTime < endMs
  return props.progressMs >= props.startMs && props.progressMs < props.endMs
})

const hasStartAfterEndWarning = computed(() => {
  const startMs = props.word?.start_ms
  const endMs = props.word?.end_ms
  return Number.isFinite(startMs) && Number.isFinite(endMs) && startMs > endMs
})

// The active reading system (`{ id, system }`) or null when none is declared.
// Every ruby affordance below is gated on this — no system means no ruby, no
// highlight, no editor: the timeline behaves exactly as before.
const activeSystem = computed(() => props.selectedTransliterationSystem)

// This word's stored reading under the active system, or '' when absent.
const wordReading = computed(() => {
  const system = activeSystem.value
  if (!system) return ''
  const map = props.word?.transliteration
  return (map && map[system.id]) || ''
})

// A kanji/hanzi word "needs a reading" when a transliteration system is active
// and this word has ideographs but no stored reading under that system. This is
// the discovery cue that opens the per-word reading editor (Task 17).
const needsReading = computed(() => {
  const system = activeSystem.value
  return Boolean(system && needsTransliteration(props.word, system.id))
})

// Exactly one word per line is "active" at a time (index shared by the lane).
const isActiveWord = computed(
  () => Boolean(activeSystem.value) && props.activeWordIndex === props.wordIndex
)

const segmentClass = computed(() => {
  const baseClasses = [
    'bg-neutral-200 dark:bg-neutral-700',
    'text-neutral-800 dark:text-neutral-300',
    'border-r',
    'border-neutral-300',
    'dark:border-neutral-600',
  ]

  if (isPlaying.value) {
    baseClasses.push(
      'bg-hoa-1100',
      'dark:bg-hoa-1100',
      'text-white',
      'dark:text-white',
      'font-bold',
      'border-r',
      'border-hoa-1100',
      'dark:border-hoa-1100'
    )
  }

  if (needsReading.value && !isActiveWord.value) {
    baseClasses.push('needs-transliteration')
  }

  return baseClasses
})

const segmentStyle = computed(() => {
  if (!props.timelineWidth || props.lineEndMs <= props.lineStartMs) {
    return {}
  }

  const duration = props.lineEndMs - props.lineStartMs
  const leftPercent = ((props.startMs - props.lineStartMs) / duration) * 100
  const wordDuration = Math.max(0, props.endMs - props.startMs)
  const widthPercent = (wordDuration / duration) * 100

  return {
    left: `${leftPercent}%`,
    width: `${widthPercent}%`,
    transition: 'none',
  }
})

const handleSegmentDoubleClick = event => {
  const splitPreview = getSplitPreview(event.clientX)
  if (!splitPreview) {
    return
  }

  emit('split-at', {
    wordIndex: props.wordIndex,
    splitIndex: splitPreview.splitIndex,
    splitRatio: splitPreview.splitRatio,
  })
}

// Open the inline reading editor for this word (single active word per line).
const activateEditor = () => {
  if (!activeSystem.value) return
  emit('activate-editor', props.wordIndex)
}

// Close the editor. The lane only clears if THIS word is still the active one,
// so a Tab-jump that has already moved focus onward isn't clobbered.
const deactivateEditor = () => {
  emit('deactivate-editor', props.wordIndex)
}

// Persist a reading edit upward. Empty/blank clears the key (never writes `{}`).
const updateReading = value => {
  emit('update-reading', { index: props.wordIndex, value })
}

// Tab/Enter advances to the next word in the line that still needs a reading.
const jumpToNextNeedsReading = () => {
  emit('jump-next', props.wordIndex)
}

// Suppress click bubbling to the timeline (which would seek) whenever the
// split preview is rendered. `hoverPreview` is non-null iff the splitter UI
// is visible, so this guarantees: preview visible -> no seek on click.
const handleSegmentClick = event => {
  if (hoverPreview.value) {
    event.stopPropagation()
    return
  }

  // A highlighted (needs-reading) word is the "add a reading here" affordance:
  // clicking it opens the per-word reading editor (Task 17) instead of seeking.
  if (activeSystem.value && needsReading.value) {
    event.stopPropagation()
    activateEditor()
  }
}

// When this word becomes active, focus its field and select the current text so
// typing immediately replaces it.
watch(isActiveWord, active => {
  if (!active) return
  nextTick(() => {
    const el = readingInput.value
    if (!el) return
    el.focus()
    el.select()
  })
})

const handleSegmentHover = event => {
  hoverPreview.value = getSplitPreview(event.clientX)
}

const handleSegmentLeave = () => {
  hoverPreview.value = null
}

</script>

<style scoped>
.word-segment {
  user-select: none;
  touch-action: none;
}

/* Subtle "needs a reading" affordance: a low-noise amber underline (not a box)
   marking kanji/hanzi words that lack a transliteration in the active system.
   Clicking the segment opens the per-word reading editor. */
.needs-transliteration {
  border-bottom: 2px solid var(--amber-400, #fbbf24);
  cursor: pointer;
}

/* Active editor: a single reading field for the focused word. It floats up by
   the transliteration-track height (1.75rem) so it sits inside that track row
   in the lane, occupying this word's slot. */
.ruby-reading-input {
  position: absolute;
  top: -1.75rem;
  left: 0;
  z-index: 40;
  width: 100%;
  min-width: 3.5rem;
  height: 1.75rem;
  padding: 0 4px;
  font-size: 0.65em;
  line-height: 1.75rem;
  text-align: center;
  border-radius: 0;
  outline: none;
}
</style>
