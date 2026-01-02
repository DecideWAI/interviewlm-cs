# LangGraph Agents Benchmark Suite

Comprehensive benchmarking tools for testing LangGraph agents including prompt caching verification, streaming performance, and latency analysis.

## Quick Start

```bash
cd langgraph-agents

# Run benchmark with default settings (3 iterations, caching enabled)
python benchmark.py

# Run with more iterations and verbose output
python benchmark.py -n 5 -v

# Run without caching (for comparison)
python benchmark.py --no-cache -o benchmark_results_no_cache

# Analyze results
python analyze_benchmark.py
```

## Benchmark Script (`benchmark.py`)

### What It Tests

The benchmark simulates a complete interview flow in the order it would happen in production:

1. **Session Start** - Interview Agent initializes session
2. **First AI Interaction** - Coding Agent explains approach
3. **Record Interaction** - Interview Agent tracks AI usage
4. **Second AI Interaction** - Coding Agent reviews code (should use cached prompt)
5. **Record Code Change** - Interview Agent tracks code modifications
6. **Record Test Run** - Interview Agent tracks test execution
7. **Third AI Interaction** - Coding Agent provides final review (should use cached prompt)
8. **Question Answered** - Interview Agent records completion
9. **Full Evaluation** - Evaluation Agent scores the session

### Command Line Options

```
--iterations, -n    Number of interview flow iterations (default: 3)
--no-cache          Disable prompt caching (for comparison runs)
--no-streaming      Disable streaming tests
--verbose, -v       Enable verbose output
--output, -o        Output directory (default: benchmark_results)
```

### Output Files

Each benchmark run generates:

| File | Description |
|------|-------------|
| `benchmark_TIMESTAMP.json` | Complete results in JSON format |
| `benchmark_TIMESTAMP_detailed.json` | Per-step detailed results |
| `benchmark_TIMESTAMP_cache.csv` | Cache metrics per operation (CSV) |
| `benchmark_TIMESTAMP_report.txt` | Human-readable summary report |

### Verifying Prompt Caching

Prompt caching is working correctly when you see:

```
[Config] Prompt caching ENABLED

[4/8] Coding Agent: Second Interaction (code review)
  ✓ coding_second_interaction: 1200ms [CACHED]
```

The `[CACHED]` indicator shows the operation used cached prompts.

In the summary, look for:
```
Cache Statistics:
  Hit Rate: 60%
  Hits: 6, Misses: 4
```

**Expected behavior:**
- First call to each agent: Cache MISS (creates cache)
- Subsequent calls to same agent: Cache HIT
- Different agents have separate caches

**Warning signs:**
- 0% cache hit rate with caching enabled
- No `[CACHED]` markers on repeated operations
- Warning message about cache issues

## Analysis Script (`analyze_benchmark.py`)

### Analyze Latest Results

```bash
python analyze_benchmark.py
```

### Compare Two Runs (e.g., cached vs uncached)

```bash
# Run benchmarks
python benchmark.py -o benchmark_results/cached
python benchmark.py --no-cache -o benchmark_results/uncached

# Compare
python analyze_benchmark.py --compare \
    benchmark_results/cached/benchmark_*.json \
    benchmark_results/uncached/benchmark_*.json
```

### Analyze All Recent Results

```bash
python analyze_benchmark.py --all
```

### Output Analysis Report

```bash
python analyze_benchmark.py -o analysis_report.txt
```

## Understanding Results

### Cache Statistics

| Metric | Description | Expected Value |
|--------|-------------|----------------|
| `cache_hits` | Operations using cached prompts | >0 if caching works |
| `cache_misses` | Operations creating new cache | First call per agent |
| `cache_hit_rate_percent` | Percentage of cache hits | 40-70% typical |
| `cache_creation_tokens` | Tokens written to cache | System prompt size |
| `cache_read_tokens` | Tokens read from cache | Should match creation |

### Timing Breakdown

| Operation | What It Tests | Typical Time |
|-----------|--------------|--------------|
| `interview_session_start` | Interview Agent initialization | 10-50ms |
| `coding_first_interaction` | Coding Agent (uncached) | 2000-5000ms |
| `coding_second_interaction` | Coding Agent (should be cached) | 1000-3000ms |
| `evaluation_full_session` | Evaluation Agent (4 parallel dimensions) | 3000-8000ms |

### Common Issues

#### 1. Zero Cache Hit Rate

**Symptom:**
```
Cache Statistics:
  Hit Rate: 0%
  Hits: 0, Misses: 10
```

**Causes:**
- `anthropic-beta` header not being sent
- `cache_control` not set on system messages
- `enable_prompt_caching = False` in config

**Fix:**
Check `config/settings.py`:
```python
enable_prompt_caching: bool = Field(default=True, ...)
```

Check agent code includes:
```python
model_kwargs["extra_headers"] = {
    "anthropic-beta": "prompt-caching-2024-07-31"
}
```

#### 2. Low Cache Hit Rate (<40%)

**Symptom:** Some cache hits but lower than expected

**Causes:**
- Each iteration creates new agent instances
- System prompts vary between calls
- Cache TTL expired (5 minute window)

**Fix:** Ensure agent instances are reused within a session

#### 3. No Performance Improvement with Caching

**Symptom:** Similar latency with and without caching

**Causes:**
- System prompts are small (caching benefit minimal)
- Most time spent in tool execution, not LLM calls
- Network latency dominates

**This may be acceptable** if the workload is tool-heavy.

#### 4. Streaming Not Working

**Symptom:**
```
[Streaming] Coding Agent
  ✓ Total time: 3000ms
  - No text tokens
```

**Causes:**
- `streaming=False` in ChatAnthropic config
- Model doesn't support streaming
- Events not being captured correctly

**Fix:** Check `enable_code_streaming = True` in settings

## Interpreting the Report

### Sample Report Analysis

```
CACHING ANALYSIS
  Hit Rate: 55%
  Total Hits: 11
  Total Misses: 9

  Performance Impact:
    Avg Cached: 1250ms
    Avg Uncached: 2800ms
    Speedup: 55%      ← Good! Caching provides significant speedup
```

```
PERFORMANCE ANALYSIS
  Bottlenecks:
    • evaluation_full_session: 45% of total time
      ← Consider: Evaluation runs 4 dimensions in parallel,
         this is expected to be the slowest operation
```

```
ERROR ANALYSIS
  Total Errors: 0    ← Good! No failures
```

## Recommended Testing Workflow

1. **Baseline Run (with caching)**
   ```bash
   python benchmark.py -n 5 -v -o benchmark_results/baseline
   ```

2. **Comparison Run (without caching)**
   ```bash
   python benchmark.py -n 5 --no-cache -o benchmark_results/no_cache
   ```

3. **Analyze and Compare**
   ```bash
   python analyze_benchmark.py --compare \
       benchmark_results/baseline/benchmark_*.json \
       benchmark_results/no_cache/benchmark_*.json
   ```

4. **Expected Results**
   - Cached run should be 20-40% faster overall
   - Cache hit rate should be 40-70%
   - Repeated coding agent calls should show `[CACHED]`

## Environment Variables

The benchmark uses these environment variables (via `config/settings.py`):

```bash
ANTHROPIC_API_KEY=sk-ant-...     # Required
ENABLE_PROMPT_CACHING=true       # Enable/disable caching
ENABLE_CODE_STREAMING=true       # Enable/disable streaming
CODING_AGENT_MODEL=claude-sonnet-4-20250514
EVALUATION_AGENT_MODEL=claude-sonnet-4-20250514
```
