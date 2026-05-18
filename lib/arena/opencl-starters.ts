import type { Challenge } from './types'

function hasTag(challenge: Challenge, tag: string) {
  return challenge.tags.includes(tag)
}

function hasAnyTag(challenge: Challenge, tags: string[]) {
  return tags.some((tag) => hasTag(challenge, tag))
}

function exampleKind(challenge: Challenge) {
  if (hasAnyTag(challenge, ['attention', 'mha', 'gqa', 'causal-attention', 'linear-attention', 'window-attention', 'alibi-attention', 'decay-attention', 'kv-attention'])) return 'attention'
  if (hasAnyTag(challenge, ['matmul', 'gemm', 'batched-matmul', 'int8-matmul', 'int4-matmul'])) return 'matmul'
  if (hasTag(challenge, 'matrix-add')) return 'matrix_add'
  if (hasTag(challenge, 'transpose')) return 'transpose'
  if (hasTag(challenge, 'copy')) return 'copy'
  if (hasTag(challenge, 'conv2d')) return 'conv2d'
  if (hasTag(challenge, 'conv3d')) return 'conv3d'
  if (hasTag(challenge, 'max-pool2d')) return 'max_pool2d'
  if (hasAnyTag(challenge, ['spmv', 'ols', 'logistic', 'nearest', 'batch-norm', 'rms-norm', 'jacobi', 'kmeans'])) return 'matrix_vector'
  if (hasAnyTag(challenge, ['gpt-block', 'llama-block', 'adder-transformer', 'swiglu-mlp', 'lora'])) return 'block'
  if (hasAnyTag(challenge, ['fft', 'fft2d'])) return 'fft'
  if (hasAnyTag(challenge, ['bfs', 'apsp'])) return 'graph'
  return 'vector'
}

function outputSize(challenge: Challenge) {
  const kind = exampleKind(challenge)
  if (kind === 'attention') return 8
  if (kind === 'matmul' || kind === 'matrix_add' || kind === 'transpose' || kind === 'copy' || kind === 'conv2d' || kind === 'max_pool2d' || kind === 'matrix_vector') return 4
  if (kind === 'conv3d') return 1
  if (kind === 'fft') return hasTag(challenge, 'fft2d') ? 8 : 16
  if (kind === 'graph') return 16
  if (kind === 'block') return 8
  if (hasAnyTag(challenge, ['sum', 'dot', 'silu', 'cross-entropy', 'mse', 'max-subarray', 'count', 'count2d', 'count3d', 'monte-carlo', 'subarray', 'subarray2d', 'subarray3d', 'top-p', 'moe-topk'])) return 1
  if (hasAnyTag(challenge, ['vector-add', 'invert', 'reverse', 'relu', 'leaky-relu', 'sigmoid', 'clip', 'prefix-sum', 'sort'])) return 5
  if (hasTag(challenge, 'conv1d')) return 4
  if (hasTag(challenge, 'topk')) return 3
  if (hasTag(challenge, 'softmax')) return 4
  if (hasTag(challenge, 'grayscale')) return 1
  if (hasTag(challenge, 'interleave')) return 6
  if (hasTag(challenge, 'compact')) return 4
  return 8
}

function inputSize(challenge: Challenge) {
  if (hasAnyTag(challenge, ['softmax', 'top-p'])) return 4
  if (hasAnyTag(challenge, ['conv1d', 'sum', 'dot', 'silu', 'max-subarray', 'subarray', 'subarray2d', 'subarray3d', 'vector-add', 'invert', 'reverse', 'relu', 'leaky-relu', 'sigmoid', 'clip', 'prefix-sum', 'sort', 'topk'])) return 5
  if (hasAnyTag(challenge, ['interleave'])) return 6
  if (hasAnyTag(challenge, ['monte-carlo', 'compact', 'histogram'])) return 8
  return outputSize(challenge)
}

function printMode(challenge: Challenge) {
  const kind = exampleKind(challenge)
  if (kind === 'attention' || kind === 'block') return { rows: 2, cols: 4 }
  if (kind === 'matmul' || kind === 'matrix_add' || kind === 'transpose' || kind === 'copy' || kind === 'conv2d' || kind === 'max_pool2d' || kind === 'matrix_vector') return { rows: 2, cols: 2 }
  if (kind === 'fft') return hasTag(challenge, 'fft2d') ? { rows: 4, cols: 2 } : { rows: 8, cols: 2 }
  if (kind === 'graph') return { rows: 4, cols: 4 }
  return null
}

