import { Anchor, Button, type ComboboxItem, Group, MultiSelect, Stack, Text, Textarea } from '@mantine/core'
import mantineCss from '@mantine/core/styles.css'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LAYER_ID } from './constants'
import type { ExtensionApi } from './content/api'
import type { Member } from './lcr/members'
import { type CallingRow, COLUMN_TITLE, enhancePage } from './page/enhance'
import { shadowContainer } from './shadow'
import type { Candidate } from './shared/consideration'
import { spreadsheetUrl } from './shared/spreadsheet'

/** How long typing in notes pauses before they're saved */
export const SAVE_DELAY_MS = 1000
/** How many matching members the dropdown shows at once */
const OPTION_LIMIT = 10

const NO_CANDIDATES: Candidate[] = []

const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const sameRows = (a: CallingRow[], b: CallingRow[]) => a.length === b.length && a.every((row, i) => row === b[i])

/**
 * The element to render into inside `host`'s shadow root, which keeps LCR's
 * CSS and Mantine's apart, like the panel's. LCR is always light, so this is
 * too: Mantine's variables come from the scheme on the host, and its other
 * rules from the scheme on an ancestor, which inside the root is the container.
 */
function lightContainer(host: HTMLElement) {
  host.setAttribute('data-mantine-color-scheme', 'light')
  const container = shadowContainer(host, mantineCss)
  container.setAttribute('data-mantine-color-scheme', 'light')
  return container
}

/**
 * Where the fields' dropdowns render: a layer over the page rather than the
 * cells, which the page's tables could clip, or the panel, which is fixed
 * while the page scrolls
 */
function createLayer(doc: Document) {
  const host = doc.createElement('div')
  host.id = LAYER_ID
  Object.assign(host.style, { position: 'absolute', top: '0', left: '0', zIndex: '2147483646' })
  return { host, target: lightContainer(host) }
}

interface PendingEdit {
  row: CallingRow
  candidates: Candidate[]
  timer: ReturnType<typeof setTimeout>
}

export interface TrackerProps {
  doc: Document
  api: ExtensionApi
  spreadsheetId: string
  initial: Record<string, Candidate[]>
  onChangeSheet: () => void
}

/** Adds the column to the page while mounted, saving edits to the sheet */
export function Tracker({ doc, api, spreadsheetId, initial, onChangeSheet }: TrackerProps) {
  const [rows, setRows] = useState<CallingRow[]>([])
  const [values, setValues] = useState(initial)
  const [members, setMembers] = useState<Member[]>()
  const [membersError, setMembersError] = useState<string>()
  const [saving, setSaving] = useState(0)
  const [error, setError] = useState<string>()
  const [refreshing, setRefreshing] = useState(false)
  const [layer] = useState(() => createLayer(doc))
  /** notes edits waiting for typing to pause, by row key */
  const pending = useRef(new Map<string, PendingEdit>())

  const save = useCallback((row: CallingRow, candidates: Candidate[]) => {
    setSaving(n => n + 1)
    api.save(spreadsheetId, { key: row.key, calling: row.calling, member: row.member, candidates }).then(
      () => {
        setError(undefined)
      },
      (e: unknown) => {
        setError(`Not saved: ${message(e)}`)
      },
    ).finally(() => {
      setSaving(n => n - 1)
    })
  }, [api, spreadsheetId])

  /** Saves a row's pending edit now, if it has one */
  const flush = useCallback((key: string) => {
    const edit = pending.current.get(key)
    if (!edit) return
    clearTimeout(edit.timer)
    pending.current.delete(key)
    save(edit.row, edit.candidates)
  }, [save])

  const change = useCallback((row: CallingRow, candidates: Candidate[], debounce: boolean) => {
    setValues(current => ({ ...current, [row.key]: candidates }))
    clearTimeout(pending.current.get(row.key)?.timer)
    if (debounce) {
      const timer = setTimeout(() => {
        flush(row.key)
      }, SAVE_DELAY_MS)
      pending.current.set(row.key, { row, candidates, timer })
    }
    else {
      pending.current.delete(row.key)
      save(row, candidates)
    }
  }, [flush, save])

  useEffect(() => {
    const e = enhancePage(doc, (next) => {
      for (const row of next) lightContainer(row.slot)
      setRows(current => sameRows(current, next) ? current : next)
    })
    return () => {
      e.cleanup()
    }
  }, [doc])

  useEffect(() => {
    doc.body.append(layer.host)
    return () => {
      layer.host.remove()
    }
  }, [doc, layer])

  // don't lose notes still being typed when the panel closes
  useEffect(() => {
    const edits = pending.current
    return () => {
      for (const key of [...edits.keys()]) flush(key)
    }
  }, [flush])

  useEffect(() => {
    let live = true
    api.loadMembers().then(
      (loaded) => {
        if (live) setMembers(loaded)
      },
      (e: unknown) => {
        if (live) setMembersError(message(e))
      },
    )
    return () => {
      live = false
    }
  }, [api])

  const options = useMemo(() => members?.map(m => ({ value: m.uuid, label: m.name })) ?? [], [members])
  const names = useMemo(() => new Map(options.map(o => [o.value, o.label])), [options])
  const loading = !members && !membersError

  const refresh = async () => {
    setRefreshing(true)
    try {
      const fresh = await api.load(spreadsheetId)
      // keep edits that haven't been saved yet
      setValues((current) => {
        const next = { ...fresh }
        for (const key of pending.current.keys()) {
          const value = current[key]
          if (value) next[key] = value
        }
        return next
      })
      setError(undefined)
    }
    catch (e) {
      setError(`Couldn't refresh: ${message(e)}`)
    }
    finally {
      setRefreshing(false)
    }
  }

  return (
    <>
      {rows.length
        ? (
            <Text size="sm">
              {`Tracking ${String(rows.length)} ${rows.length === 1 ? 'calling' : 'callings'} in `}
              <Anchor href={spreadsheetUrl(spreadsheetId)} target="_blank" rel="noreferrer">the shared sheet</Anchor>
              .
            </Text>
          )
        : (
            <Text size="sm" c="dimmed">
              No callings found. Open this on the Organizations page in Leader and Clerk Resources.
            </Text>
          )}
      {membersError && <Text size="sm" c="red">{membersError}</Text>}
      {error
        ? <Text size="sm" c="red">{error}</Text>
        : <Text size="xs" c="dimmed">{saving ? 'Saving…' : 'All changes saved'}</Text>}
      <Group>
        <Button size="xs" variant="default" loading={refreshing} onClick={() => void refresh()}>Refresh</Button>
        <Button size="xs" variant="subtle" onClick={onChangeSheet}>Change sheet</Button>
      </Group>
      {rows.map(row => createPortal(
        <CandidatesField
          row={row}
          candidates={values[row.key] ?? NO_CANDIDATES}
          options={options}
          names={names}
          loading={loading}
          membersError={membersError}
          dropdownTarget={layer.target}
          onChange={change}
          onDone={flush}
        />,
        lightContainer(row.slot),
        row.key,
      ))}
    </>
  )
}

