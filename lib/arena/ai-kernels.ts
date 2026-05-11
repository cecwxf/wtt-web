import type { Challenge, ChallengeTestCase } from './types'

const aiKernelCreatedAt = '2026-05-11T00:00:00.000Z'

export type AiKernelSpec = {
  id: string
  slug: string
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  source_slug: string
  function: string
  op: string
  tags: string[]
}

// Inspired by the public LeetGPU challenge map, but intentionally rewritten as
// WTT-owned challenge metadata and CPU-sim tasks. LeetGPU's repository is
// CC BY-NC-ND, so do not copy their statements/starter code/test generators.
export const aiKernelSpecs: AiKernelSpec[] = [
  {"id": "ai-vector-add", "slug": "ai-vector-add", "title": "Vector Add", "difficulty": "easy", "source_slug": "1_vector_add", "function": "ai_vector_add", "op": "vector_add", "tags": ["ai-kernel", "cpu-sim", "vector-add"]},
  {"id": "ai-matrix-multiplication", "slug": "ai-matrix-multiplication", "title": "Matrix Multiplication", "difficulty": "easy", "source_slug": "2_matrix_multiplication", "function": "ai_matrix_multiplication", "op": "matmul", "tags": ["ai-kernel", "cpu-sim", "matmul"]},
  {"id": "ai-matrix-transpose", "slug": "ai-matrix-transpose", "title": "Matrix Transpose", "difficulty": "easy", "source_slug": "3_matrix_transpose", "function": "ai_matrix_transpose", "op": "transpose", "tags": ["ai-kernel", "cpu-sim", "transpose"]},
  {"id": "ai-color-inversion", "slug": "ai-color-inversion", "title": "Color Inversion", "difficulty": "easy", "source_slug": "7_color_inversion", "function": "ai_color_inversion", "op": "invert", "tags": ["ai-kernel", "cpu-sim", "invert"]},
  {"id": "ai-matrix-addition", "slug": "ai-matrix-addition", "title": "Matrix Addition", "difficulty": "easy", "source_slug": "8_matrix_addition", "function": "ai_matrix_addition", "op": "matrix_add", "tags": ["ai-kernel", "cpu-sim", "matrix-add"]},
  {"id": "ai-1d-convolution", "slug": "ai-1d-convolution", "title": "1D Convolution", "difficulty": "easy", "source_slug": "9_1d_convolution", "function": "ai_1d_convolution", "op": "conv1d", "tags": ["ai-kernel", "cpu-sim", "conv1d"]},
  {"id": "ai-reverse-array", "slug": "ai-reverse-array", "title": "Reverse Array", "difficulty": "easy", "source_slug": "19_reverse_array", "function": "ai_reverse_array", "op": "reverse", "tags": ["ai-kernel", "cpu-sim", "reverse"]},
  {"id": "ai-relu", "slug": "ai-relu", "title": "ReLU", "difficulty": "easy", "source_slug": "21_relu", "function": "ai_relu", "op": "relu", "tags": ["ai-kernel", "cpu-sim", "relu"]},
  {"id": "ai-leaky-relu", "slug": "ai-leaky-relu", "title": "Leaky ReLU", "difficulty": "easy", "source_slug": "23_leaky_relu", "function": "ai_leaky_relu", "op": "leaky_relu", "tags": ["ai-kernel", "cpu-sim", "leaky-relu"]},
  {"id": "ai-rainbow-table", "slug": "ai-rainbow-table", "title": "Rainbow Table", "difficulty": "easy", "source_slug": "24_rainbow_table", "function": "ai_rainbow_table", "op": "rainbow", "tags": ["ai-kernel", "cpu-sim", "rainbow"]},
  {"id": "ai-matrix-copy", "slug": "ai-matrix-copy", "title": "Matrix Copy", "difficulty": "easy", "source_slug": "31_matrix_copy", "function": "ai_matrix_copy", "op": "copy", "tags": ["ai-kernel", "cpu-sim", "copy"]},
  {"id": "ai-simple-inference", "slug": "ai-simple-inference", "title": "Simple Inference", "difficulty": "easy", "source_slug": "41_simple_inference", "function": "ai_simple_inference", "op": "simple_inference", "tags": ["ai-kernel", "cpu-sim", "simple-inference"]},
  {"id": "ai-silu", "slug": "ai-silu", "title": "SiLU", "difficulty": "easy", "source_slug": "52_silu", "function": "ai_silu", "op": "silu", "tags": ["ai-kernel", "cpu-sim", "silu"]},
  {"id": "ai-swiglu", "slug": "ai-swiglu", "title": "SwiGLU", "difficulty": "easy", "source_slug": "54_swiglu", "function": "ai_swiglu", "op": "swiglu", "tags": ["ai-kernel", "cpu-sim", "swiglu"]},
  {"id": "ai-value-clipping", "slug": "ai-value-clipping", "title": "Value Clipping", "difficulty": "easy", "source_slug": "62_value_clipping", "function": "ai_value_clipping", "op": "clip", "tags": ["ai-kernel", "cpu-sim", "clip"]},
  {"id": "ai-interleave", "slug": "ai-interleave", "title": "Interleave", "difficulty": "easy", "source_slug": "63_interleave", "function": "ai_interleave", "op": "interleave", "tags": ["ai-kernel", "cpu-sim", "interleave"]},
  {"id": "ai-geglu", "slug": "ai-geglu", "title": "GEGLU", "difficulty": "easy", "source_slug": "65_geglu", "function": "ai_geglu", "op": "geglu", "tags": ["ai-kernel", "cpu-sim", "geglu"]},
  {"id": "ai-rgb-to-grayscale", "slug": "ai-rgb-to-grayscale", "title": "RGB To Grayscale", "difficulty": "easy", "source_slug": "66_rgb_to_grayscale", "function": "ai_rgb_to_grayscale", "op": "grayscale", "tags": ["ai-kernel", "cpu-sim", "grayscale"]},
  {"id": "ai-sigmoid", "slug": "ai-sigmoid", "title": "Sigmoid", "difficulty": "easy", "source_slug": "68_sigmoid", "function": "ai_sigmoid", "op": "sigmoid", "tags": ["ai-kernel", "cpu-sim", "sigmoid"]},
  {"id": "ai-reduction", "slug": "ai-reduction", "title": "Reduction", "difficulty": "medium", "source_slug": "4_reduction", "function": "ai_reduction", "op": "sum", "tags": ["ai-kernel", "cpu-sim", "sum"]},
  {"id": "ai-softmax", "slug": "ai-softmax", "title": "Softmax", "difficulty": "medium", "source_slug": "5_softmax", "function": "ai_softmax", "op": "softmax", "tags": ["ai-kernel", "cpu-sim", "softmax"]},
  {"id": "ai-softmax-attention", "slug": "ai-softmax-attention", "title": "Softmax Attention", "difficulty": "medium", "source_slug": "6_softmax_attention", "function": "ai_softmax_attention", "op": "attention", "tags": ["ai-kernel", "cpu-sim", "attention"]},
  {"id": "ai-2d-convolution", "slug": "ai-2d-convolution", "title": "2D Convolution", "difficulty": "medium", "source_slug": "10_2d_convolution", "function": "ai_2d_convolution", "op": "conv2d", "tags": ["ai-kernel", "cpu-sim", "conv2d"]},
  {"id": "ai-3d-convolution", "slug": "ai-3d-convolution", "title": "3D Convolution", "difficulty": "medium", "source_slug": "11_3d_convolution", "function": "ai_3d_convolution", "op": "conv3d", "tags": ["ai-kernel", "cpu-sim", "conv3d"]},
  {"id": "ai-histogramming", "slug": "ai-histogramming", "title": "Histogramming", "difficulty": "medium", "source_slug": "13_histogramming", "function": "ai_histogramming", "op": "histogram", "tags": ["ai-kernel", "cpu-sim", "histogram"]},
  {"id": "ai-prefix-sum", "slug": "ai-prefix-sum", "title": "Prefix Sum", "difficulty": "medium", "source_slug": "16_prefix_sum", "function": "ai_prefix_sum", "op": "prefix_sum", "tags": ["ai-kernel", "cpu-sim", "prefix-sum"]},
  {"id": "ai-dot-product", "slug": "ai-dot-product", "title": "Dot Product", "difficulty": "medium", "source_slug": "17_dot_product", "function": "ai_dot_product", "op": "dot", "tags": ["ai-kernel", "cpu-sim", "dot"]},
  {"id": "ai-sparse-matrix-vector-multiplication", "slug": "ai-sparse-matrix-vector-multiplication", "title": "Sparse Matrix Vector Multiplication", "difficulty": "medium", "source_slug": "18_sparse_matrix_vector_multiplication", "function": "ai_sparse_matrix_vector_multiplication", "op": "spmv", "tags": ["ai-kernel", "cpu-sim", "spmv"]},
  {"id": "ai-gemm", "slug": "ai-gemm", "title": "GEMM", "difficulty": "medium", "source_slug": "22_gemm", "function": "ai_gemm", "op": "gemm", "tags": ["ai-kernel", "cpu-sim", "gemm"]},
  {"id": "ai-categorical-cross-entropy-loss", "slug": "ai-categorical-cross-entropy-loss", "title": "Categorical Cross Entropy Loss", "difficulty": "medium", "source_slug": "25_categorical_cross_entropy_loss", "function": "ai_categorical_cross_entropy_loss", "op": "cross_entropy", "tags": ["ai-kernel", "cpu-sim", "cross-entropy"]},
  {"id": "ai-mean-squared-error", "slug": "ai-mean-squared-error", "title": "Mean Squared Error", "difficulty": "medium", "source_slug": "27_mean_squared_error", "function": "ai_mean_squared_error", "op": "mse", "tags": ["ai-kernel", "cpu-sim", "mse"]},
  {"id": "ai-gaussian-blur", "slug": "ai-gaussian-blur", "title": "Gaussian Blur", "difficulty": "medium", "source_slug": "28_gaussian_blur", "function": "ai_gaussian_blur", "op": "gaussian_blur", "tags": ["ai-kernel", "cpu-sim", "gaussian-blur"]},
  {"id": "ai-top-k-selection", "slug": "ai-top-k-selection", "title": "Top K Selection", "difficulty": "medium", "source_slug": "29_top_k_selection", "function": "ai_top_k_selection", "op": "topk", "tags": ["ai-kernel", "cpu-sim", "topk"]},
  {"id": "ai-batched-matrix-multiplication", "slug": "ai-batched-matrix-multiplication", "title": "Batched Matrix Multiplication", "difficulty": "medium", "source_slug": "30_batched_matrix_multiplication", "function": "ai_batched_matrix_multiplication", "op": "matmul", "tags": ["ai-kernel", "cpu-sim", "matmul"]},
  {"id": "ai-int8-quantized-matmul", "slug": "ai-int8-quantized-matmul", "title": "INT8 Quantized Matmul", "difficulty": "medium", "source_slug": "32_int8_quantized_matmul", "function": "ai_int8_quantized_matmul", "op": "int8_matmul", "tags": ["ai-kernel", "cpu-sim", "int8-matmul"]},
  {"id": "ai-ordinary-least-squares", "slug": "ai-ordinary-least-squares", "title": "Ordinary Least Squares", "difficulty": "medium", "source_slug": "33_ordinary_least_squares", "function": "ai_ordinary_least_squares", "op": "ols", "tags": ["ai-kernel", "cpu-sim", "ols"]},
  {"id": "ai-logistic-regression", "slug": "ai-logistic-regression", "title": "Logistic Regression", "difficulty": "medium", "source_slug": "34_logistic_regression", "function": "ai_logistic_regression", "op": "logistic", "tags": ["ai-kernel", "cpu-sim", "logistic"]},
  {"id": "ai-monte-carlo-integration", "slug": "ai-monte-carlo-integration", "title": "Monte Carlo Integration", "difficulty": "medium", "source_slug": "35_monte_carlo_integration", "function": "ai_monte_carlo_integration", "op": "monte_carlo", "tags": ["ai-kernel", "cpu-sim", "monte-carlo"]},
  {"id": "ai-matrix-power", "slug": "ai-matrix-power", "title": "Matrix Power", "difficulty": "medium", "source_slug": "37_matrix_power", "function": "ai_matrix_power", "op": "matrix_power", "tags": ["ai-kernel", "cpu-sim", "matrix-power"]},
  {"id": "ai-nearest-neighbor", "slug": "ai-nearest-neighbor", "title": "Nearest Neighbor", "difficulty": "medium", "source_slug": "38_nearest_neighbor", "function": "ai_nearest_neighbor", "op": "nearest", "tags": ["ai-kernel", "cpu-sim", "nearest"]},
  {"id": "ai-batch-normalization", "slug": "ai-batch-normalization", "title": "Batch Normalization", "difficulty": "medium", "source_slug": "40_batch_normalization", "function": "ai_batch_normalization", "op": "batch_norm", "tags": ["ai-kernel", "cpu-sim", "batch-norm"]},
  {"id": "ai-2d-max-pooling", "slug": "ai-2d-max-pooling", "title": "2D Max Pooling", "difficulty": "medium", "source_slug": "42_2d_max_pooling", "function": "ai_2d_max_pooling", "op": "max_pool2d", "tags": ["ai-kernel", "cpu-sim", "max-pool2d"]},
  {"id": "ai-count-array-element", "slug": "ai-count-array-element", "title": "Count Array Element", "difficulty": "medium", "source_slug": "43_count_array_element", "function": "ai_count_array_element", "op": "count", "tags": ["ai-kernel", "cpu-sim", "count"]},
  {"id": "ai-count-2d-array-element", "slug": "ai-count-2d-array-element", "title": "Count 2D Array Element", "difficulty": "medium", "source_slug": "44_count_2d_array_element", "function": "ai_count_2d_array_element", "op": "count2d", "tags": ["ai-kernel", "cpu-sim", "count2d"]},
  {"id": "ai-count-3d-array-element", "slug": "ai-count-3d-array-element", "title": "Count 3D Array Element", "difficulty": "medium", "source_slug": "45_count_3d_array_element", "function": "ai_count_3d_array_element", "op": "count3d", "tags": ["ai-kernel", "cpu-sim", "count3d"]},
  {"id": "ai-subarray-sum", "slug": "ai-subarray-sum", "title": "Subarray Sum", "difficulty": "medium", "source_slug": "47_subarray_sum", "function": "ai_subarray_sum", "op": "subarray", "tags": ["ai-kernel", "cpu-sim", "subarray"]},
  {"id": "ai-2d-subarray-sum", "slug": "ai-2d-subarray-sum", "title": "2D Subarray Sum", "difficulty": "medium", "source_slug": "48_2d_subarray_sum", "function": "ai_2d_subarray_sum", "op": "subarray2d", "tags": ["ai-kernel", "cpu-sim", "subarray2d"]},
  {"id": "ai-3d-subarray-sum", "slug": "ai-3d-subarray-sum", "title": "3D Subarray Sum", "difficulty": "medium", "source_slug": "49_3d_subarray_sum", "function": "ai_3d_subarray_sum", "op": "subarray3d", "tags": ["ai-kernel", "cpu-sim", "subarray3d"]},
  {"id": "ai-rms-normalization", "slug": "ai-rms-normalization", "title": "RMS Normalization", "difficulty": "medium", "source_slug": "50_rms_normalization", "function": "ai_rms_normalization", "op": "rms_norm", "tags": ["ai-kernel", "cpu-sim", "rms-norm"]},
  {"id": "ai-max-subarray-sum", "slug": "ai-max-subarray-sum", "title": "Max Subarray Sum", "difficulty": "medium", "source_slug": "51_max_subarray_sum", "function": "ai_max_subarray_sum", "op": "max_subarray", "tags": ["ai-kernel", "cpu-sim", "max-subarray"]},
  {"id": "ai-attn-w-linear-bias", "slug": "ai-attn-w-linear-bias", "title": "Attn W Linear Bias", "difficulty": "medium", "source_slug": "55_attn_w_linear_bias", "function": "ai_attn_w_linear_bias", "op": "alibi_attention", "tags": ["ai-kernel", "cpu-sim", "alibi-attention"]},
  {"id": "ai-fp16-batched-matmul", "slug": "ai-fp16-batched-matmul", "title": "FP16 Batched Matmul", "difficulty": "medium", "source_slug": "57_fp16_batched_matmul", "function": "ai_fp16_batched_matmul", "op": "batched_matmul", "tags": ["ai-kernel", "cpu-sim", "batched-matmul"]},
  {"id": "ai-fp16-dot-product", "slug": "ai-fp16-dot-product", "title": "FP16 Dot Product", "difficulty": "medium", "source_slug": "58_fp16_dot_product", "function": "ai_fp16_dot_product", "op": "dot", "tags": ["ai-kernel", "cpu-sim", "dot"]},
  {"id": "ai-top-p-sampling", "slug": "ai-top-p-sampling", "title": "Top P Sampling", "difficulty": "medium", "source_slug": "60_top_p_sampling", "function": "ai_top_p_sampling", "op": "top_p", "tags": ["ai-kernel", "cpu-sim", "top-p"]},
  {"id": "ai-rope-embedding", "slug": "ai-rope-embedding", "title": "RoPE Embedding", "difficulty": "medium", "source_slug": "61_rope_embedding", "function": "ai_rope_embedding", "op": "rope", "tags": ["ai-kernel", "cpu-sim", "rope"]},
  {"id": "ai-weight-dequantization", "slug": "ai-weight-dequantization", "title": "Weight Dequantization", "difficulty": "medium", "source_slug": "64_weight_dequantization", "function": "ai_weight_dequantization", "op": "dequant", "tags": ["ai-kernel", "cpu-sim", "dequant"]},
  {"id": "ai-moe-topk-gating", "slug": "ai-moe-topk-gating", "title": "MoE Topk Gating", "difficulty": "medium", "source_slug": "67_moe_topk_gating", "function": "ai_moe_topk_gating", "op": "moe_topk", "tags": ["ai-kernel", "cpu-sim", "moe-topk"]},
  {"id": "ai-jacobi-stencil-2d", "slug": "ai-jacobi-stencil-2d", "title": "Jacobi Stencil 2D", "difficulty": "medium", "source_slug": "69_jacobi_stencil_2d", "function": "ai_jacobi_stencil_2d", "op": "jacobi", "tags": ["ai-kernel", "cpu-sim", "jacobi"]},
  {"id": "ai-segmented-prefix-sum", "slug": "ai-segmented-prefix-sum", "title": "Segmented Prefix Sum", "difficulty": "medium", "source_slug": "70_segmented_prefix_sum", "function": "ai_segmented_prefix_sum", "op": "prefix_sum", "tags": ["ai-kernel", "cpu-sim", "prefix-sum"]},
  {"id": "ai-parallel-merge", "slug": "ai-parallel-merge", "title": "Parallel Merge", "difficulty": "medium", "source_slug": "71_parallel_merge", "function": "ai_parallel_merge", "op": "merge", "tags": ["ai-kernel", "cpu-sim", "merge"]},
  {"id": "ai-stream-compaction", "slug": "ai-stream-compaction", "title": "Stream Compaction", "difficulty": "medium", "source_slug": "72_stream_compaction", "function": "ai_stream_compaction", "op": "compact", "tags": ["ai-kernel", "cpu-sim", "compact"]},
  {"id": "ai-sparse-matrix-dense-matrix-multiplication", "slug": "ai-sparse-matrix-dense-matrix-multiplication", "title": "Sparse Matrix Dense Matrix Multiplication", "difficulty": "medium", "source_slug": "75_sparse_matrix_dense_matrix_multiplication", "function": "ai_sparse_matrix_dense_matrix_multiplication", "op": "matmul", "tags": ["ai-kernel", "cpu-sim", "matmul"]},
  {"id": "ai-adder-transformer", "slug": "ai-adder-transformer", "title": "Adder Transformer", "difficulty": "medium", "source_slug": "76_adder_transformer", "function": "ai_adder_transformer", "op": "adder_transformer", "tags": ["ai-kernel", "cpu-sim", "adder-transformer"]},
  {"id": "ai-2d-fft", "slug": "ai-2d-fft", "title": "2D FFT", "difficulty": "medium", "source_slug": "78_2d_fft", "function": "ai_2d_fft", "op": "fft2d", "tags": ["ai-kernel", "cpu-sim", "fft2d"]},
  {"id": "ai-grouped-query-attention", "slug": "ai-grouped-query-attention", "title": "Grouped Query Attention", "difficulty": "medium", "source_slug": "80_grouped_query_attention", "function": "ai_grouped_query_attention", "op": "gqa", "tags": ["ai-kernel", "cpu-sim", "gqa"]},
  {"id": "ai-int4-matmul", "slug": "ai-int4-matmul", "title": "INT4 Matmul", "difficulty": "medium", "source_slug": "81_int4_matmul", "function": "ai_int4_matmul", "op": "int4_matmul", "tags": ["ai-kernel", "cpu-sim", "int4-matmul"]},
  {"id": "ai-linear-recurrence", "slug": "ai-linear-recurrence", "title": "Linear Recurrence", "difficulty": "medium", "source_slug": "82_linear_recurrence", "function": "ai_linear_recurrence", "op": "linear_recurrence", "tags": ["ai-kernel", "cpu-sim", "linear-recurrence"]},
  {"id": "ai-swiglu-mlp-block", "slug": "ai-swiglu-mlp-block", "title": "SwiGLU Mlp Block", "difficulty": "medium", "source_slug": "84_swiglu_mlp_block", "function": "ai_swiglu_mlp_block", "op": "swiglu_mlp", "tags": ["ai-kernel", "cpu-sim", "swiglu-mlp"]},
  {"id": "ai-lora-linear", "slug": "ai-lora-linear", "title": "Lora Linear", "difficulty": "medium", "source_slug": "85_lora_linear", "function": "ai_lora_linear", "op": "lora", "tags": ["ai-kernel", "cpu-sim", "lora"]},
  {"id": "ai-speculative-decoding-verification", "slug": "ai-speculative-decoding-verification", "title": "Speculative Decoding Verification", "difficulty": "medium", "source_slug": "87_speculative_decoding_verification", "function": "ai_speculative_decoding_verification", "op": "spec_decode", "tags": ["ai-kernel", "cpu-sim", "spec-decode"]},
  {"id": "ai-causal-depthwise-conv1d", "slug": "ai-causal-depthwise-conv1d", "title": "Causal Depthwise Conv1d", "difficulty": "medium", "source_slug": "90_causal_depthwise_conv1d", "function": "ai_causal_depthwise_conv1d", "op": "causal_conv1d", "tags": ["ai-kernel", "cpu-sim", "causal-conv1d"]},
  {"id": "ai-decaying-causal-attention", "slug": "ai-decaying-causal-attention", "title": "Decaying Causal Attention", "difficulty": "medium", "source_slug": "92_decaying_causal_attention", "function": "ai_decaying_causal_attention", "op": "decay_attention", "tags": ["ai-kernel", "cpu-sim", "decay-attention"]},
  {"id": "ai-ssm-selective-scan", "slug": "ai-ssm-selective-scan", "title": "Ssm Selective Scan", "difficulty": "medium", "source_slug": "94_ssm_selective_scan", "function": "ai_ssm_selective_scan", "op": "ssm_scan", "tags": ["ai-kernel", "cpu-sim", "ssm-scan"]},
  {"id": "ai-int8-kv-cache-attention", "slug": "ai-int8-kv-cache-attention", "title": "INT8 KV Cache Attention", "difficulty": "medium", "source_slug": "96_int8_kv_cache_attention", "function": "ai_int8_kv_cache_attention", "op": "kv_attention", "tags": ["ai-kernel", "cpu-sim", "kv-attention"]},
  {"id": "ai-multi-head-attention", "slug": "ai-multi-head-attention", "title": "Multi Head Attention", "difficulty": "hard", "source_slug": "12_multi_head_attention", "function": "ai_multi_head_attention", "op": "mha", "tags": ["ai-kernel", "cpu-sim", "mha"]},
  {"id": "ai-multi-agent-sim", "slug": "ai-multi-agent-sim", "title": "Multi Agent Sim", "difficulty": "hard", "source_slug": "14_multi_agent_sim", "function": "ai_multi_agent_sim", "op": "multi_agent", "tags": ["ai-kernel", "cpu-sim", "multi-agent"]},
  {"id": "ai-sorting", "slug": "ai-sorting", "title": "Sorting", "difficulty": "hard", "source_slug": "15_sorting", "function": "ai_sorting", "op": "sort", "tags": ["ai-kernel", "cpu-sim", "sort"]},
  {"id": "ai-kmeans-clustering", "slug": "ai-kmeans-clustering", "title": "Kmeans Clustering", "difficulty": "hard", "source_slug": "20_kmeans_clustering", "function": "ai_kmeans_clustering", "op": "kmeans", "tags": ["ai-kernel", "cpu-sim", "kmeans"]},
  {"id": "ai-radix-sort", "slug": "ai-radix-sort", "title": "Radix Sort", "difficulty": "hard", "source_slug": "36_radix_sort", "function": "ai_radix_sort", "op": "sort", "tags": ["ai-kernel", "cpu-sim", "sort"]},
  {"id": "ai-fast-fourier-transform", "slug": "ai-fast-fourier-transform", "title": "Fast Fourier Transform", "difficulty": "hard", "source_slug": "39_Fast_Fourier_transform", "function": "ai_fast_fourier_transform", "op": "fft", "tags": ["ai-kernel", "cpu-sim", "fft"]},
  {"id": "ai-bfs-shortest-path", "slug": "ai-bfs-shortest-path", "title": "BFS Shortest Path", "difficulty": "hard", "source_slug": "46_bfs_shortest_path", "function": "ai_bfs_shortest_path", "op": "bfs", "tags": ["ai-kernel", "cpu-sim", "bfs"]},
  {"id": "ai-casual-attention", "slug": "ai-casual-attention", "title": "Casual Attention", "difficulty": "hard", "source_slug": "53_casual_attention", "function": "ai_casual_attention", "op": "causal_attention", "tags": ["ai-kernel", "cpu-sim", "causal-attention"]},
  {"id": "ai-linear-attention", "slug": "ai-linear-attention", "title": "Linear Attention", "difficulty": "hard", "source_slug": "56_linear_attention", "function": "ai_linear_attention", "op": "linear_attention", "tags": ["ai-kernel", "cpu-sim", "linear-attention"]},
  {"id": "ai-sliding-window-attn", "slug": "ai-sliding-window-attn", "title": "Sliding Window Attn", "difficulty": "hard", "source_slug": "59_sliding_window_attn", "function": "ai_sliding_window_attn", "op": "window_attention", "tags": ["ai-kernel", "cpu-sim", "window-attention"]},
  {"id": "ai-all-pairs-shortest-paths", "slug": "ai-all-pairs-shortest-paths", "title": "All Pairs Shortest Paths", "difficulty": "hard", "source_slug": "73_all_pairs_shortest_paths", "function": "ai_all_pairs_shortest_paths", "op": "apsp", "tags": ["ai-kernel", "cpu-sim", "apsp"]},
  {"id": "ai-gpt2-block", "slug": "ai-gpt2-block", "title": "GPT-2 Block", "difficulty": "hard", "source_slug": "74_gpt2_block", "function": "ai_gpt2_block", "op": "gpt_block", "tags": ["ai-kernel", "cpu-sim", "gpt-block"]},
  {"id": "ai-llama-transformer-block", "slug": "ai-llama-transformer-block", "title": "LLaMA Transformer Block", "difficulty": "hard", "source_slug": "93_llama_transformer_block", "function": "ai_llama_transformer_block", "op": "llama_block", "tags": ["ai-kernel", "cpu-sim", "llama-block"]},
]

