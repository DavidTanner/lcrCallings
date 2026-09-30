import { Alert, Anchor, Badge, Button, Group, Paper, SegmentedControl, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core'
import { useCallback, useMemo, useState } from 'react'
import type { SheetMember, SheetsClient } from '../src/background/sheets'
import { CandidatesField, candidateName } from '../src/CandidatesField'
import type { Candidate, Consideration } from '../src/shared/consideration'
import { spreadsheetUrl } from '../src/shared/spreadsheet'
import { type CallingInfo, useConsiderations } from '../src/useConsiderations'
import { OrganizationPicker } from './OrganizationPicker'
import { byOrganization, UNGROUPED } from './organizations'

/** What the page needs from Google Sheets, so it can be tested without Google */
export type WebApi = Pick<SheetsClient, 'loadRows' | 'loadMembers' | 'save'>

const NO_CANDIDATES: Candidate[] = []

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

type Show = 'all' | 'considering' | 'vacant'

export interface BoardProps {
  api: WebApi
  spreadsheetId: string
  rows: Consideration[]
  members: SheetMember[]
  /** Makes sure there's a Google token, signing in if needed; call it from a tap */
  ensureSignedIn: () => Promise<void>
}

/** Every calling in the sheet, with who is being considered for each, saving edits to the sheet */
export function Board({ api, spreadsheetId, rows: initialRows, members: initialMembers, ensureSignedIn }: BoardProps) {
  const [callings, setCallings] = useState<CallingInfo[]>(initialRows)
  const [members, setMembers] = useState(initialMembers)
  const [search, setSearch] = useState('')
  const [show, setShow] = useState<Show>('all')
  /** organizations taken out of view; any not in it, including new ones, are shown */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())
  const [refreshing, setRefreshing] = useState(false)

  const initial = useMemo(() => Object.fromEntries(initialRows.map(r => [r.key, r.candidates])), [initialRows])
  const save = useCallback((consideration: Consideration) => api.save(spreadsheetId, consideration), [api, spreadsheetId])
  const { values, change, flush, retry, replace, saving, unsaved, error, setError } = useConsiderations(initial, save)

  const options = useMemo(() => members.map(m => ({ value: m.uuid, label: m.name })), [members])
  const names = useMemo(() => new Map(options.map(o => [o.value, o.label])), [options])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await ensureSignedIn()
      const [rows, fresh] = await Promise.all([api.loadRows(spreadsheetId), api.loadMembers(spreadsheetId)])
      setCallings(rows)
      setMembers(fresh)
      replace(Object.fromEntries(rows.map(r => [r.key, r.candidates])))
      setError(undefined)
    }
    catch (e) {
      setError(`Couldn't refresh: ${message(e)}`)
    }
    finally {
      setRefreshing(false)
    }
  }

  const saveAgain = async () => {
    try {
      await ensureSignedIn()
      retry()
    }
    catch (e) {
      setError(`Not saved: ${message(e)}`)
    }
  }

  const holderName = (member: string) => member ? names.get(member) ?? 'Someone not on the member list' : undefined

  const organizations = useMemo(() => byOrganization(callings), [callings])
  const organizationNames = useMemo(() => organizations.map(o => o.name), [organizations])

  const query = search.trim().toLowerCase()
  const matches = ({ key, calling, member, organization: headings = [] }: CallingInfo) => {
    const candidates = values[key] ?? NO_CANDIDATES
    if (show === 'considering' && !candidates.length) return false
    if (show === 'vacant' && member) return false
    if (!query) return true
    const text = [calling, ...headings, holderName(member) ?? 'vacant', ...candidates.flatMap(c => [candidateName(c.id, names, false), c.status ?? '', c.notes])]
    return text.some(t => t.toLowerCase().includes(query))
  }
  const shown = organizations
    .filter(o => !hidden.has(o.name))
    .map(o => ({ ...o, groups: o.groups.map(g => ({ ...g, rows: g.rows.filter(matches) })).filter(g => g.rows.length) }))
    .filter(o => o.groups.length)

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" gap="xs">
        <Text size="sm" c="dimmed">
          {`${String(callings.length)} ${callings.length === 1 ? 'calling' : 'callings'} in `}
          <Anchor href={spreadsheetUrl(spreadsheetId)} target="_blank" rel="noreferrer">the shared sheet</Anchor>
          {' · '}
          {saving ? 'Saving…' : unsaved ? `${String(unsaved)} not saved` : 'All changes saved'}
        </Text>
        <Button size="sm" variant="default" loading={refreshing} onClick={() => void refresh()}>Refresh</Button>
      </Group>

      {error && (
        <Alert color="red" p="sm">
          <Group justify="space-between" gap="xs">
            <Text size="sm">{error}</Text>
            {unsaved > 0 && <Button size="xs" color="red" onClick={() => void saveAgain()}>Save again</Button>}
          </Group>
        </Alert>
      )}
      {!members.length && (
        <Alert color="yellow" p="sm">
          No member names in the sheet yet. Someone with the extension needs to open it on LCR&apos;s Organizations page once to copy them.
        </Alert>
      )}
      {!callings.length && (
        <Alert color="yellow" p="sm">
          No callings in the sheet yet. Someone with the extension needs to press Sync all callings on LCR&apos;s Organizations page.
        </Alert>
      )}

      <Stack gap="xs">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" verticalSpacing="xs">
          <TextInput
            type="search"
            size="md"
            placeholder="Search callings, names, statuses and notes"
            aria-label="Search"
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value)
            }}
          />
          <OrganizationPicker organizations={organizationNames} hidden={hidden} onChange={setHidden} />
        </SimpleGrid>
        <SegmentedControl
          fullWidth
          value={show}
          onChange={(value) => {
            setShow(value)
          }}
          data={[
            { value: 'all', label: 'All' },
            { value: 'considering', label: 'Considering' },
            { value: 'vacant', label: 'Vacant' },
          ]}
        />
      </Stack>

      {shown.map(({ name, groups }) => (
        <Stack key={name} component="section" gap="xs" aria-label={name}>
          <div>
            <Title order={2} size="h3">{name}</Title>
            {name === UNGROUPED && (
              <Text size="sm" c="dimmed">
                The sheet doesn&apos;t say which organization these are in yet. Someone with the extension can press Sync all callings on LCR&apos;s Organizations page to sort them.
              </Text>
            )}
          </div>
          {groups.map(group => (
            <Stack key={group.name} gap={6}>
              {group.name && <Title order={3} size="h5" c="dimmed">{group.name}</Title>}
              {/* three columns from iPad width, so more callings fit on screen */}
              <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="xs" verticalSpacing="xs" style={{ alignItems: 'start' }}>
                {group.rows.map(row => (
                  <Paper key={row.key} withBorder radius="md" p="xs">
                    <Stack gap={6}>
                      <div>
                        <Title order={4} size="h6" lh={1.3}>{row.calling}</Title>
                        {row.member
                          ? <Text size="xs" c="dimmed" truncate>{holderName(row.member)}</Text>
                          : <Badge size="xs" variant="light" color="gray">Vacant</Badge>}
                      </div>
                      <CandidatesField
                        row={row}
                        candidates={values[row.key] ?? NO_CANDIDATES}
                        options={options}
                        names={names}
                        loading={false}
                        onChange={change}
                        onDone={flush}
                        size="md"
                      />
                    </Stack>
                  </Paper>
                ))}
              </SimpleGrid>
            </Stack>
          ))}
        </Stack>
      ))}
      {callings.length > 0 && !shown.length && (
        <Text c="dimmed" ta="center">
          {organizationNames.every(name => hidden.has(name)) ? 'No organizations picked.' : 'Nothing matches.'}
        </Text>
      )}
    </Stack>
  )
}
