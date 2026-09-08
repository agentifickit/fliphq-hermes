#!/usr/bin/env bash
# fliphq-hermes deploy script
# Pushes repo state into the live ~/.hermes/ installation.
#
# Usage:
#   ./scripts/deploy.sh internal          # deploy internal profile
#   ./scripts/deploy.sh clients/teemgenie # deploy a client profile
#   ./scripts/deploy.sh --all             # deploy everything
#
# Secrets (.env, auth.json) are NEVER deployed by this script.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${1:-}"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"

if [[ -z "$PROFILE" ]]; then
  echo "Usage: $0 <profile-dir|--all>"
  echo "  e.g., $0 internal"
  echo "  e.g., $0 clients/teemgenie"
  exit 1
fi

deploy_profile() {
  local profile_dir="$1"
  local profile_name
  profile_name="$(basename "$profile_dir")"

  echo "→ Deploying profile: $profile_name"

  # Create profile directory
  mkdir -p "$HERMES_HOME/profiles/$profile_name"

  # Config
  if [[ -f "$profile_dir/config.yaml" ]]; then
    cp "$profile_dir/config.yaml" "$HERMES_HOME/profiles/$profile_name/config.yaml"
    echo "  ✓ config.yaml"
  fi

  # SOUL.md
  if [[ -f "$profile_dir/SOUL.md" ]]; then
    cp "$profile_dir/SOUL.md" "$HERMES_HOME/profiles/$profile_name/SOUL.md"
    echo "  ✓ SOUL.md"
  fi

  # Cron jobs (only for internal profile)
  if [[ -f "$profile_dir/cron-jobs.json" ]]; then
    cp "$profile_dir/cron-jobs.json" "$HERMES_HOME/cron/jobs.json"
    echo "  ✓ cron-jobs.json"
  fi

  echo ""
}

# Deploy plugins (shared across all profiles)
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

# Deploy shared skills
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

# Deploy cron ticker state
deploy_cron_state() {
  if [[ -d "$REPO_ROOT/profiles/internal/cron" ]]; then
    echo "→ Deploying cron state"
    mkdir -p "$HERMES_HOME/cron"
    for f in "$REPO_ROOT/profiles/internal/cron"/*; do
      cp "$f" "$HERMES_HOME/cron/$(basename "$f")"
      echo "  ✓ $(basename "$f")"
    done
    echo ""
  fi
}

# Main
echo "=== FlipHQ Hermes Deploy ==="
echo "  Repo: $REPO_ROOT"
echo "  Hermes: $HERMES_HOME"
echo ""

if [[ "$PROFILE" == "--all" ]]; then
  # Internal profile
  deploy_profile "$REPO_ROOT/profiles/internal"
  deploy_cron_state

  # All client profiles
  for client_dir in "$REPO_ROOT/profiles/clients"/*/; do
    [[ "$(basename "$client_dir")" == "template" ]] && continue
    deploy_profile "$client_dir"
  done

  deploy_plugins
  deploy_shared_skills
else
  profile_path="$REPO_ROOT/profiles/$PROFILE"
  if [[ ! -d "$profile_path" ]]; then
    echo "✗ Profile not found: $profile_path"
    exit 1
  fi
  deploy_profile "$profile_path"

  if [[ "$PROFILE" == "internal" ]]; then
    deploy_cron_state
    deploy_plugins
    deploy_shared_skills
  fi
fi

echo "=== Deploy complete ==="
echo ""
echo "Next steps:"
echo "  1. Ensure ~/.hermes/.env has the right tokens for this profile"
echo "  2. Run: hermes --profile <name> gateway restart"
echo "  3. Or:  hermes --profile <name> gateway run"
