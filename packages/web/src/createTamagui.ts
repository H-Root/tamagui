import { isWeb } from '@tamagui/constants'

import { configListeners, setConfig, setTokens } from './config'
import { Variable } from './createVariable'
import { DeepVariableObject, createVariables } from './createVariables'
import { getThemeCSSRules } from './helpers/getThemeCSSRules'
import {
  getAllRules,
  listenForSheetChanges,
  scanAllSheets,
} from './helpers/insertStyleRule'
import { proxyThemesToParents } from './helpers/proxyThemeToParents'
import { registerCSSVariable, variableToCSS } from './helpers/registerCSSVariable'
import { ensureThemeVariable } from './helpers/themes'
import { configureMedia } from './hooks/useMedia'
import { parseFont, registerFontVariables } from './insertFont'
import { Tamagui } from './Tamagui'
import {
  CreateTamaguiProps,
  DedupedTheme,
  DedupedThemes,
  GenericFont,
  GetCSS,
  InferTamaguiConfig,
  TamaguiInternalConfig,
  ThemeParsed,
  ThemesLikeObject,
  TokensMerged,
  TokensParsed,
} from './types'

// config is re-run by the @tamagui/static, dont double validate
const createdConfigs = new WeakMap<any, boolean>()

export function createTamagui<Conf extends CreateTamaguiProps>(
  configIn: Conf
): InferTamaguiConfig<Conf> {
  if (createdConfigs.has(configIn)) {
    return configIn as any
  }

  // ensure variables
  const tokensParsed: TokensParsed = {} as any
  const tokens = createVariables(configIn.tokens || {})

  if (configIn.tokens) {
    // faster lookups
    const tokensMerged: TokensMerged = {} as any
    for (const cat in tokens) {
      tokensParsed[cat] = {}
      tokensMerged[cat] = {}
      const tokenCat = tokens[cat]
      for (const key in tokenCat) {
        const val = tokenCat[key]
        const prefixedKey = `$${key}`
        tokensParsed[cat][prefixedKey] = val as any
        tokensMerged[cat][prefixedKey] = val as any
        tokensMerged[cat][key] = val as any
      }
    }
    setTokens(tokensMerged)
  }

  let foundThemes: DedupedThemes | undefined
  if (configIn.themes) {
    const noThemes = Object.keys(configIn.themes).length === 0
    foundThemes = scanAllSheets(noThemes, tokensParsed)
  }

  listenForSheetChanges()

  let fontSizeTokens: Set<string> | null = null
  let fontsParsed:
    | {
        [k: string]: DeepVariableObject<GenericFont<string>>
      }
    | undefined

  if (configIn.fonts) {
    const fontTokens = Object.fromEntries(
      Object.entries(configIn.fonts).map(([k, v]) => {
        return [k, createVariables(v, 'f', true)]
      })
    )

    fontsParsed = (() => {
      const res = {} as typeof fontTokens
      for (const familyName in fontTokens) {
        const font = fontTokens[familyName]
        const fontParsed = parseFont(font)
        res[`$${familyName}`] = fontParsed
        if (!fontSizeTokens && fontParsed.size) {
          fontSizeTokens = new Set(Object.keys(fontParsed.size))
        }
      }
      return res!
    })()
  }

  const specificTokens = {}

  const themeConfig = (() => {
    const cssRuleSets: string[] = []

    if (
      process.env.TAMAGUI_DOES_SSR_CSS !== 'true' &&
      // we can leave this out if mutating, only need the js for getThemeCSSRules
      process.env.TAMAGUI_DOES_SSR_CSS !== 'mutates-themes'
    ) {
      const declarations: string[] = []
      const fontDeclarations: Record<
        string,
        { name: string; declarations: string[]; language?: string }
      > = {}

      for (const key in tokens) {
        for (const skey in tokens[key]) {
          const variable = tokens[key][skey] as any as Variable

          // set specific tokens (like $size.sm)
          specificTokens[`$${key}.${skey}`] = variable

          if (process.env.NODE_ENV === 'development') {
            if (typeof variable === 'undefined') {
              throw new Error(
                `No value for tokens.${key}.${skey}:\n${JSON.stringify(
                  variable,
                  null,
                  2
                )}`
              )
            }
          }

          if (isWeb) {
            registerCSSVariable(variable)
            declarations.push(variableToCSS(variable, key === 'zIndex'))
          }
        }
      }

      if (isWeb) {
        for (const key in fontsParsed) {
          const fontParsed = fontsParsed[key]
          const [name, language] = key.includes('_') ? key.split('_') : [key]
          const fontVars = registerFontVariables(fontParsed)
          fontDeclarations[key] = {
            name: name.slice(1),
            declarations: fontVars,
            language,
          }
        }

        const sep =
          process.env.NODE_ENV === 'development' ? configIn.cssStyleSeparator || ' ' : ''

        function declarationsToRuleSet(decs: string[], selector = '') {
          return `:root${selector} {${sep}${[...decs].join(`;${sep}`)}${sep}}`
        }

        // non-font
        cssRuleSets.push(declarationsToRuleSet(declarations))

        // fonts
        if (fontDeclarations) {
          for (const key in fontDeclarations) {
            const { name, declarations, language = 'default' } = fontDeclarations[key]
            const fontSelector = `.font_${name}`
            const langSelector = `:root .t_lang-${name}-${language} ${fontSelector}`
            const selectors =
              language === 'default' ? ` ${fontSelector}, ${langSelector}` : langSelector
            const specificRuleSet = declarationsToRuleSet(declarations, selectors)
            cssRuleSets.push(specificRuleSet)
          }
        }
      }
    }

    const themesIn = { ...configIn.themes } as ThemesLikeObject
    const dedupedThemes = foundThemes ?? getThemesDeduped(themesIn)
    const themes = proxyThemesToParents(dedupedThemes)

    return {
      themes,
      cssRuleSets,
      getThemeRulesSets() {
        // then, generate CSS from de-duped
        let themeRuleSets: string[] = []

        if (isWeb) {
          for (const { names, theme } of dedupedThemes) {
            const nextRules = getThemeCSSRules({
              config: configIn,
              themeName: names[0],
              names,
              theme,
            })
            themeRuleSets = [...themeRuleSets, ...nextRules]
          }
        }

        return themeRuleSets
      },
    }
  })()

  const shorthands = configIn.shorthands || {}

  let lastCSSInsertedRulesIndex = -1

  const getCSS: GetCSS = ({ separator = '\n', sinceLastCall, exclude } = {}) => {
    if (sinceLastCall && lastCSSInsertedRulesIndex >= 0) {
      // after first run with sinceLastCall
      const rules = getAllRules()
      lastCSSInsertedRulesIndex = rules.length
      return rules.slice(lastCSSInsertedRulesIndex).join(separator)
    }

    // set so next time getNewCSS will trigger only new rules
    lastCSSInsertedRulesIndex = 0

    const runtimeStyles = getAllRules().join(separator)

    if (exclude === 'design-system') {
      return runtimeStyles
    }

    const designSystem = `._ovs-contain {overscroll-behavior:contain;}
.is_Text .is_Text {display:inline-flex;}
._dsp_contents {display:contents;}
${themeConfig.cssRuleSets.join(separator)}`

    return `${designSystem}
${exclude ? '' : themeConfig.getThemeRulesSets().join(separator)}
${runtimeStyles}`
  }

  const getNewCSS: GetCSS = (opts) => getCSS({ ...opts, sinceLastCall: true })

  let defaultFontName =
    configIn.defaultFont ||
    // uses font named "body" if present for compat
    (configIn.fonts && ('body' in configIn.fonts ? 'body' : ''))

  if (!defaultFontName && configIn.fonts) {
    // defaults to the first font to make life easier
    defaultFontName = Object.keys(configIn.fonts)[0]
  }

  if (defaultFontName?.[0] === '$') {
    defaultFontName = defaultFontName.slice(1)
  }

  // ensure prefixed with $
  const defaultFont = `$${defaultFontName}`

  const config: TamaguiInternalConfig = {
    fonts: {},
    onlyAllowShorthands: false,
    fontLanguages: [],
    animations: {} as any,
    media: {},
    ...configIn,
    unset: {
      fontFamily: configIn.defaultFont ? defaultFont : undefined,
      ...configIn.unset,
    },
    settings: {
      webContainerType: 'inline-size',
      ...configIn.settings,
    },
    tokens: tokens as any,
    // vite made this into a function if it wasn't set
    shorthands,
    inverseShorthands: shorthands
      ? Object.fromEntries(Object.entries(shorthands).map(([k, v]) => [v, k]))
      : {},
    themes: themeConfig.themes as any,
    fontsParsed: fontsParsed || {},
    themeConfig,
    tokensParsed: tokensParsed as any,
    parsed: true,
    getNewCSS,
    getCSS,
    defaultFont,
    fontSizeTokens: fontSizeTokens || new Set(),
    specificTokens,
    // const tokens = [...getToken(tokens.size[0])]
    // .spacer-sm + ._dsp_contents._dsp-sm-hidden { margin-left: -var(--${}) }
  }

  configureMedia(config)
  setConfig(config)

  createdConfigs.set(config, true)

  if (configListeners.size) {
    configListeners.forEach((cb) => cb(config))
    configListeners.clear()
  }

  if (process.env.NODE_ENV === 'development') {
    if (process.env.DEBUG?.startsWith('tamagui')) {
      console.info('Tamagui config:', config)
    }
    if (!globalThis['Tamagui']) {
      globalThis['Tamagui'] = Tamagui
    }
  }

  return config as any
}

