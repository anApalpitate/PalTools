# PalTools Agent Instructions

## Preserve the shared workspace

- Treat existing modified and untracked files as user work. Do not reset, discard, overwrite, or reformat unrelated changes.
- Inspect the relevant diff before editing a file that already has modifications.
- Keep changes scoped to the requested phase or issue.

## Long-running commands and local services

- Never use `start /b`, `Start-Process`, `cmd /c start`, `nohup`, or an equivalent detached process to run Vite, preview servers, watchers, packaging jobs, or other long-lived commands.
- Run a long-lived command in the foreground through an execution mechanism that yields a managed `cell_id` (shown as `Script running with cell ID ...`).
- Record the returned `cell_id`. Use the cell wait mechanism to read incremental output; do not launch a duplicate service just because no new output appears.
- Keep waits bounded and provide a user-facing progress update at least every 60 seconds.
- After the browser check or other dependent work finishes, explicitly terminate the same cell with the wait mechanism's termination option.
- On Windows, terminating an npm-managed cell may leave its child `node`/Vite process alive. Cell termination alone is not sufficient proof that the service stopped.
- After terminating the cell, verify both the exact listening port and the readiness URL. If a listener remains, resolve its exact PID from that port, verify that its executable/start time belong to the project service, and terminate only that PID.
- If a turn is interrupted, check for an existing managed cell or exact listening port before restarting. Terminate only the verified project process; never kill broad process-name groups.
- Report both service startup and confirmed termination in the task's validation record.

Recommended lifecycle:

1. Start the foreground service with a short execution yield so a `cell_id` is returned.
2. Wait on that cell until the readiness URL appears.
3. Run the bounded browser or integration checks.
4. Terminate the same `cell_id` explicitly, including after a failed check.
5. Confirm that the test port no longer has a listener and the readiness URL is unreachable.
6. On Windows, clean up an orphaned child only after resolving and verifying its exact PID.

## Validation cost control

- Prefer the narrowest relevant test file and TypeScript check during implementation.
- Run full tests, data validation, production builds, and Electron packaging only at the phase or release gate that requires them.
- Do not repeatedly run data synchronization, full data validation, or EXE packaging after style-only changes.
- If a command runs longer than expected, inspect incremental output before deciding whether it is progressing or stuck.
