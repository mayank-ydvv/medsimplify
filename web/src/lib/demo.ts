/** `?demo=` switch so reviewers can reach every state without a broken file.
 *  parse-fail | error | slow | offline | empty */
export type DemoFlag = 'parse-fail' | 'error' | 'slow' | 'offline' | 'empty'

const VALID: DemoFlag[] = ['parse-fail', 'error', 'slow', 'offline', 'empty']

let cached: DemoFlag | null | undefined

export function demoFlag(): DemoFlag | null {
  if (cached !== undefined) return cached
  try {
    const q = new URLSearchParams(window.location.search).get('demo')
    if (q && VALID.includes(q as DemoFlag)) {
      sessionStorage.setItem('medsimplify:demo', q)
      cached = q as DemoFlag
    } else if (q === 'off') {
      sessionStorage.removeItem('medsimplify:demo')
      cached = null
    } else {
      cached = (sessionStorage.getItem('medsimplify:demo') as DemoFlag | null) ?? null
    }
  } catch {
    cached = null
  }
  return cached
}

export const isDemo = (f: DemoFlag) => demoFlag() === f
