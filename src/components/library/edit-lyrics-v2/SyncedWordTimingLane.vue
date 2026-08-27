<template>
  <div
    class="relative z-20 flex flex-col px-2 py-2 rounded-lg overflow-visible transition-[height] duration-200 ease-out"
    :class="[
      hasSelectedLine ? 'bg-neutral-100 dark:bg-neutral-800' : 'bg-white dark:bg-neutral-950',
      laneHeightClass,
    ]"
  >
    <!-- Empty state - no line selected -->
    <div v-if="!hasSelectedLine" class="flex items-center justify-center h-full">
      <span class="text-sm text-neutral-700 dark:text-neutral-400 italic">
        Select a lyric line to edit word timings
      </span>
    </div>

    <!-- Feature not available states -->
    <div v-else-if="!hasLineContent" class="flex items-center justify-center h-full">
      <span class="text-sm text-neutral-700 dark:text-neutral-400 italic">
        Add lyrics content to enable word timing
      </span>
    </div>

    <div v-else-if="!hasLineStartTime" class="flex items-center justify-center h-full">
      <span class="text-sm text-neutral-700 dark:text-neutral-400 italic">
        Sync the line (set start time) to enable word timing
      </span>
    </div>

    <div v-else-if="!hasLineEndTime" class="flex items-center justify-center h-full">
      <span class="text-sm text-neutral-700 dark:text-neutral-400 italic">
        Set the line end timestamp to define the timing window
      </span>
    </div>

    <!-- Word timing timeline -->
    <template v-else-if="isWordSyncAvailable">
      <!-- Header with line info -->
      <div class="flex items-center justify-between mb-2 shrink-0">
        <div class="flex items-center gap-3 text-xs text-neutral-600 dark:text-neutral-400">
          <span class="font-mono bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 px-2 py-0.5 rounded">
            {{ formatTimestampMs(selectedLine.start_ms) }} -
            {{ formatTimestampMs(actualLineEndMs) }}
          </span>
          <span class="truncate max-w-xs">{{ selectedLine.text || '(empty)' }}</span>
        </div>

        <div class="flex items-center gap-2">
          <button
            v-if="filePath"
            class="button button-normal rounded-full h-6 w-6 flex items-center justify-center"
            :title="spectrogramVisible ? 'Hide spectrogram' : 'Show spectrogram'"
            @click="toggleSpectrogramVisible"
          >
            <Waveform v-if="spectrogramVisible" class="w-3.5 h-3.5" />
            <EyeOff v-else class="w-3.5 h-3.5" />
          </button>
          <button
            class="button button-normal text-xs px-2 py-1 rounded flex items-center gap-1"
            :title="playLineTitle"
            @click="handlePlayLine"
          >
            <Play class="w-3.5 h-3.5" />
            <span>Play</span>
          </button>
          <button
            class="button button-primary text-xs px-2 py-1 rounded flex items-center gap-1"
            :title="syncWordTitle"
            @click="handleSyncWord"
          >
            <Equal class="w-3.5 h-3.5" />
            <span>Sync word</span>
          </button>
          <button
            class="button button-normal text-xs px-2 py-1 rounded flex items-center gap-1"
            title="Reset word timings to default state"
            @click="handleResetWords"
          >
            <Close class="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      <div class="relative flex flex-col flex-1 min-h-0">
      <!-- Transliteration controls bar: always visible. Zero-system state shows
           a placeholder + add button; ≥1-system state shows the active-system
           select with inline re-tag (the select itself becomes an input),
           remove, and add affordances. -->
      <div class="flex items-center gap-2 mb-2 shrink-0">
        <span
          v-if="declaredSystems.length === 0"
          class="text-xs text-neutral-500 dark:text-neutral-400 italic"
        >
          No transliteration
        </span>

        <template v-else>
          <select
            v-if="!isEditingSystem"
            class="select select-xs"
            :value="selectedTransliterationSystem?.id ?? ''"
            @change="onSelectSystem"
          >
            <option value="">No transliteration track selected</option>
            <option
              v-for="entry in declaredSystems"
              :key="entry.id"
              :value="entry.id"
            >
              {{ systemLabel(entry.system) }} ({{ entry.system }})
            </option>
          </select>
          <input
            v-else
            v-model="editingSystemText"
            type="text"
            class="input px-3 h-7 w-[10rem]"
            placeholder="BCP-47 tag"
            @keydown.enter.prevent="confirmEditSystem"
            @keydown.esc.prevent="cancelEditSystem"
          />

          <button
            v-if="!isEditingSystem && selectedTransliterationSystem"
            class="button button-normal rounded h-6 w-6 flex items-center justify-center"
            title="Edit reading system locale"
            type="button"
            @click="startEditSystem(selectedTransliterationSystem)"
          >
            <Pencil class="w-3.5 h-3.5" />
          </button>

          <template v-if="isEditingSystem">
            <button
              class="button button-primary rounded h-6 w-6 flex items-center justify-center"
              title="Confirm re-tag"
              type="button"
              @click="confirmEditSystem"
            >
              <Check class="w-3.5 h-3.5" />
            </button>
            <button
              class="button button-normal rounded h-6 w-6 flex items-center justify-center"
              title="Cancel"
              type="button"
              @click="cancelEditSystem"
            >
              <Close class="w-3.5 h-3.5" />
            </button>
          </template>

          <button
            v-if="!isEditingSystem && selectedTransliterationSystem"
            class="button button-normal rounded h-6 w-6 flex items-center justify-center"
            title="Remove reading system"
            type="button"
            @click="confirmRemoveSystem(selectedTransliterationSystem)"
          >
            <Trash class="w-3.5 h-3.5" />
          </button>
        </template>

        <VDropdown
          theme="lrcget-dropdown"
          placement="bottom-end"
          :shown="isPickerOpen"
          @apply-show="openPicker"
          @apply-hide="closePicker"
        >
          <button
            class="button button-normal rounded h-6 w-6 flex items-center justify-center"
            title="Add reading system"
            type="button"
          >
            <Plus class="w-3.5 h-3.5" />
          </button>

          <template #popper>
            <div class="dropdown-container min-w-[13rem]">
              <div class="dropdown-section-label">Add reading system</div>
              <template v-if="!isCustomInput">
                <button
                  v-for="presetName in orderedPresetNames"
                  :key="presetName"
                  v-close-popper
                  class="dropdown-item"
                  type="button"
                  @click="choosePreset(presetName)"
                >
                  <span class="dropdown-label">{{ presetName }}</span>
                  <span class="ml-auto text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                    {{ TRANSLITERATION_PRESETS[presetName] }}
                  </span>
                </button>
                <div class="dropdown-divider" />
                <button
                  class="dropdown-item"
                  type="button"
                  @click="isCustomInput = true"
                >
                  <span class="dropdown-label">Custom…</span>
                </button>
              </template>

              <div v-else class="px-2 py-2 flex flex-col gap-2">
                <label class="text-xs text-neutral-600 dark:text-neutral-400">
                  BCP-47 locale tag
                </label>
                <input
                  v-model="customSystemText"
                  type="text"
                  class="input px-3 h-8 w-full"
                  placeholder="e.g. ja-Latn"
                  @keydown.enter.prevent="submitCustomSystem"
                />
                <div class="flex justify-end gap-2">
                  <button
                    class="button button-normal px-3 h-7 rounded text-xs"
                    type="button"
                    @click="isCustomInput = false"
                  >
                    Back
                  </button>
                  <button
                    v-close-popper
                    class="button button-primary px-3 h-7 rounded text-xs"
                    :class="{ 'button-disabled': !customSystemText.trim() }"
                    :disabled="!customSystemText.trim()"
                    type="button"
                    @click="submitCustomSystem"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </template>
        </VDropdown>
      </div>

      <!-- Sub-wrapper: spectrograph + transliteration track + timeline.
           The playhead is absolute within this so it never overlaps the
           controls bar above. -->
      <div class="relative flex flex-col flex-1 min-h-0">
      <SpectrogramPanel
        v-if="filePath && spectrogramVisible"
        :file-path="filePath"
        :start-ms="laneStartMs"
        :end-ms="laneEndMs"
        class="mb-2 shrink-0"
        @seek="$emit('seek', $event)"
      />

      <!-- Transliteration track: a separate row above the main timing track,
           on the same horizontal scale. Shows each word's reading under the
           active system, and continues the word-boundary lines upward (faint)
           so the track and timeline read as one connected surface. -->
      <div
         v-if="selectedTransliterationSystem"
         class="relative shrink-0 bg-neutral-50 dark:bg-neutral-900 border-t border-x-0 border-neutral-300 dark:border-neutral-600 rounded-t overflow-hidden"
         style="height: 1.75rem;"
       >
         <template
           v-for="(word, index) in displayedWords"
           :key="`translit-${index}`"
         >
           <div
             class="absolute flex items-center justify-center px-0.5 overflow-hidden text-neutral-500 dark:text-neutral-400 cursor-pointer"
             :style="getWordSegmentStyle(index)"
             style="top: 0; bottom: 0; font-size: 0.65em;"
             @click.stop="handleActivateEditor(index)"
           >
             <span class="truncate">{{ getWordReading(word) }}</span>
           </div>
         </template>

        <div
          v-for="index in boundaryIndexes"
          :key="`translit-boundary-${index}`"
          class="absolute top-0 bottom-0 w-px -translate-x-1/2 pointer-events-none bg-neutral-300/40 dark:bg-hoa-1000/40"
          :style="{ left: `${timeToPercent(displayedWords[index].start_ms)}%` }"
        />
      </div>

      <!-- Timeline with word segments -->
      <div
        ref="timelineElement"
        class="relative flex-1 bg-white dark:bg-neutral-900 rounded border border-neutral-300 dark:border-neutral-600 transition-opacity duration-200 cursor-pointer"
        :class="{ 'opacity-50': !hasActualWords }"
        @click.capture="handleTimelineCaptureDeselect"
        @click="handleTimelineClick"
      >
        <!-- Timeline grid lines (every 500ms) -->
        <!-- <div class="absolute inset-0 pointer-events-none">
          <template v-for="n in gridLinesCount" :key="n">
            <div
              class="absolute top-0 bottom-0 w-px bg-neutral-200 dark:bg-hoa-1100 opacity-50"
              :style="{ left: `${(n / gridLinesCount) * 100}%` }"
            />
          </template>
        </div> -->

        <!-- Word segments -->
        <SyncedWordTimingSegment
          v-for="(word, index) in displayedWords"
          :key="index"
          :word="word"
          :word-index="index"
          :next-word-text="displayedWords[index]?.text || ''"
          :next-word-start-ms="displayedWords[index]?.start_ms ?? null"
          :next-word-end-ms="
            index + 1 < displayedWords.length ? getWordEndMs(index + 1) : null
          "
          :start-ms="word.start_ms"
          :end-ms="getWordEndMs(index)"
          :line-start-ms="laneStartMs"
          :line-end-ms="laneEndMs"
          :timeline-width="timelineWidth"
          :progress-ms="progressMs"
          :selected-boundary-index="selectedBoundaryIndex"
          :selected-boundary-indices="selectedBoundaryIndices"
          :selected-transliteration-system="selectedTransliterationSystem"
          :active-word-index="activeWordIndex"
          @split-at="handleSegmentSplitAt"
          @activate-editor="handleActivateEditor"
          @deactivate-editor="handleDeactivateEditor"
          @update-reading="handleUpdateReading"
          @jump-next="jumpToNextNeedsReading"
        />

        <button
          v-for="index in boundaryIndexes"
          :key="`boundary-${index}`"
          type="button"
          data-boundary-handle
          class="group absolute top-0 bottom-0 z-30 -ml-2 w-4 cursor-ew-resize bg-transparent"
          :style="{ left: `${timeToPercent(displayedWords[index].start_ms)}%` }"
          :title="`Adjust start of ${displayedWords[index].text}`"
          @pointerdown="handleBoundaryPointerDown(index, $event)"
          @click.stop="selectBoundary(index, $event)"
        >
          <span
            class="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 transition-all duration-150 ease-linear bg-neutral-300/70 dark:bg-hoa-1000/70 group-hover:bg-neutral-600 dark:group-hover:bg-neutral-300 group-hover:w-[3px] group-hover:ring-1 group-hover:ring-neutral-500/25"
            :class="getBoundaryLineClass(index)"
          />
        </button>

        <div
          v-if="dragState"
          class="absolute inset-y-0 z-20 pointer-events-none"
          :style="{ left: `${timeToPercent(dragState.currentStartMs)}%` }"
        >
          <div
            class="absolute top-0 bottom-0 w-[3px] -translate-x-1/2 bg-neutral-600 dark:bg-neutral-300 ring-1 ring-neutral-500/25"
          />
          <div
            class="absolute top-[-0.375rem] left-0 -translate-x-1/2 -translate-y-full px-[0.4rem] py-0.5 rounded-full text-xs leading-4 whitespace-nowrap text-neutral-800 bg-neutral-200 dark:text-white dark:bg-hoa-1100"
          >
            {{ formatTimestampMs(dragState.currentStartMs) }}
          </div>
        </div>

      </div>

      <!-- Line-level transliteration lane: one full-width editable field for
           the whole-line reading under the active system, sitting directly
           below the timeline as a sibling surface. Spacing is preserved
           verbatim. Shows an amber out-of-sync warning when the line-level
           reading diverges from the cue concat (any system), plus an explicit
           "Generate from cues" rebuild. -->
      <div
        v-if="selectedTransliterationSystem"
        class="relative shrink-0 mt-1 flex items-center gap-2 px-2 rounded-b overflow-hidden"
        :class="
          showLineSyncWarning
            ? 'bg-amber-100 dark:bg-amber-950/40 border border-amber-400'
            : 'bg-neutral-50 dark:bg-neutral-900 border-t border-x-0 border-b-0 border-neutral-300 dark:border-neutral-600'
        "
        style="height: 1.75rem"
      >
        <Alert
          v-if="showLineSyncWarning"
          class="shrink-0 w-3.5 h-3.5 text-amber-700 dark:text-amber-300"
          title="Line-level and cue-level readings are out of sync"
        />
        <input
          :value="lineLevelReading"
          type="text"
          class="grow min-w-0 h-full bg-transparent outline-none border-none p-0 text-xs"
          :class="
            showLineSyncWarning
              ? 'text-amber-700 dark:text-amber-300 placeholder:text-amber-600/60 dark:placeholder:text-amber-300/50'
              : 'text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-400 dark:placeholder:text-neutral-500'
          "
          placeholder="No line-level reading — edit or Generate from cues"
          @input="handleLineTransliterationInput"
        />
        <span
          v-if="showLineSyncWarning"
          class="shrink-0 whitespace-nowrap text-[0.65rem] text-amber-700 dark:text-amber-300"
        >
          line-level transliteration does not match cue-level values
        </span>
        <button
          class="button button-normal shrink-0 rounded px-2 py-0.5 text-[0.65rem]"
          title="Generate line-level reading from the cue readings"
          type="button"
          @click="handleGenerateLineFromCues"
        >
          Generate from cues
        </button>
      </div>

      <!-- Playhead spans the spectrograph + transliteration track + timeline +
           line-level lane — it is inside the sub-wrapper so it never overlaps
           the controls bar above. -->
      <div
        v-if="progressMs >= lineStartMs && progressMs <= laneEndMs"
        class="absolute -top-1 bottom-0 w-px bg-neutral-400 dark:bg-neutral-400 z-20 pointer-events-none"
        :style="{ left: `${playheadPercent}%` }"
      >
        <div
          class="absolute -top-1 -left-[3px] w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-neutral-400 dark:border-t-neutral-400"
        />
      </div>
      </div><!-- end sub-wrapper -->
      </div><!-- end outer wrapper -->
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import Equal from '~icons/mdi/equal'
import Play from '~icons/mdi/play'
import Close from '~icons/mdi/close'
import Waveform from '~icons/mdi/waveform'
import EyeOff from '~icons/mdi/eye-off'
import Plus from '~icons/mdi/plus'
import Pencil from '~icons/mdi/pencil'
import Trash from '~icons/mdi/trash-can'
import Check from '~icons/mdi/check'
import Alert from '~icons/mdi/alert'
import { useGlobalState } from '@/composables/global-state.js'
import SpectrogramPanel from '@/components/library/edit-lyrics-v2/SpectrogramPanel.vue'
import SyncedWordTimingSegment from '@/components/library/edit-lyrics-v2/SyncedWordTimingSegment.vue'
import { useEditLyricsV2WordBoundaryDrag } from '@/composables/edit-lyrics-v2/useEditLyricsV2WordBoundaryDrag.js'
import { useEditLyricsV2WordTimingHotkeys } from '@/composables/edit-lyrics-v2/useEditLyricsV2WordTimingHotkeys.js'
import { resolveWordSplitTimeMs } from '@/utils/word-split.js'
import {
  syncedEditorShortcutBindings,
  wordTimingShortcutBindings,
  withShortcutTitle,
} from '@/composables/edit-lyrics-v2/shortcutRegistry.js'
import { formatTimestampMs, splitWordTransliteration } from '@/utils/lyricsfile.js'
import { isLineOutOfSync } from '@/utils/transliteration-sync.js'
import { TRANSLITERATION_PRESETS } from '@/composables/edit-lyrics-v2/useEditLyricsV2Document.js'
import {
  ensureLineWords,
  distributeWordTimings,
  hasValidWords,
  needsTransliteration,
} from '@/utils/word-tokenizer.js'

