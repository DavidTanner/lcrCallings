import { useCallback, useEffect, useRef, useState } from 'react'
import { isConflict } from './background/sheets'
import { type Candidate, type Consideration, type HolderStatus, consideration as toConsideration, type Tracking } from './shared/consideration'
import { message } from './shared/errors'

/** How long typing in notes pauses before they're saved */
export const SAVE_DELAY_MS = 1000

/** The calling a consideration is for, without who is being considered */
export type CallingInfo = Omit<Consideration, keyof Tracking>

interface PendingEdit {
  consideration: Consideration
  timer: ReturnType<typeof setTimeout>
}

const NOTHING_TRACKED: Tracking = { candidates: [] }

/** Each row's Updated, by key */
const stampsOf = (values: Record<string, Tracking>) =>
  new Map(Object.entries(values).flatMap(([key, { updated }]) => updated ? [[key, updated] as const] : []))

/**
 * Who is being considered for each calling, and where its holder is, by key,
 * saving each change with `save`: right away, or once typing pauses for
 * `debounce`d changes. Saves that fail are kept to `retry`, except ones
 * refused because someone else changed the row, which need a refresh first.
 */
export function useConsiderations(initial: Record<string, Tracking>, save: (consideration: Consideration) => Promise<string>) {
  const [values, setValuesState] = useState(initial)
  /** the values as of the last change, for changes to one part of a row to keep the rest */
  const latest = useRef(initial)
  const setValues = useCallback((update: (current: Record<string, Tracking>) => Record<string, Tracking>) => {
    latest.current = update(latest.current)
    setValuesState(latest.current)
  }, [])
  const [saving, setSaving] = useState(0)
  const [error, setError] = useState<string>()
  /** edits waiting for typing to pause, by key */
  const pending = useRef(new Map<string, PendingEdit>())
  /** saves that haven't finished, which never reject */
  const inFlight = useRef(new Set<Promise<void>>())
  /** the latest edit of each row that couldn't be saved, by key */
  const failed = useRef(new Map<string, Consideration>())
  const [unsaved, setUnsaved] = useState(0)
  /** each row's Updated as last loaded or saved, which the sheet must still have for a save to go ahead */
  const stamps = useRef(stampsOf(initial))

  /** each row's latest save, which its next save waits for */
  const chains = useRef(new Map<string, Promise<void>>())

  const write = useCallback((consideration: Consideration) => {
    setSaving(n => n + 1)
    const { key } = consideration
    // one save of a row at a time: at once, a new row would be appended twice and a second save sent the Updated the first replaces
    const saved = (chains.current.get(key) ?? Promise.resolve()).then(() => {
      // read as it's sent, not as edited, so it follows saves that finished meanwhile
      const updated = stamps.current.get(key)
      return save({ ...consideration, ...(updated ? { updated } : {}) })
    }).then(
      (stamp) => {
        stamps.current.set(consideration.key, stamp)
        if (failed.current.get(consideration.key) === consideration) failed.current.delete(consideration.key)
        setError(undefined)
      },
      (e: unknown) => {
        // not kept when refused for others' changes: it would be refused again, and would hide theirs on refresh
        if (!isConflict(e)) failed.current.set(consideration.key, consideration)
        setError(`Not saved: ${message(e)}`)
      },
    ).finally(() => {
      setUnsaved(failed.current.size)
      setSaving(n => n - 1)
      inFlight.current.delete(saved)
      if (chains.current.get(key) === saved) chains.current.delete(key)
    })
    chains.current.set(key, saved)
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

  const edit = useCallback((calling: CallingInfo, update: (current: Tracking) => Tracking, debounce: boolean) => {
    const tracked = update(latest.current[calling.key] ?? NOTHING_TRACKED)
    const consideration = toConsideration(calling, tracked)
    setValues(current => ({ ...current, [calling.key]: tracked }))
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
  }, [flush, write, setValues])

  /** Changes who is being considered for a calling */
  const change = useCallback((calling: CallingInfo, candidates: Candidate[], debounce: boolean) => {
    edit(calling, current => ({ ...current, candidates }), debounce)
  }, [edit])

  /** Changes where a calling's holder is; clearing it leaves it out, as it is before one is picked */
  const changeHolderStatus = useCallback((calling: CallingInfo, holderStatus: HolderStatus | undefined) => {
    edit(calling, ({ candidates }) => ({ candidates, ...(holderStatus ? { holderStatus } : {}) }), false)
  }, [edit])

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
  const replace = useCallback((fresh: Record<string, Tracking>) => {
    const kept = [...pending.current.keys(), ...failed.current.keys()]
    // edits kept keep the Updated they were made on, so their save still catches others' changes
    const loaded = stampsOf(fresh)
    for (const key of kept) {
      const stamp = stamps.current.get(key)
      if (stamp) loaded.set(key, stamp)
      else loaded.delete(key)
    }
    stamps.current = loaded
    setValues((current) => {
      const next = { ...fresh }
      for (const key of kept) {
        const value = current[key]
        if (value) next[key] = value
      }
      return next
    })
  }, [setValues])

  // don't lose notes still being typed when unmounted
  useEffect(() => {
    const edits = pending.current
    return () => {
      for (const key of [...edits.keys()]) flush(key)
    }
  }, [flush])

  return { values, change, changeHolderStatus, flush, settle, retry, replace, saving, unsaved, error, setError }
}