function familyFor(op: string) {
  if (['matmul', 'gemm', 'batched_matmul', 'int8_matmul', 'int4_matmul', 'spmm'].includes(op)) return 'matrix'
  if (['attention', 'mha', 'causal_attention', 'linear_attention', 'window_attention', 'gqa', 'kv_attention', 'alibi_attention', 'decay_attention'].includes(op)) return 'attention'
  if (['conv1d', 'conv2d', 'conv3d', 'causal_conv1d', 'gaussian_blur', 'max_pool2d', 'jacobi'].includes(op)) return 'stencil'
  if (['sort', 'topk', 'top_p', 'merge', 'compact', 'prefix_sum', 'segmented_prefix', 'histogram', 'count', 'count2d', 'count3d'].includes(op)) return 'parallel-data'
  if (['bfs', 'apsp', 'nearest', 'kmeans', 'multi_agent'].includes(op)) return 'graph-sim'
  if (['relu', 'leaky_relu', 'silu', 'sigmoid', 'clip', 'swiglu', 'geglu', 'swiglu_mlp', 'rms_norm', 'batch_norm', 'dequant', 'lora', 'moe_topk'].includes(op)) return 'neural-op'
  if (['fft', 'fft2d', 'monte_carlo', 'ols', 'logistic', 'linear_recurrence', 'ssm_scan', 'spec_decode', 'gpt_block', 'llama_block', 'adder_transformer'].includes(op)) return 'model-system'
  return 'vector'
}