function vectorBody(challenge: Challenge) {
  if (hasTag(challenge, 'vector-add')) return 'output[gid] = input[gid] + aux[gid];'
  if (hasTag(challenge, 'invert')) return 'output[gid] = (gid % 4 == 3) ? input[gid] : 255.0f - input[gid];'
  if (hasTag(challenge, 'conv1d')) return `if (gid < n - 2) {
    output[gid] = input[gid] * aux[0]
      + input[gid + 1] * aux[1]
      + input[gid + 2] * aux[2];
  }`
  if (hasTag(challenge, 'causal-conv1d')) return `output[gid] = input[gid] * aux[0]
    + (gid > 0 ? input[gid - 1] * aux[1] : 0.0f)
    + (gid > 1 ? input[gid - 2] * aux[2] : 0.0f);`
  if (hasTag(challenge, 'reverse')) return 'output[gid] = input[n - 1 - gid];'
  if (hasTag(challenge, 'relu')) return 'output[gid] = fmax(input[gid], 0.0f);'
  if (hasTag(challenge, 'leaky-relu')) return 'output[gid] = input[gid] > 0.0f ? input[gid] : 0.01f * input[gid];'
  if (hasTag(challenge, 'sigmoid')) return 'output[gid] = 1.0f / (1.0f + exp(-input[gid]));'
  if (hasTag(challenge, 'silu')) return 'output[gid] = input[gid] / (1.0f + exp(-input[gid]));'
  if (hasTag(challenge, 'swiglu')) return 'output[gid] = (input[gid] / (1.0f + exp(-input[gid]))) * aux[gid];'
  if (hasTag(challenge, 'geglu')) return 'output[gid] = 0.5f * input[gid] * (1.0f + tanh(0.7978845608f * (input[gid] + 0.044715f * input[gid] * input[gid] * input[gid]))) * aux[gid];'
  if (hasTag(challenge, 'clip')) return 'output[gid] = fmin(4.0f, fmax(-2.0f, input[gid]));'
  if (hasTag(challenge, 'softmax')) return `float mx = input[0];
  for (int i = 1; i < n; ++i) {
    mx = fmax(mx, input[i]);
  }

  float den = 0.0f;
  for (int i = 0; i < n; ++i) {
    den += exp(input[i] - mx);
  }

  output[gid] = exp(input[gid] - mx) / den;`
  if (hasTag(challenge, 'prefix-sum')) return `float acc = 0.0f;
  for (int i = 0; i <= gid; ++i) {
    if (aux[i] > 0.5f && i != 0) acc = 0.0f;
    acc += input[i];
  }
  output[gid] = acc;`
  if (hasTag(challenge, 'sort')) return `float v = input[gid];
  int rank = 0;
  for (int i = 0; i < n; ++i) {
    if (input[i] < v || (input[i] == v && i < gid)) {
      rank += 1;
    }
  }
  output[rank] = v;`
  if (hasTag(challenge, 'topk')) return `if (gid < 3) {
    for (int round = 0; round <= gid; ++round) {
      float best = -3.402823e38f;
      for (int i = 0; i < n; ++i) {
        int used = 0;
        for (int j = 0; j < round; ++j) {
          used |= (input[i] == output[j]);
        }
        if (!used && input[i] > best) {
          best = input[i];
        }
      }
      if (round == gid) output[gid] = best;
    }
  }`
  if (hasTag(challenge, 'rainbow')) return 'output[gid] = fmod((input[gid] * 1103515245.0f + 12345.0f), 997.0f);'
  if (hasTag(challenge, 'simple-inference')) return 'output[gid] = fmax(input[gid] * aux[gid] + param, 0.0f);'
  if (hasTag(challenge, 'grayscale')) return `int base = gid * 3;
  output[gid] = 0.299f * input[base]
    + 0.587f * input[base + 1]
    + 0.114f * input[base + 2];`
  if (hasTag(challenge, 'interleave')) return 'output[gid] = (gid % 2 == 0) ? input[gid / 2] : aux[gid / 2];'
  if (hasTag(challenge, 'dequant')) return 'output[gid] = input[gid] * param;'
  if (hasTag(challenge, 'rope')) return `int pair = gid ^ 1;
  float angle = aux[gid / 2];
  if (gid % 2 == 0) {
    output[gid] = input[gid] * cos(angle) - input[pair] * sin(angle);
  } else {
    output[gid] = input[pair] * sin(angle) + input[gid] * cos(angle);
  }`
  if (hasTag(challenge, 'linear-recurrence')) return `float state = 0.0f;
  for (int i = 0; i <= gid; ++i) {
    state = param * state + input[i];
  }
  output[gid] = state;`
  if (hasTag(challenge, 'ssm-scan')) return `float state = 0.0f;
  for (int i = 0; i <= gid; ++i) {
    state = aux[i] * state + input[i];
  }
  output[gid] = state;`
  if (hasTag(challenge, 'spec-decode')) return 'output[gid] = input[gid] == aux[gid] ? 1.0f : 0.0f;'
  if (hasTag(challenge, 'compact')) return `if (aux[gid] > 0.0f) {
    int pos = 0;
    for (int i = 0; i < gid; ++i) {
      pos += aux[i] > 0.0f ? 1 : 0;
    }
    output[pos] = input[gid];
  }`
  if (hasTag(challenge, 'merge')) return `int ia = 0;
  int ib = 0;
  for (int out = 0; out <= gid; ++out) {
    if (ib >= n || (ia < n && input[ia] <= aux[ib])) {
      output[out] = input[ia++];
    } else {
      output[out] = aux[ib++];
    }
  }`
  if (hasTag(challenge, 'weight-dequantization')) return 'output[gid] = input[gid] * aux[gid / 4];'
  if (hasTag(challenge, 'sum')) return `if (gid == 0) {
    float acc = 0.0f;
    for (int i = 0; i < n; ++i) {
      acc += input[i];
    }
    output[0] = acc;
  }`
  if (hasTag(challenge, 'dot')) return `if (gid == 0) {
    float acc = 0.0f;
    for (int i = 0; i < n; ++i) {
      acc += input[i] * aux[i];
    }
    output[0] = acc;
  }`
  if (hasTag(challenge, 'cross-entropy')) return `if (gid == 0) {
    float loss = 0.0f;
    for (int i = 0; i < n; ++i) {
      if (aux[i] > 0.0f) {
        loss -= log(fmax(input[i], 1e-6f));
      }
    }
    output[0] = loss;
  }`
  if (hasTag(challenge, 'mse')) return `if (gid == 0) {
    float loss = 0.0f;
    for (int i = 0; i < n; ++i) {
      float d = input[i] - aux[i];
      loss += d * d;
    }
    output[0] = loss / (float)n;
  }`
  if (hasAnyTag(challenge, ['count', 'count2d', 'count3d'])) return `if (gid == 0) {
    float c = 0.0f;
    for (int i = 0; i < n; ++i) {
      c += input[i] == param ? 1.0f : 0.0f;
    }
    output[0] = c;
  }`
  if (hasAnyTag(challenge, ['subarray', 'subarray2d', 'subarray3d']) || hasTag(challenge, 'max-subarray')) return `if (gid == 0) {
    float best = input[0];
    float cur = input[0];
    for (int i = 1; i < n; ++i) {
      cur = fmax(input[i], cur + input[i]);
      best = fmax(best, cur);
    }
    output[0] = best;
  }`
  if (hasTag(challenge, 'monte-carlo')) return `if (gid == 0) {
    float inside = 0.0f;
    for (int i = 0; i + 1 < n; i += 2) {
      float x = input[i];
      float y = input[i + 1];
      if (x * x + y * y <= 1.0f) {
        inside += 1.0f;
      }
    }
    output[0] = 4.0f * inside / fmax((float)(n / 2), 1.0f);
  }`
  if (hasTag(challenge, 'top-p')) return `if (gid == 0) {
    float cum = 0.0f;
    int count = 0;
    for (int i = 0; i < n; ++i) {
      cum += input[i];
      count++;
      if (cum >= param) break;
    }
    output[0] = (float)count;
  }`
  if (hasTag(challenge, 'moe-topk')) return `if (gid == 0) {
    int best = 0;
    for (int i = 1; i < n; ++i) {
      if (input[i] > input[best]) best = i;
    }
    output[0] = (float)best;
  }`
  if (hasTag(challenge, 'histogram')) return `if (gid < 4) {
    float c = 0.0f;
    for (int i = 0; i < n; ++i) {
      c += ((int)input[i] == gid) ? 1.0f : 0.0f;
    }
    output[gid] = c;
  }`
  return 'output[gid] = input[gid];'
}

