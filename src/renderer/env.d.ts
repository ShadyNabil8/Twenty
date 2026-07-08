import type { EyeApi } from '../preload/index'

declare global {
  interface Window {
    eye: EyeApi
  }
}

export {}
