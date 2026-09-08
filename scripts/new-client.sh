#!/usr/bin/env bash
# Set up a new client profile from the template
#
# Usage:
#   ./scripts/new-client.sh <client-slug> <client-name>
#   ./scripts/new-client.sh teemgenie "TeemGenie Labs"

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CLIENT_SLUG="${1:-}"
CLIENT_NAME="${2:-}"

if [[ -z "$CLIENT_SLUG" || -z "$CLIENT_NAME" ]]; then
  echo "Usage: $0 <client-slug> <client-name>"
  echo "  e.g., $0 teemgenie 'TeemGenie Labs'"
  exit 1
fi

TEMPLATE="$REPO_ROOT/profiles/clients/template"
TARGET="$REPO_ROOT/profiles/clients/$CLIENT_SLUG"

if [[ -d "$TARGET" ]]; then
  echo "✗ Profile already exists: $TARGET"
  exit 1
fi

mkdir -p "$TARGET"

# Copy template files
cp "$TEMPLATE/config.yaml" "$TARGET/config.yaml"
cp "$TEMPLATE/SOUL.md" "$TARGET/SOUL.md"

# Replace placeholders
sed -i "s/\[CLIENT_NAME\]/$CLIENT_NAME/g" "$TARGET/config.yaml"
sed -i "s/\[CLIENT_NAME\]/$CLIENT_NAME/g" "$TARGET/SOUL.md"

echo "✓ Created client profile: $TARGET"
echo ""
echo "Next steps:"
echo "  1. Edit $TARGET/config.yaml — set Slack channel IDs, MCP servers, plugins"
echo "  2. Edit $TARGET/SOUL.md — customize the agent persona"
echo "  3. Run: git add $TARGET && git commit -m 'Add $CLIENT_NAME profile'"
