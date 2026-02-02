# OpenCode Agent Logger Plugin

A production-ready TypeScript plugin for OpenCode that captures all activities as structured NDJSON logs with zero impact on streaming performance.

## Features

- **Real-time NDJSON Logging**: Structured JSON logs with one event per line
- **Automatic Log Rotation**: Size-based and count-based rotation with archival
- **Log Archive Compression**: Gzip compression for archived logs to save disk space
- **Automatic .gitignore Management**: Automatically adds log directory to .gitignore
- **Intelligent Filename Generation**: Session-based filenames with customizable patterns
- **Configurable Verbosity**: debug, info, warn, error log levels
- **High Performance**: Buffered writes with configurable flush intervals
- **Security**: Automatic sanitization of sensitive data (passwords, tokens, secrets)
- **Graceful Shutdown**: Handles SIGINT/SIGTERM without data loss
- **Zero Dependencies**: Pure Node.js implementation

## Installation

### Quick Install

```bash
./install.sh
```

### Manual Installation

1. Clone or copy the plugin to your OpenCode plugins directory:
```bash
mkdir -p ~/.config/opencode/plugin/
cp -r plugin/agent-logger ~/.config/opencode/plugin/
cd ~/.config/opencode/plugin/agent-logger
npm install
npm run build
```

2. Add to your OpenCode configuration (`~/.config/opencode/opencode.json`):

```json
{
  "plugins": [
    "~/.config/opencode/plugin/agent-logger/dist/index.js"
  ]
}
```

3. Create plugin configuration file (`~/.config/opencode/agent-logger.json`):

```json
{
  "logDir": ".opencode/logs",
  "filenamePattern": "{session}-{YYYY-MM-DD-HH-mm-ss}.ndjson",
  "rotation": {
    "enabled": true,
    "maxSizeMB": 100,
    "maxFiles": 10,
    "maxAgeDays": 30,
    "compress": true,
    "compressionLevel": 6
  },
  "verbosity": "info",
  "buffering": {
    "enabled": true,
    "flushIntervalMs": 100
  },
  "excludedEvents": ["token_usage", "heartbeat"]
}
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `logDir` | string | `.opencode/logs` | Directory for log files |
| `filenamePattern` | string | `agent-{YYYY-MM-DD}.ndjson` | Log file naming pattern |
| `rotation.enabled` | boolean | `true` | Enable log rotation |
| `rotation.maxSizeMB` | number | `100` | Rotate when file exceeds this size |
| `rotation.maxFiles` | number | `10` | Keep maximum N archived files |
| `rotation.maxAgeDays` | number | `30` | Delete files older than N days |
| `rotation.compress` | boolean | `true` | Compress archived logs with gzip |
| `rotation.compressionLevel` | number | `6` | Gzip compression level (1-9) |
| `verbosity` | string | `"info"` | Log level: debug, info, warn, error |
| `excludedEvents` | array | `["token_usage"]` | Events to exclude from logging |
| `timestampFormat` | string | `"ISO"` | Format: ISO, epoch, local |
| `buffering.enabled` | boolean | `true` | Enable write buffering |
| `buffering.flushIntervalMs` | number | `100` | Buffer flush interval |
| `buffering.highWatermarkBytes` | number | `16384` | Buffer high watermark |

### Filename Patterns

The `filenamePattern` supports placeholders that are replaced at runtime:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{YYYY}` | 4-digit year | 2026 |
| `{MM}` | 2-digit month | 02 |
| `{DD}` | 2-digit day | 02 |
| `{HH}` | 2-digit hour (24h) | 14 |
| `{mm}` | 2-digit minute | 30 |
| `{ss}` | 2-digit second | 45 |
| `{YYYY-MM-DD}` | Full date | 2026-02-02 |
| `{YYYY-MM-DD-HH-mm-ss}` | Full datetime | 2026-02-02-14-30-45 |
| `{session}` | Project/session name | my-project |

**Examples:**
- `{session}-{YYYY-MM-DD}.ndjson` → `my-project-2026-02-02.ndjson`
- `agent-{YYYY-MM-DD-HH-mm-ss}.ndjson` → `agent-2026-02-02-14-30-45.ndjson`
- `{session}-{YYYY-MM-DD-HH-mm-ss}.ndjson` → `my-project-2026-02-02-14-30-45.ndjson`

