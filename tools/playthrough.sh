#!/bin/bash
# Regression playthrough: a bot plays CRATEFALL from a fresh level-1 save to the Crate Titan
# with no cheats (virtual stick, action buttons and real menu taps only) and reports how it went.
#
#   tools/playthrough.sh [--url <base>] [--from <checkpoint>] [--max-minutes N]
#
#   --url          game URL, default http://localhost:5174/?q=medium
#   --from         fresh (default) | resume | l4-docks | l7-heights | l10-slag | vault |
#                  l12-slagboss | l13-rivet | l16-arc | gauntlet | titan
#                  Checkpoints are written with dev cheats (tools/bot/checkpoints.js), then the
#                  page reloads without ?dev and everything after is played. The report says
#                  which kind of run it was.
#   --max-minutes  real-time limit, default 180
#   --reload-at N  reload the page N minutes in (checks that the run resumes from the save)
#   --out <dir>    default shots/playthrough/<run id>/ (git-ignored): report.json, summary.txt,
#                  and one screenshot per stall
#
# Uses its own agent-browser session ("playthrough-bot"; override with PLAYTHROUGH_SESSION).
# Exit status: 0 the Titan died and Cratefall was turned in, 2 it stopped short, 1 runner error.
exec node "$(dirname "$0")/bot/run.mjs" "$@"
