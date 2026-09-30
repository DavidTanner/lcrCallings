import { Anchor, Button, Group, Text } from '@mantine/core'
import mantineCss from '@mantine/core/styles.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CandidatesField } from './CandidatesField'
import { LAYER_ID } from './constants'
import type { ExtensionApi } from './content/api'
import type { Member } from './lcr/members'
import { type CallingRow, enhancePage } from './page/enhance'
import { shadowContainer } from './shadow'
import type { Candidate, Consideration } from './shared/consideration'
import { spreadsheetUrl } from './shared/spreadsheet'
import { useConsiderations } from './useConsiderations'

export { SAVE_DELAY_MS } from './useConsiderations'

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
  const [members, setMembers] = useState<Member[]>()
  const [membersError, setMembersError] = useState<string>()
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  /** what the last sync did */
  const [synced, setSynced] = useState<string>()
  const [layer] = useState(() => createLayer(doc))

  const save = useCallback((consideration: Consideration) => api.save(spreadsheetId, consideration), [api, spreadsheetId])
  const { values, change, flush, settle, replace, saving, error, setError } = useConsiderations(initial, save)

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

  useEffect(() => {
    let live = true
    api.loadMembers().then(
      async (loaded) => {
        if (!live) return
        setMembers(loaded)
        // so the web page, which can't reach LCR, can show and pick names
        await api.saveMembers(spreadsheetId, loaded).catch((e: unknown) => {
          if (live) setError(`Couldn't copy member names to the sheet: ${message(e)}`)
        })
      },
      (e: unknown) => {
        if (live) setMembersError(message(e))
      },
    )
    return () => {
      live = false
    }
  }, [api, spreadsheetId, setError])

  const options = useMemo(() => members?.map(m => ({ value: m.uuid, label: m.name })) ?? [], [members])
  const names = useMemo(() => new Map(options.map(o => [o.value, o.label])), [options])
  const loading = !members && !membersError

  const refresh = async () => {
    setRefreshing(true)
    try {
      replace(await api.load(spreadsheetId))
      setError(undefined)
    }
    catch (e) {
      setError(`Couldn't refresh: ${message(e)}`)
    }
    finally {
      setRefreshing(false)
    }
  }

  /** Adds a row to the sheet for every calling on the page that isn't in it yet */
  const syncAll = async () => {
    setSyncing(true)
    setSynced(undefined)
    try {
      // let edits land first, so a row they add isn't added again
      await settle()
      const added = await api.sync(spreadsheetId, rows.map(row => ({
        key: row.key,
        calling: row.calling,
        member: row.member,
        candidates: values[row.key] ?? NO_CANDIDATES,
      })))
      setSynced(added
        ? `Added ${String(added)} ${added === 1 ? 'calling' : 'callings'} to the sheet.`
        : 'Every calling is already in the sheet.')
      setError(undefined)
    }
    catch (e) {
      setError(`Couldn't sync: ${message(e)}`)
    }
    finally {
      setSyncing(false)
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
      {synced && <Text size="xs" c="dimmed">{synced}</Text>}
      <Group gap="xs">
        <Button size="xs" variant="default" loading={refreshing} onClick={() => void refresh()}>Refresh</Button>
        <Button size="xs" variant="default" loading={syncing} disabled={!rows.length} onClick={() => void syncAll()}>Sync all callings</Button>
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
