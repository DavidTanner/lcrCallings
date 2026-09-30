import type { Member } from '../src/lcr/members'
import type { Candidate } from '../src/shared/consideration'

// Everyone here is made up, so the demo can be shared and committed, unlike
// the saved LCR pages in resources/

const NAMES = [
  'Alvarez, Sofia', 'Anderson, Mark', 'Bennett, Grace', 'Brooks, Daniel', 'Carter, Emily', 'Chen, Lucas',
  'Davis, Hannah', 'Delgado, Mateo', 'Ellis, Naomi', 'Evans, Thomas', 'Fischer, Clara', 'Foster, Isaac',
  'Garcia, Lucia', 'Green, Samuel', 'Harris, Abigail', 'Hughes, Owen', 'Ito, Keiko', 'Jensen, Peter',
  'Johnson, Ruth', 'Kim, Joseph', 'Larsen, Anna', 'Lopez, Gabriel', 'Martin, Olivia', 'Morgan, Eli',
  'Nguyen, Linh', 'Nielsen, Erik', 'Ortiz, Camila', 'Parker, Jacob', 'Peterson, Leah', 'Quinn, Rachel',
  'Reyes, Adrian', 'Roberts, Julia', 'Sato, Kenji', 'Smith, Caleb', 'Taylor, Megan', 'Turner, Nathan',
  'Walker, Esther', 'Young, Benjamin',
]

const uuidOf = (name: string) => `demo-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`

/** The unit's members, sorted by name, as LCR's member list would give them */
export const MEMBERS: Member[] = NAMES.map(name => ({ uuid: uuidOf(name), name, nameSort: name.toUpperCase() }))
  .sort((a, b) => a.nameSort.localeCompare(b.nameSort))

/** A member's uuid by name, so the data below reads naturally */
export function member(name: string): string {
  if (!NAMES.includes(name)) throw new Error(`${name} isn't a demo member`)
  return uuidOf(name)
}

export interface DemoCalling {
  calling: string
  /** member uuid; omitted for a vacant calling */
  holder?: string
  sustained?: string
  setApart?: string
}

export interface DemoTable {
  heading: string
  callings: DemoCalling[]
}

export interface DemoOrganization {
  name: string
  tables: DemoTable[]
}

const held = (calling: string, name: string, sustained: string, setApart = sustained): DemoCalling =>
  ({ calling, holder: member(name), sustained, setApart })
const vacant = (calling: string): DemoCalling => ({ calling })

