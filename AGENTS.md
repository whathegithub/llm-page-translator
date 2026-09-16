# Project Instructions

## Versioning

- Every user-requested change to this project must update the `version` field in `manifest.json` in the same change set.
- Increment the version exactly once per user-requested change set, even when multiple files are modified.
- Use a patch-version increment by default, for example `0.1.1` to `0.1.2`.
- Use a minor or major increment only when the user explicitly requests it or the change introduces a corresponding compatibility boundary.
- The required version edit does not recursively require another version increment.
- Before completing a change, verify that `manifest.json` is valid JSON and that its version was incremented.