const props = defineProps({
  selectedLine: {
    type: Object,
    default: null,
  },
  hasSelectedLine: {
    type: Boolean,
    default: false,
  },
  progressMs: {
    type: Number,
    default: 0,
  },
  allLines: {
    type: Array,
    default: () => [],
  },
  selectedLineIndex: {
    type: Number,
    default: -1,
  },
  filePath: {
    type: String,
    default: null,
  },
  declaredTransliterations: {
    type: Array,
    default: () => [],
  },
  selectedTransliterationSystem: {
    type: Object,
    default: null,
  },
  documentLanguage: {
    type: String,
    default: null,
  },
})

const emit = defineEmits([
  'update:words',
  'word-timing-edited',
  'play-line',
  'select-next-line',
  'seek',
  'update:selected-transliteration-system',
  'add-transliteration-system',
  'edit-transliteration-system',
  'remove-transliteration-system',
  'update:line-transliteration',
  'generate-line-transliteration',
])

const { spectrogramVisible, toggleSpectrogramVisible } = useGlobalState()

const PRESET_NAMES = Object.keys(TRANSLITERATION_PRESETS)

// Presets whose locale matches the document language float to the top of the
// picker. Match on the primary subtag (before the first '-') of each system.
const LANGUAGE_PRESET_PRIORITY = {
  ja: ['Furigana', 'Romaji'],
  zh: ['Pinyin', 'Zhuyin'],
  ko: ['Romaja'],
}

