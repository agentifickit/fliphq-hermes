#!/usr/bin/env bash
# Deploy script — supports staging and production
# Usage:
#   ./scripts/deploy.sh <profile>              # deploy to production (port 4133)
#   ./scripts/deploy.sh --staging <profile>    # deploy to staging (port 4134)
#   ./scripts/deploy.sh --all                  # deploy everything to production

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${1:-}"
STAGING=false

# Parse flags
if [[ "$PROFILE" == "--staging" ]]; then
  STAGING=true
  PROFILE="${2:-}"
  shift 2 || true
elif [[ "$PROFILE" == "--all" ]]; then
  PROFILE="--all"
fi

if [[ -z "$PROFILE" ]]; then
  echo "Usage: $0 <profile>"
  echo "  e.g., $0 internal"
  echo "  e.g., $0 clients/teemgenie"
  echo "  e.g., $0 --staging internal"
  echo "  e.g., $0 --all"
  exit 1
fi

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
PORT=4133
if $STAGING; then
  PORT=4134
fi

echo "=== FlipHQ Hermes Deploy ==="
echo "  Repo: $REPO_ROOT"
echo "  Hermes: $HERMES_HOME"
echo "  Port: $PORT"
echo ""

deploy_profile() {
  local profile_dir="$1"
  local profile_name
  profile_name="$(basename "$profile_dir")"

  echo "→ Deploying profile: $profile_name"

  mkdir -p "$HERMES_HOME/profiles/$profile_name"

  if [[ -f "$profile_dir/config.yaml" ]]; then
    cp "$profile_dir/config.yaml" "$HERMES_HOME/profiles/$profile_name/config.yaml"
    echo "  ✓ config.yaml"
  fi

  if [[ -f "$profile_dir/SOUL.md" ]]; then
    cp "$profile_dir/SOUL.md" "$HERMES_HOME/profiles/$profile_name/SOUL.md"
    echo "  ✓ SOUL.md"
  fi

  if [[ -f "$profile_dir/channels.yaml" ]]; then
    cp "$profile_dir/channels.yaml" "$HERMES_HOME/profiles/$profile_name/channels.yaml"
    echo "  ✓ channels.yaml"
  fi

  if [[ -f "$profile_dir/mcp.yaml" ]]; then
    cp "$profile_dir/mcp.yaml" "$HERMES_HOME/profiles/$profile_name/mcp.yaml"
    echo "  ✓ mcp.yaml"
  fi

  echo ""
}

deploy_plugins() {
  if [[ -d "$REPO_ROOT/plugins" ]]; then
    echo "→ Deploying plugins"
    for plugin in "$REPO_ROOT/plugins"/*/; do
      local plugin_name
      plugin_name="$(basename "$plugin")"
      rm -rf "$HERMES_HOME/plugins/$plugin_name"
      cp -r "$plugin" "$HERMES_HOME/plugins/$plugin_name"
      echo "  ✓ $plugin_name"
    done
    echo ""
  fi
}

deploy_shared_skills() {
  if [[ -d "$REPO_ROOT/shared-skills" && -n "$(ls -A "$REPO_ROOT/shared-skills" 2>/dev/null)" ]]; then
    echo "→ Deploying shared skills"
    mkdir -p "$HERMES_HOME/skills"
    for skill in "$REPO_ROOT/shared-skills"/*/; do
      local skill_name
      skill_name="$(basename "$skill")"
      rm -rf "$HERMES_HOME/skills/$skill_name"
      cp -r "$skill" "$HERMES_HOME/skills/$skill_name"
      echo "  ✓ $skill_name"
    done
    echo ""
  fi
}

restart_ui() {
  echo "→ Restarting UI server on port $PORT"
  
  # Kill existing
  local existing_pid
  existing_pid=$(lsof -ti:$PORT 2>/dev/null || true)
  if [[ -n "$existing_pid" ]]; then
    kill -9 "$existing_pid" 2>/dev/null || true
    sleep 1
  fi
  
  # Start new
  cd "$REPO_ROOT/client-onboarding-ui"
  if $STAGING; then
    NODE_ENV=staging npx nodemon server.js &
  else
    npx nodemon server.js &
  fi
  local new_pid=$!
  sleep 2
  
  if curl -s http://localhost:$PORT/api/health > /dev/null; then
    echo "  ✓ UI server restarted (PID: $new_pid)"
  else
    echo "  ✗ UI server failed to start"
    return 1
  fi
  echo ""
}

# Main
if [[ "$PROFILE" == "--all" ]]; then
  deploy_profile "$REPO_ROOT/profiles/internal"
  for client_dir in "$REPO_ROOT/profiles/clients"/*/; do
    [[ "$(basename "$client_dir")" == "template" ]] && continue
    deploy_profile "$client_dir"
  done
  deploy_plugins
  deploy_shared_skills
  restart_ui
else
  profile_path="$REPO_ROOT/profiles/$PROFILE"
  if [[ ! -d "$profile_path" ]]; then
    echo "✗ Profile not found: $profile_path"
    exit 1
  fi
  deploy_profile "$profile_path"
  
  if [[ "$PROFILE" == "internal" ]]; then
    deploy_plugins
    deploy_shared_skills
    restart_ui
  fi
fi

echo "=== Deploy complete ==="
echo ""
echo "Next steps:"
echo "  1. Ensure ~/.hermes/.env has the right tokens for this profile"
echo "  2. Run: hermes --profile <name> gateway restart"
echo "  3. Or:  hermes --profile <name> gateway run"
