#!/bin/bash

set -e

PLUGIN_NAME="opencode-agent-logger"
PLUGIN_DIR="$HOME/.config/opencode/plugin/$PLUGIN_NAME"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================"
echo "OpenCode Agent Logger - Installation"
echo "========================================"
echo ""

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required but not installed."
    echo "Please install Node.js 18 or later."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Error: Node.js 18 or later is required. Found: $(node --version)"
    exit 1
fi

echo "✓ Node.js version: $(node --version)"

# Create plugin directory
echo ""
echo "Installing plugin to: $PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR"

# Copy plugin files
cp -r "$REPO_DIR/plugin/agent-logger/"* "$PLUGIN_DIR/"

# Install dependencies
echo ""
echo "Installing dependencies..."
cd "$PLUGIN_DIR"
npm install

# Build the plugin
echo ""
echo "Building TypeScript..."
npm run build

# Create log directory
echo ""
echo "Creating log directory..."
mkdir -p .opencode/logs

echo ""
echo "========================================"
echo "✅ Installation complete!"
echo "========================================"
echo ""
echo "Step 1: Add the following to your ~/.config/opencode/opencode.json:"
echo ""
cat <<EOF
{
  "plugins": [
    "$PLUGIN_DIR/dist/index.js"
  ]
}
EOF

echo ""
echo "Step 2: Create plugin configuration at ~/.config/opencode/agent-logger.json:"
echo ""
cat <<EOF
{
  "logDir": ".opencode/logs",
  "rotation": {
    "enabled": true,
    "maxSizeMB": 100,
    "maxFiles": 10,
    "maxAgeDays": 30
  },
  "verbosity": "info",
  "buffering": {
    "enabled": true,
    "flushIntervalMs": 100
  },
  "excludedEvents": ["token_usage", "heartbeat"]
}
EOF

echo ""
echo "Logs will be written to: $PLUGIN_DIR/.opencode/logs/"
echo ""
echo "To uninstall, run: rm -rf $PLUGIN_DIR"
echo ""
