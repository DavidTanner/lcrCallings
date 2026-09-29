import { act } from '@testing-library/react'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fakeApi, orgTable } from '../test/fixtures'
import { HOST_ID } from './constants'
import { mount, type Unmount } from './mount'

describe('mount', () => {
  it('renders the panel into a shadow root and undoes everything on unmount', async () => {
    document.body.innerHTML = orgTable('Bishopric', [{ calling: 'Bishop', person: 'p1' }])
    const page = document.body.innerHTML
    let unmount: Unmount | undefined
    await act(async () => {
      await Promise.resolve()
      unmount = mount(document, fakeApi({ spreadsheetId: '1AbC-dEf_ghIJklMNopQRstuVWxyz0123456789' }))
    })
    assert.ok(unmount)

    const host = document.getElementById(HOST_ID)
    assert.ok(host?.shadowRoot)
    assert.match(host.shadowRoot.textContent, /Tracking 1 calling in/)
    assert.ok(host.shadowRoot.querySelector('style')?.textContent.includes('--mantine-color-scheme'))
    assert.ok(document.querySelector('.callings-calling-bishop [data-callings-slot]')?.shadowRoot?.querySelector('input'))

    act(unmount)
    assert.equal(document.body.innerHTML, page)
  })
})
