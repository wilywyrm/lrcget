import { describe, it, expect } from 'vitest'
import {
  stripWhitespace,
  effectiveReading,
  composeReading,
  isRomanizationSystem,
  propagateCueEditToLine,
  isLineOutOfSync,
  generateLineFromCues,
  cueReadingSpanInLine,
} from './transliteration-sync.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a cue with an optional reading for a single system. */
const cue = (text, systemId, reading) =>
  reading === undefined ? { text } : { text, transliteration: { [systemId]: reading } }

/** The canonical romaji line: 大人(otona) に(ni) なる(naru) → "otona ni naru". */
const romajiWords = (r0 = 'otona', r1 = 'ni', r2 = 'naru') => [
  cue('大人', 'romaji', r0),
  cue('に', 'romaji', r1),
  cue('なる', 'romaji', r2),
]

// ---------------------------------------------------------------------------
// stripWhitespace
// ---------------------------------------------------------------------------

describe('stripWhitespace', () => {
  it('removes ASCII spaces', () => expect(stripWhitespace('otona ni naru')).toBe('otonaninaru'))
  it('removes tabs/newlines', () => expect(stripWhitespace('a\tb\nc')).toBe('abc'))
  it('removes NBSP (U+00A0)', () => expect(stripWhitespace('a\u00a0b')).toBe('ab'))
  it('removes ideographic space (U+3000)', () => expect(stripWhitespace('a\u3000b')).toBe('ab'))
  it('keeps punctuation intact', () => expect(stripWhitespace('a, b.')).toBe('a,b.'))
  it('handles non-strings', () => {
    expect(stripWhitespace(null)).toBe('')
    expect(stripWhitespace(undefined)).toBe('')
    expect(stripWhitespace(42)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// effectiveReading
// ---------------------------------------------------------------------------

describe('effectiveReading', () => {
  it('returns the stored reading when present', () =>
    expect(effectiveReading(cue('大人', 'romaji', 'otona'), 'romaji')).toBe('otona'))
  it('falls back to text when the system has no reading', () =>
    expect(effectiveReading(cue('に'), 'romaji')).toBe('に'))
  it('falls back to text when a different system is read', () =>
    expect(effectiveReading(cue('大人', 'hira', 'おとな'), 'romaji')).toBe('大人'))
  it('returns empty string for missing word/text', () => {
    expect(effectiveReading(undefined, 'romaji')).toBe('')
    expect(effectiveReading({}, 'romaji')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// isRomanizationSystem
// ---------------------------------------------------------------------------

describe('isRomanizationSystem', () => {
  it('detects Latin-script systems', () => {
    expect(isRomanizationSystem('ja-Latn')).toBe(true)
    expect(isRomanizationSystem('zh-Latn-pinyin')).toBe(true)
    expect(isRomanizationSystem('ko-Latn')).toBe(true)
    expect(isRomanizationSystem('de-Latn')).toBe(true)
  })
  it('is case-insensitive on the script subtag', () => {
    expect(isRomanizationSystem('ja-latn')).toBe(true)
    expect(isRomanizationSystem('JA-LATN')).toBe(true)
  })
  it('rejects non-Latin systems', () => {
    expect(isRomanizationSystem('ja-Hrkt')).toBe(false)
    expect(isRomanizationSystem('zh-Bopo')).toBe(false)
  })
  it('rejects empty/nullish/non-strings', () => {
    expect(isRomanizationSystem('')).toBe(false)
    expect(isRomanizationSystem(null)).toBe(false)
    expect(isRomanizationSystem(undefined)).toBe(false)
    expect(isRomanizationSystem(123)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// propagateCueEditToLine — surgical span replacement
// ---------------------------------------------------------------------------

describe('propagateCueEditToLine — surgical replacement', () => {
  it('replaces a middle cue and preserves spacing', () => {
    const result = propagateCueEditToLine('otona ni naru', romajiWords(), romajiWords('otona', 'wa', 'naru'), 'romaji', 1)
    expect(result).toBe('otona wa naru')
  })

  it('CORRUPTION GUARD: never collapses to the naive space-less concat', () => {
    const result = propagateCueEditToLine('otona ni naru', romajiWords(), romajiWords('otona', 'wa', 'naru'), 'romaji', 1)
    expect(result).not.toBe('otonawanaru')
    expect(result).not.toBe('otonaninaru')
  })

  it('replaces the first cue and preserves trailing text/space', () => {
    const result = propagateCueEditToLine('otona ni naru', romajiWords(), romajiWords('otoona', 'ni', 'naru'), 'romaji', 0)
    expect(result).toBe('otoona ni naru')
  })

  it('replaces the last cue and preserves leading text/space', () => {
    const result = propagateCueEditToLine('otona ni naru', romajiWords(), romajiWords('otona', 'ni', 'naruu'), 'romaji', 2)
    expect(result).toBe('otona ni naruu')
  })

  it('preserves multiple interior spaces', () => {
    const result = propagateCueEditToLine('otona  ni  naru', romajiWords(), romajiWords('otona', 'wa', 'naru'), 'romaji', 1)
    expect(result).toBe('otona  wa  naru')
  })

  it('preserves leading and trailing whitespace on the line', () => {
    const result = propagateCueEditToLine('  otona ni naru  ', romajiWords(), romajiWords('otona', 'wa', 'naru'), 'romaji', 1)
    expect(result).toBe('  otona wa naru  ')
  })

  it('ANTI-SUBSTRING: edits by position, not first match, when a reading repeats', () => {
    const words = [cue('X', 'romaji', 'na'), cue('Y', 'romaji', 'ni'), cue('Z', 'romaji', 'na')]
    const next = [cue('X', 'romaji', 'na'), cue('Y', 'romaji', 'ni'), cue('Z', 'romaji', 'NO')]
    const result = propagateCueEditToLine('na ni na', words, next, 'romaji', 2)
    expect(result).toBe('na ni NO')
  })

  it('inserts a new reading that itself contains spaces verbatim', () => {
    const result = propagateCueEditToLine('otona ni naru', romajiWords(), romajiWords('otona', 'n i', 'naru'), 'romaji', 1)
    expect(result).toBe('otona n i naru')
  })

  it('degenerates safely for a syllabary system (no whitespace)', () => {
    const words = [cue('大人', 'hira', 'おとな'), cue('に'), cue('なる', 'hira', 'なる')]
    const next = [cue('大人', 'hira', 'オトナ'), cue('に'), cue('なる', 'hira', 'なる')]
    const result = propagateCueEditToLine('おとなになる', words, next, 'hira', 0)
    expect(result).toBe('オトナになる')
  })
})

// ---------------------------------------------------------------------------
// propagateCueEditToLine — decline cases (never corrupt)
// ---------------------------------------------------------------------------

describe('propagateCueEditToLine — declines safely', () => {
  it('declines when an unchanged neighbour is an unread ideograph', () => {
    const words = [cue('大人'), cue('に', 'romaji', 'ni'), cue('なる', 'romaji', 'naru')]
    const next = [cue('大人'), cue('に', 'romaji', 'wa'), cue('なる', 'romaji', 'naru')]
    const result = propagateCueEditToLine('otona ni naru', words, next, 'romaji', 1)
    expect(result).toBe('otona ni naru') // unchanged
  })

  it('declines when the line is already out of sync', () => {
    const result = propagateCueEditToLine('completely different', romajiWords(), romajiWords('otona', 'wa', 'naru'), 'romaji', 1)
    expect(result).toBe('completely different')
  })

  it('declines for an empty/absent line value', () => {
    expect(propagateCueEditToLine('', romajiWords(), romajiWords('otona', 'wa', 'naru'), 'romaji', 1)).toBe('')
    expect(propagateCueEditToLine(undefined, romajiWords(), romajiWords('otona', 'wa', 'naru'), 'romaji', 1)).toBe(undefined)
  })

  it('declines an unread→read transition (old reading empty)', () => {
    const words = [cue('大人', 'romaji', 'otona'), cue('に', 'romaji', 'ni'), cue('なる')]
    const next = [cue('大人', 'romaji', 'otona'), cue('に', 'romaji', 'ni'), cue('なる', 'romaji', 'naru')]
    const result = propagateCueEditToLine('otona ni naru', words, next, 'romaji', 2)
    expect(result).toBe('otona ni naru') // unchanged; warning will surface it
  })

  it('declines a read→cleared transition (new reading empty)', () => {
    const next = [cue('大人', 'romaji', 'otona'), cue('に'), cue('なる', 'romaji', 'naru')]
    const result = propagateCueEditToLine('otona ni naru', romajiWords(), next, 'romaji', 1)
    expect(result).toBe('otona ni naru') // unchanged
  })

  it('declines on a word-count change (split/merge)', () => {
    const next = [...romajiWords('otona', 'wa', 'naru'), cue('よ', 'romaji', 'yo')]
    const result = propagateCueEditToLine('otona ni naru', romajiWords(), next, 'romaji', 1)
    expect(result).toBe('otona ni naru')
  })
})

// ---------------------------------------------------------------------------
// isLineOutOfSync
// ---------------------------------------------------------------------------

describe('isLineOutOfSync', () => {
  it('is false when the stripped concat matches the line (spacing ignored)', () => {
    const line = { words: romajiWords(), transliteration: { romaji: 'otona ni naru' } }
    expect(isLineOutOfSync(line, 'romaji')).toBe(false)
  })

  it('is false when only whitespace differs', () => {
    const line = { words: romajiWords(), transliteration: { romaji: 'otona  ni  naru' } }
    expect(isLineOutOfSync(line, 'romaji')).toBe(false)
  })

  it('is true when reading content diverges', () => {
    const line = { words: romajiWords(), transliteration: { romaji: 'otona wo naru' } }
    expect(isLineOutOfSync(line, 'romaji')).toBe(true)
  })

  it('is true when an ideograph cue is still unread in a romaji line', () => {
    const line = {
      words: [cue('大人'), cue('に', 'romaji', 'ni'), cue('なる', 'romaji', 'naru')],
      transliteration: { romaji: 'otona ni naru' },
    }
    expect(isLineOutOfSync(line, 'romaji')).toBe(true)
  })

  it('is false when the line value is absent/empty (optional line-level)', () => {
    expect(isLineOutOfSync({ words: romajiWords(), transliteration: {} }, 'romaji')).toBe(false)
    expect(isLineOutOfSync({ words: romajiWords() }, 'romaji')).toBe(false)
    expect(isLineOutOfSync({ words: romajiWords(), transliteration: { romaji: '' } }, 'romaji')).toBe(false)
  })

  it('is false for a furigana line whose kana cue reads as itself', () => {
    const line = {
      words: [cue('大人', 'hira', 'おとな'), cue('に'), cue('なる', 'hira', 'なる')],
      transliteration: { hira: 'おとなになる' },
    }
    expect(isLineOutOfSync(line, 'hira')).toBe(false)
  })

  it('is true for a furigana line when a kanji cue reading diverges from the line', () => {
    const line = {
      words: [cue('大人', 'hira', 'こども'), cue('に'), cue('なる', 'hira', 'なる')],
      transliteration: { hira: 'おとなになる' },
    }
    expect(isLineOutOfSync(line, 'hira')).toBe(true)
  })

  it('is true for a furigana line with an unread kanji cue (cannot reconstruct)', () => {
    const line = {
      words: [cue('大人'), cue('に'), cue('なる', 'hira', 'なる')],
      transliteration: { hira: 'おとなになる' },
    }
    expect(isLineOutOfSync(line, 'hira')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// generateLineFromCues
// ---------------------------------------------------------------------------

describe('generateLineFromCues', () => {
  it('space-joins for a romanization system', () => {
    const line = { words: romajiWords() }
    expect(generateLineFromCues(line, 'romaji', 'ja-Latn')).toBe('otona ni naru')
  })

  it('joins with no separator for a syllabary system', () => {
    const line = { words: [cue('大人', 'hira', 'おとな'), cue('に'), cue('なる', 'hira', 'なる')] }
    expect(generateLineFromCues(line, 'hira', 'ja-Hrkt')).toBe('おとなになる')
  })

  it('returns undefined for an empty line', () => {
    expect(generateLineFromCues({ words: [] }, 'romaji', 'ja-Latn')).toBeUndefined()
    expect(generateLineFromCues({}, 'romaji', 'ja-Latn')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// composeReading (okurigana folding)
// ---------------------------------------------------------------------------

describe('composeReading', () => {
  it('folds a trailing okurigana into a kanji ruby (沈ん + しず → しずん)', () => {
    expect(composeReading('沈ん', 'しず')).toBe('しずん')
  })

  it('folds a multi-kana okurigana suffix (食べる + た → たべる)', () => {
    expect(composeReading('食べる', 'た')).toBe('たべる')
  })

  it('dedups when the ruby is already the full word reading (食べる + たべる → たべる)', () => {
    expect(composeReading('食べる', 'たべる')).toBe('たべる')
  })

  it('folds leading okurigana (お客 + きゃく → おきゃく)', () => {
    expect(composeReading('お客', 'きゃく')).toBe('おきゃく')
  })

  it('dedups a leading kana already present in the reading (お客 + おきゃく → おきゃく)', () => {
    expect(composeReading('お客', 'おきゃく')).toBe('おきゃく')
  })

  it('leaves an all-kanji surface unchanged (今日 + きょう → きょう)', () => {
    expect(composeReading('今日', 'きょう')).toBe('きょう')
  })

  it('declines to compose across more than one kanji run (食べ物 keeps the ruby as-is)', () => {
    expect(composeReading('食べ物', 'ふる')).toBe('ふる')
  })

  it('passes a Latin/romaji reading through untouched (沈ん + shizun → shizun)', () => {
    expect(composeReading('沈ん', 'shizun')).toBe('shizun')
  })

  it('returns the reading unchanged when the surface has no kanji', () => {
    expect(composeReading('に', 'に')).toBe('に')
    expect(composeReading('', 'しず')).toBe('しず')
  })

  it('handles empty/undefined readings', () => {
    expect(composeReading('沈ん', '')).toBe('')
    expect(composeReading('沈ん', undefined)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Okurigana across effectiveReading / isLineOutOfSync / generate / propagate
// ---------------------------------------------------------------------------

const sinkingSunCues = (ruby = 'しず') => [
  cue('太陽', 'hira', 'たいよう'),
  cue('が'),
  cue('沈ん', 'hira', ruby),
  cue('で'),
  cue('いく'),
]

describe('okurigana line reconstruction', () => {
  it('effectiveReading composes a kana ruby (沈ん/しず → しずん)', () => {
    expect(effectiveReading(cue('沈ん', 'hira', 'しず'), 'hira')).toBe('しずん')
  })

  it('effectiveReading leaves a full romaji reading untouched (沈ん/shizun → shizun)', () => {
    expect(effectiveReading(cue('沈ん', 'romaji', 'shizun'), 'romaji')).toBe('shizun')
  })

  it('generateLineFromCues folds okurigana into the whole line', () => {
    expect(generateLineFromCues({ words: sinkingSunCues() }, 'hira', 'ja-Hrkt')).toBe(
      'たいようがしずんでいく'
    )
  })

  it('isLineOutOfSync is false when the line matches the okurigana-composed cues', () => {
    const line = { words: sinkingSunCues(), transliteration: { hira: 'たいようがしずんでいく' } }
    expect(isLineOutOfSync(line, 'hira')).toBe(false)
  })

  it('isLineOutOfSync is true against an okurigana-dropping line value', () => {
    const line = { words: sinkingSunCues(), transliteration: { hira: 'たいようがしずでいく' } }
    expect(isLineOutOfSync(line, 'hira')).toBe(true)
  })

  it('propagate rewrites the composed span when the ruby is edited (しず→しづ)', () => {
    const result = propagateCueEditToLine(
      'たいようがしずんでいく',
      sinkingSunCues('しず'),
      sinkingSunCues('しづ'),
      'hira',
      2
    )
    expect(result).toBe('たいようがしづんでいく')
  })
})

// ---------------------------------------------------------------------------
// cueReadingSpanInLine (per-cue karaoke highlight span)
// ---------------------------------------------------------------------------

describe('cueReadingSpanInLine', () => {
  it('spans the okurigana-composed reading of a middle cue (沈ん → しずん)', () => {
    expect(cueReadingSpanInLine('たいようがしずんでいく', sinkingSunCues(), 'hira', 2)).toEqual([5, 8])
  })

  it('spans the first cue', () => {
    expect(cueReadingSpanInLine('たいようがしずんでいく', sinkingSunCues(), 'hira', 0)).toEqual([0, 4])
  })

  it('spans a kana cue that reads as itself (が)', () => {
    expect(cueReadingSpanInLine('たいようがしずんでいく', sinkingSunCues(), 'hira', 1)).toEqual([4, 5])
  })

  it('spans the last cue', () => {
    expect(cueReadingSpanInLine('たいようがしずんでいく', sinkingSunCues(), 'hira', 4)).toEqual([9, 11])
  })

  it('keeps romaji inter-word spaces OUTSIDE the highlighted span', () => {
    expect(cueReadingSpanInLine('otona ni naru', romajiWords(), 'romaji', 1)).toEqual([6, 8])
  })

  it('spans the first romaji cue', () => {
    expect(cueReadingSpanInLine('otona ni naru', romajiWords(), 'romaji', 0)).toEqual([0, 5])
  })

  it('returns null when the line is out of sync with the cues', () => {
    expect(cueReadingSpanInLine('completely different', romajiWords(), 'romaji', 1)).toBeNull()
  })

  it('returns null for an empty line, out-of-range index, or empty cue reading', () => {
    expect(cueReadingSpanInLine('', sinkingSunCues(), 'hira', 2)).toBeNull()
    expect(cueReadingSpanInLine('たいようがしずんでいく', sinkingSunCues(), 'hira', 9)).toBeNull()
    expect(cueReadingSpanInLine('た', [cue('')], 'hira', 0)).toBeNull()
  })
})