### Configuration File Location

Create the configuration file at:
- `~/.config/opencode/agent-logger.json`

### Environment Variables

Override configuration with environment variables:

```bash
AGENT_LOGGER_LOG_DIR=/var/log/opencode
AGENT_LOGGER_VERBOSITY=debug
AGENT_LOGGER_EXCLUDED_EVENTS=token_usage,heartbeat
AGENT_LOGGER_ROTATION_MAX_SIZE_MB=50
AGENT_LOGGER_BUFFERING_ENABLED=true
```

## Log Format

Each line is a valid JSON object (NDJSON format):

```json
{
  "timestamp": "2025-01-30T20:45:30.123Z",
  "level": "info",
  "type": "tool_use",
  "session_id": "ses_abc123",
  "data": {
    "tool": "bash",
    "direction": "after",
    "duration_ms": 150,
    "status": "success",
    "output": "command output here"
  }
}
```

### Event Types

- `system`: System events (session start/end, initialization)
- `tool_use`: Tool execution events (before/after)
- `llm`: LLM interaction events
- `error`: Error events

## Log Rotation

Logs are automatically rotated based on:
1. **Size**: When current log exceeds `maxSizeMB`
2. **Cleanup**: Old files are deleted based on `maxFiles` and `maxAgeDays`

Archived logs are stored in `{logDir}/archive/` with timestamps.

### Archive Compression

When `rotation.compress` is enabled (default: true), archived logs are compressed using gzip:
- Compressed files have `.gz` extension: `filename-{timestamp}.ndjson.gz`
- Typical compression ratio: 80-90% reduction for NDJSON logs
- Compression level is configurable (1-9, default: 6)

### Automatic .gitignore

The plugin automatically manages your project's `.gitignore` file:
- Adds the log directory entry if not present
- Creates `.gitignore` if it doesn't exist
- Prevents duplicate entries
- Uses relative paths from git repository root

**Example:** If your `logDir` is `.opencode/logs`, the plugin will add `.opencode/logs/` to `.gitignore`.

## Performance Metrics

- **Write Throughput**: >10,000 events/sec
- **Latency Overhead**: <1ms per log entry
- **Memory Usage**: Configurable buffer size (default 16KB)
- **Zero Data Loss**: Graceful shutdown with sync flush

## Security

Sensitive fields are automatically redacted:
- password
- token
- secret
- key
- api_key
- auth
- credential

Example:
```json
{
  "args": {
    "username": "admin",
    "password": "***REDACTED***"
  }
}
```

## Development

```bash
cd plugin/agent-logger

# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Clean build
npm run clean

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Troubleshooting

### Logs not appearing

1. Check plugin is registered in `opencode.json`
2. Verify plugin path is correct
3. Check log directory permissions
4. Review OpenCode console for plugin errors

### High disk usage

Enable compression and adjust rotation settings in `~/.config/opencode/agent-logger.json`:
```json
{
  "rotation": {
    "maxSizeMB": 50,
    "maxFiles": 5,
    "maxAgeDays": 7,
    "compress": true,
    "compressionLevel": 6
  }
}
```

Compression typically reduces log size by 80-90%.

### Too verbose

Increase minimum log level:
```json
{
  "verbosity": "warn"
}
```

Or exclude specific events:
```json
{
  "excludedEvents": ["tool_use", "system"]
}
```

## Architecture

```
plugin/agent-logger/
├── src/
│   ├── index.ts              # Plugin entry point
│   ├── logger.ts             # Core logging engine
│   ├── rotator.ts            # Log rotation and compression
│   ├── serializers.ts        # Event transformation
│   ├── config.ts             # Configuration management
│   ├── types.ts              # TypeScript definitions
│   ├── gitignore.ts          # .gitignore automation
│   └── __tests__/
│       └── rotator.test.ts   # Unit tests
├── dist/                     # Compiled JavaScript
├── package.json
├── tsconfig.json
└── vitest.config.ts          # Test configuration
```

## License

MIT