function kernelSource(challenge: Challenge) {
  const name = challenge.function_name
  const kind = exampleKind(challenge)
  if (kind === 'attention') {
    const scoreBias = hasTag(challenge, 'alibi-attention')
      ? 'score += -0.25f * fabs((float)(row - j));'
      : hasTag(challenge, 'decay-attention')
        ? 'score += log(pow(param, fabs((float)(row - j))));'
        : ''
    const mask = hasTag(challenge, 'causal-attention') || hasTag(challenge, 'kv-attention') || hasTag(challenge, 'decay-attention')
      ? 'if (j > row) continue;'
      : hasTag(challenge, 'window-attention')
        ? 'if (abs(j - row) > 1) continue;'
        : ''
    const linear = hasTag(challenge, 'linear-attention')
    return `__kernel void ${name}(__global const float* input, __global const float* aux, __global float* output, int n, int rows, int cols, int depth, float param) {
  int col = get_global_id(0);
  int row = get_global_id(1);
  if (row >= rows || col >= cols) return;
  float scale = 1.0f / sqrt((float)cols);
  ${linear ? 'float normalizer = 0.0f; float acc = 0.0f;' : 'float max_score = -3.402823e38f;'}
  for (int j = 0; j < depth; ++j) {
    ${mask}
    float score = 0.0f;
    for (int k = 0; k < cols; ++k) score += input[row * cols + k] * aux[j * cols + k];
    score *= scale;
    ${scoreBias}
    ${linear ? 'float feature = fmax(score, 0.0f) + 1.0f; normalizer += feature; acc += feature * aux[depth * cols + j * cols + col];' : 'max_score = fmax(max_score, score);'}
  }
  ${linear ? 'output[row * cols + col] = acc / fmax(normalizer, 1e-6f);' : `
  float denom = 0.0f;
  float acc = 0.0f;
  for (int j = 0; j < depth; ++j) {
    ${mask}
    float score = 0.0f;
    for (int k = 0; k < cols; ++k) score += input[row * cols + k] * aux[j * cols + k];
    score *= scale;
    ${scoreBias}
    float weight = exp(score - max_score);
    denom += weight;
    acc += weight * aux[depth * cols + j * cols + col];
  }
  output[row * cols + col] = acc / denom;`}
}`
  }

  if (kind === 'matmul') {
    const quantized = hasAnyTag(challenge, ['int8-matmul', 'int4-matmul'])
    return `__kernel void ${name}(__global const float* input, __global const float* aux, __global float* output, int n, int rows, int cols, int depth, float param) {
  int col = get_global_id(0);
  int row = get_global_id(1);
  if (row >= rows || col >= cols) return;
  float acc = 0.0f;
  for (int kk = 0; kk < depth; ++kk) {
    float a = input[row * depth + kk];
    float b = aux[kk * cols + col];
    ${quantized ? 'a = round(a) * param; b = round(b) * param;' : ''}
    acc += a * b;
  }
  output[row * cols + col] = acc;
}`
  }

  if (kind === 'matrix_add' || kind === 'copy' || kind === 'transpose') {
    const expr = kind === 'matrix_add' ? 'input[idx] + aux[idx]' : kind === 'copy' ? 'input[idx]' : 'input[col * cols + row]'
    return `__kernel void ${name}(__global const float* input, __global const float* aux, __global float* output, int n, int rows, int cols, int depth, float param) {
  int col = get_global_id(0);
  int row = get_global_id(1);
  if (row >= rows || col >= cols) return;
  int idx = row * cols + col;
  output[idx] = ${expr};
}`
  }

  if (kind === 'conv2d' || kind === 'max_pool2d' || kind === 'matrix_vector') {
    const body = kind === 'conv2d'
      ? `float acc = 0.0f;
  for (int kr = 0; kr < 2; ++kr) {
    for (int kc = 0; kc < 2; ++kc) {
      acc += input[(row + kr) * 3 + (col + kc)] * aux[kr * 2 + kc];
    }
  }
  output[row * cols + col] = acc;`
      : kind === 'max_pool2d'
        ? `float best = -3.402823e38f;
  for (int kr = 0; kr < 2; ++kr) {
    for (int kc = 0; kc < 2; ++kc) {
      best = fmax(best, input[(row * 2 + kr) * 4 + (col * 2 + kc)]);
    }
  }
  output[row * cols + col] = best;`
        : matrixVectorBody(challenge)
    return `__kernel void ${name}(__global const float* input, __global const float* aux, __global float* output, int n, int rows, int cols, int depth, float param) {
  int col = get_global_id(0);
  int row = get_global_id(1);
  if (row >= rows || col >= cols) return;
  ${body}
}`
  }

  if (kind === 'conv3d') {
    return `__kernel void ${name}(__global const float* input, __global const float* aux, __global float* output, int n, int rows, int cols, int depth, float param) {
  if (get_global_id(0) != 0) return;
  float acc = 0.0f;
  for (int i = 0; i < 8; ++i) acc += input[i] * aux[i];
  output[0] = acc;
}`
  }

  if (kind === 'fft') {
    return `__kernel void ${name}(__global const float* input, __global const float* aux, __global float* output, int n, int rows, int cols, int depth, float param) {
  int k = get_global_id(0);
  if (k >= n) return;
  float real = 0.0f, imag = 0.0f;
  for (int t = 0; t < n; ++t) {
    float angle = -6.28318530718f * (float)(k * t) / (float)n;
    real += input[t] * cos(angle);
    imag += input[t] * sin(angle);
  }
  output[2 * k] = real;
  output[2 * k + 1] = imag;
}`
  }

  if (kind === 'graph') {
    const apsp = hasTag(challenge, 'apsp')
    return `__kernel void ${name}(__global const float* input, __global const float* aux, __global float* output, int n, int rows, int cols, int depth, float param) {
  int col = get_global_id(0);
  int row = get_global_id(1);
  if (row >= rows || col >= cols) return;
  ${apsp ? 'float direct = input[row * cols + col]; float via1 = input[row * cols + 1] + input[1 * cols + col]; output[row * cols + col] = fmin(direct, via1);' : 'output[row * cols + col] = input[row * cols + col] > 0.0f ? 1.0f : (row == col ? 0.0f : 99.0f);'}
}`
  }

  if (kind === 'block') {
    return `__kernel void ${name}(__global const float* input, __global const float* aux, __global float* output, int n, int rows, int cols, int depth, float param) {
  int gid = get_global_id(0);
  if (gid >= n) return;
  float mean = 0.0f;
  for (int i = 0; i < n; ++i) mean += input[i];
  mean /= (float)n;
  float var = 0.0f;
  for (int i = 0; i < n; ++i) { float d = input[i] - mean; var += d * d; }
  float norm = (input[gid] - mean) / sqrt(var / (float)n + 1e-5f);
  float gate = norm / (1.0f + exp(-norm));
  output[gid] = input[gid] + gate * aux[gid] * param;
}`
  }

  return `__kernel void ${name}(__global const float* input, __global const float* aux, __global float* output, int n, int rows, int cols, int depth, float param) {
  int gid = get_global_id(0);
  if (gid >= n) return;
  ${vectorBody(challenge)}
}`
}