const declaredSystems = computed(() => props.declaredTransliterations ?? [])

const systemLabel = system => {
  const preset = PRESET_NAMES.find(name => TRANSLITERATION_PRESETS[name] === system)
  return preset || system
}

const orderedPresetNames = computed(() => {
  const lang = (props.documentLanguage || '').split('-')[0].toLowerCase()
  const prioritized = LANGUAGE_PRESET_PRIORITY[lang] || []
  const rest = PRESET_NAMES.filter(name => !prioritized.includes(name))
  return [...prioritized, ...rest]
})

const isPickerOpen = ref(false)
const isCustomInput = ref(false)
const customSystemText = ref('')

const openPicker = () => {
  isPickerOpen.value = true
  isCustomInput.value = false
  customSystemText.value = ''
}

const closePicker = () => {
  isPickerOpen.value = false
  isCustomInput.value = false
  customSystemText.value = ''
}

const choosePreset = presetName => {
  emit('add-transliteration-system', { presetName, customSystem: null })
  closePicker()
}

const submitCustomSystem = () => {
  const value = customSystemText.value.trim()
  if (!value) return
  emit('add-transliteration-system', { presetName: value, customSystem: value })
  closePicker()
}

const onSelectSystem = event => {
  const id = event.target.value
  const entry = declaredSystems.value.find(system => system.id === id)
  emit('update:selected-transliteration-system', entry ? { ...entry } : null)
}

