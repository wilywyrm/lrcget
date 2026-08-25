/**
 * Cue-level ↔ line-level transliteration synchronisation.
 *
 * Two levels of transliteration coexist on a synced line (see LYRICSFILE_CONCEPT.md §5):
 *   - cue-level: `word.transliteration[systemId]` — per-word/character reading
 *   - line-level: `line.transliteration[systemId]` — the whole-line reading
 *
 * Spec §3 soft rule: concatenating the word readings SHOULD approximate the line
 * reading. The catch is that romanization line-level values (romaji/pinyin/romaja)
 * carry inter-word SPACES that the cue-level readings omit — e.g. line "otona ni
 * naru" vs word readings "otona","ni","naru". So a naive `words.join('')`
 * recomputation would collapse "otona ni naru" → "otonaninaru" and DESTROY the
 * spacing. Line-level is therefore the source of truth for spacing and must be
 * preserved.
 *
 * The design here propagates a single cue edit into the corresponding SPAN of the
 * line-level string (preserving all surrounding whitespace), and — critically —
 * only does so when the line is already in sync with the cues. The moment they
 * disagree it declines and leaves the line untouched, letting the out-of-sync
 * warning surface the divergence instead of risking corruption.
 */

// Strip all Unicode whitespace (ASCII space/tab/newline, NBSP U+00A0, ideographic
// space U+3000, ZWNBSP, …). Only whitespace is removed — punctuation is meaningful
// and left intact.
export const stripWhitespace = value => (typeof value === 'string' ? value : '').replace(/\s/gu, '')

// A cue's "effective reading" for a system: its stored reading, else its raw text.
// Kana/hangul read as themselves; an unread ideograph contributes its ideographs,
// which correctly forces an out-of-sync/decline against an all-Latin line rather
// than pretending the line can be reconstructed from the cues.
export const effectiveReading = (word, systemId) =>
  (word && word.transliteration && word.transliteration[systemId]) || (word && word.text) || ''

// A romanization system is any BCP-47 tag carrying a `Latn` script subtag
// (ja-Latn, zh-Latn-pinyin, ko-Latn, de-Latn, …). Compared case-insensitively
// because some servers lowercase tags on the wire. Excludes ja-Hrkt, zh-Bopo, etc.
export const isRomanizationSystem = system => {
  if (typeof system !== 'string') return false
  return system.split('-').some(sub => sub.toLowerCase() === 'latn')
}

// Map a whitespace-stripped window [nwsStart, nwsEnd) back to a character slice
// [ci, cj) of the original string L, keeping boundary whitespace OUTSIDE the
// window: ci lands on the window's first non-whitespace char, cj just past its
// last non-whitespace char. This is what preserves inter-cue spacing on replace.
const nwsWindowToCharSlice = (L, nwsStart, nwsEnd) => {
  let count = 0
  let ci = -1
  let cj = -1

  for (let k = 0; k < L.length; k++) {
    const isWhitespace = /\s/u.test(L[k])
    if (!isWhitespace && count === nwsStart && ci === -1) ci = k
    if (!isWhitespace) count++
    if (count === nwsEnd) {
      cj = k + 1
      break
    }
  }

  if (ci === -1) ci = L.length
  if (cj === -1) cj = L.length
  return [ci, cj]
}

/**
 * Propagate a single cue reading edit into the line-level string, replacing only
 * that cue's span and preserving every surrounding/interior space. Returns the new
 * line value, or the OLD line value UNCHANGED when it cannot safely/unambiguously
 * align — deferring to the out-of-sync warning rather than risking corruption.
 *
 * Uses non-whitespace positional anchoring (never substring search, which would be
 * ambiguous when a reading repeats, e.g. "na" twice in "otona ni naru").
 *
 * @param {string} oldLineValue  current line-level reading for the system
 * @param {Array}  oldWords      cue array BEFORE the edit
 * @param {Array}  newWords      cue array AFTER the edit (same length as oldWords)
 * @param {string} systemId      transliteration system id being edited
 * @param {number} changedIndex  index of the single cue whose reading changed
 * @returns {string} the patched line value, or oldLineValue on decline
 */
