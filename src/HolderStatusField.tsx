import { DEFAULT_THEME, type MantineSize, Select } from '@mantine/core'
import { memo } from 'react'
import { HOLDER_STATUS_COLORS, HOLDER_STATUSES, type HolderStatus, isHolderStatus } from './shared/consideration'
import type { CallingInfo } from './useConsiderations'

/** The Mantine color a vacant calling's Name is highlighted in */
export const VACANT_COLOR = 'red' as const

/** A Mantine color as a plain color for pages outside Mantine's styles, the same shade Mantine's Mark uses */
const highlightShade = (color: typeof VACANT_COLOR | typeof HOLDER_STATUS_COLORS[HolderStatus]) => DEFAULT_THEME.colors[color][2]

/** The color to highlight a holder's name in for `status` */
export const highlightColor = (status: HolderStatus) => highlightShade(HOLDER_STATUS_COLORS[status])

/** The color to highlight a vacant calling's Name in */
export const vacantHighlight = highlightShade(VACANT_COLOR)

export interface HolderStatusFieldProps {
  row: CallingInfo
  /** whoever holds the calling now */
  holder: string
  status: HolderStatus | undefined
  onChange: (row: CallingInfo, status: HolderStatus | undefined) => void
  /** where the dropdown renders; Mantine's default when left out */
  dropdownTarget?: HTMLElement
  /** of the input; iPads zoom in on inputs with text smaller than md */
  size?: MantineSize
}

const STATUS_OPTIONS = [...HOLDER_STATUSES]

/** Picks where whoever holds a calling now is, e.g. being considered for release */
export const HolderStatusField = memo(function HolderStatusField({ row, holder, status, onChange, dropdownTarget, size = 'xs' }: HolderStatusFieldProps) {
  return (
    <Select
      size={size}
      // wide enough to show the longest status in full, in the page's narrow Name column
      miw={170}
      aria-label={`Status of ${holder} as ${row.calling}`}
      placeholder="Status"
      data={STATUS_OPTIONS}
      value={status ?? null}
      onChange={(value) => {
        onChange(row, isHolderStatus(value) ? value : undefined)
      }}
      clearable
      comboboxProps={{ keepMounted: false, portalProps: { target: dropdownTarget } }}
    />
  )
})