/**
 * A candidate's name, from the member list. Someone typed in as free text is
 * named by that text, and anyone no longer in the list (moved out) by their
 * member uuid.
 */
function candidateName(id: string, names: Map<string, string>, loading: boolean) {
  const name = names.get(id)
  if (name !== undefined) return name
  if (id.startsWith('text:')) return id.slice('text:'.length)
  return loading ? 'Loading…' : id
}

interface CandidatesFieldProps {
  row: CallingRow
  candidates: Candidate[]
  /** the members who can be picked */
  options: ComboboxItem[]
  /** member uuid → name */
  names: Map<string, string>
  loading: boolean
  /** why the member list couldn't be loaded */
  membersError?: string
  dropdownTarget: HTMLElement
  onChange: (row: CallingRow, candidates: Candidate[], debounce: boolean) => void
  /** called when the user leaves a notes field, to save it right away */
  onDone: (key: string) => void
}

/** Picks who is being considered for one calling, with notes on each */
const CandidatesField = memo(function CandidatesField({ row, candidates, options, names, loading, membersError, dropdownTarget, onChange, onDone }: CandidatesFieldProps) {
  const nameOf = (id: string) => candidateName(id, names, loading)

  // candidates who aren't in the member list (moved out, or typed in before
  // there was one) still need an option to show as picked
  const data = useMemo(() => {
    const unlisted = candidates.filter(c => !names.has(c.id)).map(c => ({ value: c.id, label: candidateName(c.id, names, loading) }))
    return unlisted.length ? [...unlisted, ...options] : options
  }, [options, names, loading, candidates])

  const pick = (ids: string[]) => {
    onChange(row, ids.map(id => candidates.find(c => c.id === id) ?? { id, notes: '' }), false)
  }

  const setNotes = (id: string, notes: string) => {
    onChange(row, candidates.map(c => c.id === id ? { ...c, notes } : c), true)
  }

  return (
    <Stack gap={4} miw={220}>
      <MultiSelect
        size="xs"
        aria-label={`${COLUMN_TITLE} for ${row.calling}`}
        placeholder={candidates.length ? undefined : loading ? 'Loading members…' : 'Pick members'}
        data={data}
        value={candidates.map(c => c.id)}
        onChange={pick}
        searchable
        hidePickedOptions
        limit={OPTION_LIMIT}
        nothingFoundMessage={loading ? 'Loading members…' : membersError ? `Couldn't load members: ${membersError}` : 'No members found'}
        // with a field in every row, keeping closed dropdowns around adds up
        comboboxProps={{ keepMounted: false, portalProps: { target: dropdownTarget } }}
      />
      {candidates.map(c => (
        <Textarea
          key={c.id}
          size="xs"
          label={nameOf(c.id)}
          aria-label={`Notes on ${nameOf(c.id)} for ${row.calling}`}
          placeholder="Notes"
          autosize
          minRows={1}
          maxRows={6}
          value={c.notes}
          onChange={(event) => {
            setNotes(c.id, event.currentTarget.value)
          }}
          onBlur={() => {
            onDone(row.key)
          }}
        />
      ))}
    </Stack>
  )
})
