---
name: benchmark
category: research
description: Measuring execution latency, memory footprint, and throughput accurately
triggers: ["benchmark", "performance", "latency", "profile", "speed", "throughput"]
---

# Benchmark Skill

## Methodology
1. **Warmup Runs**: Discard the first 1-3 iterations to allow JIT compilation and file cache warmup.
2. **Statistical Significance**: Run at least 10-30 iterations; report median, p95, and standard deviation rather than single run spikes.
3. **Isolated Environment**: Avoid running heavy background processes while benchmarking.
4. **Reproducible Script**: Always wrap the benchmark in a standalone, self-contained script with clear tabular output.
