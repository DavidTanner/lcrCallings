/** Someone being considered for a calling */
export interface Candidate {
  /**
   * member uuid, or `text:…` for someone typed in as free text before
   * candidates were picked from the member list. Names aren't kept: they're
   * looked up in LCR's member list, since members can share a name.
   */
  id: string
  notes: string
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