function conceptFor(spec: AiKernelSpec) {
  const family = familyFor(spec.op)
  const guide: Record<string, string> = {
    vector: 'element-wise/vector memory access',
    matrix: 'matrix tiling, accumulation, and numeric stability',
    attention: 'attention-style score/mask/reduction flow',
    stencil: 'neighborhood/stencil indexing and boundary handling',
    'parallel-data': 'parallel scan/sort/filter/count patterns',
    'graph-sim': 'graph or simulation state updates',
    'neural-op': 'neural network operator math and activation rules',
    'model-system': 'model-system operator composition and deterministic checksums',
  }
  return guide[family] || guide.vector
}

function descriptionFor(spec: AiKernelSpec) {
  const concept = conceptFor(spec)
  return `AI Kernel / CPU-sim challenge. Implement \`${spec.function}(payload)\` in Python and return the exact JSON value requested by the examples.

This task trains ${concept}. The current MVP judge executes a deterministic CPU simulation, so CUDA/OpenCL kernels can be prototyped as plain Python first. Later the same challenge contract can be routed to a hardware runner for CUDA, OpenCL, PoCL/Vortex, Metal, or other accelerators.

Rules:
- Do not read files or use network access.
- Treat \`payload\` as the only input.
- Return JSON-serializable numbers, lists, or dictionaries.
- Public examples are small; hidden tests vary shapes, signs, and boundary cases.`
}