const editingSystemId = ref(null)
const editingSystemText = ref('')

// True while the inline system re-tag editor is open: the controls bar swaps
// the active-system <select> for an <input>, hiding the pencil/trash in favor
// of confirm/cancel.
const isEditingSystem = computed(() => editingSystemId.value !== null)

const startEditSystem = entry => {
  editingSystemId.value = entry.id
  editingSystemText.value = entry.system
}

const cancelEditSystem = () => {
  editingSystemId.value = null
  editingSystemText.value = ''
}

const confirmEditSystem = () => {
  const value = editingSystemText.value.trim()
  if (!value || editingSystemId.value == null) {
    cancelEditSystem()
    return
  }
  if (
    !window.confirm(
      'Re-tagging this reading system will re-key every existing word reading under it. Continue?'
    )
  ) {
    return
  }
  emit('edit-transliteration-system', { oldId: editingSystemId.value, newSystem: value })
  cancelEditSystem()
}

const confirmRemoveSystem = entry => {
  if (
    !window.confirm(
      `Remove the "${systemLabel(entry.system)}" reading system? This deletes all word readings stored under it.`
    )
  ) {
    return
  }
  emit('remove-transliteration-system', entry.id)
  if (editingSystemId.value === entry.id) cancelEditSystem()
}

const timelineElement = ref(null)
const timelineWidth = ref(0)
const laneStartMs = ref(0)
const laneEndMs = ref(0)
const segmentedTokenTexts = ref(null)
const segmentationRequestId = ref(0)

