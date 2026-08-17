import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import {
  useEditLyricsV2Document,
  deriveTransliterationId,
  TRANSLITERATION_PRESETS,
} from './useEditLyricsV2Document.js'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}))

const FIXTURE = `version: '1.0'
metadata:
  title: 'Song'
  artist: 'Artist'
  language: 'ja'
  transliterations:
    - id: hira
      system: 'ja-Hrkt'
lines:
  - text: '大人になる'
    start_ms: 1000
    end_ms: 5000
    transliteration:
      hira: 'おとなになる'
    words:
      - text: '大人'
        start_ms: 1000
        end_ms: 2500
        transliteration:
          hira: 'おとな'
      - text: 'に'
        start_ms: 2500
        end_ms: 3500
      - text: 'なる'
        start_ms: 3500
        end_ms: 5000
        transliteration:
          hira: 'なる'
`

const createDoc = (content = FIXTURE) =>
  useEditLyricsV2Document({
    audioSource: ref({ title: 'Song', artist_name: 'Artist', duration: 5 }),
    lyricsfile: ref({ content }),
    trackId: ref('track-1'),
    progress: ref(0),
    toast: { success: vi.fn(), error: vi.fn() },
  })

describe('deriveTransliterationId', () => {
  it('maps known preset names to short bases', () => {
    expect(deriveTransliterationId('Furigana', [])).toBe('hira')
    expect(deriveTransliterationId('Romaji', [])).toBe('romaji')
    expect(deriveTransliterationId('Pinyin', [])).toBe('pinyin')
    expect(deriveTransliterationId('Zhuyin', [])).toBe('zhuyin')
    expect(deriveTransliterationId('Romaja', [])).toBe('romaja')
  })

  it('slugifies custom names', () => {
    expect(deriveTransliterationId('ja-Latn', [])).toBe('ja-latn')
    expect(deriveTransliterationId('My Reading!', [])).toBe('my-reading')
  })

  it('suffixes collisions numerically starting at 2', () => {
    expect(deriveTransliterationId('Furigana', ['hira'])).toBe('hira2')
    expect(deriveTransliterationId('Furigana', ['hira', 'hira2'])).toBe('hira3')
  })
})

describe('useEditLyricsV2Document transliteration systems', () => {
  it('selects the first declared system on init', () => {
    const doc = createDoc()
    doc.initializeLyrics()
    expect(doc.selectedTransliterationSystem.value).toEqual({ id: 'hira', system: 'ja-Hrkt' })
    expect(doc.declaredTransliterations.value).toEqual([{ id: 'hira', system: 'ja-Hrkt' }])
  })

  it('adds a preset system and selects it', () => {
    const doc = createDoc()
    doc.initializeLyrics()
    const entry = doc.addTransliterationSystem('Romaji')
    expect(entry).toEqual({ id: 'romaji', system: 'ja-Latn' })
    expect(doc.declaredTransliterations.value).toEqual([
      { id: 'hira', system: 'ja-Hrkt' },
      { id: 'romaji', system: TRANSLITERATION_PRESETS.Romaji },
    ])
    expect(doc.selectedTransliterationSystem.value).toEqual({ id: 'romaji', system: 'ja-Latn' })
  })

  it('adds a custom system with a slugified id', () => {
    const doc = createDoc()
    doc.initializeLyrics()
    const entry = doc.addTransliterationSystem('Custom…', 'de-Latn')
    expect(entry).toEqual({ id: 'de-latn', system: 'de-Latn' })
  })

  it('collision-suffixes ids when adding a duplicate base', () => {
    const doc = createDoc()
    doc.initializeLyrics()
    const entry = doc.addTransliterationSystem('Furigana')
    expect(entry.id).toBe('hira2')
  })

  it('re-keys word readings when editing a system tag', () => {
    const doc = createDoc()
    doc.initializeLyrics()
    doc.editTransliterationSystem('hira', 'ja-Latn')

    expect(doc.declaredTransliterations.value).toEqual([{ id: 'ja-latn', system: 'ja-Latn' }])

    const line = doc.syncedLines.value[0]
    expect(line.transliteration).toEqual({ 'ja-latn': 'おとなになる' })
    expect(line.words[0].transliteration).toEqual({ 'ja-latn': 'おとな' })
    expect(line.words[1].transliteration).toBeUndefined()
    expect(line.words[2].transliteration).toEqual({ 'ja-latn': 'なる' })
    expect(doc.selectedTransliterationSystem.value).toEqual({ id: 'ja-latn', system: 'ja-Latn' })
  })

  it('deletes word readings when removing a system', () => {
    const doc = createDoc()
    doc.initializeLyrics()
    doc.removeTransliterationSystem('hira')

    expect(doc.declaredTransliterations.value).toEqual([])
    expect(doc.selectedTransliterationSystem.value).toBeNull()

    const line = doc.syncedLines.value[0]
    expect(line.transliteration).toBeUndefined()
    expect(line.words[0].transliteration).toBeUndefined()
    expect(line.words[2].transliteration).toBeUndefined()
  })

  it('reassigns selection to the first remaining system after removal', () => {
    const doc = createDoc()
    doc.initializeLyrics()
    doc.addTransliterationSystem('Romaji')
    doc.selectedTransliterationSystem.value = { id: 'hira', system: 'ja-Hrkt' }
    doc.removeTransliterationSystem('hira')
    expect(doc.selectedTransliterationSystem.value).toEqual({ id: 'romaji', system: 'ja-Latn' })
  })

  it('serializes added systems into the lyricsfile output', () => {
    const doc = createDoc()
    doc.initializeLyrics()
    doc.addTransliterationSystem('Romaji')
    const serialized = doc.serializedLyricsfile.value
    expect(serialized).toContain('transliterations:')
    expect(serialized).toContain('ja-Latn')
    expect(serialized).toContain('romaji')
  })
})
