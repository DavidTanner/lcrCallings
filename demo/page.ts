import { type DemoCalling, type DemoOrganization, MEMBERS } from './data'

const names = new Map(MEMBERS.map(m => [m.uuid, m.name]))

const escape = (text: string) => text.replace(/[&<>"]/g, c => `&#${String(c.charCodeAt(0))};`)

// LCR repeats each column's title in every cell for its mobile card view,
// which is how the extension finds its columns (see src/page/enhance.ts)
const cardLabel = (text: string) =>
  `<span class="eden-headings-h6 eden-table-card-view__cloned-column-header" aria-hidden="true">${escape(text)}</span>`

const COLUMNS = ['Calling', 'Name', 'Sustained', 'Set Apart', '']

function row({ calling, holder, sustained = '', setApart = '' }: DemoCalling) {
  const name = holder
    ? `<button data-member-card-person-uuid="${escape(holder)}" type="button" class="eden-button-a11y orgs__member">${escape(names.get(holder) ?? holder)}</button>`
    : '<span class="orgs__vacant">Calling Vacant</span>'
  const td = (label: string, content: string, className = 'orgs__td-top') =>
    `<td class="eden-table-td ${className}">${cardLabel(label)}${content}</td>`
  return '<tr role="row">'
    + td('Calling', `<div class="eden-stack">${escape(calling)}</div>`, 'orgs__td-small')
    + td('Name', `<div class="eden-stack">${name}</div>`)
    + td('Sustained', escape(sustained))
    + td('Set Apart', escape(setApart))
    + td('', '<button type="button" class="eden-button-a11y orgs__edit" disabled>Edit</button>', 'no-print orgs__td-top')
    + '</tr>'
}

function table(heading: string, callings: DemoCalling[], level: 'h2' | 'h3') {
  const th = (text: string) => `<th class="eden-table-th" scope="col" role="columnheader">${cardLabel(text)}${escape(text)}</th>`
  return '<div class="eden-stack orgs__table">'
    + `<${level} class="eden-headings-${level}">${escape(heading)}</${level}>`
    + '<div class="eden-table-card-view__container"><div class="eden-table-card-view">'
    + '<table role="grid" class="eden-table-table eden-table-table--striped">'
    + `<thead><tr role="row">${COLUMNS.map(th).join('')}</tr></thead>`
    + `<tbody>${callings.map(row).join('')}</tbody>`
    + '</table></div></div></div>'
}

/** Markup shaped like LCR's Organizations page, one section per organization */
export function organizationsHtml(organizations: DemoOrganization[]): string {
  return organizations.map(({ name, tables }) => {
    // an organization with a single table is headed by it, as on LCR
    const only = tables.length === 1 ? tables[0] : undefined
    const body = only
      ? table(name, only.callings, 'h2')
      : `<h2 class="eden-headings-h2">${escape(name)}</h2>${tables.map(t => table(t.heading, t.callings, 'h3')).join('')}`
    return `<section class="orgs__section">${body}</section>`
  }).join('')
}