// The single word currently being edited for its transliteration reading, or
// null. Lane-local (one line is shown at a time), shared across every segment
// so only one inline reading field is ever open at once.
const activeWordIndex = ref(null)

const playLineTitle = withShortcutTitle(
  'Play line from beginning',
  syncedEditorShortcutBindings,
  'replaySelectedLine'
)

const syncWordTitle = withShortcutTitle(
  'Sync word at current playback position',
  wordTimingShortcutBindings,
  'syncSelectedSeparatorAndAdvance'
)

// Availability checks for word sync feature
const hasLineContent = computed(() => {
  return props.selectedLine && props.selectedLine.text && props.selectedLine.text.trim().length > 0
})

const hasLineStartTime = computed(() => {
  return props.selectedLine && Number.isFinite(props.selectedLine.start_ms)
})

const hasLineEndTime = computed(() => {
  return props.selectedLine && Number.isFinite(props.selectedLine.end_ms)
})

const isWordSyncAvailable = computed(() => {
  return hasLineContent.value && hasLineStartTime.value && hasLineEndTime.value
})

const hasSpectrogramSlot = computed(
  () => !!props.filePath && isWordSyncAvailable.value && spectrogramVisible.value
)

// Three-way lane height so collapsing the spectrogram doesn't squash the
// word-timing timeline: tall with spectrogram, mid-tall in word-sync without
// spectrogram (preserves timeline size), compact otherwise. When a reading
// system is active, add ~1.75rem for the transliteration track row that sits
// above the timeline.
const laneHeightClass = computed(() => {
  const hasTransliteration = !!props.selectedTransliterationSystem
  // Base heights are increased by ~2rem vs the old values to account for the
  // always-visible controls bar (h-7 + mb-2). When a reading system is active
  // two extra rows appear (~1.75rem each): the cue transliteration track above
  // the timeline and the line-level reading lane below it — so +3.5rem total.
  if (hasSpectrogramSlot.value) return hasTransliteration ? 'h-[18.5rem]' : 'h-[15rem]'
  if (isWordSyncAvailable.value) return hasTransliteration ? 'h-[12.5rem]' : 'h-[9rem]'
  return 'h-[7rem]'
})

// Check if the line has actual saved words (not auto-generated)
const hasActualWords = computed(() => {
  return hasValidWords(props.selectedLine)
})

const actualLineEndMs = computed(() => {
  if (!props.selectedLine) return 0

  // Use the line's own end_ms if available
  if (Number.isFinite(props.selectedLine.end_ms)) {
    return props.selectedLine.end_ms
  }

  // Fallback: start_ms + 2000ms
  if (Number.isFinite(props.selectedLine.start_ms)) {
    return props.selectedLine.start_ms + 2000
  }

  return 2000
})

const lineStartMs = computed(() => {
  return Number.isFinite(props.selectedLine?.start_ms) ? props.selectedLine.start_ms : 0
})

const syncLaneWindowToSelection = () => {
  if (!props.hasSelectedLine || !props.selectedLine) {
    laneStartMs.value = 0
    laneEndMs.value = 0
    return
  }

  laneStartMs.value = lineStartMs.value
  laneEndMs.value = actualLineEndMs.value
}

const words = computed(() => {
  if (!isWordSyncAvailable.value) return []

  if (!hasActualWords.value) {
    const lineText = props.selectedLine?.text || ''
    const charabiaTokens = segmentedTokenTexts.value

    if (
      Array.isArray(charabiaTokens) &&
      charabiaTokens.length > 0 &&
      charabiaTokens.join('') === lineText
    ) {
      return distributeWordTimings(
        charabiaTokens.map(text => ({ text })),
        lineStartMs.value,
        actualLineEndMs.value
      )
    }
  }

  const lineWithWords = ensureLineWords(props.selectedLine, props.allLines, props.selectedLineIndex)

  return lineWithWords.words || []
})

const {
  dragState,
  displayedWords,
  boundaryIndexes,
  selectedBoundaryIndex,
  selectedBoundaryIndices,
  startBoundaryDrag,
  selectBoundary,
  isBoundarySelected,
  selectPreviousBoundary,
  selectNextBoundary,
  syncSelectedBoundary,
  deleteSelectedBoundaries,
  resetBoundarySelection,
  clearBoundarySelection,
  cancelBoundaryInteraction,
} = useEditLyricsV2WordBoundaryDrag({
  isWordSyncAvailable,
  words,
  lineStartMs,
  timelineStartMs: laneStartMs,
  timelineEndMs: laneEndMs,
  selectedLineIndex: computed(() => props.selectedLineIndex),
  onUpdateWords: payload => emit('update:words', payload),
  onWordTimingEdited: payload => emit('word-timing-edited', payload),
})

const playheadPercent = computed(() => {
  if (!isWordSyncAvailable.value) return 0

  const duration = laneEndMs.value - laneStartMs.value
  if (duration <= 0) return 0

  const elapsed = props.progressMs - laneStartMs.value
  return Math.max(0, Math.min(100, (elapsed / duration) * 100))
})

const updateTimelineWidth = () => {
  if (timelineElement.value) {
    timelineWidth.value = timelineElement.value.clientWidth
  }
}

const timeToPercent = timeMs => {
  if (!isWordSyncAvailable.value) return 0

  const duration = laneEndMs.value - laneStartMs.value
  if (duration <= 0) return 0

  const elapsed = timeMs - laneStartMs.value
  return Math.max(0, Math.min(100, (elapsed / duration) * 100))
}

