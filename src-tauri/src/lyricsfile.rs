use crate::parser::lrc::{parse_lrc, format_timestamp};
use crate::persistent_entities::PersistentTrack;
use crate::utils::strip_timestamp;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const LYRICSFILE_VERSION: &str = "1.0";
pub const INSTRUMENTAL_LRC: &str = "[au: instrumental]";

#[derive(Debug, Clone, Copy, Default)]
pub struct LyricsPresence {
    pub has_plain_lyrics: bool,
    pub has_synced_lyrics: bool,
    pub has_word_synced_lyrics: bool,
    pub is_instrumental: bool,
}

#[derive(Debug, Clone)]
pub struct LyricsfileTrackMetadata {
    pub title: String,
    pub album_name: String,
    pub artist_name: String,
    pub duration: f64,
}

impl LyricsfileTrackMetadata {
    pub fn from_persistent_track(track: &PersistentTrack) -> Self {
        Self {
            title: track.title.clone(),
            album_name: track.album_name.clone(),
            artist_name: track.artist_name.clone(),
            duration: track.duration,
        }
    }

    pub fn new(title: &str, album_name: &str, artist_name: &str, duration: f64) -> Self {
        Self {
            title: title.to_string(),
            album_name: album_name.to_string(),
            artist_name: artist_name.to_string(),
            duration,
        }
    }
}

