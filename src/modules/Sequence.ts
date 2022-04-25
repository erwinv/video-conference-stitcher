import Media from './Media'
import SequenceStep from './SequenceStep'
import User from './User'
import { VideoLayout, Size } from '../types/Types'
import { ffmpegMux } from '../lib/ffmpeg'

type Resolution = '360p' | '720p' | '1080p'

export default class Sequence {
  public mediaList: Media[]
  public sequenceSteps: SequenceStep[] = []
  public outputVideo: Media
  public layout: VideoLayout
  constructor(users: User[] = [], outputVideo: Media, layout: VideoLayout) {
    this.mediaList = []
    users.forEach((user) => {
      this.mediaList.push(...user.media)
    })

    this.outputVideo = outputVideo
    this.layout = layout
  }

  addVideo(video: Media): void {
    this.mediaList.push(video)
  }

  async encode(resolution: Resolution = '720p') {
    // https://developers.google.com/media/vp9/settings/vod#recommended_settings
    let dimensions: Size
    let videoEncodingOpts: string
    switch (resolution) {
      case '360p':
        dimensions = { w: 640, h: 360 }
        videoEncodingOpts = '-b:v 276k -minrate 138k -maxrate 400k'
        break
      default:
      case '720p':
        dimensions = { w: 1280, h: 720 }
        videoEncodingOpts = '-b:v 1024k -minrate 512k -maxrate 1485k'
        break
      case '1080p':
        dimensions = { w: 1920, h: 1080 }
        videoEncodingOpts = '-b:v 1800k -minrate 900k -maxrate 2610k'
        break
    }

    await this.createSequenceSteps(dimensions)
    const [complexFilter, outputStreams] = this.generateComplexFilter()

    return ffmpegMux(
      this.mediaList.map((media) => media.path),
      this.outputVideo.path,
      complexFilter,
      `-c:v libvpx-vp9 ${videoEncodingOpts}`,
      `-c:a libopus -b:a 128k`,
      outputStreams,
      ['-r 30']
    )
  }

  async createSequenceSteps(outputDimensions: Size) {
    // check videos
    for (const media of this.mediaList) {
      if (!media.initialized) await media.init()
    }

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
          outputDimensions,
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
        '[' + step.mediaList.map((vid) => vid.id.toString()).join(',') + ']',
        'start',
        step.startTime,
        'end',
        step.startTime + step.duration,
        'len',
        step.duration
      )
    })
  }

  generateComplexFilter() {
    const videoOut = '[vid]'
    const audioOut = '[aud]'

    const sequenceFilters = this.sequenceSteps.map((step) =>
      step.generateFilter()
    )
    const sequenceOutput = [
      ...this.sequenceSteps.map(
        (step) => `[${step.id}_out_v][${step.id}_out_a]`
      ),
      `concat=n=${this.sequenceSteps.length}:v=1:a=1${videoOut}${audioOut}`,
    ].join('')

    console.info(
      sequenceFilters.map((filter) => filter.join('\n')).join('\n\n'),
      '\n\n' + sequenceOutput
    )

    const complexFilterGraph = [
      ...sequenceFilters.flatMap((filter) => filter),
      sequenceOutput,
    ].join('')

    return [
      `-filter_complex "${complexFilterGraph}"`,
      [videoOut, audioOut] as string[],
    ] as const
  }
}
