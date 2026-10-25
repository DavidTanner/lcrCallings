import { act, renderHook } from '@testing-library/react'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Consideration } from './shared/consideration'
import { useConsiderations } from './useConsiderations'

const bishop = { key: 'bishop', calling: 'Bishop', member: '' }

describe('useConsiderations', () => {
  it('saves a row only once its last save is done, with the Updated that save wrote', async () => {
    const sent: Consideration[] = []
    const finish: ((stamp: string) => void)[] = []
    const save = (consideration: Consideration) => new Promise<string>((resolve) => {
      sent.push(consideration)
      finish.push(resolve)
    })
    const { result } = renderHook(() => useConsiderations({}, save))

    act(() => {
      result.current.change(bishop, [{ id: 'a', notes: '' }], false)
      result.current.change(bishop, [{ id: 'a', notes: '' }, { id: 'b', notes: '' }], false)
    })
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve))
    })
    assert.equal(sent.length, 1)
    assert.equal(sent[0]?.updated, undefined)

    await act(async () => {
      finish[0]?.('stamp-1')
      await new Promise(resolve => setTimeout(resolve))
    })
    assert.equal(sent.length, 2)
    assert.equal(sent[1]?.updated, 'stamp-1')
    assert.deepEqual(sent[1].candidates.map(({ id }) => id), ['a', 'b'])

    await act(async () => {
      finish[1]?.('stamp-2')
      await result.current.settle()
    })
    assert.equal(result.current.saving, 0)
  })
})