function matrixVectorBody(challenge: Challenge) {
  if (hasTag(challenge, 'spmv')) return `float acc = 0.0f;
  for (int k = 0; k < depth; ++k) {
    acc += input[row * depth + k] * aux[k * cols + col];
  }
  output[row * cols + col] = acc;`
  if (hasTag(challenge, 'batch-norm')) return `float mean = aux[col];
  float inv_std = aux[cols + col];
  output[row * cols + col] = (input[row * cols + col] - mean) * inv_std;`
  if (hasTag(challenge, 'rms-norm')) return `float ss = 0.0f;
  for (int k = 0; k < cols; ++k) {
    float value = input[row * cols + k];
    ss += value * value;
  }
  output[row * cols + col] = input[row * cols + col]
    / sqrt(ss / (float)cols + 1e-5f)
    * aux[col];`
  if (hasTag(challenge, 'jacobi')) return `int idx = row * cols + col;
  float north = input[idx - (row > 0 ? cols : 0)];
  float south = input[idx + (row + 1 < rows ? cols : 0)];
  float west = input[row * cols + (col > 0 ? col - 1 : col)];
  float east = input[row * cols + (col + 1 < cols ? col + 1 : col)];
  output[idx] = 0.25f * (north + south + west + east);`
  if (hasTag(challenge, 'nearest') || hasTag(challenge, 'kmeans')) return `float dx = input[row * 2] - aux[col * 2];
  float dy = input[row * 2 + 1] - aux[col * 2 + 1];
  output[row * cols + col] = dx * dx + dy * dy;`
  if (hasTag(challenge, 'ols')) return `output[row * cols + col] = input[row * cols + col] * aux[col];`
  if (hasTag(challenge, 'logistic')) return `float z = input[row * cols + col] * aux[col];
  output[row * cols + col] = 1.0f / (1.0f + exp(-z));`
  return 'output[row * cols + col] = input[row * cols + col];'
}

