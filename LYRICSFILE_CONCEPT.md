```yaml
version: '1.0'

metadata:
  title: 'Song Title'
  artist: 'Artist Name'
  album: 'Album Name'
  duration_ms: 245000
  offset_ms: 0
  language: 'en'
  instrumental: false

lines:
  - text: 'Synced line here'
    start_ms: 12000
    end_ms: 15500

plain: |
  Song Title

  [Verse 1]
  Synced line here
  Another synced line

  [Chorus]
  Hook line here
```

---

## Specification

### Top-Level Fields

| Field      | Type   | Required | Description                           |
| ---------- | ------ | -------- | ------------------------------------- |
| `version`  | string | Yes      | Format version, always `"1.0"`        |
| `metadata` | object | Yes      | Song information                      |
| `lines`    | array  | No       | Synced lyric lines (omit if unsynced) |
| `plain`    | string | No       | Plain text lyrics (multiline)         |

### Metadata Object

| Field          | Type    | Required | Description                                         |
| -------------- | ------- | -------- | --------------------------------------------------- |
| `title`        | string  | Yes      | Song title                                          |
| `artist`       | string  | Yes      | Primary artist                                      |
| `album`        | string  | No       | Album name                                          |
| `duration_ms`  | integer | No       | Total song length in milliseconds                   |
| `offset_ms`    | integer | No       | Global timing offset in milliseconds (default: `0`) |
| `language`     | string  | No       | ISO 639-1 language code                             |
| `instrumental`       | boolean | No       | `true` if song has no vocals (default: `false`)                                                                                                  |
| `transliterations`  | array   | No       | Declared transliteration systems. Each entry: `{id` (short mnemonic, e.g. `"hira"`), `system` (BCP-47 tag, e.g. `"ja-Hrkt"`)`}`. See §5 below. |

### Line Object

| Field      | Type    | Required | Description                     |
| ---------- | ------- | -------- | ------------------------------- |
| `text`            | string  | Yes | Full line text                                                                                                                                                |
| `start_ms`        | integer | Yes | Line start time in milliseconds                                                                                                                               |
| `end_ms`          | integer | No  | Line end time in milliseconds                                                                                                                                 |
| `words`           | array   | No  | Word-level sync array                                                                                                                                         |
| `transliteration` | object  | No  | Keyed map `{<id>: <string>}`. Value is the transliteration of the whole line in that system. Should approximate the concatenation of word transliterations. |

### Word Object

| Field      | Type    | Required | Description                                           |
| ---------- | ------- | -------- | ----------------------------------------------------- |
| `text`            | string  | Yes | Word text including trailing space (except last word)                                                                                                    |
| `start_ms`        | integer | Yes | Word start time in milliseconds                                                                                                                          |
| `end_ms`          | integer | No  | Word end time in milliseconds                                                                                                                            |
| `transliteration` | object  | No  | Keyed map `{<id>: <string>}`. Value is the transliteration of this word/segment in that system. Omit the key entirely when no reading exists for that word. |

---

## Usage Patterns

### 1. Unsynced Lyrics Only

```yaml
version: '1.0'
metadata:
  title: 'New Song'
  artist: 'Unknown Artist'
  instrumental: false

lines: []

plain: |
  [Verse 1]
  These lyrics haven't been synced yet

  Just plain text with empty lines for spacing

  [Chorus]
  La la la
```

### 2. Synced + Plain (Customized)

```yaml
version: '1.0'
metadata:
  title: 'Midnight City'
  artist: 'M83'
  duration_ms: 243000

lines:
  - text: 'Waiting in a car'
    start_ms: 23500
    end_ms: 26800
  - text: 'Waiting for a ride in the dark'
    start_ms: 26800
    end_ms: 31500

plain: |
  MIDNIGHT CITY

  [Verse 1]
  Waiting in a car
  Waiting for a ride in the dark

  (Instrumental break)

  [Verse 2]
  The city is my church
```

_Note: Plain version includes custom headers, empty lines, and notes that wouldn't exist in the synced array._

### 3. Instrumental (No Lyrics)

```yaml
version: '1.0'
metadata:
  title: 'Adagio in G Minor'
  artist: 'Tomaso Albinoni'
  duration_ms: 480000
  instrumental: true

lines: []
plain: '' # Empty or omitted
```

### 4. Word-Synced Lyrics

```yaml
version: '1.0'
metadata:
  title: 'Shape of You'
  artist: 'Ed Sheeran'
  duration_ms: 235000

lines:
  - text: "The club isn't the best place to find a lover"
    start_ms: 12450
    end_ms: 18200
    words:
      - text: 'The '
        start_ms: 12450
        end_ms: 12900
      - text: 'club '
        start_ms: 12900
        end_ms: 13500
      - text: "isn't "
        start_ms: 13500
        end_ms: 14200
      - text: 'the '
        start_ms: 14200
        end_ms: 14600
      - text: 'best '
        start_ms: 14600
        end_ms: 15200
      - text: 'place '
        start_ms: 15200
        end_ms: 15800
      - text: 'to '
        start_ms: 15800
        end_ms: 16200
      - text: 'find '
        start_ms: 16200
        end_ms: 16800
      - text: 'a '
        start_ms: 16800
        end_ms: 17100
      - text: 'lover'
        start_ms: 17100
        end_ms: 18200
  - text: 'So the bar is where I go'
    start_ms: 18500
    end_ms: 22100
    words:
      - text: 'So '
        start_ms: 18500
        end_ms: 19000
      - text: 'the '
        start_ms: 19000
        end_ms: 19400
      - text: 'bar '
        start_ms: 19400
        end_ms: 20000
      - text: 'is '
        start_ms: 20000
        end_ms: 20400
      - text: 'where '
        start_ms: 20400
        end_ms: 21000
      - text: 'I '
        start_ms: 21000
        end_ms: 21400
      - text: 'go'
        start_ms: 21400
        end_ms: 22100

plain: |
  [Verse 1]
  The club isn't the best place to find a lover
  So the bar is where I go
```

