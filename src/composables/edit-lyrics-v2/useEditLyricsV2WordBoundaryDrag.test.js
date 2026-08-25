import { describe, it, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { useEditLyricsV2WordBoundaryDrag } from './useEditLyricsV2WordBoundaryDrag.js'

const createDrag = (wordCount = 3, overrides = {}) => {
  const words = ref(
    Array.from({ length: wordCount }, (_, i) => ({ text: `w${i}`, start_ms: i * 100 }))
  )
  const api = useEditLyricsV2WordBoundaryDrag({
    isWordSyncAvailable: computed(() => true),
    words,
    lineStartMs: ref(0),
    timelineStartMs: ref(0),
    timelineEndMs: ref(1000),
    selectedLineIndex: ref(0),
    onUpdateWords: overrides.onUpdateWords ?? vi.fn(),
    onWordTimingEdited: overrides.onWordTimingEdited ?? vi.fn(),
  })
  return { ...api, words }
}

describe('boundary selection clearing', () => {
  it('selects the default (second) boundary after resetBoundarySelection', () => {
    const drag = createDrag()
    drag.resetBoundarySelection()
    expect(drag.selectedBoundaryIndex.value).toBe(1)
    expect(drag.selectedBoundaryIndices.value).toEqual([1])
  })

  it('clearBoundarySelection empties the selection', () => {
    const drag = createDrag()
    drag.resetBoundarySelection()
    drag.clearBoundarySelection()
    expect(drag.selectedBoundaryIndex.value).toBe(-1)
    expect(drag.selectedBoundaryIndices.value).toEqual([])
  })

  it('plain-clicking the only selected boundary toggles it off', () => {
    const drag = createDrag()
    drag.selectBoundary(1)
    expect(drag.selectedBoundaryIndices.value).toEqual([1])
    drag.selectBoundary(1)
    expect(drag.selectedBoundaryIndices.value).toEqual([])
    expect(drag.selectedBoundaryIndex.value).toBe(-1)
  })

  it('plain-clicking a different boundary selects it instead of clearing', () => {
    const drag = createDrag()
    drag.selectBoundary(1)
    drag.selectBoundary(2)
    expect(drag.selectedBoundaryIndices.value).toEqual([2])
    expect(drag.selectedBoundaryIndex.value).toBe(2)
  })

  it('ctrl-toggling off the last selected boundary clears the selection', () => {
    const drag = createDrag()
    drag.selectBoundary(1)
    drag.selectBoundary(1, { ctrlKey: true })
    expect(drag.selectedBoundaryIndices.value).toEqual([])
    expect(drag.selectedBoundaryIndex.value).toBe(-1)
  })

  it('re-establishes the default selection from cleared via selectNextBoundary', () => {
    const drag = createDrag()
    drag.clearBoundarySelection()
    expect(drag.selectNextBoundary()).toBe(true)
    expect(drag.selectedBoundaryIndex.value).toBe(1)
  })

  it('re-establishes the default selection from cleared via selectPreviousBoundary', () => {
    const drag = createDrag()
    drag.clearBoundarySelection()
    expect(drag.selectPreviousBoundary()).toBe(true)
    expect(drag.selectedBoundaryIndex.value).toBe(1)
  })

  it('re-establishes selection from cleared via syncSelectedBoundary without editing timing', () => {
    const onUpdateWords = vi.fn()
    const drag = createDrag(3, { onUpdateWords })
    drag.clearBoundarySelection()
    expect(drag.syncSelectedBoundary(500)).toBe(true)
    expect(drag.selectedBoundaryIndex.value).toBe(1)
    expect(onUpdateWords).not.toHaveBeenCalled()
  })
})