function starterFor(spec: AiKernelSpec) {
  return `def ${spec.function}(payload: dict):
    # CPU-sim version of the kernel. Replace this with your implementation.
    # payload contains small deterministic tensors/lists used by the judge.
    return None
`
}

function checksum(values: number[]) {
  return values.reduce((acc, value, index) => acc + Math.round(value * 1000) * (index + 1), 0)
}

function expectedFor(op: string, seed: number): unknown {
  const values = [seed, seed + 1, -seed, 2 * seed, seed % 3 - 1]
  const matrix = [[seed, seed + 1], [seed + 2, seed + 3]]
  const other = [[1, 2], [3, 4]]
  switch (op) {
    case 'vector_add': return values.map((v, i) => v + i)
    case 'matrix_add': return matrix.map((row, r) => row.map((v, c) => v + other[r][c]))
    case 'matmul':
    case 'gemm': return [[matrix[0][0] * 1 + matrix[0][1] * 3, matrix[0][0] * 2 + matrix[0][1] * 4], [matrix[1][0] * 1 + matrix[1][1] * 3, matrix[1][0] * 2 + matrix[1][1] * 4]]
    case 'transpose': return [[matrix[0][0], matrix[1][0]], [matrix[0][1], matrix[1][1]]]
    case 'invert': return values.map((v) => 255 - Math.max(0, Math.min(255, v + 128)))
    case 'conv1d': return [values[0] - values[1], values[1] - values[2], values[2] - values[3], values[3] - values[4]]
    case 'reverse': return [...values].reverse()
    case 'relu': return values.map((v) => Math.max(0, v))
    case 'leaky_relu': return values.map((v) => v >= 0 ? v : Number((v * 0.1).toFixed(4)))
    case 'silu': return Number((values.reduce((a, v) => a + v / (1 + Math.exp(-v)), 0)).toFixed(4))
    case 'sigmoid': return values.map((v) => Number((1 / (1 + Math.exp(-v))).toFixed(4)))
    case 'clip': return values.map((v) => Math.max(-2, Math.min(4, v)))
    case 'sum': return values.reduce((a, v) => a + v, 0)
    case 'dot': return values.reduce((a, v, i) => a + v * (i + 1), 0)
    case 'softmax': {
      const exps = values.slice(0, 4).map((v) => Math.exp(v - Math.max(...values.slice(0, 4))))
      const total = exps.reduce((a, v) => a + v, 0)
      return exps.map((v) => Number((v / total).toFixed(6)))
    }
    case 'prefix_sum': { let acc = 0; return values.map((v) => (acc += v)) }
    case 'sort': return [...values].sort((a, b) => a - b)
    case 'topk': return [...values].sort((a, b) => b - a).slice(0, 3)
    case 'max_subarray': {
      let best = values[0], cur = values[0]
      for (const v of values.slice(1)) { cur = Math.max(v, cur + v); best = Math.max(best, cur) }
      return best
    }
    case 'grayscale': return [Math.round(0.299 * 120 + 0.587 * (seed + 80) + 0.114 * 40)]
    case 'interleave': return [values[0], 10, values[1], 20, values[2], 30]
    case 'copy': return { copied: matrix, checksum: checksum(matrix.flat()) }
    default: return { checksum: checksum(values), op, seed }
  }
}

