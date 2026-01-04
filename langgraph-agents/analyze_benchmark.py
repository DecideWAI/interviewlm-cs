#!/usr/bin/env python3
"""
Benchmark Analysis Script

Analyzes benchmark results to identify issues with caching, performance bottlenecks,
and compare multiple runs.

Usage:
    python analyze_benchmark.py                    # Analyze latest results
    python analyze_benchmark.py results1.json results2.json  # Compare two runs
    python analyze_benchmark.py --all              # Analyze all results in directory
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional


class BenchmarkAnalyzer:
    """Analyzes benchmark results for issues and insights."""

    def __init__(self, results_dir: str = "benchmark_results"):
        self.results_dir = Path(results_dir)

    def load_results(self, filepath: Path) -> dict:
        """Load results from a JSON file."""
        with open(filepath) as f:
            return json.load(f)

    def get_latest_results(self) -> Optional[Path]:
        """Get the path to the latest benchmark results."""
        files = sorted(
            self.results_dir.glob("benchmark_*.json"),
            key=lambda p: p.stat().st_mtime,
            reverse=True
        )
        # Skip detailed files
        for f in files:
            if "_detailed" not in f.name and "_cache" not in f.name:
                return f
        return None

    def analyze_caching(self, results: dict) -> dict:
        """Analyze caching effectiveness."""
        cache_stats = results.get("cache_stats", {})
        timings = results.get("timings", [])

        analysis = {
            "caching_enabled": results.get("config", {}).get("enable_caching", False),
            "hit_rate": cache_stats.get("cache_hit_rate_percent", 0),
            "total_hits": cache_stats.get("cache_hits", 0),
            "total_misses": cache_stats.get("cache_misses", 0),
            "issues": [],
            "recommendations": [],
        }

        # Check for caching issues
        if analysis["caching_enabled"]:
            if analysis["hit_rate"] == 0:
                analysis["issues"].append({
                    "severity": "HIGH",
                    "issue": "Zero cache hit rate",
                    "details": "Prompt caching is enabled but no cache hits were recorded. "
                              "This could indicate the anthropic-beta header is not being sent, "
                              "or the system prompts are not being cached correctly.",
                })
                analysis["recommendations"].append(
                    "Verify that 'anthropic-beta: prompt-caching-2024-07-31' header is included in requests"
                )
                analysis["recommendations"].append(
                    "Check that system messages have cache_control: {type: 'ephemeral'} set"
                )

            elif analysis["hit_rate"] < 50:
                analysis["issues"].append({
                    "severity": "MEDIUM",
                    "issue": f"Low cache hit rate ({analysis['hit_rate']}%)",
                    "details": "Cache hit rate is below 50%. Expected higher hit rate for "
                              "repeated operations with same system prompts.",
                })
                analysis["recommendations"].append(
                    "Review system prompt consistency across requests"
                )

        # Check cache creation vs read pattern
        operations = cache_stats.get("operations", [])
        creation_ops = [op for op in operations if op.get("cache_creation_tokens", 0) > 0]
        read_ops = [op for op in operations if op.get("cache_read_tokens", 0) > 0]

        analysis["cache_creation_operations"] = len(creation_ops)
        analysis["cache_read_operations"] = len(read_ops)

        # Analyze timing patterns for cached vs non-cached
        cached_timings = [t["duration_ms"] for t in timings if t.get("is_cached")]
        uncached_timings = [t["duration_ms"] for t in timings if not t.get("is_cached")]

        if cached_timings and uncached_timings:
            avg_cached = sum(cached_timings) / len(cached_timings)
            avg_uncached = sum(uncached_timings) / len(uncached_timings)
            speedup = ((avg_uncached - avg_cached) / avg_uncached) * 100 if avg_uncached > 0 else 0

            analysis["performance_impact"] = {
                "avg_cached_ms": round(avg_cached, 2),
                "avg_uncached_ms": round(avg_uncached, 2),
                "speedup_percent": round(speedup, 2),
            }

            if speedup < 10:
                analysis["issues"].append({
                    "severity": "LOW",
                    "issue": f"Low cache speedup ({speedup:.1f}%)",
                    "details": "Expected at least 10-20% speedup from caching. "
                              "Actual improvement is minimal.",
                })

        return analysis

    def analyze_performance(self, results: dict) -> dict:
        """Analyze performance and identify bottlenecks."""
        timings = results.get("timings", [])
        summary = results.get("summary", {})

        analysis = {
            "total_operations": len(timings),
            "total_duration_ms": results.get("total_duration_ms", 0),
            "bottlenecks": [],
            "slow_operations": [],
            "recommendations": [],
        }

        # Identify slow operations (>5 seconds)
        for timing in timings:
            if timing["duration_ms"] > 5000:
                analysis["slow_operations"].append({
                    "operation": timing["operation"],
                    "duration_ms": timing["duration_ms"],
                    "error": timing.get("error"),
                })

        # Identify bottlenecks (operations taking >30% of total time)
        op_stats = summary.get("operation_stats", {})
        for op, stats in op_stats.items():
            total_op_time = stats["avg_ms"] * stats["count"]
            if analysis["total_duration_ms"] > 0:
                percentage = (total_op_time / analysis["total_duration_ms"]) * 100
                if percentage > 30:
                    analysis["bottlenecks"].append({
                        "operation": op,
                        "total_time_ms": round(total_op_time, 2),
                        "percentage": round(percentage, 2),
                        "avg_time_ms": stats["avg_ms"],
                        "count": stats["count"],
                    })

        # Generate recommendations
        if analysis["slow_operations"]:
            analysis["recommendations"].append(
                f"Found {len(analysis['slow_operations'])} operations exceeding 5 seconds. "
                "Consider reducing system prompt size or using streaming."
            )

        if analysis["bottlenecks"]:
            for bottleneck in analysis["bottlenecks"]:
                analysis["recommendations"].append(
                    f"Operation '{bottleneck['operation']}' takes {bottleneck['percentage']:.1f}% "
                    "of total time. Consider optimizing or parallelizing."
                )

        return analysis

    def analyze_errors(self, results: dict) -> dict:
        """Analyze errors and failures."""
        errors = results.get("errors", [])
        timings = results.get("timings", [])

        failed_ops = [t for t in timings if t.get("error")]

        analysis = {
            "total_errors": len(errors),
            "failed_operations": len(failed_ops),
            "error_details": errors,
            "failed_operation_details": [
                {"operation": t["operation"], "error": t["error"]}
                for t in failed_ops
            ],
            "recommendations": [],
        }

        # Categorize errors
        error_categories = {}
        for error in errors:
            # Simple categorization based on error content
            if "timeout" in error.lower():
                category = "timeout"
            elif "api" in error.lower() or "rate" in error.lower():
                category = "api"
            elif "connection" in error.lower():
                category = "connection"
            else:
                category = "other"

            if category not in error_categories:
                error_categories[category] = []
            error_categories[category].append(error)

        analysis["error_categories"] = error_categories

        # Recommendations
        if "timeout" in error_categories:
            analysis["recommendations"].append(
                "Timeout errors detected. Consider increasing timeout values or "
                "using streaming to avoid connection timeouts."
            )
        if "api" in error_categories:
            analysis["recommendations"].append(
                "API errors detected. Check rate limits and API key validity."
            )

        return analysis

    def compare_runs(self, results1: dict, results2: dict) -> dict:
        """Compare two benchmark runs."""
        comparison = {
            "run1": {
                "id": results1.get("run_id"),
                "caching": results1.get("config", {}).get("enable_caching"),
                "total_duration_ms": results1.get("total_duration_ms"),
            },
            "run2": {
                "id": results2.get("run_id"),
                "caching": results2.get("config", {}).get("enable_caching"),
                "total_duration_ms": results2.get("total_duration_ms"),
            },
            "differences": {},
            "analysis": [],
        }

        # Compare total duration
        d1 = results1.get("total_duration_ms", 0)
        d2 = results2.get("total_duration_ms", 0)
        if d1 > 0:
            diff_pct = ((d2 - d1) / d1) * 100
            comparison["differences"]["duration"] = {
                "run1_ms": d1,
                "run2_ms": d2,
                "change_percent": round(diff_pct, 2),
            }

            if diff_pct < -10:
                comparison["analysis"].append(f"Run 2 is {abs(diff_pct):.1f}% faster than Run 1")
            elif diff_pct > 10:
                comparison["analysis"].append(f"Run 2 is {diff_pct:.1f}% slower than Run 1")

        # Compare cache hit rates
        c1 = results1.get("cache_stats", {}).get("cache_hit_rate_percent", 0)
        c2 = results2.get("cache_stats", {}).get("cache_hit_rate_percent", 0)
        comparison["differences"]["cache_hit_rate"] = {
            "run1_percent": c1,
            "run2_percent": c2,
            "difference": c2 - c1,
        }

        if c2 > c1 + 10:
            comparison["analysis"].append(f"Run 2 has {c2-c1:.1f}% higher cache hit rate")

        # Compare operation-level performance
        stats1 = results1.get("summary", {}).get("operation_stats", {})
        stats2 = results2.get("summary", {}).get("operation_stats", {})

        op_comparison = {}
        all_ops = set(stats1.keys()) | set(stats2.keys())

        for op in all_ops:
            s1 = stats1.get(op, {})
            s2 = stats2.get(op, {})

            avg1 = s1.get("avg_ms", 0)
            avg2 = s2.get("avg_ms", 0)

            if avg1 > 0:
                change = ((avg2 - avg1) / avg1) * 100
            else:
                change = 0

            op_comparison[op] = {
                "run1_avg_ms": avg1,
                "run2_avg_ms": avg2,
                "change_percent": round(change, 2),
            }

            if change < -20:
                comparison["analysis"].append(f"'{op}' is {abs(change):.1f}% faster in Run 2")
            elif change > 20:
                comparison["analysis"].append(f"'{op}' is {change:.1f}% slower in Run 2")

        comparison["differences"]["operations"] = op_comparison

        return comparison

    def generate_report(self, results: dict) -> str:
        """Generate a comprehensive analysis report."""
        lines = [
            "=" * 70,
            "BENCHMARK ANALYSIS REPORT",
            "=" * 70,
            "",
            f"Run ID: {results.get('run_id', 'Unknown')}",
            f"Analysis Date: {datetime.now().isoformat()}",
            "",
        ]

        # Caching Analysis
        cache_analysis = self.analyze_caching(results)
        lines.extend([
            "CACHING ANALYSIS",
            "-" * 40,
            f"  Caching Enabled: {cache_analysis['caching_enabled']}",
            f"  Hit Rate: {cache_analysis['hit_rate']}%",
            f"  Total Hits: {cache_analysis['total_hits']}",
            f"  Total Misses: {cache_analysis['total_misses']}",
            "",
        ])

        if "performance_impact" in cache_analysis:
            pi = cache_analysis["performance_impact"]
            lines.extend([
                "  Performance Impact:",
                f"    Avg Cached: {pi['avg_cached_ms']}ms",
                f"    Avg Uncached: {pi['avg_uncached_ms']}ms",
                f"    Speedup: {pi['speedup_percent']}%",
                "",
            ])

        if cache_analysis["issues"]:
            lines.append("  Issues Found:")
            for issue in cache_analysis["issues"]:
                lines.append(f"    [{issue['severity']}] {issue['issue']}")
                lines.append(f"      {issue['details']}")
            lines.append("")

        if cache_analysis["recommendations"]:
            lines.append("  Recommendations:")
            for rec in cache_analysis["recommendations"]:
                lines.append(f"    • {rec}")
            lines.append("")

        # Performance Analysis
        perf_analysis = self.analyze_performance(results)
        lines.extend([
            "PERFORMANCE ANALYSIS",
            "-" * 40,
            f"  Total Operations: {perf_analysis['total_operations']}",
            f"  Total Duration: {perf_analysis['total_duration_ms']}ms",
            "",
        ])

        if perf_analysis["bottlenecks"]:
            lines.append("  Bottlenecks:")
            for bn in perf_analysis["bottlenecks"]:
                lines.append(f"    • {bn['operation']}: {bn['percentage']:.1f}% of total time "
                           f"({bn['avg_time_ms']}ms avg × {bn['count']} calls)")
            lines.append("")

        if perf_analysis["slow_operations"]:
            lines.append("  Slow Operations (>5s):")
            for so in perf_analysis["slow_operations"]:
                lines.append(f"    • {so['operation']}: {so['duration_ms']}ms")
            lines.append("")

        if perf_analysis["recommendations"]:
            lines.append("  Recommendations:")
            for rec in perf_analysis["recommendations"]:
                lines.append(f"    • {rec}")
            lines.append("")

        # Error Analysis
        error_analysis = self.analyze_errors(results)
        if error_analysis["total_errors"] > 0:
            lines.extend([
                "ERROR ANALYSIS",
                "-" * 40,
                f"  Total Errors: {error_analysis['total_errors']}",
                f"  Failed Operations: {error_analysis['failed_operations']}",
                "",
            ])

            if error_analysis["error_categories"]:
                lines.append("  Error Categories:")
                for cat, errors in error_analysis["error_categories"].items():
                    lines.append(f"    {cat}: {len(errors)}")
                lines.append("")

            if error_analysis["recommendations"]:
                lines.append("  Recommendations:")
                for rec in error_analysis["recommendations"]:
                    lines.append(f"    • {rec}")
                lines.append("")

        lines.extend(["", "=" * 70])
        return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Analyze benchmark results")
    parser.add_argument("files", nargs="*", help="Benchmark result files to analyze")
    parser.add_argument("--all", action="store_true", help="Analyze all results in directory")
    parser.add_argument("--compare", action="store_true", help="Compare two result files")
    parser.add_argument("--dir", "-d", type=str, default="benchmark_results",
                       help="Results directory (default: benchmark_results)")
    parser.add_argument("--output", "-o", type=str, help="Output file for report")

    args = parser.parse_args()

    analyzer = BenchmarkAnalyzer(args.dir)

    if args.compare and len(args.files) == 2:
        # Compare two runs
        results1 = analyzer.load_results(Path(args.files[0]))
        results2 = analyzer.load_results(Path(args.files[1]))
        comparison = analyzer.compare_runs(results1, results2)

        print("\n" + "=" * 70)
        print("BENCHMARK COMPARISON")
        print("=" * 70)
        print(f"\nRun 1: {comparison['run1']['id']}")
        print(f"  Caching: {comparison['run1']['caching']}")
        print(f"  Duration: {comparison['run1']['total_duration_ms']}ms")
        print(f"\nRun 2: {comparison['run2']['id']}")
        print(f"  Caching: {comparison['run2']['caching']}")
        print(f"  Duration: {comparison['run2']['total_duration_ms']}ms")

        if comparison["differences"].get("duration"):
            d = comparison["differences"]["duration"]
            print(f"\nDuration Change: {d['change_percent']:+.1f}%")

        if comparison["differences"].get("cache_hit_rate"):
            c = comparison["differences"]["cache_hit_rate"]
            print(f"Cache Hit Rate: {c['run1_percent']}% → {c['run2_percent']}%")

        if comparison["analysis"]:
            print("\nAnalysis:")
            for note in comparison["analysis"]:
                print(f"  • {note}")

        print("\n" + "=" * 70)

        if args.output:
            with open(args.output, "w") as f:
                json.dump(comparison, f, indent=2)
            print(f"\nComparison saved to: {args.output}")

    elif args.all:
        # Analyze all results
        result_files = sorted(
            Path(args.dir).glob("benchmark_*.json"),
            key=lambda p: p.stat().st_mtime,
            reverse=True
        )
        result_files = [f for f in result_files if "_detailed" not in f.name and "_cache" not in f.name]

        print(f"\nFound {len(result_files)} benchmark results\n")

        for filepath in result_files[:5]:  # Limit to 5 most recent
            print(f"Analyzing: {filepath.name}")
            results = analyzer.load_results(filepath)
            cache_analysis = analyzer.analyze_caching(results)
            print(f"  Duration: {results.get('total_duration_ms', 0):.0f}ms")
            print(f"  Cache Hit Rate: {cache_analysis['hit_rate']}%")
            print(f"  Errors: {len(results.get('errors', []))}")
            if cache_analysis["issues"]:
                for issue in cache_analysis["issues"]:
                    print(f"  ⚠️  [{issue['severity']}] {issue['issue']}")
            print()

    else:
        # Analyze single result (latest or specified)
        if args.files:
            filepath = Path(args.files[0])
        else:
            filepath = analyzer.get_latest_results()
            if not filepath:
                print("No benchmark results found")
                sys.exit(1)

        print(f"Analyzing: {filepath}")
        results = analyzer.load_results(filepath)
        report = analyzer.generate_report(results)
        print(report)

        if args.output:
            with open(args.output, "w") as f:
                f.write(report)
            print(f"\nReport saved to: {args.output}")


if __name__ == "__main__":
    main()