// dedupes the themes if given them via JS config
function getThemesDeduped(themes: ThemesLikeObject): DedupedThemes {
  const dedupedThemes: DedupedThemes = []
  const existing = new Map<string, DedupedTheme>()

  // first, de-dupe and parse them
  for (const themeName in themes) {
    // forces us to separate the dark/light themes (otherwise we generate bad t_light prefix selectors)
    const darkOrLightSpecificPrefix = themeName.startsWith('dark')
      ? 'dark'
      : themeName.startsWith('light')
      ? 'light'
      : ''

    const rawTheme = themes[themeName]

    // dont force referential equality but may need something more consistent than JSON.stringify
    // separate between dark/light
    const key = darkOrLightSpecificPrefix + JSON.stringify(rawTheme)

    // if existing, avoid
    if (existing.has(key)) {
      const e = existing.get(key)!
      e.names.push(themeName)
      continue
    }

    // ensure each theme object unique for dedupe
    // is ThemeParsed because we call ensureThemeVariable
    const theme = { ...rawTheme } as any as ThemeParsed
    // parse into variables
    for (const key in theme) {
      // make sure properly names theme variables
      ensureThemeVariable(theme, key)
    }

    // set deduped
    const deduped: DedupedTheme = {
      names: [themeName],
      theme,
    }
    dedupedThemes.push(deduped)
    existing.set(key, deduped)
  }

  return dedupedThemes
}