const clientXToTime = clientX => {
  if (!timelineElement.value || !isWordSyncAvailable.value) {
    return laneStartMs.value
  }

  if (laneEndMs.value <= laneStartMs.value) {
    return laneStartMs.value
  }

  const rect = timelineElement.value.getBoundingClientRect()
  const width = rect.width
  if (width <= 0) {
    return laneStartMs.value
  }

  const clampedX = Math.max(0, Math.min(width, clientX - rect.left))
  const duration = laneEndMs.value - laneStartMs.value
  return Math.round(laneStartMs.value + (clampedX / width) * duration)
}

const getWordEndMs = index => {
  if (index >= displayedWords.value.length - 1) {
    return laneEndMs.value
  }

  const nextWordStart = displayedWords.value[index + 1]?.start_ms
  return Number.isFinite(nextWordStart) ? nextWordStart : laneEndMs.value
}

// --- Transliteration track (reading row above the timeline) ------------------

// This word's stored reading under the active system, or '' when none/absent.
const getWordReading = word => {
  const system = props.selectedTransliterationSystem
  if (!system) return ''
  return word?.transliteration?.[system.id] || ''
}

// Horizontal placement (left/width %) of a word's slot in the transliteration
// track. Mirrors SyncedWordTimingSegment's segmentStyle math so each reading
// label lines up exactly above its word segment.
const getWordSegmentStyle = index => {
  if (!timelineWidth.value || laneEndMs.value <= laneStartMs.value) return {}
  const word = displayedWords.value[index]
  if (!word) return {}
  const duration = laneEndMs.value - laneStartMs.value
  const leftPercent = ((word.start_ms - laneStartMs.value) / duration) * 100
  const endMs = getWordEndMs(index)
  const widthPercent = (Math.max(0, endMs - word.start_ms) / duration) * 100
  return { left: `${leftPercent}%`, width: `${widthPercent}%` }
}

// --- Line-level transliteration lane (whole-line reading below the timeline) --

// The raw line-level reading string for the active system, or '' when absent.
// Kept verbatim (spacing is the whole point of a line-level reading).
const lineLevelReading = computed(() => {
  const system = props.selectedTransliterationSystem
  if (!system) return ''
  return props.selectedLine?.transliteration?.[system.id] ?? ''
})

// Amber warning when the line-level reading diverges (beyond whitespace) from
// the cue readings, for ANY active system. Furigana reconstructs too: a kana
// cue reads as itself and a kanji cue as its stored reading, so concatenating
// the cue readings yields the line reading (see effectiveReading).
const showLineSyncWarning = computed(() => {
  const system = props.selectedTransliterationSystem
  if (!system) return false
  return isLineOutOfSync(props.selectedLine, system.id)
})

// Verbatim direct edit of the line-level reading — no trim, so user spacing is
// preserved. The composable collapses an all-whitespace value to cleared.
const handleLineTransliterationInput = event => {
  const system = props.selectedTransliterationSystem
  if (!system) return
  emit('update:line-transliteration', {
    lineIndex: props.selectedLineIndex,
    systemId: system.id,
    value: event.target.value,
  })
}

// Explicit, opt-in rebuild of the line-level reading from the cues.
const handleGenerateLineFromCues = () => {
  const system = props.selectedTransliterationSystem
  if (!system) return
  emit('generate-line-transliteration', {
    lineIndex: props.selectedLineIndex,
    systemId: system.id,
    system: system.system,
  })
}

const handleBoundaryPointerDown = (rightWordIndex, event) => {
  startBoundaryDrag(rightWordIndex, event, clientXToTime)
}

const getBoundaryLineClass = index => {
  const isActive =
    dragState.value?.rightWordIndex === index ||
    (!dragState.value && selectedBoundaryIndex.value === index)
  const isSelected = !dragState.value && isBoundarySelected(index)

  if (isSelected) {
    return 'bg-hoa-1000 dark:bg-neutral-300 w-[3px] ring-2 ring-neutral-300/35'
  }

  if (isActive) {
    return 'bg-neutral-600 dark:bg-neutral-300 w-[3px] ring-1 ring-neutral-500/25'
  }

  return ''
}

const handleSyncWord = () => {
  const selectedBoundaryBeforeSync = selectedBoundaryIndex.value
  const synced = syncSelectedBoundary(props.progressMs)

  if (
    synced &&
    selectedBoundaryBeforeSync === words.value.length - 1 &&
    props.selectedLineIndex < props.allLines.length - 1
  ) {
    emit('select-next-line')
  }
}

const handleSyncWordNoAdvance = () => {
  syncSelectedBoundary(props.progressMs, { advance: false })
}

const handlePlayLine = () => {
  if (!isWordSyncAvailable.value) return
  emit('play-line', props.selectedLineIndex)
}

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

const getWordEndMsFromList = (wordsList, index) => {
  if (index >= wordsList.length - 1) {
    return laneEndMs.value
  }

  const nextWordStart = wordsList[index + 1]?.start_ms
  return Number.isFinite(nextWordStart) ? nextWordStart : laneEndMs.value
}

const handleDeleteSelectedBoundaries = () => {
  if (!isWordSyncAvailable.value) return
  deleteSelectedBoundaries()
}

