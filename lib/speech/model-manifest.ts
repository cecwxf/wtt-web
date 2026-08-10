export type BrowserSpeechModelFile = {
  path: string;
  url: string;
  sourceUrl: string;
  size: number;
  sha256: string;
};

const REVISION = "8e40c43232a1c5c66c82111efc5820d3accca11b";
const SOURCE_BASE = `https://huggingface.co/csukuangfj/sherpa-onnx-streaming-paraformer-bilingual-zh-en/resolve/${REVISION}`;
const MODEL_ID = `paraformer-zh-en-int8-${REVISION.slice(0, 12)}`;
const PUBLIC_BASE = `/speech-models/${MODEL_ID}`;

export const browserAsrModel = {
  id: MODEL_ID,
  files: [
    {
      path: "encoder.onnx",
      url: `${PUBLIC_BASE}/encoder.onnx`,
      sourceUrl: `${SOURCE_BASE}/encoder.int8.onnx`,
      size: 165_462_184,
      sha256:
        "81a70226a8934e6ed92aa1d4fc486b428b5398e2f2619ed4897b7294cab90e9a",
    },
    {
      path: "decoder.onnx",
      url: `${PUBLIC_BASE}/decoder.onnx`,
      sourceUrl: `${SOURCE_BASE}/decoder.int8.onnx`,
      size: 71_664_561,
      sha256:
        "f3cca9f77bb9d93c8fcbfb63ae617b6b1ee96818df3aa3b151c40658fe38594f",
    },
    {
      path: "tokens.txt",
      url: `${PUBLIC_BASE}/tokens.txt`,
      sourceUrl: `${SOURCE_BASE}/tokens.txt`,
      size: 75_756,
      sha256:
        "59aba8873a2ed1e122c25fee421e25f283b63290efbde85c1f01a853d83cb6e6",
    },
  ] satisfies BrowserSpeechModelFile[],
};
