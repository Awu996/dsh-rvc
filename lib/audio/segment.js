export function planChunks(samples, sampleRate, maxSeconds) {
  const total = samples.length
  const maxLen = Math.max(1, Math.floor(maxSeconds * sampleRate))
  if (total <= maxLen) return [[0, total]]
  const win = Math.max(1, Math.floor(sampleRate * 0.05))
  const back = Math.floor(sampleRate * 15)
  const chunks = []
  let start = 0
  while (total - start > maxLen) {
    const hardEnd = start + maxLen
    const lo = Math.max(start + Math.floor(maxLen / 2), hardEnd - back)
    let best = hardEnd
    let bestEnergy = Infinity
    for (let pos = lo; pos + win <= hardEnd; pos += win) {
      let e = 0
      for (let i = pos; i < pos + win; i++) e += samples[i] * samples[i]
      if (e < bestEnergy) {
        bestEnergy = e
        best = pos + (win >> 1)
      }
    }
    chunks.push([start, best])
    start = best
  }
  chunks.push([start, total])
  return chunks
}

export function joinChunks(parts, sampleRate, fadeMs = 8) {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Int16Array(total)
  const fade = Math.max(1, Math.floor((sampleRate * fadeMs) / 1000))
  let pos = 0
  parts.forEach((part, idx) => {
    out.set(part, pos)
    const n = Math.min(fade, part.length)
    if (idx > 0) for (let i = 0; i < n; i++) out[pos + i] = Math.round(out[pos + i] * (i / n))
    if (idx < parts.length - 1) {
      const end = pos + part.length
      for (let i = 0; i < n; i++) out[end - 1 - i] = Math.round(out[end - 1 - i] * (i / n))
    }
    pos += part.length
  })
  return out
}