function hostConstants(challenge: Challenge) {
  const kind = exampleKind(challenge)
  if (kind === 'attention') return { n: 8, rows: 2, cols: 4, depth: 3, param: hasTag(challenge, 'decay-attention') ? 0.5 : 0.75, global: 'global2' }
  if (kind === 'matmul') return { n: 4, rows: 2, cols: 2, depth: 2, param: 0.1, global: 'global2' }
  if (kind === 'matrix_add' || kind === 'copy' || kind === 'transpose') return { n: 4, rows: 2, cols: 2, depth: 2, param: 0.5, global: 'global2' }
  if (kind === 'conv2d' || kind === 'max_pool2d' || kind === 'matrix_vector') return { n: 4, rows: 2, cols: 2, depth: 2, param: 1.0, global: 'global2' }
  if (kind === 'graph') return { n: 16, rows: 4, cols: 4, depth: 4, param: 1.0, global: 'global2' }
  if (kind === 'conv3d') return { n: 1, rows: 1, cols: 1, depth: 2, param: 1.0, global: 'global1' }
  if (kind === 'fft') return { n: hasTag(challenge, 'fft2d') ? 4 : 8, rows: 2, cols: 2, depth: 2, param: 1.0, global: 'fft' }
  if (kind === 'block') return { n: 8, rows: 2, cols: 4, depth: 2, param: 0.25, global: 'global1' }
  return { n: inputSize(challenge), rows: 2, cols: 4, depth: 2, param: hasTag(challenge, 'top-p') ? 0.8 : hasAnyTag(challenge, ['count', 'count2d', 'count3d']) ? 2.0 : 0.5, global: 'global1' }
}

