import { type ComboboxItem, type MantineSize, MultiSelect, Select, Stack, Textarea } from '@mantine/core'
import { memo, useMemo } from 'react'
import { COLUMN_TITLE } from './page/enhance'
import { type Candidate, isStatus, STATUSES } from './shared/consideration'
import type { CallingInfo } from './useConsiderations'

/** How many matching members the dropdown shows at once */
const OPTION_LIMIT = 10

/**
 * A candidate's name, from the member list. Someone typed in as free text is
 * named by that text, and anyone no longer in the list (moved out) by their
 * member uuid.
 */
export function candidateName(id: string, names: Map<string, string>, loading: boolean) {
  const name = names.get(id)
  if (name !== undefined) return name
  if (id.startsWith('text:')) return id.slice('text:'.length)
  return loading ? 'Loading…' : id
}

export interface CandidatesFieldProps {
  row: CallingInfo
  candidates: Candidate[]
  /** the members who can be picked */
  options: ComboboxItem[]
  /** member uuid → name */
  names: Map<string, string>
  loading: boolean
  /** why the member list couldn't be loaded */
  membersError?: string
  /** where dropdowns render; Mantine's default when left out */
  dropdownTarget?: HTMLElement
  onChange: (row: CallingInfo, candidates: Candidate[], debounce: boolean) => void
  /** called when the user leaves a notes field, to save it right away */
  onDone: (key: string) => void
  /** of the inputs; iPads zoom in on inputs with text smaller than md */
  size?: MantineSize
}

const STATUS_OPTIONS = [...STATUSES]

/** Picks who is being considered for one calling, with a status and notes on each */
export const CandidatesField = memo(function CandidatesField({ row, candidates, options, names, loading, membersError, dropdownTarget, onChange, onDone, size = 'xs' }: CandidatesFieldProps) {
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

  /** clearing the status leaves it out, as it is before one is picked */
  const setStatus = (id: string, value: string | null) => {
    onChange(row, candidates.map(c => c.id !== id ? c : isStatus(value) ? { ...c, status: value } : { id: c.id, notes: c.notes }), false)
  }

  return (
    <Stack gap={4} miw={220}>
      <MultiSelect
        size={size}
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
        <Stack key={c.id} gap={2}>
          <Select
            size={size}
            label={nameOf(c.id)}
            aria-label={`Status of ${nameOf(c.id)} for ${row.calling}`}
            placeholder="Status"
            data={STATUS_OPTIONS}
            value={c.status ?? null}
            onChange={(value) => {
              setStatus(c.id, value)
            }}
            clearable
            comboboxProps={{ keepMounted: false, portalProps: { target: dropdownTarget } }}
          />
          <Textarea
            size={size}
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
        </Stack>
      ))}
    </Stack>
  )
})
