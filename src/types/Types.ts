export interface Size {
  w: number
  h: number
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