/** The callings on the mock Organizations page */
export const ORGANIZATIONS: DemoOrganization[] = [
  {
    name: 'Bishopric',
    tables: [{
      heading: 'Bishopric',
      callings: [
        held('Bishop', 'Anderson, Mark', '12 Mar 2023'),
        held('Bishopric First Counselor', 'Chen, Lucas', '12 Mar 2023'),
        held('Bishopric Second Counselor', 'Nielsen, Erik', '12 Mar 2023'),
        held('Ward Executive Secretary', 'Brooks, Daniel', '2 Apr 2023'),
        held('Ward Clerk', 'Jensen, Peter', '8 Jan 2022'),
        vacant('Ward Assistant Clerk'),
      ],
    }],
  },
  {
    name: 'Elders Quorum',
    tables: [
      {
        heading: 'Elders Quorum Presidency',
        callings: [
          held('Elders Quorum President', 'Evans, Thomas', '4 Jun 2024'),
          held('Elders Quorum First Counselor', 'Kim, Joseph', '4 Jun 2024'),
          held('Elders Quorum Second Counselor', 'Reyes, Adrian', '4 Jun 2024'),
          vacant('Elders Quorum Secretary'),
        ],
      },
      {
        heading: 'Teachers',
        callings: [
          held('Elders Quorum Teacher', 'Hughes, Owen', '17 Sep 2024', ''),
          vacant('Elders Quorum Teacher'),
        ],
      },
    ],
  },
  {
    name: 'Relief Society',
    tables: [
      {
        heading: 'Relief Society Presidency',
        callings: [
          held('Relief Society President', 'Larsen, Anna', '19 Feb 2023'),
          held('Relief Society First Counselor', 'Garcia, Lucia', '19 Feb 2023'),
          held('Relief Society Second Counselor', 'Ito, Keiko', '19 Feb 2023'),
          held('Relief Society Secretary', 'Walker, Esther', '5 Mar 2023'),
        ],
      },
      {
        heading: 'Teachers',
        callings: [
          held('Relief Society Teacher', 'Fischer, Clara', '11 Aug 2024'),
          held('Relief Society Teacher', 'Martin, Olivia', '11 Aug 2024', ''),
        ],
      },
    ],
  },
  {
    name: 'Primary',
    tables: [
      {
        heading: 'Primary Presidency',
        callings: [
          held('Primary President', 'Bennett, Grace', '7 Jan 2024'),
          vacant('Primary First Counselor'),
          held('Primary Second Counselor', 'Nguyen, Linh', '7 Jan 2024'),
          held('Primary Secretary', 'Davis, Hannah', '21 Jan 2024'),
        ],
      },
      {
        heading: 'Teachers',
        callings: [
          held('Primary Teacher', 'Smith, Caleb', '3 Nov 2024'),
          held('Primary Teacher', 'Peterson, Leah', '3 Nov 2024'),
          vacant('Nursery Leader'),
        ],
      },
    ],
  },
  {
    name: 'Sunday School',
    tables: [{
      heading: 'Sunday School Presidency',
      callings: [
        held('Sunday School President', 'Turner, Nathan', '14 Jul 2024'),
        held('Gospel Doctrine Teacher', 'Roberts, Julia', '28 Jul 2024'),
        vacant('Youth Sunday School Teacher'),
      ],
    }],
  },
  {
    name: 'Music',
    tables: [{
      heading: 'Music',
      callings: [
        held('Music Coordinator', 'Taylor, Megan', '9 Feb 2025'),
        vacant('Organist'),
        held('Choir Director', 'Alvarez, Sofia', '9 Feb 2025', ''),
      ],
    }],
  },
]

/** The key the extension gives a row (see src/page/enhance.ts) */
export const rowKey = (calling: string, holder?: string, occurrence = 0) =>
  `${calling}|${holder ?? 'vacant'}|${String(occurrence)}`

/** What the pretend shared sheet holds before anyone changes anything */
export const SEED_SHEET: Record<string, Candidate[]> = {
  [rowKey('Ward Assistant Clerk')]: [
    { id: member('Sato, Kenji'), notes: 'Good with spreadsheets; works from home on Sundays.', status: 'Schedule for Interview' },
  ],
  [rowKey('Elders Quorum Secretary')]: [
    { id: member('Lopez, Gabriel'), notes: 'Suggested by the EQ presidency.', status: 'Submitted by Presidency' },
    { id: member('Parker, Jacob'), notes: '', status: 'Discussion' },
  ],
  [rowKey('Primary First Counselor')]: [
    { id: member('Carter, Emily'), notes: 'Accepted on Tuesday.', status: 'Ready to sustain' },
  ],
  [rowKey('Nursery Leader')]: [
    { id: member('Quinn, Rachel'), notes: '', status: 'Pray about' },
    { id: member('Morgan, Eli'), notes: 'Could serve with Rachel.', status: 'Pray about' },
  ],
  [rowKey('Organist')]: [
    { id: member('Young, Benjamin'), notes: 'Took piano lessons for 10 years.', status: 'Contacted for Interview' },
  ],
  [rowKey('Relief Society Secretary', member('Walker, Esther'))]: [
    { id: member('Walker, Esther'), notes: 'Moving in December.', status: 'Need to release' },
    { id: member('Ellis, Naomi'), notes: '' },
  ],
}
