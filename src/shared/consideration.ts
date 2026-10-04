/** Where someone is in being called, released or passed over, in order */
export const STATUSES = [
  'Submitted by Presidency',
  'Discussion',
  'Pray about',
  'Schedule for Interview',
  'Submit to Stake',
  'Contacted for Interview',
  'Submitted to Stake',
  'Interview Scheduled',
  'Called and accepted',
  'Ready to sustain',
  'Sustained',
  'Need to release',
  'Thank at pulpit',
  'Released',
  'Declined',
  'Not extended',
  'Member Considering',
  'Stake Considering',
] as const

export type Status = typeof STATUSES[number]

export const isStatus = (value: unknown): value is Status => STATUSES.includes(value as Status)

/**
 * Where whoever holds a calling now is, with the Mantine color their name is
 * highlighted in once it's picked
 */
export const HOLDER_STATUS_COLORS = {
  'Considering Release': 'orange',
  'Fill/Change': 'red',
} as const

export type HolderStatus = keyof typeof HOLDER_STATUS_COLORS

export const HOLDER_STATUSES = Object.keys(HOLDER_STATUS_COLORS) as HolderStatus[]

export const isHolderStatus = (value: unknown): value is HolderStatus => HOLDER_STATUSES.includes(value as HolderStatus)

/** Someone being considered for a calling */
export interface Candidate {
  /**
   * member uuid, or `text:…` for someone typed in as free text before
   * candidates were picked from the member list. Names aren't kept: they're
   * looked up in LCR's member list, since members can share a name.
   */
  id: string
  notes: string
  /** left out until one is picked */
  status?: Status
}

/** What's tracked for one calling row: who is being considered, and where its current holder is */
export interface Tracking {
  candidates: Candidate[]
  /** left out until one is picked, and for vacant callings */
  holderStatus?: HolderStatus
}

/** Who is being considered for one calling row on the Organizations page */
export interface Consideration extends Tracking {
  /** identifies the row across page loads: calling, current holder and occurrence */
  key: string
  calling: string
  /** member uuid of whoever holds the calling now, '' when vacant */
  member: string
  /**
   * The headings the calling is under on the Organizations page, outermost
   * first, e.g. `['Elders Quorum', 'Teachers']`. Left out when not known, as
   * for rows saved before it was recorded.
   */
  organization?: string[]
  /** Where the row is on the Organizations page, from 0; left out when not known */
  position?: number
}

/** Just the fields of a consideration, for when `calling` may be a page row carrying more */
export function consideration({ key, calling, member, organization, position }: Omit<Consideration, keyof Tracking>, { candidates, holderStatus }: Tracking): Consideration {
  return {
    key,
    calling,
    member,
    ...(organization ? { organization } : {}),
    ...(position === undefined ? {} : { position }),
    candidates,
    ...(holderStatus ? { holderStatus } : {}),
  }
}

/** Just what's tracked of a consideration */
export const tracking = ({ candidates, holderStatus }: Tracking): Tracking => ({ candidates, ...(holderStatus ? { holderStatus } : {}) })