const handleSegmentSplitAt = ({ wordIndex, splitIndex, splitRatio, splitClientX }) => {
  if (!isWordSyncAvailable.value) {
    return
  }

  if (!Number.isInteger(wordIndex) || wordIndex < 0 || wordIndex >= displayedWords.value.length) {
    return
  }

  const currentWord = displayedWords.value[wordIndex]
  const graphemes = splitTextByGrapheme(currentWord?.text || '')
  if (graphemes.length <= 1) {
    return
  }

  const fallbackSplitIndex = Math.max(1, Math.min(graphemes.length - 1, Math.floor(graphemes.length / 2)))
  const normalizedSplitIndex = Number.isInteger(splitIndex)
    ? Math.max(1, Math.min(graphemes.length - 1, splitIndex))
    : fallbackSplitIndex

  const leftText = graphemes.slice(0, normalizedSplitIndex).join('')
  const rightText = graphemes.slice(normalizedSplitIndex).join('')

  const wordStartMs = Number.isFinite(currentWord?.start_ms) ? currentWord.start_ms : laneStartMs.value
  const wordEndMs = getWordEndMsFromList(displayedWords.value, wordIndex)
  const normalizedSplitRatio = Number.isFinite(splitRatio)
    ? Math.max(0, Math.min(1, splitRatio))
    : normalizedSplitIndex / graphemes.length
  // Prefer the highlighted divider's actual position on the lane: map its
  // client-X through the timeline's time scale so the split lands under the
  // highlight the user clicked. This avoids the trailing-space failure where a
  // zero-width trailing space drives the width ratio to ~1.0 and pins the new
  // segment onto the word's end bound (a zero-length segment). Fall back to the
  // width ratio when no client-X is available (non-text-node measurement path).
  const ratioTimeMs = Math.round(wordStartMs + (wordEndMs - wordStartMs) * normalizedSplitRatio)
  const highlightTimeMs = Number.isFinite(splitClientX) ? clientXToTime(splitClientX) : null
  const splitTimeMs = resolveWordSplitTimeMs({
    wordStartMs,
    wordEndMs,
    highlightTimeMs,
    ratioTimeMs,
  })

  const leftTransliteration = splitWordTransliteration(currentWord?.transliteration, rightText)
  const leftWord = { text: leftText, start_ms: wordStartMs }
  if (Object.keys(leftTransliteration).length > 0) {
    leftWord.transliteration = leftTransliteration
  }

  const updatedWords = [
    ...displayedWords.value.slice(0, wordIndex),
    leftWord,
    { text: rightText, start_ms: splitTimeMs },
    ...displayedWords.value.slice(wordIndex + 1),
  ]

  emit('update:words', {
    lineIndex: props.selectedLineIndex,
    words: updatedWords,
    lineStartMs: laneStartMs.value,
  })

  selectBoundary(Math.min(updatedWords.length - 1, wordIndex + 1))
}

// --- Per-word transliteration reading editor (Task 17) -----------------------
// A single reading field is open at a time, tracked by `activeWordIndex`.

const handleActivateEditor = index => {
  if (!props.selectedTransliterationSystem) return
  if (!Number.isInteger(index) || index < 0 || index >= displayedWords.value.length) return
  clearBoundarySelection()
  activeWordIndex.value = index
}

// Clear only if the blurring word is still the active one. A Tab-jump reassigns
// `activeWordIndex` synchronously before the outgoing field's async blur fires,
// so this guard prevents the blur from clobbering the freshly-focused word.
const handleDeactivateEditor = index => {
  if (activeWordIndex.value === index) {
    activeWordIndex.value = null
  }
}

// Write (or clear) a single word's reading under the active system, then persist
// through the normal word-update path. Blank input deletes the key; an emptied
// reading map is dropped entirely so a bare `{}` is never stored.
const setWordReading = (index, value) => {
  const system = props.selectedTransliterationSystem
  if (!system) return

  const list = displayedWords.value
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return

  const raw = typeof value === 'string' ? value : ''
  const nextWords = list.map((word, i) => {
    if (i !== index) return word

    const nextMap = { ...(word.transliteration || {}) }
    if (raw.trim() === '') {
      delete nextMap[system.id]
    } else {
      nextMap[system.id] = raw
    }

    const nextWord = { ...word }
    if (Object.keys(nextMap).length > 0) {
      nextWord.transliteration = nextMap
    } else {
      delete nextWord.transliteration
    }
    return nextWord
  })

  emit('update:words', {
    lineIndex: props.selectedLineIndex,
    words: nextWords,
  })
}

const handleUpdateReading = ({ index, value }) => {
  setWordReading(index, value)
}

// Move focus to the next word (wrapping once) that still needs a reading under
// the active system. When none remain, close the editor.
const jumpToNextNeedsReading = fromIndex => {
  const system = props.selectedTransliterationSystem
  if (!system) return

  const list = displayedWords.value
  const count = list.length
  if (count === 0) {
    activeWordIndex.value = null
    return
  }

  const start = Number.isInteger(fromIndex) ? fromIndex : -1
  for (let step = 1; step <= count; step++) {
    const j = (start + step) % count
    if (j === start) break
    if (needsTransliteration(list[j], system.id)) {
      activeWordIndex.value = j
      return
    }
  }

  activeWordIndex.value = null
}

const loadDefaultSegmentation = async ({ force = false } = {}) => {
  if (!isWordSyncAvailable.value) {
    segmentedTokenTexts.value = null
    return
  }

  if (!force && hasActualWords.value) {
    segmentedTokenTexts.value = null
    return
  }

  const lineText = props.selectedLine?.text || ''
  if (!lineText) {
    segmentedTokenTexts.value = []
    return
  }

  const requestId = ++segmentationRequestId.value

  try {
    const tokens = await invoke('segment_words', { text: lineText })

    if (requestId !== segmentationRequestId.value) {
      return
    }

    if (!Array.isArray(tokens)) {
      segmentedTokenTexts.value = null
      return
    }

    segmentedTokenTexts.value = tokens
      .filter(token => typeof token === 'string')
      .filter(token => token.length > 0)
  } catch (error) {
    if (requestId !== segmentationRequestId.value) {
      return
    }

    segmentedTokenTexts.value = null
    console.error(error)
  }
}

