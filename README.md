# Milestone Overview

A read-only, fully offline dashboard over several Milestone XProtect management servers: one place to see the inventory (management servers → recording servers → cameras), their status, and **what changed** since the last check.

Status: **early starter code.** It runs on sample data ("fake Milestone"). There is no real Milestone connection yet.

## What's here

| Folder | What it is |
|---|---|
| `src/Collector.Core` | The data model and the change-log logic (`SnapshotDiff`). Compares two snapshots and reports: added, removed, went offline, back online, possible replacement (a guess). |
| `src/Dashboard` | A small web server (.NET) that serves the dashboard page and an API. Runs as a Windows service when installed, or as a normal app while developing. |
| `fixtures` | Two sample snapshots (6 and 7 Oct 2026) with made-up names. Not real customer data. |
| `tests` | Tests for the change-log rules. |

## Run it on your Mac

1. Install the .NET 8 SDK: `brew install --cask dotnet-sdk` (or from Microsoft's .NET download page).
2. In this folder run:
   ```
   dotnet test                         # checks the change-log rules
   dotnet run --project src/Dashboard  # starts the dashboard
   ```
3. Open http://localhost:5080

To try your own snapshots, put `snapshot-YYYY-MM-DD.json` files (same shape as the ones in `fixtures`) in a folder and run with `--SnapshotFolder /path/to/folder`.

## API

- `GET /api/summary`: counts from the latest snapshot
- `GET /api/inventory`: the latest snapshot
- `GET /api/changes`: the change log, newest first
- `GET /api/changes.csv`: the change log as CSV

## Rules the change log follows

- Items are matched by their Milestone **id**, so a renamed camera is not "removed + added".
- **Offline is not removed.** A camera that's still configured but not responding is "went offline".
- **Possible replacement** = a camera disappeared and a new one appeared on the **same recording server** in the same run. It's shown as a guess, alongside the normal added/removed lines.

## Not built yet (in order)

1. Real Milestone collector (waiting on: which Milestone API, and one real snapshot from a test environment).
2. Local database for history (embedded database, choice pending CTO confirmation).
3. Full dashboard screens (servers drill-down, camera detail, filters) based on the Base44 prototype.
4. Windows installer, local log file and "export diagnostics" bundle.

Deliberately **not** in the first version: alerts, CPU/RAM/disk monitoring, comments, anything that changes Milestone configuration, any internet connection.
