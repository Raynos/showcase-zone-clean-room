#!/bin/bash
# Release check: run before pushing to main (a push deploys to GitHub Pages).
#
#   tools/release-check.sh [--tiers low,medium,high,ultra] [--viewport 402x874] [--port 5194]
#                          [--budget-mb 9] [--out <dir>] [--skip-build] [--keep]
#                          [--session release-check] [--shots <dir>]
#
# 1. typecheck and production build to a scratch directory outside the repo (never dist/)
# 2. static checks: physics wasm split out, index.html refs, manifest and icons, the service
#    worker's file list
# 3. serves the build like Pages (base /showcase-zone-clean-room/, gzip, max-age=600) and loads
#    every tier at phone size in its own agent-browser session (?dev&nosw): boots on the tier
#    asked for, no console errors or warnings, no failed requests, frame not black or magenta;
#    bytes to play on medium within the budget; enters the vault and the arena
# 4. prints the 20 largest files (raw and on the wire), a tier table and a pass/fail table
#
# --out <dir> keeps the build there (with --skip-build, checks an existing build). Screenshots go
# to shots/release/check/ (git-ignored). Exit status 0 means GO.
#
# Not covered here (see docs or do by hand): Fast 4G timings, offline launch and deploy-to-deploy
# updates (service worker), WebKit, a 20-minute soak, and anything on a real iPhone.
exec node "$(dirname "$0")/release/check.mjs" "$@"
