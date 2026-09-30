/** Stands in for the browser's clipboard, which jsdom doesn't have; `fail` makes copying fail */
export function fakeClipboard({ fail = false } = {}) {
  const copied: string[] = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string) => {
        if (fail) return Promise.reject(new Error('Not allowed'))
        copied.push(text)
        return Promise.resolve()
      },
    },
  })
  return {
    copied,
    restore: () => {
      Reflect.deleteProperty(navigator, 'clipboard')
    },
  }
}
