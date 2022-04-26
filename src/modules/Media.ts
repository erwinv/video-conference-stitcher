import { ffprobe } from '../lib/ffmpeg'
import User from './User'

export default class Media {
  public readonly path: string
  public readonly hasAudio: boolean
  public readonly hasVideo: boolean
  public readonly startTime: number
  public user: User | null = null
  public id = -1
  public duration = -1
  public audioChannels = -1
  public initialized = false

  /**
   *
   * @param path
   * @param startTime time in milliseconds
   * @param hasVideo
   * @param hasAudio
   */
  constructor(
    path: string,
    startTime: number,
    hasVideo: boolean,
    hasAudio: boolean,
    public isPresentation = false
  ) {
    this.path = path
    if (!(hasAudio || hasVideo))
      throw new Error('media must contain audio or video')
    this.hasAudio = hasAudio
    this.hasVideo = hasVideo
    this.startTime = startTime
  }

  async init() {
    // TODO not looking for stream channels if doesn't contain audio.
    // Would it work with just audio files?
    const [duration, channels] = await Promise.all([
      ffprobe(this.path, 'format=duration'),
      this.hasAudio ? ffprobe(this.path, 'stream=channels') : '-1',
    ])

    this.duration = Math.round(parseFloat(duration) * 1000)
    this.audioChannels = parseInt(channels, 10)
    this.initialized = true
  }

  setId(id: number): void {
    this.id = id
  }
}
