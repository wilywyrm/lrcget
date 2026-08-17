import { describe, it, expect } from 'vitest'
import { parseLyricsfile, serializeLyricsfile } from './lyricsfile.js'

const KEYED_TRANSLITERATION_FIXTURE = `version: '1.0'
metadata:
  title: 'Bilingual Song'
  artist: 'Artist'
  language: 'ja'
  transliterations:
    - id: hira
      system: 'ja-Hrkt'
    - id: romaji
      system: 'ja-Latn'
lines:
  - text: '大人になる'
    start_ms: 1000
    end_ms: 5000
    transliteration:
      hira: 'おとなになる'
      romaji: 'otona ni naru'
    words:
      - text: '大人'
        start_ms: 1000
        end_ms: 2500
        transliteration:
          hira: 'おとな'
          romaji: 'otona'
      - text: 'に'
        start_ms: 2500
        end_ms: 3500
        transliteration:
          romaji: 'ni'
      - text: 'なる'
        start_ms: 3500
        end_ms: 5000
        transliteration:
          romaji: 'naru'
  - text: '空を飛ぶ'
    start_ms: 9500
    end_ms: 12000
    words:
      - text: '空'
        start_ms: 9500
        end_ms: 10500
        transliteration:
          hira: 'そら'
      - text: 'を'
        start_ms: 10500
        end_ms: 11000
      - text: '飛ぶ'
        start_ms: 11000
        end_ms: 12000
plain: |
  大人になる
  空を飛ぶ
`

describe('lyricsfile keyed transliteration', () => {
  it('round-trips keyed transliteration through parse→serialize→parse', () => {
    const parsed1 = parseLyricsfile(KEYED_TRANSLITERATION_FIXTURE)

    const serialized = serializeLyricsfile({
      plainLyrics: parsed1.plainLyrics,
      syncedLines: parsed1.syncedLines,
      baseDocument: parsed1.document,
    })

    const parsed2 = parseLyricsfile(serialized)

    expect(parsed2.transliterations).toEqual([
      { id: 'hira', system: 'ja-Hrkt' },
      { id: 'romaji', system: 'ja-Latn' },
    ])
    expect(parsed2.transliterations).toEqual(parsed1.transliterations)

    expect(parsed2.syncedLines[0].transliteration).toEqual({
      hira: 'おとなになる',
      romaji: 'otona ni naru',
    })
    expect(parsed2.syncedLines[0].transliteration).toEqual(parsed1.syncedLines[0].transliteration)

    const words1 = parsed1.syncedLines[0].words
    const words2 = parsed2.syncedLines[0].words
    expect(words2[0].transliteration).toEqual({ hira: 'おとな', romaji: 'otona' })
    expect(words2[1].transliteration).toEqual({ romaji: 'ni' })
    expect(words2[2].transliteration).toEqual({ romaji: 'naru' })
    words2.forEach((word, index) => {
      expect(word.transliteration).toEqual(words1[index].transliteration)
    })

    const sparseWords = parsed2.syncedLines[1].words
    expect(sparseWords[0].transliteration).toEqual({ hira: 'そら' })
    expect(sparseWords[1].transliteration).toBeUndefined()
    expect(sparseWords[2].transliteration).toBeUndefined()
    expect(parsed2.syncedLines[1].transliteration).toBeUndefined()
  })

  it('preserves the metadata.transliterations declaration only when non-empty', () => {
    const parsed = parseLyricsfile(KEYED_TRANSLITERATION_FIXTURE)

    const withDeclaration = serializeLyricsfile({
      plainLyrics: parsed.plainLyrics,
      syncedLines: parsed.syncedLines,
      baseDocument: parsed.document,
    })
    expect(withDeclaration).toContain('transliterations:')

    const withoutDeclaration = serializeLyricsfile({
      track: { title: 'Plain', artist_name: 'Nobody' },
      syncedLines: [{ text: 'hello world', start_ms: 0, end_ms: 1000 }],
    })
    expect(withoutDeclaration).not.toContain('transliterations:')
  })

  it('omits the transliteration key entirely when a line/word has none', () => {
    const serialized = serializeLyricsfile({
      track: { title: 'Plain', artist_name: 'Nobody' },
      syncedLines: [
        {
          text: 'hello world',
          start_ms: 0,
          end_ms: 1000,
          words: [
            { text: 'hello ', start_ms: 0, end_ms: 500 },
            { text: 'world', start_ms: 500, end_ms: 1000 },
          ],
        },
      ],
    })

    expect(serialized).not.toContain('transliteration')
    expect(serialized).not.toContain('{}')
  })

  it('treats an empty transliteration map like none — never emits {}', () => {
    const serialized = serializeLyricsfile({
      track: { title: 'Plain', artist_name: 'Nobody' },
      syncedLines: [
        {
          text: 'hi',
          start_ms: 0,
          end_ms: 100,
          transliteration: {},
          words: [{ text: 'hi', start_ms: 0, end_ms: 100, transliteration: {} }],
        },
      ],
    })

    expect(serialized).not.toContain('transliteration')
    expect(serialized).not.toContain('{}')
  })

  it('emits per-word transliteration maps that survive re-parse', () => {
    const serialized = serializeLyricsfile({
      track: { title: 'JP', artist_name: 'A' },
      syncedLines: [
        {
          text: '今日',
          start_ms: 0,
          end_ms: 1000,
          transliteration: { hira: 'きょう' },
          words: [{ text: '今日', start_ms: 0, end_ms: 1000, transliteration: { hira: 'きょう' } }],
        },
      ],
    })

    expect(serialized).toContain('transliteration:')

    const reparsed = parseLyricsfile(serialized)
    expect(reparsed.syncedLines[0].transliteration).toEqual({ hira: 'きょう' })
    expect(reparsed.syncedLines[0].words[0].transliteration).toEqual({ hira: 'きょう' })
  })
})