function payloadFor(spec: AiKernelSpec, seed: number) {
  return {
    op: spec.op,
    seed,
    values: [seed, seed + 1, -seed, 2 * seed, seed % 3 - 1],
    matrix: [[seed, seed + 1], [seed + 2, seed + 3]],
    vector: [1, 2, 3, 4],
  }
}

export const aiKernelChallenges: Challenge[] = aiKernelSpecs.map((spec) => ({
  id: spec.id,
  title: spec.title,
  slug: spec.slug,
  description: descriptionFor(spec),
  difficulty: spec.difficulty,
  category: 'ai-kernel',
  tags: spec.tags,
  challenge_type: 'coding',
  time_limit_ms: spec.difficulty === 'hard' ? 4000 : 2500,
  memory_limit_mb: spec.difficulty === 'hard' ? 256 : 128,
  starter_code: starterFor(spec),
  function_name: spec.function,
  input_keys: ['payload'],
  published: true,
  created_at: aiKernelCreatedAt,
  updated_at: aiKernelCreatedAt,
}))

export const aiKernelTestCases: ChallengeTestCase[] = aiKernelSpecs.flatMap((spec, index) => [1, 2, 7].map((seed, caseIndex) => {
  const actualSeed = seed + (index % 5)
  return {
    id: `${spec.id}-${caseIndex === 0 ? 'public' : 'hidden'}-${caseIndex + 1}`,
    challenge_id: spec.id,
    input: JSON.stringify({ payload: payloadFor(spec, actualSeed) }),
    expected_output: JSON.stringify(expectedFor(spec.op, actualSeed)),
    is_hidden: caseIndex > 0,
    weight: 1,
    explanation: caseIndex === 0 ? `CPU-sim public case for ${spec.title}.` : undefined,
    checker: 'json_exact' as const,
  }
}))
