import { useCallback, useMemo } from 'react'
import { candidateName, memberLabel } from './CandidatesField'
import { type CallingRule, optionsByCalling } from './lcr/callingRules'
import type { Member } from './lcr/members'
import type { CallingInfo, useConsiderations } from './useConsiderations'

type Considerations = ReturnType<typeof useConsiderations>

/**
 * The members to pick candidates from, for the extension's panel and the web
 * page alike: everyone, who can hold each calling, and what they hold now,
 * with picking someone marking them considering release from it.
 */
export function useMemberOptions(
  members: Pick<Member, 'uuid' | 'name' | 'sex' | 'age' | 'baptized' | 'organizations'>[] | undefined,
  rules: Map<string, CallingRule> | undefined,
  callings: CallingInfo[],
  { considerRelease, reconsiderRelease }: Pick<Considerations, 'considerRelease' | 'reconsiderRelease'>,
  /** the page, to ask whether to keep considering someone for release */
  doc: Document,
) {
  const options = useMemo(() => members?.map(m => ({ value: m.uuid, label: memberLabel(m) })) ?? [], [members])
  /** calling name → the members who can hold it */
  const byCalling = useMemo(() => optionsByCalling(rules, members ?? [], options), [rules, members, options])
  /** member uuid → name, without the details the options show */
  const names = useMemo(() => new Map(members?.map(m => [m.uuid, m.name])), [members])
  const held = useMemo(() => heldCallings(callings), [callings])
  /** someone picked for another calling may be released from the ones they hold */
  const pick = useCallback((row: CallingInfo, id: string) => {
    considerRelease(row, held.get(id))
  }, [held, considerRelease])
  const unpick = useCallback((row: CallingInfo, id: string) => {
    reconsiderRelease(row, id, candidateName(id, names, false), held.get(id), q => doc.defaultView?.confirm(q) ?? true)
  }, [held, names, reconsiderRelease, doc])
  return { options, byCalling, names, held, pick, unpick }
}

/** The callings each member holds now, by member uuid */
export function heldCallings<T extends CallingInfo>(rows: T[]) {
  const held = new Map<string, T[]>()
  for (const row of rows) if (row.member) held.set(row.member, [...held.get(row.member) ?? [], row])
  return held
}
