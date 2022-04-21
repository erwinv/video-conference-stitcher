import Media from './Media'
import SequenceStep from './SequenceStep'
import CommandExecutor from './CommandExecutor'
import User from './User'
import { VideoLayout, EncodingOptions } from '../types/Types'

export default class Sequence {
  public mediaList: Media[]
  public sequenceSteps: SequenceStep[] = []
  public outputVideo: Media
  public layout: VideoLayout
  public encodingOptions: EncodingOptions
  constructor(
    users: User[] = [],
    outputVideo: Media,
    layout: VideoLayout,
    encOpt?: EncodingOptions
  ) {
    this.mediaList = []
    users.forEach((user) => {
      this.mediaList.push(...user.media)
    })

    const defaultEncodingOptions: EncodingOptions = {
      size: { w: 1920, h: 1080 },
      bitrate: '1800k',
    }
    if (encOpt && encOpt.crf && encOpt.bitrate)
      throw new Error('cannot use bitrate and crf simultaneously')
    const encoding: EncodingOptions = {
      size: encOpt?.size ?? defaultEncodingOptions.size,
      loglevel: encOpt?.loglevel,
    }
    if (!encOpt?.crf && !encOpt?.bitrate) {
      encoding.crf = defaultEncodingOptions.crf
    } else {
      encoding.crf = encOpt?.crf
      encoding.bitrate = encOpt?.bitrate
    }

    this.encodingOptions = encoding

    this.outputVideo = outputVideo
    this.layout = layout
  }

  addVideo(video: Media): void {
    this.mediaList.push(video)
  }

  async encode() {
    console.log('start encoding')
    const [filter, command] = await this.generateCommand()
    return CommandExecutor.pipeExec(filter, command, true)
  }

  private async createSequenceSteps() {
    // check videos
    return this.mediaList
      .reduce(async (p: Promise<void>, med: Media) => {
        await p
        if (!med.initialized) {
          await med.init()
        }
      }, Promise.resolve())
      .catch((err) => {
        console.log('error initializing video files', err)
        throw err
      })
      .then(() => {
        // Order videos
        this.mediaList
          .sort((a, b) =>
            a.startTime > b.startTime ? 1 : a.startTime === b.startTime ? 0 : -1
          )
          .forEach((vid, index) => vid.setId(index))

        interface MediaPoint {
          start_point: boolean
          time: number
          media_id: number
        }

        const queue: MediaPoint[] = []
        this.mediaList.forEach((vid) => {
          queue.push({
            start_point: true,
            time: vid.startTime,
            media_id: vid.id,
          })
          queue.push({
            start_point: false,
            time: vid.startTime + vid.duration,
            media_id: vid.id,
          })
        })

        queue.sort((a: MediaPoint, b: MediaPoint) =>
          a.time < b.time ? 1 : a.time === b.time ? 0 : -1
        )

        console.log(`\n---- sort queue -----\n`, queue)

        // building sequences

        let prevTime = -1
        const currentVideos: Media[] = []
        this.sequenceSteps = []
        while (queue.length > 0) {
          const point = queue.pop() as MediaPoint
          if (
            (queue.length === 0 || point.time !== prevTime) &&
            prevTime !== -1 &&
            currentVideos.length >= 0
          ) {
            const step: SequenceStep = new SequenceStep(
              `Seq${this.sequenceSteps.length}`,
              [...currentVideos],
              prevTime,
              point.time,
              this.encodingOptions.size,
              this.layout
            )
            this.sequenceSteps.push(step)
          }
          if (point.start_point) {
            currentVideos.push(this.mediaList[point.media_id])
          } else {
            const index: number = currentVideos.findIndex(
              (vid) => vid.id === point.media_id
            )
            currentVideos.splice(index, 1)
          }
          prevTime = point.time
        }
        console.log('\n---- Videos ----')
        this.mediaList.forEach((vid) =>
          console.log(
            'id',
            vid.id,
            'start',
            vid.startTime,
            'len',
            vid.duration,
            'achan',
            vid.audioChannels,
            vid.path
          )
        )
        console.log('output:', this.outputVideo.path)
        console.log('\n---- Sequences ----')
        this.sequenceSteps.forEach((step) => {
          console.log(
            step.id,
            'v:',
            '[' +
              step.mediaList.map((vid) => vid.id.toString()).join(',') +
              ']',
            'start',
            step.startTime,
            'end',
            step.startTime + step.duration,
            'len',
            step.duration
          )
        })
      })
  }

  async generateCommand() {
    await this.createSequenceSteps()

    const command: string[] = []

    const logging: string = this.encodingOptions.loglevel
      ? `-v ${this.encodingOptions.loglevel}`
      : `-v quiet -stats`

    command.push(`ffmpeg ${logging} `)
    command.push(
      this.mediaList.map((video) => `-i "${video.path}"`).join(' ') + ' '
    )
    command.push(`-filter_complex_script `)
    command.push('pipe:0 ')

    // https://developers.google.com/media/vp9/settings/vod#recommended_settings
    // 1080p@30
    const quality = `-b:v 1800k -minrate 900k -maxrate 2610k`
    // 720p@30
    // const quality = `-b:v 1024k -minrate 512k -maxrate 1485k`

    command.push(
      `-c:a libopus -b:a 128k -c:v libvpx-vp9 ${quality} -map [aud] -map [vid] -r 30 -y "${this.outputVideo.path}"`
    )

    const filter: string[] = []
    filter.push(
      `${this.sequenceSteps.map((step) => step.generateFilter()).join('')}`
    )
    filter.push(
      `${this.sequenceSteps
        .map((step) => `[${step.id}_out_v][${step.id}_out_a]`)
        .join('')}concat=n=${this.sequenceSteps.length}:v=1:a=1[vid][aud]`
    )

    return [filter.join(''), command.join('')]
  }
}
