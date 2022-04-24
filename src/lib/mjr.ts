import { spawn, execFile } from 'child_process'
import { basename, dirname, extname, join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

type EpochInMicroseconds = number
type Seconds = number

export interface BaseMjrMeta {
  s: EpochInMicroseconds
  u: EpochInMicroseconds
  x: Record<`${number}`, string>
  extended: {
    packets: number
    duration: Seconds
  }
}

export interface AudioMjrMeta extends BaseMjrMeta {
  t: 'a'
  c: 'opus' | 'aac'
}

export interface VideoMjrMeta extends BaseMjrMeta {
  t: 'v'
  c: 'vp8' | 'vp9' | 'h264' | 'h265' | 'av1'
}

export interface DataMjrMeta extends BaseMjrMeta {
  t: 'd'
}

export type MjrMeta = AudioMjrMeta | VideoMjrMeta | DataMjrMeta

type MjrPath = string

export async function parseMjrMeta(mjrPath: MjrPath): Promise<MjrMeta> {
  const { stdout, stderr } = await execFileAsync('janus-pp-rec', [
    mjrPath,
    '--extended-json',
  ])
  console.error(stderr)

  return JSON.parse(stdout)
}

export async function convertMjr(mjrPath: MjrPath) {
  const dir = dirname(mjrPath)
  const base = basename(mjrPath, '.mjr')
  const ext = extname(mjrPath)

  if (ext !== '.mjr') {
    throw new Error()
  }

  const meta = await parseMjrMeta(mjrPath)
  if (meta.t === 'd') {
    throw new Error(`Converting data mjr is not supported`)
  }

  let outputExt: string
  switch (meta.c) {
    case 'opus':
      outputExt = '.opus'
      break
    case 'vp8':
    case 'vp9':
      outputExt = '.webm'
      break
    default:
      throw new Error(`Unsupported mjr codec: ${meta.c}`)
  }
  const outputPath = join(dir, base + outputExt)

  const janusPpRec = spawn('janus-pp-rec', [mjrPath, outputPath], {
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  await new Promise<void>((resolve, reject) => {
    janusPpRec.on('error', reject)
    janusPpRec.on('close', (code) => {
      if (code !== 0) reject(code)
      else resolve()
    })
  })

  return {
    path: outputPath,
    meta,
  }
}
