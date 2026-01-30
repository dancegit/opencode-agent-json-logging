# AGENTS.md - OpenCode Agent Logger Plugin

## Project Overview

This is a **TypeScript plugin for OpenCode** that provides structured NDJSON logging of all agent activities. The plugin integrates with OpenCode's hook system to capture events, tool executions, and system state.

## Architecture

### Core Components

1. **Plugin Entry (`src/index.ts`)**
   - Exports default async function
   - Registers OpenCode hooks: `event`, `tool.execute.before`, `tool.execute.after`, `client.init`, `close`, `hook.error`
   - Returns Plugin interface implementation

2. **Logger Engine (`src/logger.ts`)**
   - `ActivityLogger` class manages file I/O
   - Uses Node.js `fs.createWriteStream` for non-blocking writes
   - Implements buffered writes with periodic flush
   - Handles backpressure and graceful shutdown
   - **Key Method**: `log(entry: LogEntry)` - main logging interface

3. **Log Rotator (`src/rotator.ts`)**
   - `LogRotator` class manages file rotation
   - Size-based rotation (>100MB default)
   - Cleanup based on file count and age
   - Archives to `{logDir}/archive/`

4. **Serializers (`src/serializers.ts`)**
   - Transforms OpenCode events to NDJSON format
   - Sanitizes sensitive data (passwords, tokens, etc.)
   - Truncates large outputs for performance
   - **Security**: `sanitizeArgs()` redacts sensitive fields
   - **Performance**: `truncateOutput()` limits output size

5. **Configuration (`src/config.ts`)**
   - Loads from `~/.config/opencode/opencode.json`
   - Environment variable overrides
   - Sensible defaults
   - **Key Function**: `loadConfig()` returns merged configuration

6. **Types (`src/types.ts`)**
   - TypeScript interfaces for all data structures
   - Plugin interface definition
   - Log entry schema

### Data Flow

```
OpenCode Event → Hook Handler → Serializer → Logger → File
```

1. OpenCode triggers a hook (tool execution, system event, etc.)
2. Plugin's hook handler receives the event
3. Serializer transforms to structured format
4. Logger writes to NDJSON file (buffered)
5. Periodic flush writes to disk

## Hook Coverage

| Hook | Purpose | Data Captured |
|------|---------|---------------|
| `event` | System events | Event type, payload |
| `tool.execute.before` | Tool call start | Tool name, arguments |
| `tool.execute.after` | Tool call end | Duration, output, errors |
| `client.init` | Session init | Model info, timestamp |
| `close` | Session end | Cleanup, final flush |
| `hook.error` | Error handling | Error details, context |

## Key Implementation Details

### ES Modules
- Uses ES module syntax (`import`/`export`)
- Requires `.js` extensions in imports for Node16 resolution
- `type: "module"` in package.json

### TypeScript Configuration
- Target: ES2022
- Module: NodeNext
- Strict mode enabled
- Declaration files generated

### Error Handling
- All hook handlers wrapped in try-catch
- Errors logged to console (not to log file to avoid recursion)
- Graceful degradation on write failures

### Performance Optimizations
- Buffered writes (default 100ms flush interval)
- Configurable buffer size (16KB default)
- Asynchronous I/O with backpressure handling
- Opportunistic rotation checks (1% probability)

### Security Considerations
- Sensitive field redaction in `sanitizeArgs()`
- No credentials in log files
- Stack traces may contain sensitive paths

## Development Guidelines

### Adding New Hooks

1. Add hook handler to Plugin interface in `types.ts`
2. Implement handler in `index.ts`
3. Add serializer if needed in `serializers.ts`
4. Update tests

### Modifying Serializers

- Maintain backward compatibility for log format
- Use `sanitizeArgs()` for any user input
- Consider truncation for large payloads
- Preserve timestamp and level fields

### Configuration Changes

- Add to `LoggerConfig` interface in `types.ts`
- Add default value in `DEFAULT_CONFIG` in `config.ts`
- Add environment variable override in `applyEnvironmentOverrides()`
- Add validation in `validateConfig()`
- Update README.md

## Testing

### Manual Testing

```bash
# Build the plugin
cd plugin/agent-logger
npm run build

# Test with OpenCode
opencode run "test command"

# Verify logs
cat .opencode/logs/agent-*.ndjson | jq .
```

### Log Verification

```bash
# Check JSON validity
cat agent-*.ndjson | jq -c '.' > /dev/null && echo "Valid JSON"

# Count events
wc -l agent-*.ndjson

# Filter by type
cat agent-*.ndjson | jq 'select(.type == "tool_use")'
```

## Common Tasks

### Update Plugin

1. Edit source files in `src/`
2. Run `npm run build`
3. Restart OpenCode

### Debug Logging

Set verbosity to debug:
```json
{
  "agent-logger": {
    "verbosity": "debug"
  }
}
```

### Exclude Events

Add to excluded events list:
```json
{
  "agent-logger": {
    "excludedEvents": ["token_usage", "heartbeat", "llm"]
  }
}
```

### Custom Log Directory

```bash
export AGENT_LOGGER_LOG_DIR=/var/log/opencode
```

## File Structure

```
.
├── README.md              # User documentation
├── AGENTS.md             # This file - agent instructions
├── install.sh            # Installation script
├── plans/
│   └── oracle_rfc/
│       └── opencode-agent-logger.md  # Development plan
└── plugin/
    └── agent-logger/
        ├── package.json
        ├── tsconfig.json
        ├── src/
        │   ├── index.ts
        │   ├── logger.ts
        │   ├── rotator.ts
        │   ├── serializers.ts
        │   ├── config.ts
        │   └── types.ts
        └── dist/           # Compiled output
```

## Dependencies

- **Runtime**: None (pure Node.js)
- **Development**: TypeScript, @types/node
- **Requirements**: Node.js >= 18

## Integration Points

### OpenCode
- Reads `client` object for session/model info
- Uses OpenCode plugin hook system
- Configuration from `~/.config/opencode/opencode.json`

### File System
- Creates log directories recursively
- Appends to existing log files
- Rotates and archives old logs

### Process
- Handles SIGINT/SIGTERM for graceful shutdown
- Synchronous flush on process exit

## Known Limitations

1. **Buffer Loss**: Unflushed buffer lost on SIGKILL
2. **Disk Space**: No hard limit on total log size
3. **Concurrency**: Single process only (no multi-process safety)
4. **Rotation**: Rotation check is probabilistic (not exact)

## Future Enhancements

- Real-time WebSocket streaming
- Training data export mode
- Log analysis CLI tool
- Compression for archived logs
- Remote logging endpoints
