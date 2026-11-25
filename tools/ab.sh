#!/bin/bash
# agent-browser wrapper pinned to this project's session
export AGENT_BROWSER_SESSION="cratefall"
exec agent-browser "$@"