export function propagateCueEditToLine(oldLineValue, oldWords, newWords, systemId, changedIndex) {
  if (typeof oldLineValue !== 'string' || oldLineValue === '') return oldLineValue
  if (!Array.isArray(oldWords) || !Array.isArray(newWords)) return oldLineValue
  if (oldWords.length !== newWords.length) return oldLineValue
  if (!Number.isInteger(changedIndex) || changedIndex < 0 || changedIndex >= newWords.length) {
    return oldLineValue
  }

  const L = oldLineValue
  const newReading = (newWords[changedIndex] && newWords[changedIndex].transliteration
    ? newWords[changedIndex].transliteration[systemId]
    : '') ?? ''
  const oldStrip = stripWhitespace(effectiveReading(oldWords[changedIndex], systemId))

  // Only true value-replacements propagate. An unread→read transition (old reading
  // empty) has no width to anchor, and a read→cleared transition (new reading
  // empty) would leave dangling spacing — both decline and defer to the warning.
  if (oldStrip === '' || stripWhitespace(newReading) === '') return oldLineValue

  const leftStrip = stripWhitespace(
    newWords
      .slice(0, changedIndex)
      .map(word => effectiveReading(word, systemId))
      .join('')
  )
  const rightStrip = stripWhitespace(
    newWords
      .slice(changedIndex + 1)
      .map(word => effectiveReading(word, systemId))
      .join('')
  )
  const lineStrip = stripWhitespace(L)

  // Core precondition — exactly the negation of isLineOutOfSync(): the stripped
  // line must decompose into left + old + right. If it does not, cues and line
  // already disagree; decline rather than risk corrupting spacing.
  if (lineStrip !== leftStrip + oldStrip + rightStrip) return oldLineValue

  const [ci, cj] = nwsWindowToCharSlice(L, leftStrip.length, leftStrip.length + oldStrip.length)

  // Defensive: the mapped window must strip to exactly the old reading. Guaranteed
  // by the precondition, but a data-corrupting bug must never slip through.
  if (stripWhitespace(L.slice(ci, cj)) !== oldStrip) return oldLineValue

  // Insert the new reading verbatim (respects any user spacing inside it); the
  // predicate normalizes whitespace, so consistency is retained on the next edit.
  return L.slice(0, ci) + newReading + L.slice(cj)
}

/**
 * True when a line's line-level reading disagrees (beyond whitespace) with the
 * whitespace-stripped concatenation of its cue readings, for the given system.
 *
 * Shares `effectiveReading`/`stripWhitespace` with `propagateCueEditToLine`, so
 * "propagation declined" ⟺ "out of sync" always hold together — no confusing
 * states where the line silently failed to update yet shows no warning.
 *
 * An absent/empty line value is NOT out of sync: line-level is optional, so
 * missing it is a valid state (surfaced instead by the line-row faded-text hint).
 *
 * @param {Object} line      synced line ({ words, transliteration })
 * @param {string} systemId  transliteration system id
 * @returns {boolean}
 */
export function isLineOutOfSync(line, systemId) {
  const lineValue = line && line.transliteration ? line.transliteration[systemId] : undefined
  if (lineValue === undefined || lineValue === null || lineValue === '') return false

  const cues = Array.isArray(line?.words) ? line.words : []
  const concat = cues.map(word => effectiveReading(word, systemId)).join('')

  return stripWhitespace(lineValue) !== stripWhitespace(concat)
}

/**
 * Build a line-level reading from the cues for the given system. Romanization
 * systems join with a single space (spacing the cues can't represent); syllabary
 * systems (furigana/zhuyin) join with no separator. Explicit, opt-in only — this
 * may overwrite manual spacing by design and must never run on a keystroke.
 *
 * @param {Object} line      synced line ({ words })
 * @param {string} systemId  transliteration system id
 * @param {string} system    BCP-47 system tag (decides the join separator)
 * @returns {string|undefined} the generated reading, or undefined when empty
 */
export function generateLineFromCues(line, systemId, system) {
  const cues = Array.isArray(line?.words) ? line.words : []
  if (cues.length === 0) return undefined

  const parts = cues.map(word => effectiveReading(word, systemId)).filter(part => part !== '')
  if (parts.length === 0) return undefined

  if (isRomanizationSystem(system)) {
    const joined = parts.join(' ').replace(/\s+/gu, ' ').trim()
    return joined === '' ? undefined : joined
  }

  const joined = parts.join('')
  return joined === '' ? undefined : joined
}