#[derive(Debug)]
pub struct ParsedLyricsfile {
    pub plain_lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
    pub is_instrumental: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct TransliterationDecl {
    pub id: String,
    pub system: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct LyricsfileDocument {
    version: String,
    metadata: LyricsfileMetadata,
    lines: Vec<LyricsfileLine>,
    #[serde(skip_serializing_if = "Option::is_none")]
    plain: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct LyricsfileMetadata {
    title: String,
    artist: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    album: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    offset_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    language: Option<String>,
    #[serde(default)]
    instrumental: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transliterations: Option<Vec<TransliterationDecl>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct LyricsfileLine {
    text: String,
    start_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    end_ms: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transliteration: Option<BTreeMap<String, String>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    words: Vec<LyricsfileWord>,
}

#[derive(Debug, Serialize, Deserialize)]
struct LyricsfileWord {
    text: String,
    start_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    end_ms: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transliteration: Option<BTreeMap<String, String>>,
}

fn null_as_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Default + serde::Deserialize<'de>,
{
    let opt = Option::<T>::deserialize(deserializer)?;
    Ok(opt.unwrap_or_default())
}

#[derive(Debug, Deserialize)]
struct ParsedLyricsfileDocument {
    metadata: ParsedLyricsfileMetadata,
    #[serde(default, deserialize_with = "null_as_default")]
    lines: Vec<LyricsfileLine>,
    plain: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ParsedLyricsfileMetadata {
    #[serde(default)]
    instrumental: bool,
}

pub fn build_lyricsfile(
    metadata: &LyricsfileTrackMetadata,
    plain_lyrics: Option<&str>,
    synced_lyrics: Option<&str>,
) -> Option<String> {
    let plain = normalize_non_empty(plain_lyrics);
    let synced = normalize_non_empty(synced_lyrics);
    let is_instrumental = synced
        .as_ref()
        .map(|value| is_instrumental_lyrics(value))
        .unwrap_or(false);

    if plain.is_none() && synced.is_none() {
        return None;
    }

    let synced_lines = if is_instrumental {
        Vec::new()
    } else {
        synced
            .as_ref()
            .map_or_else(Vec::new, |value| parse_lrc_lines(value))
    };

    let plain_for_document = if is_instrumental {
        None
    } else {
        plain.or_else(|| synced.as_ref().map(|value| strip_timestamp(value)))
    };

    let document = LyricsfileDocument {
        version: LYRICSFILE_VERSION.to_string(),
        metadata: LyricsfileMetadata {
            title: metadata.title.clone(),
            artist: metadata.artist_name.clone(),
            album: normalize_non_empty(Some(metadata.album_name.as_str())),
            duration_ms: duration_to_ms(metadata.duration),
            offset_ms: None,
            language: None,
            instrumental: is_instrumental,
            transliterations: None,
        },
        lines: synced_lines,
        plain: plain_for_document,
    };

    serde_yaml::to_string(&document).ok()
}

pub fn parse_lyricsfile(lyricsfile: &str) -> Result<ParsedLyricsfile> {
    let document: ParsedLyricsfileDocument = serde_yaml::from_str(lyricsfile)?;

    let is_instrumental = document.metadata.instrumental;
    let synced_lyrics = if is_instrumental {
        Some(INSTRUMENTAL_LRC.to_string())
    } else {
        lines_to_lrc(&document.lines)
    };

    let plain_lyrics = normalize_non_empty(document.plain.as_deref()).or_else(|| {
        synced_lyrics
            .as_ref()
            .map(|value| strip_timestamp(value))
            .and_then(|value| normalize_non_empty(Some(value.as_str())))
    });

    Ok(ParsedLyricsfile {
        plain_lyrics,
        synced_lyrics,
        is_instrumental,
    })
}

pub fn lyrics_presence_from_lyricsfile(lyricsfile: &str) -> Result<LyricsPresence> {
    let document: ParsedLyricsfileDocument = serde_yaml::from_str(lyricsfile)?;
    let is_instrumental = document.metadata.instrumental;

    if is_instrumental {
        return Ok(LyricsPresence {
            is_instrumental: true,
            ..LyricsPresence::default()
        });
    }

    let has_synced_lyrics = !document.lines.is_empty();
    let has_word_synced_lyrics = document.lines.iter().any(|line| !line.words.is_empty());
    let has_plain_from_lines = document.lines.iter().any(|line| {
        normalize_non_empty(Some(line.text.as_str())).is_some()
            || line
                .words
                .iter()
                .any(|word| normalize_non_empty(Some(word.text.as_str())).is_some())
    });
    let has_plain_lyrics = normalize_non_empty(document.plain.as_deref()).is_some()
        || (has_synced_lyrics && has_plain_from_lines);

    Ok(LyricsPresence {
        has_plain_lyrics,
        has_synced_lyrics,
        has_word_synced_lyrics,
        is_instrumental: false,
    })
}

pub fn is_instrumental_lyrics(lyrics: &str) -> bool {
    let lowered = lyrics.to_lowercase();
    lowered.contains("[au:") && lowered.contains("instrumental")
}

fn parse_lrc_lines(synced_lyrics: &str) -> Vec<LyricsfileLine> {
    let parsed = parse_lrc(synced_lyrics);

    parsed
        .timed_lines
        .iter()
        .enumerate()
        .map(|(index, timed_line)| {
            let start_ms = timed_line.timestamp_ms;
            let end_ms = parsed
                .timed_lines
                .get(index + 1)
                .map(|next_line| next_line.timestamp_ms);

            LyricsfileLine {
                text: timed_line.text.clone(),
                start_ms,
                end_ms,
                transliteration: None,
                words: Vec::new(),
            }
        })
        .collect()
}

fn lines_to_lrc(lines: &[LyricsfileLine]) -> Option<String> {
    let mut output = String::new();

    for line in lines {
        let text = if !line.words.is_empty() {
            line.words.iter().map(|word| word.text.as_str()).collect()
        } else {
            line.text.clone()
        };

        output.push_str(&format!("{} {}\n", format_timestamp(line.start_ms), text));
    }

    normalize_non_empty(Some(output.as_str()))
}

fn duration_to_ms(duration: f64) -> Option<i64> {
    if duration > 0.0 {
        Some((duration * 1000.0).round() as i64)
    } else {
        None
    }
}

fn normalize_non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::to_string)
        .filter(|content| !content.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    const TRANSLITERATION_YAML: &str = r#"version: '1.0'
metadata:
  title: 'Song'
  artist: 'Artist'
  language: 'ja'
  transliterations:
    - id: hira
      system: 'ja-Hrkt'
    - id: romaji
      system: 'ja-Latn'
lines:
  - text: '今日は'
    start_ms: 1000
    end_ms: 3000
    transliteration:
      hira: 'きょうは'
      romaji: 'kyō wa'
    words:
      - text: '今日'
        start_ms: 1000
        end_ms: 2000
        transliteration:
          hira: 'きょう'
          romaji: 'kyō'
      - text: 'は'
        start_ms: 2000
        end_ms: 3000
        transliteration:
          romaji: 'wa'
plain: |
  今日は
"#;

    #[test]
    fn transliteration_metadata_and_maps_round_trip() {
        let document: LyricsfileDocument =
            serde_yaml::from_str(TRANSLITERATION_YAML).expect("fixture YAML should parse");

        let declarations = document
            .metadata
            .transliterations
            .as_ref()
            .expect("transliterations should be present");
        assert_eq!(declarations.len(), 2);
        assert_eq!(declarations[0].id, "hira");
        assert_eq!(declarations[0].system, "ja-Hrkt");
        assert_eq!(declarations[1].id, "romaji");
        assert_eq!(declarations[1].system, "ja-Latn");

        let line = &document.lines[0];
        let line_map = line
            .transliteration
            .as_ref()
            .expect("line transliteration should be present");
        assert_eq!(line_map.get("hira").map(String::as_str), Some("きょうは"));
        assert_eq!(line_map.get("romaji").map(String::as_str), Some("kyō wa"));

        let kanji_word = &line.words[0];
        let kanji_map = kanji_word
            .transliteration
            .as_ref()
            .expect("kanji word transliteration should be present");
        assert_eq!(kanji_map.get("hira").map(String::as_str), Some("きょう"));
        assert_eq!(kanji_map.get("romaji").map(String::as_str), Some("kyō"));

        let kana_word = &line.words[1];
        let kana_map = kana_word
            .transliteration
            .as_ref()
            .expect("kana word transliteration should be present");
        assert!(kana_map.get("hira").is_none(), "pure kana omits the hira key");
        assert_eq!(kana_map.get("romaji").map(String::as_str), Some("wa"));

        let serialized = serde_yaml::to_string(&document).expect("serialize document");
        let reparsed: LyricsfileDocument =
            serde_yaml::from_str(&serialized).expect("re-parse serialized document");

        assert_eq!(
            document.metadata.transliterations,
            reparsed.metadata.transliterations
        );
        assert_eq!(document.lines.len(), reparsed.lines.len());
        for (before, after) in document.lines.iter().zip(reparsed.lines.iter()) {
            assert_eq!(before.transliteration, after.transliteration);
            assert_eq!(before.words.len(), after.words.len());
            for (word_before, word_after) in before.words.iter().zip(after.words.iter()) {
                assert_eq!(word_before.transliteration, word_after.transliteration);
            }
        }
    }

    #[test]
    fn transliteration_fixture_round_trips_structurally() {
        let fixture = include_str!("../testdata/ja_transliteration.lyricsfile");
        let document: LyricsfileDocument =
            serde_yaml::from_str(fixture).expect("fixture should parse");

        assert_eq!(
            document
                .metadata
                .transliterations
                .as_ref()
                .expect("fixture declares transliterations")
                .len(),
            2
        );

        let serialized = serde_yaml::to_string(&document).expect("serialize fixture");

        println!("===RUST_YAML_START===");
        print!("{serialized}");
        println!("===RUST_YAML_END===");

        let reparsed: LyricsfileDocument =
            serde_yaml::from_str(&serialized).expect("re-parse serialized fixture");

        assert_eq!(
            document.metadata.transliterations,
            reparsed.metadata.transliterations
        );
        assert_eq!(document.lines.len(), reparsed.lines.len());
        for (before, after) in document.lines.iter().zip(reparsed.lines.iter()) {
            assert_eq!(before.transliteration, after.transliteration);
            assert_eq!(before.words.len(), after.words.len());
            for (word_before, word_after) in before.words.iter().zip(after.words.iter()) {
                assert_eq!(word_before.transliteration, word_after.transliteration);
            }
        }
    }
}
