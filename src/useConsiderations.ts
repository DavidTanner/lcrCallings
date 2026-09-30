import { useCallback, useEffect, useRef, useState } from 'react'
import type { Candidate, Consideration } from './shared/consideration'

/** How long typing in notes pauses before they're saved */
export const SAVE_DELAY_MS = 1000

/** The calling a consideration is for, without who is being considered */
export type CallingInfo = Omit<Consideration, 'candidates'>

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

interface PendingEdit {
  consideration: Consideration
  timer: ReturnType<typeof setTimeout>
}

/**
 * Who is being considered for each calling, by key, saving each change with
 * `save`: right away, or once typing pauses for `debounce`d changes. Saves
 * that fail are kept to `retry`.
 */
export function useConsiderations(initial: Record<string, Candidate[]>, save: (consideration: Consideration) => Promise<void>) {
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState(0)
  const [error, setError] = useState<string>()
  /** edits waiting for typing to pause, by key */
  const pending = useRef(new Map<string, PendingEdit>())
  /** saves that haven't finished, which never reject */
  const inFlight = useRef(new Set<Promise<void>>())
  /** the latest edit of each row that couldn't be saved, by key */
  const failed = useRef(new Map<string, Consideration>())
  const [unsaved, setUnsaved] = useState(0)

  const write = useCallback((consideration: Consideration) => {
    setSaving(n => n + 1)
    const saved = save(consideration).then(
      () => {
        if (failed.current.get(consideration.key) === consideration) failed.current.delete(consideration.key)
        setError(undefined)
      },
      (e: unknown) => {
        failed.current.set(consideration.key, consideration)
        setError(`Not saved: ${message(e)}`)
      },
    ).finally(() => {
      setUnsaved(failed.current.size)
      setSaving(n => n - 1)
      inFlight.current.delete(saved)
    })
    inFlight.current.add(saved)
  }, [save])

  /** Saves a row's pending edit now, if it has one */
  const flush = useCallback((key: string) => {
    const edit = pending.current.get(key)
    if (!edit) return
    clearTimeout(edit.timer)
    pending.current.delete(key)
    write(edit.consideration)
  }, [write])

  const change = useCallback((calling: CallingInfo, candidates: Candidate[], debounce: boolean) => {
    // just these, as `calling` may be a page row carrying more
    const consideration = { key: calling.key, calling: calling.calling, member: calling.member, candidates }
    setValues(current => ({ ...current, [calling.key]: candidates }))
    clearTimeout(pending.current.get(calling.key)?.timer)
    // a newer edit replaces one that failed
    failed.current.delete(calling.key)
    if (debounce) {
      const timer = setTimeout(() => {
        flush(calling.key)
      }, SAVE_DELAY_MS)
      pending.current.set(calling.key, { consideration, timer })
    }
    else {
      pending.current.delete(calling.key)
      write(consideration)
    }
  }, [flush, write])

  /** Saves every pending edit now, and waits for all saves to finish */
  const settle = useCallback(async () => {
    for (const key of [...pending.current.keys()]) flush(key)
    await Promise.all(inFlight.current)
  }, [flush])

  /** Tries the saves that failed again */
  const retry = useCallback(() => {
    const edits = [...failed.current.values()]
    failed.current.clear()
    for (const edit of edits) write(edit)
  }, [write])

  /** Shows `fresh` values from the sheet, keeping edits that haven't been saved yet */
  const replace = useCallback((fresh: Record<string, Candidate[]>) => {
    setValues((current) => {
      const next = { ...fresh }
      for (const key of [...pending.current.keys(), ...failed.current.keys()]) {
        const value = current[key]
        if (value) next[key] = value
      }
      return next
    })
  }, [])

  // don't lose notes still being typed when unmounted
  useEffect(() => {
    const edits = pending.current
    return () => {
      for (const key of [...edits.keys()]) flush(key)
    }
  }, [flush])

  return { values, change, flush, settle, retry, replace, saving, unsaved, error, setError }
}