function inputArray(challenge: Challenge) {
  if (hasAnyTag(challenge, ['invert'])) return '255,0,128,255,10,20,30,255'
  if (hasAnyTag(challenge, ['softmax', 'top-p'])) return '0.40f,0.30f,0.20f,0.10f,0,0,0,0'
  if (hasAnyTag(challenge, ['sort', 'topk', 'compact'])) return '3,1,4,1,5,9,2,6'
  if (hasTag(challenge, 'histogram')) return '0,1,1,2,3,3,3,0'
  if (hasAnyTag(challenge, ['cross-entropy'])) return '0.70f,0.20f,0.10f,0.01f,0,0,0,0'
  if (hasAnyTag(challenge, ['conv2d', 'max-pool2d', 'jacobi'])) return '1,2,3,4,5,6,7,8,9'
  if (hasTag(challenge, 'conv3d')) return '1,2,3,4,5,6,7,8'
  if (hasTag(challenge, 'graph') || hasAnyTag(challenge, ['bfs', 'apsp'])) return '0,1,9,9,1,0,1,9,9,1,0,1,9,9,1,0'
  if (exampleKind(challenge) === 'attention') return '1,0,0,0,0,1,0,0'
  if (exampleKind(challenge) === 'matmul') return '1,2,3,4'
  return '1,2,-1,2,0,3,-2,4'
}