_Note: Word objects include trailing spaces in `text` (except the last word) to allow proper reconstruction of the full line. Each word has its own `start_ms` for karaoke-style highlighting._

---

## 5. Keyed Multi-System Transliteration

Transliteration is fully optional and additive. Old parsers that don't know about these fields ignore them; the format version stays `"1.0"`.

### How it works

Declare which transliteration systems the file uses in `metadata.transliterations`. Then attach readings inline at the line and/or word level using the same short `id` as a key.

- **`metadata.transliterations`** — the declaration array. Each entry names a system once. Parsers use this to know which keys to expect.
- **`line.transliteration`** — a keyed map giving the full-line reading in each system. Optional; omit when you only have word-level readings.
- **`word.transliteration`** — a keyed map giving the per-word reading. Omit the key for a given system when that word has no reading to annotate (pure kana, punctuation, ASCII, etc.).

### Conventions

1. **Version stays `"1.0"`** — transliteration fields are additive and optional. Parsers that don't recognise them skip them safely.

2. **`system` is a BCP-47 tag** — use `"ja-Hrkt"` for Japanese syllabaries (hiragana or katakana) and `"ja-Latn"` for romaji. Some servers (e.g. navidrome) lowercase tag values on the wire (`"ja-Hrkt"` → `"ja-hrkt"`). Consumers MUST compare `system` values case-insensitively.

3. **Soft concatenation** — concatenating `word.transliteration[id]` values SHOULD approximate `line.transliteration[id]`. This mirrors the existing soft rule for `word.text` vs `line.text`: it's a guideline for consistency, not a hard constraint.

4. **Avoid duplicate kana (affix-strip ruby rule)** — when rendering ruby annotations, show ruby ONLY over spans whose base text contains kanji/hanzi AND whose transliteration reading differs from the base. A pure-kana word (e.g. `は`) or a word whose base and reading are identical gets no ruby annotation. For okurigana like `食べる`, annotate only the kanji span (`食` → `た`), leaving the kana suffix `べる` bare.

5. **Jukujikun MUST NOT be split** — a multi-kanji word with an irreducible reading (e.g. `今日` → `きょう`) MUST be kept as one word segment. Never split it across separate word entries to try to assign per-character readings.

### Example 5a — Single system (furigana only)

```yaml
version: '1.0'
metadata:
  title: 'Song Title'
  artist: 'Artist'
  language: 'ja'
  transliterations:
    - id: hira
      system: 'ja-Hrkt'
lines:
  - text: '今日は'
    start_ms: 1000
    end_ms: 3000
    transliteration:
      hira: 'きょうは'
    words:
      - text: '今日'
        start_ms: 1000
        end_ms: 2000
        transliteration:
          hira: 'きょう'
      - text: 'は'
        start_ms: 2000
        end_ms: 3000
plain: |
  今日は
```

`は` has no `transliteration` key — it's pure kana, nothing to annotate. `今日` is a jukujikun and is kept as one segment.

### Example 5b — Dual system (furigana + romaji)

```yaml
version: '1.0'
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
plain: |
  大人になる
```

`に` and `なる` are kana — they carry no `hira` key (nothing to annotate in hiragana) but do carry a `romaji` key, since romaji covers kana too.

### Example 5c — Sparse readings (only some words annotated)

```yaml
version: '1.0'
metadata:
  title: 'Mixed Song'
  artist: 'Artist'
  language: 'ja'
  transliterations:
    - id: hira
      system: 'ja-Hrkt'
lines:
  - text: '空を飛ぶ'
    start_ms: 0
    end_ms: 3000
    words:
      - text: '空'
        start_ms: 0
        end_ms: 1000
        transliteration:
          hira: 'そら'
      - text: 'を'
        start_ms: 1000
        end_ms: 1500
      - text: '飛ぶ'
        start_ms: 1500
        end_ms: 3000
plain: |
  空を飛ぶ
```

Only `空` has a reading. `を` is kana — no key. `飛ぶ` is intentionally left unannotated here to show that sparse coverage is valid; a renderer simply skips words with no key for a given system.

---

## Rules

1. **Timing**: All timestamps are integers in milliseconds, monotonically increasing
2. **Words array**: If present, render words sequentially; ignore `line.text` for display
3. **Trailing spaces**: Include in `word.text` except for the last word of each line
4. **CJK**: No spaces needed between words
5. **Validation**: Concatenation of `word.text` should approximate `line.text`
6. **Instrumental**: When `true`, both `lines` and `plain` should be empty or omitted
7. **Plain field**: Uses literal block scalar (`|`) to preserve newlines and spacing exactly as written
8. **Transliteration**: All transliteration fields are optional. Declared `id` values in `metadata.transliterations` MUST match the keys used in `line.transliteration` and `word.transliteration`. Compare `system` values case-insensitively. See §5 for full conventions.
