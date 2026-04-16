declare module 'mammoth' {
  interface ConvertOptions {
    arrayBuffer?: ArrayBuffer
    convertImage?: ImageConverter
  }
  interface ImageConverter {
    (element: unknown): unknown
  }
  interface ConvertResult {
    value: string
    messages: Array<{ type: string; message: string }>
  }
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: { convertImage?: ImageConverter }
  ): Promise<ConvertResult>
  export const images: {
    imgElement: (fn: (image: unknown) => Promise<{ src: string }>) => ImageConverter
  }
}
