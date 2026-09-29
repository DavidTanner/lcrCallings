// esbuild loads .css imports as plain text (see scripts/build.ts) so they can
// be injected into the bookmarklet's shadow root
declare module '*.css' {
  const css: string
  export default css
}
