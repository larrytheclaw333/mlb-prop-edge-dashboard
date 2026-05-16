# MLB Prop Edge Dashboard

Static dashboard export for MLB prop edge tracking.

This repository intentionally contains only sanitized static dashboard files. No model source,
credentials, raw runtime files, or private run artifacts should be committed here.

## Publish source

Generated from the private model project with:

```bash
mlb-prop-edge export-dashboard-static --start-date 2026-05-04 --end-date today --sanitize
```

GitHub Pages serves this repo from the `main` branch root.