function auxArray(challenge: Challenge) {
  if (exampleKind(challenge) === 'attention') return '1,0,0,0,0,1,0,0,0,0,1,0,1,2,3,4,5,6,7,8,9,10,11,12'
  if (exampleKind(challenge) === 'matmul') return '5,6,7,8'
  if (hasTag(challenge, 'conv1d') || hasTag(challenge, 'causal-conv1d')) return '1,0,-1,0,0,0,0,0'
  if (hasTag(challenge, 'conv2d') || hasTag(challenge, 'conv3d')) return '1,0,0,-1,1,0,0,-1'
  if (hasAnyTag(challenge, ['compact'])) return '1,0,1,0,1,0,1,0'
  if (hasAnyTag(challenge, ['cross-entropy'])) return '1,0,0,0,0,0,0,0'
  if (hasAnyTag(challenge, ['batch-norm'])) return '2.5,3.5,1,1,0,0,0,0'
  if (hasAnyTag(challenge, ['nearest', 'kmeans'])) return '0,0,2,2,0,0,0,0'
  return '4,3,2,1,0.5f,0.25f,0.125f,0.0625f'
}

function cFloatLiteral(value: number) {
  return Number.isInteger(value) ? `${value}.0f` : `${value}f`
}

export function buildOpenClStarter(challenge: Challenge) {
  const constants = hostConstants(challenge)
  const outN = outputSize(challenge)
  const shape = printMode(challenge)
  const globalDecl = constants.global === 'global2'
    ? `size_t global[2] = { (size_t)${constants.cols}, (size_t)${constants.rows} };`
    : constants.global === 'fft'
      ? `size_t global = (size_t)${constants.n};`
      : `size_t global = (size_t)${Math.max(constants.n, outN)};`
  const enqueueDim = constants.global === 'global2' ? '2, NULL, global' : '1, NULL, &global'
  const paramLiteral = cFloatLiteral(constants.param)
  const printOutput = shape
    ? `printf("output = [");
  for (int r = 0; r < ${shape.rows}; ++r) {
    if (r) printf(",");
    printf("[");
    for (int c = 0; c < ${shape.cols}; ++c) {
      if (c) printf(",");
      print_number(output[r * ${shape.cols} + c]);
    }
    printf("]");
  }
  printf("]\\n");`
    : `printf("output = [");
  for (int i = 0; i < ${outN}; ++i) {
    if (i) printf(",");
    print_number(output[i]);
  }
  printf("]\\n");`

  return `// Complete OpenCL C example for ${challenge.title}.
// Build locally on macOS:
//   clang main.c -framework OpenCL -O2 -o runner
// Run:
//   ./runner
// The host validates a small hard-coded example; scale dimensions and buffers
// to solve the full Arena case.
#include <OpenCL/opencl.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>

static const char* KERNEL_NAME = "${challenge.function_name}";

#define OPENCL_KERNEL_SOURCE(...) #__VA_ARGS__

static const char* KERNEL_SOURCE = OPENCL_KERNEL_SOURCE(
${kernelSource(challenge)}
);

static void fail(const char* label, cl_int err) {
  fprintf(stderr, "%s failed: %d\\n", label, err);
  exit(2);
}

static void print_number(float value) {
  if (fabsf(value - roundf(value)) < 0.00001f) printf("%.0f", value);
  else printf("%.6f", value);
}

static void print_kernel_time(cl_event event) {
  cl_ulong start = 0;
  cl_ulong end = 0;
  if (!event) return;
  if (clGetEventProfilingInfo(event, CL_PROFILING_COMMAND_START, sizeof(start), &start, NULL) == CL_SUCCESS &&
      clGetEventProfilingInfo(event, CL_PROFILING_COMMAND_END, sizeof(end), &end, NULL) == CL_SUCCESS &&
      end >= start) {
    printf("kernel_time_ms = %.6f\\n", (double)(end - start) / 1000000.0);
  }
  clReleaseEvent(event);
}

int main(void) {
  cl_int err = CL_SUCCESS;
  cl_platform_id platform = NULL;
  cl_device_id device = NULL;
  cl_context context = NULL;
  cl_command_queue queue = NULL;
  cl_program program = NULL;
  cl_kernel kernel = NULL;

  err = clGetPlatformIDs(1, &platform, NULL);
  if (err != CL_SUCCESS) fail("clGetPlatformIDs", err);
  err = clGetDeviceIDs(platform, CL_DEVICE_TYPE_GPU, 1, &device, NULL);
  if (err != CL_SUCCESS) err = clGetDeviceIDs(platform, CL_DEVICE_TYPE_DEFAULT, 1, &device, NULL);
  if (err != CL_SUCCESS) fail("clGetDeviceIDs", err);

  context = clCreateContext(NULL, 1, &device, NULL, NULL, &err);
  if (err != CL_SUCCESS) fail("clCreateContext", err);
  queue = clCreateCommandQueue(context, device, CL_QUEUE_PROFILING_ENABLE, &err);
  if (err != CL_SUCCESS) fail("clCreateCommandQueue", err);
  program = clCreateProgramWithSource(context, 1, &KERNEL_SOURCE, NULL, &err);
  if (err != CL_SUCCESS) fail("clCreateProgramWithSource", err);
  err = clBuildProgram(program, 1, &device, "", NULL, NULL);
  if (err != CL_SUCCESS) {
    size_t log_size = 0;
    clGetProgramBuildInfo(program, device, CL_PROGRAM_BUILD_LOG, 0, NULL, &log_size);
    char* log = (char*)calloc(log_size + 1, 1);
    clGetProgramBuildInfo(program, device, CL_PROGRAM_BUILD_LOG, log_size, log, NULL);
    fprintf(stderr, "%s", log);
    free(log);
    return 1;
  }
  kernel = clCreateKernel(program, KERNEL_NAME, &err);
  if (err != CL_SUCCESS) fail("clCreateKernel", err);

  const int n = ${constants.n};
  const int rows = ${constants.rows};
  const int cols = ${constants.cols};
  const int depth = ${constants.depth};
  const float param = ${paramLiteral};
  float input[64] = { ${inputArray(challenge)} };
  float aux[64] = { ${auxArray(challenge)} };
  float output[64] = {0};

  cl_mem input_buf = clCreateBuffer(context, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, sizeof(input), input, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(input)", err);
  cl_mem aux_buf = clCreateBuffer(context, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, sizeof(aux), aux, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(aux)", err);
  cl_mem output_buf = clCreateBuffer(context, CL_MEM_WRITE_ONLY, sizeof(output), NULL, &err);
  if (err != CL_SUCCESS) fail("clCreateBuffer(output)", err);

  clSetKernelArg(kernel, 0, sizeof(cl_mem), &input_buf);
  clSetKernelArg(kernel, 1, sizeof(cl_mem), &aux_buf);
  clSetKernelArg(kernel, 2, sizeof(cl_mem), &output_buf);
  clSetKernelArg(kernel, 3, sizeof(int), &n);
  clSetKernelArg(kernel, 4, sizeof(int), &rows);
  clSetKernelArg(kernel, 5, sizeof(int), &cols);
  clSetKernelArg(kernel, 6, sizeof(int), &depth);
  clSetKernelArg(kernel, 7, sizeof(float), &param);

  ${globalDecl}
  cl_event kernel_event = NULL;
  err = clEnqueueNDRangeKernel(queue, kernel, ${enqueueDim}, NULL, 0, NULL, &kernel_event);
  if (err != CL_SUCCESS) fail("clEnqueueNDRangeKernel", err);
  clFinish(queue);
  clEnqueueReadBuffer(queue, output_buf, CL_TRUE, 0, sizeof(output), output, 0, NULL, NULL);

  ${printOutput}
  print_kernel_time(kernel_event);

  clReleaseMemObject(output_buf);
  clReleaseMemObject(aux_buf);
  clReleaseMemObject(input_buf);
  clReleaseKernel(kernel);
  clReleaseProgram(program);
  clReleaseCommandQueue(queue);
  clReleaseContext(context);
  return 0;
}
`
}
