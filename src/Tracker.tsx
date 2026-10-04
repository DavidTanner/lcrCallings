import { Anchor, Button, Group, Text } from '@mantine/core'
import mantineCss from '@mantine/core/styles.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CandidatesField } from './CandidatesField'
import { HolderStatusField, type HolderStatusFieldProps, highlightColor, vacantHighlight } from './HolderStatusField'
import { LAYER_ID } from './constants'
import type { ExtensionApi } from './content/api'
import type { Member } from './lcr/members'
import { type CallingRow, enhancePage } from './page/enhance'
import { shadowContainer } from './shadow'
import { ShareLinkButton } from './ShareLinkButton'
import { type Candidate, type Consideration, consideration, type Tracking } from './shared/consideration'
import { spreadsheetUrl } from './shared/spreadsheet'
import { useConsiderations } from './useConsiderations'

export { SAVE_DELAY_MS } from './useConsiderations'

const NO_CANDIDATES: Candidate[] = []
const NOTHING_TRACKED: Tracking = { candidates: NO_CANDIDATES }

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
  initial: Record<string, Tracking>
  /** where the web page is, to share links to it */
  webUrl?: string
  onChangeSheet: () => void
}

/** Adds the column to the page while mounted, saving edits to the sheet */
export function Tracker({ doc, api, spreadsheetId, initial, webUrl, onChangeSheet }: TrackerProps) {
  const [rows, setRows] = useState<CallingRow[]>([])
  const [members, setMembers] = useState<Member[]>()
  const [membersError, setMembersError] = useState<string>()
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  /** what the last sync did */
  const [synced, setSynced] = useState<string>()
  const [layer] = useState(() => createLayer(doc))

  const save = useCallback((consideration: Consideration) => api.save(spreadsheetId, consideration), [api, spreadsheetId])
  const { values, change, changeHolderStatus, flush, settle, replace, saving, error, setError } = useConsiderations(initial, save)

  useEffect(() => {
    const e = enhancePage(doc, (next) => {
      for (const row of next) {
        lightContainer(row.slot)
        lightContainer(row.holderSlot)
      }
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
      const added = await api.sync(spreadsheetId, rows.map(row => consideration(row, values[row.key] ?? NOTHING_TRACKED)))
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
        {webUrl && <ShareLinkButton pageUrl={webUrl} spreadsheetId={spreadsheetId} />}
        <Button size="xs" variant="subtle" onClick={onChangeSheet}>Change sheet</Button>
      </Group>
      {rows.map(row => createPortal(
        <CandidatesField
          row={row}
          candidates={values[row.key]?.candidates ?? NO_CANDIDATES}
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
      {rows.map(row => row.member
        ? createPortal(
            <HolderCell
              row={row}
              holder={names.get(row.member) ?? 'the holder'}
              status={values[row.key]?.holderStatus}
              dropdownTarget={layer.target}
              onChange={changeHolderStatus}
            />,
            lightContainer(row.holderSlot),
            `${row.key}|holder`,
          )
        : <VacantCell key={`${row.key}|vacant`} nameCell={row.nameCell} />)}
    </>
  )
}

/** Colors the background of `element`, a part of the page; returns a function that puts it back */
function highlight(element: HTMLElement, color: string) {
  const before = element.style.backgroundColor
  element.style.backgroundColor = color
  return () => {
    element.style.backgroundColor = before
  }
}

/** Highlights a vacant calling's Name cell while mounted */
function VacantCell({ nameCell }: { nameCell: HTMLElement }) {
  useEffect(() => highlight(nameCell, vacantHighlight), [nameCell])
  return null
}

/** The holder's status, in the page's Name cell, highlighting the cell in its color once picked */
function HolderCell({ row, status, ...props }: HolderStatusFieldProps & { row: CallingRow }) {
  const { nameCell } = row
  useEffect(() => status && highlight(nameCell, highlightColor(status)), [nameCell, status])

  return <HolderStatusField row={row} status={status} {...props} />
}
