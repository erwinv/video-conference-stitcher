export interface Size {
  w: number
  h: number
}

export interface EncodingOptions {
  crf?: number
  bitrate?: string
  size: Size
  loglevel?:
    | number
    | 'quiet'
    | 'panic'
    | 'fatal'
    | 'error'
    | 'warning'
    | 'info'
    | 'verbose'
    | 'debug'
    | 'trace'
}

export interface VideoBox {
  w: number
  h: number
  x: number
  y: number
}

export interface VideoLayout {
  getBoxes(n: number, size: Size): VideoBox[]
}
