import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { en, type TranslationKey } from './en'
import { hi } from './hi'
import { gu } from './gu'

export type Locale = 'en' | 'hi' | 'gu'

export const LOCALES: Array<{ code: Locale; label: string; native: string }> = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
]

const CATALOGUES: Record<Locale, Record<TranslationKey, string>> = { en, hi, gu }

const STORAGE_KEY = 'fitness_locale'

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'hi' || stored === 'gu') return stored
  } catch {
    // Private browsing or storage disabled - fall back to the browser.
  }
  const language = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en'
  if (language.startsWith('hi')) return 'hi'
  if (language.startsWith('gu')) return 'gu'
  return 'en'
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')

  useEffect(() => {
    setLocaleState(readStoredLocale())
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage is optional; the choice still applies for this session.
    }
    document.documentElement.lang = next
  }, [])

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      const catalogue = CATALOGUES[locale] ?? en
      // English is the fallback so a missing translation never shows a key.
      const template = catalogue[key] ?? en[key] ?? key
      return interpolate(template, vars)
    },
    [locale],
  )

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext)
  if (!context) {
    return {
      locale: 'en',
      setLocale: () => undefined,
      t: (key, vars) => interpolate(en[key] ?? key, vars),
    }
  }
  return context
}

/** Shorthand for components that only need the translate function. */
export function useT() {
  return useLocale().t
}

export type { TranslationKey }
export { en }
