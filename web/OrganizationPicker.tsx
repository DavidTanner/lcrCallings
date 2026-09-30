import { Checkbox, Combobox, Group, InputBase, useCombobox } from '@mantine/core'

/** The option that shows or hides every organization at once; organization names are never empty */
const ALL = ''

export interface OrganizationPickerProps {
  /** every organization, in the order to list them */
  organizations: string[]
  /** those taken out of view */
  hidden: ReadonlySet<string>
  onChange: (hidden: ReadonlySet<string>) => void
}

/** What the picker says is shown, e.g. `All organizations` or `3 of 12 organizations` */
function summary(organizations: string[], shown: string[]) {
  if (shown.length === organizations.length) return 'All organizations'
  if (!shown.length) return 'No organizations'
  if (shown.length === 1) return shown[0] ?? ''
  return `${String(shown.length)} of ${String(organizations.length)} organizations`
}

/**
 * A dropdown of every organization with a checkbox by each, like the one on
 * LCR's Organizations page, to add organizations to the view or take them out.
 * It stays open while picking, so several can be changed at once.
 */
export function OrganizationPicker({ organizations, hidden, onChange }: OrganizationPickerProps) {
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption()
    },
  })

  const shown = organizations.filter(name => !hidden.has(name))
  const allShown = shown.length === organizations.length

  const toggle = (value: string) => {
    if (value === ALL) {
      onChange(allShown ? new Set(organizations) : new Set())
      return
    }
    const next = new Set(hidden)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  const label = summary(organizations, shown)

  return (
    <Combobox store={combobox} onOptionSubmit={toggle} size="md">
      <Combobox.Target targetType="button">
        <InputBase
          component="button"
          type="button"
          size="md"
          pointer
          aria-label={`Organizations: ${label}`}
          rightSection={<Combobox.Chevron />}
          rightSectionPointerEvents="none"
          onClick={() => {
            combobox.toggleDropdown()
          }}
        >
          {label}
        </InputBase>
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options mah={360} style={{ overflowY: 'auto' }} aria-multiselectable>
          <Combobox.Option value={ALL} active={allShown} aria-selected={allShown}>
            <Group gap="sm" wrap="nowrap">
              <Checkbox.Indicator checked={allShown} indeterminate={!allShown && shown.length > 0} aria-hidden />
              <span>All organizations</span>
            </Group>
          </Combobox.Option>
          {organizations.map(name => (
            <Combobox.Option key={name} value={name} active={!hidden.has(name)} aria-selected={!hidden.has(name)}>
              <Group gap="sm" wrap="nowrap">
                <Checkbox.Indicator checked={!hidden.has(name)} aria-hidden />
                <span>{name}</span>
              </Group>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  )
}
