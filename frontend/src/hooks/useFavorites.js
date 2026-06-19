import { useCallback, useState } from 'react'
import { getPathId } from '../utils/pathUtils'

const STORAGE_KEY = 'sgpo-favorites'

const loadIds = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

export function useFavorites() {
  const [ids, setIds] = useState(loadIds)

  const toggle = useCallback((path) => {
    const id = getPathId(path)
    setIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

  const isFavorite = useCallback((path) => ids.has(getPathId(path)), [ids])

  return { toggle, isFavorite }
}
