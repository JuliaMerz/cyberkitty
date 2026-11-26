import type { CkApi } from '@shared/types'

declare global {
  interface Window {
    ck: CkApi
  }
}

declare module '*.css'
