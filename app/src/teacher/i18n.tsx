import { createContext, useContext, useState, type ReactNode } from 'react'
import { initialLang, saveLang, STRINGS, type UiLang } from './strings'

const Ctx = createContext<{ lang: UiLang; setLang: (l: UiLang) => void }>({ lang: 'en', setLang: () => {} })

/** Wraps the teacher app; everything inside reads its words through useT(). */
export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState(initialLang)
  const setLang = (l: UiLang) => {
    setLangState(l)
    saveLang(l)
  }
  return (
    <Ctx.Provider value={{ lang, setLang }}>
      <div lang={lang}>{children}</div>
    </Ctx.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components
export function useT() {
  const { lang, setLang } = useContext(Ctx)
  return { t: STRINGS[lang], lang, setLang }
}