const { bindWordTimingHotkeys, unbindWordTimingHotkeys } = useEditLyricsV2WordTimingHotkeys({
  isWordSyncAvailable,
  selectedBoundaryIndex,
  words,
  syncSelectedBoundaryAtProgress: () => handleSyncWord(),
  syncSelectedBoundaryAtProgressNoAdvance: () => handleSyncWordNoAdvance(),
  selectPreviousBoundary: () => selectPreviousBoundary(),
  selectNextBoundary: () => selectNextBoundary(),
  resetBoundarySelection: () => resetBoundarySelection(),
  clearBoundarySelection: () => clearBoundarySelection(),
  deleteSelectedBoundaries: () => handleDeleteSelectedBoundaries(),
})

// Watch the selected line's identity AND its timestamps so that the lane window refreshes on deletions and changes.
watch(
  [
    () => props.selectedLineIndex,
    () => props.selectedLine?.start_ms,
    () => props.selectedLine?.end_ms,
  ],
  ([newIndex], [oldIndex] = []) => {
    cancelBoundaryInteraction()
    // Only reset boundary index when actually moving to a different line.
    if (newIndex !== oldIndex) {
      resetBoundarySelection()
      // A different line's words are a different set — close any open reading
      // editor so it can't linger on a stale word index.
      activeWordIndex.value = null
    }
    syncLaneWindowToSelection()
    segmentedTokenTexts.value = null
    void loadDefaultSegmentation()
    nextTick(() => {
      updateTimelineWidth()
    })
  },
  { immediate: true }
)

// Switching (or clearing) the active reading system closes any open editor: the
// readings it was editing belong to a different key.
watch(
  () => props.selectedTransliterationSystem?.id ?? null,
  () => {
    activeWordIndex.value = null
  }
)

// If the visible word count shrinks (merge/split/reset) past the active index,
// drop the editor rather than leave it pointing at a word that no longer exists.
watch(
  () => displayedWords.value.length,
  length => {
    if (activeWordIndex.value !== null && activeWordIndex.value >= length) {
      activeWordIndex.value = null
    }
  }
)

const handleResetWords = async () => {
  if (!isWordSyncAvailable.value) return

  // Clear the words object entirely - this removes persisted word timings.
  emit('update:words', {
    lineIndex: props.selectedLineIndex,
    words: undefined,
  })

  // Reset selected boundary after clearing.
  resetBoundarySelection()

  // Wait for parent state to apply, then force segmentation so first reset is reliable.
  await nextTick()
  await loadDefaultSegmentation({ force: true })
}

// Capture-phase deselect: a click anywhere inside the timeline that is NOT on a
// boundary handle clears the selection. Capture runs before a segment's
// bubble-phase stopPropagation (which a hovered split preview triggers), so
// clicking even a multi-character segment still deselects; boundary handles are
// skipped so their own bubble-phase click can still select/toggle.
const handleTimelineCaptureDeselect = event => {
  if (event.target.closest('[data-boundary-handle]')) return
  clearBoundarySelection()
}

const handleTimelineClick = event => {
  event.stopPropagation()
  if (laneEndMs.value <= laneStartMs.value) return
  const rect = timelineElement.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0) return
  const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  const timeMs = laneStartMs.value + fraction * (laneEndMs.value - laneStartMs.value)
  emit('seek', timeMs / 1000)
}

watch(
  () => props.hasSelectedLine,
  hasLine => {
    if (hasLine) {
      nextTick(() => {
        updateTimelineWidth()
      })
      return
    }

    syncLaneWindowToSelection()
  },
  { immediate: true }
)

watch(isWordSyncAvailable, (available, wasAvailable) => {
  if (!available) {
    cancelBoundaryInteraction()
    segmentedTokenTexts.value = null
    return
  }

  if (!wasAvailable) {
    syncLaneWindowToSelection()
    segmentedTokenTexts.value = null
    void loadDefaultSegmentation()
  }
})

watch(hasActualWords, (hasWords, hadWords) => {
  if (hadWords && !hasWords && isWordSyncAvailable.value) {
    segmentedTokenTexts.value = null
    void loadDefaultSegmentation()
  }
})

watch(
  () => props.selectedLine?.text,
  () => {
    segmentedTokenTexts.value = null
    if (isWordSyncAvailable.value) {
      void loadDefaultSegmentation()
    }
  }
)

watch(
  [lineStartMs, actualLineEndMs],
  () => {
    if (!props.hasSelectedLine || !props.selectedLine) {
      return
    }

    laneStartMs.value = lineStartMs.value
    laneEndMs.value = actualLineEndMs.value
  },
  { immediate: true }
)

watch(
  () => props.allLines,
  () => {
    if (dragState.value) {
      cancelBoundaryInteraction()
    }
  },
  { deep: true }
)

onMounted(() => {
  window.addEventListener('resize', updateTimelineWidth)
  bindWordTimingHotkeys()
})

onUnmounted(() => {
  cancelBoundaryInteraction()
  window.removeEventListener('resize', updateTimelineWidth)
  unbindWordTimingHotkeys()
})
</script>
