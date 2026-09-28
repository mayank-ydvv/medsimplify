import { useCallback, useEffect, useRef, useState } from 'react'

/** Web Speech readout: one utterance per line so the UI can highlight the line
 *  being spoken. Visible play/pause; stops on unmount or language change. */
export type SpeechState = 'idle' | 'playing' | 'paused' | 'unsupported' | 'no-voice'

export function useSpeech(lines: string[], locale: string) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [state, setState] = useState<SpeechState>(supported ? 'idle' : 'unsupported')
  const [index, setIndex] = useState(-1)
  const runId = useRef(0)

  /** Browsers load voices asynchronously; ask before the list is ready and a
   *  Hindi summary gets read in an English voice. Wait for it (briefly). */
  const pickVoice = useCallback(async (): Promise<SpeechSynthesisVoice | undefined> => {
    if (!supported) return undefined
    const synth = window.speechSynthesis
    let voices = synth.getVoices()
    if (!voices.length) {
      voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
        const done = () => { synth.removeEventListener('voiceschanged', done); resolve(synth.getVoices()) }
        synth.addEventListener('voiceschanged', done)
        window.setTimeout(done, 1500)
      })
    }
    const lang = locale.toLowerCase()
    const base = lang.split('-')[0]
    return voices.find((v) => v.lang.toLowerCase() === lang) ?? voices.find((v) => v.lang.toLowerCase().split(/[-_]/)[0] === base)
  }, [locale, supported])

  const stop = useCallback(() => {
    runId.current++
    if (supported) window.speechSynthesis.cancel()
    setIndex(-1)
    setState((s) => (s === 'unsupported' ? s : 'idle'))
  }, [supported])

  const play = useCallback(async () => {
    if (!supported || !lines.length) return
    const voice = await pickVoice()
    // No matching voice: show the text instead of mispronouncing it.
    if (!voice && !locale.startsWith('en')) {
      setState('no-voice')
      return
    }
    window.speechSynthesis.cancel()
    const my = ++runId.current
    setState('playing')
    const speakFrom = (i: number) => {
      if (my !== runId.current) return
      if (i >= lines.length) {
        setIndex(-1)
        setState('idle')
        return
      }
      setIndex(i)
      const u = new SpeechSynthesisUtterance(lines[i])
      u.lang = locale
      if (voice) u.voice = voice
      u.rate = 0.95
      u.onend = () => speakFrom(i + 1)
      u.onerror = () => { if (my === runId.current) { setIndex(-1); setState('idle') } }
      window.speechSynthesis.speak(u)
    }
    speakFrom(0)
  }, [lines, locale, pickVoice, supported])

  const pause = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.pause()
    setState('paused')
  }, [supported])

  const resume = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.resume()
    setState('playing')
  }, [supported])

  useEffect(() => stop, [locale, stop])
  useEffect(() => () => { if (supported) window.speechSynthesis.cancel() }, [supported])

  return { state, index, play, pause, resume, stop, supported }
}
