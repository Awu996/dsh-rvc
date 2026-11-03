function ascii(buf, start, len) {
  return buf.length >= start + len ? buf.toString('latin1', start, start + len) : ''
}

const ASF = Buffer.from([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])

export function detectFormat(head) {
  if (!head || head.length === 0) return { kind: 'empty' }
  if (head[0] === 0x02 && ascii(head, 1, 9) === '#!SILK_V3') return { kind: 'silk', label: 'SILK（QQ/微信语音）' }
  if (ascii(head, 0, 9) === '#!SILK_V3') return { kind: 'silk', label: 'SILK' }
  const riff = ascii(head, 0, 4)
  if ((riff === 'RIFF' || riff === 'RF64' || riff === 'BW64') && ascii(head, 8, 4) === 'WAVE') return { kind: 'wav', demuxer: 'wav', label: 'WAV' }
  if (riff === 'RIFF' && ascii(head, 8, 4) === 'AVI ') return { kind: 'video', demuxer: 'avi', label: 'AVI' }
  if (ascii(head, 0, 6) === '#!AMR\n') return { kind: 'audio', demuxer: 'amr', label: 'AMR' }
  if (ascii(head, 0, 9) === '#!AMR-WB\n') return { kind: 'audio', demuxer: 'amr', label: 'AMR-WB' }
  if (ascii(head, 0, 4) === 'OggS') return { kind: 'audio', demuxer: 'ogg', label: 'OGG' }
  if (ascii(head, 0, 4) === 'fLaC') return { kind: 'audio', demuxer: 'flac', label: 'FLAC' }
  if (ascii(head, 4, 4) === 'ftyp') return { kind: 'media', demuxer: 'mov', label: 'MP4/M4A' }
  if (ascii(head, 0, 9) === '000000000' && ascii(head, 13, 4) === 'ftyp') return { kind: 'bili', demuxer: 'mov', skip: 9, label: 'B站缓存 m4s' }
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return { kind: 'media', demuxer: 'matroska', label: 'MKV/WebM' }
  if (ascii(head, 0, 3) === 'FLV') return { kind: 'media', demuxer: 'flv', label: 'FLV' }
  if (head.length >= 8 && head.subarray(0, 8).equals(ASF)) return { kind: 'media', demuxer: 'asf', label: 'WMA/WMV' }
  if (ascii(head, 0, 4) === 'FORM' && /^AIF[FC]$/.test(ascii(head, 8, 4))) return { kind: 'audio', demuxer: 'aiff', label: 'AIFF' }
  if (ascii(head, 0, 4) === 'caff') return { kind: 'audio', demuxer: 'caf', label: 'CAF' }
  if (ascii(head, 0, 4) === '.snd') return { kind: 'audio', demuxer: 'au', label: 'AU' }
  if (ascii(head, 0, 4) === 'wvpk') return { kind: 'audio', demuxer: 'wv', label: 'WavPack' }
  if (ascii(head, 0, 4) === 'MAC ') return { kind: 'audio', demuxer: 'ape', label: 'APE' }
  if (ascii(head, 0, 4) === 'TTA1') return { kind: 'audio', demuxer: 'tta', label: 'TTA' }
  if (ascii(head, 0, 3) === 'ID3') return { kind: 'audio', label: 'MP3/AAC（带 ID3）' }
  if (head[0] === 0xff && (head[1] & 0xf6) === 0xf0) return { kind: 'audio', demuxer: 'aac', label: 'AAC' }
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return { kind: 'audio', demuxer: 'mp3', label: 'MP3' }
  if (head[0] === 0x0b && head[1] === 0x77) return { kind: 'audio', label: 'AC3' }
  if (head[0] === 0x00 && head[1] === 0x00 && head[2] === 0x01 && head[3] === 0xba) return { kind: 'media', demuxer: 'mpeg', label: 'MPEG-PS' }
  if (head[0] === 0x47 && head.length > 188 && head[188] === 0x47) return { kind: 'media', demuxer: 'mpegts', label: 'MPEG-TS' }
  const text = head.toString('utf8', 0, Math.min(head.length, 256)).trimStart().toLowerCase()
  if (text.startsWith('<!doctype') || text.startsWith('<html') || text.startsWith('<?xml') || text.startsWith('{') || text.startsWith('[')) {
    return { kind: 'text', label: '网页或文本' }
  }
  return { kind: 'unknown', label: '未知格式' }
}
