#!/usr/bin/env python3
"""Read-only macOS process-tree RAM sampler. No command lines or note data saved."""
import argparse
import datetime
import json
import platform
import re
import statistics
import subprocess
import time
from pathlib import Path


def command(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=30).stdout


def role(command_line):
    if "--type=renderer" in command_line:
        return "renderer"
    if "--type=gpu-process" in command_line:
        return "gpu"
    if "--type=utility" in command_line:
        return "utility"
    if "--desktop-host" in command_line:
        return "native-host"
    if "gateway.mjs" in command_line:
        return "gateway"
    return "other"


def sample(root_pid):
    rows = {}
    for line in command("ps", "-axo", "pid=,ppid=,rss=,command=").splitlines():
        fields = line.strip().split(None, 3)
        if len(fields) == 4:
            pid, parent, rss = map(int, fields[:3])
            rows[pid] = {"pid": pid, "parent": parent, "rss_bytes": rss * 1024,
                         "role": "main" if pid == root_pid else role(fields[3])}
    if root_pid not in rows:
        raise RuntimeError("Root process exited; do not report a partial sample")
    selected = {root_pid}
    while True:
        expanded = selected | {pid for pid, row in rows.items() if row["parent"] in selected}
        if expanded == selected:
            break
        selected = expanded
    args = ["footprint", "--noCategories", "-f", "bytes"]
    for pid in sorted(selected):
        args.extend(["-p", str(pid)])
    output = command(*args)
    for block in re.split(r"(?=^[^\n]*\[\d+\]:)", output, flags=re.M):
        match = re.search(r"\[(\d+)\]:", block)
        if not match:
            continue
        pid = int(match[1])
        current = re.search(r"phys_footprint:\s+(\d+) B", block)
        peak = re.search(r"phys_footprint_peak:\s+(\d+) B", block)
        if pid in selected and current and peak:
            rows[pid].update(physical_bytes=int(current[1]), lifetime_peak_bytes=int(peak[1]))
    missing = [pid for pid in selected if "physical_bytes" not in rows[pid]]
    if missing:
        raise RuntimeError(f"Missing footprint for PIDs {missing}; retry a stable process tree")
    processes = [rows[pid] for pid in sorted(selected)]
    return {"time": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "physical_bytes": sum(row["physical_bytes"] for row in processes),
            "rss_bytes": sum(row["rss_bytes"] for row in processes), "processes": processes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pid", type=int, help="Desktop main PID, not a helper")
    parser.add_argument("--samples", type=int, default=13)
    parser.add_argument("--interval", type=float, default=5)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if platform.system() != "Darwin" or args.pid <= 0 or args.samples <= 0 or args.interval <= 0:
        parser.error("Requires macOS, a positive PID, sample count and interval")
    started = time.monotonic()
    samples = []
    for index in range(args.samples):
        time.sleep(max(0, started + index * args.interval - time.monotonic()))
        samples.append(sample(args.pid))
        print(f"{index + 1}/{args.samples}: {samples[-1]['physical_bytes'] / 1e6:.1f} MB footprint; "
              f"{samples[-1]['rss_bytes'] / 1e6:.1f} MB RSS", flush=True)
    summary = {metric: {"min": min(values), "median": statistics.median(values), "max": max(values)}
               for metric in ("physical_bytes", "rss_bytes")
               for values in ([sample[metric] for sample in samples],)}
    result = {"schema": 1, "macos": platform.mac_ver()[0], "arch": platform.machine(),
              "machine_memory_bytes": int(command("sysctl", "-n", "hw.memsize")),
              "interval_seconds": args.interval, "elapsed_seconds": time.monotonic() - started,
              "method": "Sum per-process phys_footprint; ps RSS is separate. Lifetime peaks are not simultaneous.",
              "summary": summary, "samples": samples}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
