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

/** Who is being considered for one calling row on the Organizations page */
export interface Consideration {
  /** identifies the row across page loads: calling, current holder and occurrence */
  key: string
  calling: string
  /** member uuid of whoever holds the calling now, '' when vacant */
  member: string
  candidates: Candidate[]
}
