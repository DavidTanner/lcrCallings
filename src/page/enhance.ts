/** Title of the column added after Name */
export const COLUMN_TITLE = 'Considering'
/** Added to every calling row */
export const ROW_CLASS = 'callings-row'
/** Prefix of the per-calling row class, e.g. `callings-calling-bishop` */
export const CALLING_CLASS_PREFIX = 'callings-calling-'
/** Marks the element in each added cell that a row's field renders into, holding the row's key */
export const SLOT = 'data-callings-slot'
/** Marks the element added to each Name cell that the holder's status renders into, holding the row's key */
export const HOLDER_SLOT = 'data-callings-holder-slot'

/** Marks the cells this module adds, so they can be found and removed */
const ADDED = 'data-callings-column'

// LCR repeats each column's title inside every cell for its mobile card view;
// it's the most reliable way to tell which column a cell belongs to
const LABEL_CLASS = 'eden-table-card-view__cloned-column-header'

/** A calling row on the page */
export interface CallingRow {
  /** identifies the row across page loads: calling, current holder and occurrence */
  key: string
  calling: string
  /** member uuid of whoever holds the calling now, '' when vacant */
  member: string
  /** the headings the row's table is under, outermost first, e.g. `['Elders Quorum', 'Teachers']` */
  organization: string[]
  /** where the row is on the page, from 0 */
  position: number
  /** element in the added cell to render the row's field into */
  slot: HTMLElement
  /** the page's Name cell, which shows whoever holds the calling now */
  nameCell: HTMLElement
  /** element at the end of the Name cell to render the holder's status into */
  holderSlot: HTMLElement
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const label = (cell: Element) => cell.querySelector(`:scope > .${LABEL_CLASS}`)?.textContent.trim()
const cellLabelled = (row: Element, name: string) => [...row.children].find(cell => label(cell) === name)

/** A cell cloned from `template` (so it matches the page's styling) with the given label */
function addedCell(template: Element, tag: 'td' | 'th', title: string) {
  const doc = template.ownerDocument
  const cell = doc.createElement(tag)
  cell.className = template.className
  for (const attr of ['style', 'scope', 'role']) {
    const value = template.getAttribute(attr)
    if (value !== null) cell.setAttribute(attr, value)
  }
  cell.setAttribute(ADDED, '')
  const cardLabel = doc.createElement('span')
  cardLabel.className = template.querySelector(`.${LABEL_CLASS}`)?.className ?? LABEL_CLASS
  cardLabel.setAttribute('aria-hidden', 'true')
  cardLabel.textContent = title
  cell.append(cardLabel)
  return cell
}

/**
 * The headings each calling table is under, outermost first. LCR heads each
 * organization with an h2 and the groups within it with h3s and h4s, not
 * always nested in their own elements, so this goes by document order.
 */
function tableOrganizations(doc: Document) {
  const organizations = new Map<Element, string[]>()
  const headings: string[] = []
  for (const el of doc.querySelectorAll('h2, h3, h4, h5, h6, table')) {
    if (el.tagName === 'TABLE') {
      organizations.set(el, headings.filter(Boolean))
      continue
    }
    const level = Number(el.tagName.slice(1)) - 2
    headings.length = level
    headings[level] = el.textContent.trim()
  }
  return organizations
}

export interface Enhancement {
  /** The calling rows currently enhanced, in page order */
  rows: () => CallingRow[]
  /** Removes everything that was added to the page */
  cleanup: () => void
}

/**
 * Adds a Considering column after Name to every calling table on an LCR
 * organizations page, with an empty slot in each row for the caller to render
 * into, another at the end of each Name cell, and classes to every row so callings can be hidden. Keeps doing so as
 * the page re-renders or loads more rows, calling `onApply` with the rows after
 * each pass; a row that's still on the page is the same object every time.
 */
export function enhancePage(doc: Document, onApply?: (rows: CallingRow[]) => void): Enhancement {
  let rows: CallingRow[] = []
  const rowFor = new WeakMap<Element, CallingRow>()

  const apply = () => {
    for (const header of doc.querySelectorAll('thead tr')) {
      const name = cellLabelled(header, 'Name')
      if (name && !name.nextElementSibling?.hasAttribute(ADDED)) {
        const th = addedCell(name, 'th', COLUMN_TITLE)
        th.append(COLUMN_TITLE)
        name.after(th)
      }
    }

    // The same calling and person can appear more than once (e.g. the bishop
    // is also over the Aaronic Priesthood), so count repeats to keep keys unique
    const seen = new Map<string, number>()
    const organizations = tableOrganizations(doc)
    const found: CallingRow[] = []
    for (const tr of doc.querySelectorAll('tbody tr')) {
      const callingCell = cellLabelled(tr, 'Calling')
      const name = cellLabelled(tr, 'Name')
      if (!callingCell || !name) continue

      const calling = (callingCell.querySelector('.eden-stack') ?? callingCell).textContent.trim()
      const member = name.querySelector('[data-member-card-person-uuid]')?.getAttribute('data-member-card-person-uuid') ?? ''
      const id = `${calling}|${member || 'vacant'}`
      const occurrence = seen.get(id) ?? 0
      seen.set(id, occurrence + 1)

      tr.classList.add(ROW_CLASS, CALLING_CLASS_PREFIX + slugify(calling))

      let cell = name.nextElementSibling
      if (!cell?.hasAttribute(ADDED)) {
        cell = addedCell(name, 'td', COLUMN_TITLE)
        const slot = doc.createElement('div')
        const key = `${id}|${String(occurrence)}`
        slot.setAttribute(SLOT, key)
        cell.append(slot)
        name.after(cell)
        const holderSlot = doc.createElement('div')
        holderSlot.setAttribute(HOLDER_SLOT, key)
        holderSlot.setAttribute(ADDED, '')
        holderSlot.style.marginTop = '4px'
        rowFor.set(cell, { key, calling, member, organization: [], position: 0, slot, nameCell: name as HTMLElement, holderSlot })
      }
      const row = rowFor.get(cell)
      if (row) {
        // put back if the page re-rendered the cell's contents without it
        if (row.holderSlot.parentElement !== name) name.append(row.holderSlot)
        row.nameCell = name as HTMLElement
        // kept up to date on the same object, in case rows are added above it
        row.organization = organizations.get(tr.closest('table') ?? tr) ?? []
        row.position = found.length
        found.push(row)
      }
    }
    rows = found
    onApply?.(rows)
  }

  // LCR is a React app, so re-apply whenever it re-renders. Our own changes
  // trigger one more pass, which finds nothing left to do.
  let scheduled = false
  const observer = new MutationObserver(() => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      apply()
    })
  })

  apply()
  observer.observe(doc.body, { childList: true, subtree: true })

  return {
    rows: () => rows,
    cleanup: () => {
      observer.disconnect()
      for (const el of doc.querySelectorAll(`[${ADDED}]`)) el.remove()
      for (const row of doc.querySelectorAll(`.${ROW_CLASS}`)) {
        const added = [...row.classList].filter(c => c === ROW_CLASS || c.startsWith(CALLING_CLASS_PREFIX))
        row.classList.remove(...added)
        if (!row.classList.length) row.removeAttribute('class')
      }
    },
  }
}
