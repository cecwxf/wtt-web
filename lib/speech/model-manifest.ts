export type BrowserSpeechModelFile = {
  path: string;
  url: string;
  sourceUrl: string;
  size: number;
  sha256: string;
};

const REVISION = "e2382758de9a0219b4efe682b95af30b399db3b8";
const SOURCE_BASE = `https://huggingface.co/csukuangfj/k2fsa-zipformer-bilingual-zh-en-t/resolve/${REVISION}`;
const MODEL_ID = `zipformer-small-zh-en-int8-${REVISION.slice(0, 12)}`;
const PUBLIC_BASE = `/speech-models/${MODEL_ID}`;

export const browserAsrModel = {
  id: MODEL_ID,
  files: [
    {
      path: "encoder.onnx",
      url: `${PUBLIC_BASE}/encoder.onnx`,
      sourceUrl: `${SOURCE_BASE}/exp/32/encoder-epoch-99-avg-1.int8.onnx`,
      size: 42_980_793,
      sha256:
        "db6f51551762e40e549166fe041ea3e45464370b595e9ad23f06478ec3794fbb",
    },
    {
      path: "decoder.onnx",
      url: `${PUBLIC_BASE}/decoder.onnx`,
      sourceUrl: `${SOURCE_BASE}/exp/32/decoder-epoch-99-avg-1.onnx`,
      size: 13_877_276,
      sha256:
        "89be509a83175261695bdef5fd1c7b9ab1129a663d1284e7ba9f8507b21e0906",
    },
    {
      path: "joiner.onnx",
      url: `${PUBLIC_BASE}/joiner.onnx`,
      sourceUrl: `${SOURCE_BASE}/exp/32/joiner-epoch-99-avg-1.int8.onnx`,
      size: 3_228_485,
      sha256:
        "bdda356d6f9b8c2d7cee9ee0e26075fa537490f7fd06520be408d287073667b9",
    },
    {
      path: "tokens.txt",
      url: `${PUBLIC_BASE}/tokens.txt`,
      sourceUrl: `${SOURCE_BASE}/data/lang_char_bpe/tokens.txt`,
      size: 56_317,
      sha256:
        "a8e0e4ec53810e433789b54a5c0134a7eaa2ffca595a6334d54c00da858841d3",
    },
  ] satisfies BrowserSpeechModelFile[],
};
