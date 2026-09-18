import { rgb } from 'd3-color'
import { interpolateRgbBasis } from 'd3-interpolate'
import { interpolateInferno } from 'd3-scale-chromatic'

// Entry count of every theme's colour lookup table. The spectrogram render hot
// loop indexes it with the normalized magnitude, so this doubles as the
// quantization resolution of the colour axis.
export const SPECTROGRAM_LUT_SIZE = 256

// Sample any d3 `t => colour` interpolator into a flat RGB lookup table.
//
// This is the single colour-calculation path shared by every theme: a theme is
// just an interpolator plugged into this builder. `interpolateInferno` returns
// "#rrggbb" while `interpolateRgbBasis` returns "rgb(r, g, b)", so values are
// normalized through d3-color's `rgb()` rather than parsing either format by
// hand — that is what keeps one builder viable for all themes.
const buildLut = interpolate => {
  const lut = new Uint8Array(SPECTROGRAM_LUT_SIZE * 3)
  for (let i = 0; i < SPECTROGRAM_LUT_SIZE; i++) {
    const { r, g, b } = rgb(interpolate(i / (SPECTROGRAM_LUT_SIZE - 1)))
    lut[i * 3] = r
    lut[i * 3 + 1] = g
    lut[i * 3 + 2] = b
  }
  return lut
}

const cssRgbAt = (lut, index) =>
  `rgb(${lut[index * 3]}, ${lut[index * 3 + 1]}, ${lut[index * 3 + 2]})`

// Neither end of a ramp identifies its theme: every one starts near-black and
// ends near-white, so endpoint swatches all read as black-to-white. The most
// chromatic entry is the hue a reader actually associates with the theme.
const mostChromaticIndex = lut => {
  let bestIndex = 0
  let bestChroma = -1
  for (let i = 0; i < SPECTROGRAM_LUT_SIZE; i++) {
    const red = lut[i * 3]
    const green = lut[i * 3 + 1]
    const blue = lut[i * 3 + 2]
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue)
    if (chroma > bestChroma) {
      bestChroma = chroma
      bestIndex = i
    }
  }
  return bestIndex
}

const defineTheme = (id, label, interpolate) => {
  const lut = buildLut(interpolate)
  return Object.freeze({
    id,
    label,
    lut,
    swatchColor: cssRgbAt(lut, mostChromaticIndex(lut)),
  })
}

// Blue and green are Aegisub-flavoured ramps: a black floor climbing through the
// hue to a pale — not white — peak, mirroring how inferno tops out at pale
// yellow. Capping below white keeps the two-extreme swatches readable as "blue"
// and "green" instead of collapsing to greyscale.
//
// They run through `interpolateRgbBasis`, the same builder d3-scale-chromatic
// uses for its own named ramps (`interpolateBlues` is exactly
// `interpolateRgbBasis(schemeBlues[9])`), so all three themes share one code
// path. d3's stock Blues/Greens are unusable here: they run light -> dark with
// no black anchor, inverting the loudness polarity a spectrogram needs.
const BLUE_STOPS = ['#000004', '#0a2f6b', '#2a7fc0', '#7fd4f0', '#cdf0ff']
const GREEN_STOPS = ['#000400', '#0b3b16', '#1f9a3c', '#62d967', '#d6ffcc']

export const SPECTROGRAM_THEMES = Object.freeze([
  defineTheme('inferno', 'Inferno', interpolateInferno),
  defineTheme('blue', 'Blue', interpolateRgbBasis(BLUE_STOPS)),
  defineTheme('green', 'Green', interpolateRgbBasis(GREEN_STOPS)),
])

export const DEFAULT_SPECTROGRAM_THEME_ID = 'inferno'

const THEMES_BY_ID = new Map(SPECTROGRAM_THEMES.map(theme => [theme.id, theme]))

export const isSpectrogramThemeId = id => THEMES_BY_ID.has(id)

// Coerce persisted or unknown values to an id that is always renderable.
export const normalizeSpectrogramThemeId = id =>
  THEMES_BY_ID.has(id) ? id : DEFAULT_SPECTROGRAM_THEME_ID

export const getSpectrogramTheme = id => THEMES_BY_ID.get(normalizeSpectrogramThemeId(id))

export const getSpectrogramLut = id => getSpectrogramTheme(id).lut
