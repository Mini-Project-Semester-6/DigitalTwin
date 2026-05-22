import { createContext, useContext, useState, useCallback } from 'react'

const STORAGE_KEY = 'lungtwin_results_v1'
const CONDITIONS = ['covid19', 'cancer', 'fibrosis']

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { covid19: null, cancer: null, fibrosis: null }
    const parsed = JSON.parse(raw)
    const out = { covid19: null, cancer: null, fibrosis: null }
    for (const c of CONDITIONS) {
      if (parsed[c] && typeof parsed[c] === 'object') out[c] = parsed[c]
    }
    return out
  } catch {
    return { covid19: null, cancer: null, fibrosis: null }
  }
}

function saveToStorage(results) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(results)) } catch {}
}

const ResultsStoreContext = createContext(null)

export function ResultsStoreProvider({ children }) {
  const [results, setResults] = useState(() => loadFromStorage())

  const setResult = useCallback((condition, data) => {
    if (!CONDITIONS.includes(condition)) return
    setResults(prev => {
      const next = { ...prev, [condition]: { ...data, _savedAt: Date.now() } }
      saveToStorage(next)
      return next
    })
  }, [])

  const clearResult = useCallback((condition) => {
    setResults(prev => {
      const next = { ...prev, [condition]: null }
      saveToStorage(next)
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    const empty = { covid19: null, cancer: null, fibrosis: null }
    saveToStorage(empty)
    setResults(empty)
  }, [])

  return (
    <ResultsStoreContext.Provider value={{ results, setResult, clearResult, clearAll }}>
      {children}
    </ResultsStoreContext.Provider>
  )
}

export function useResultsStore() {
  const ctx = useContext(ResultsStoreContext)
  if (!ctx) throw new Error('useResultsStore must be used inside ResultsStoreProvider')
  return ctx
}
