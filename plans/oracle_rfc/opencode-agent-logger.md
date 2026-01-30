# OpenCode Agent Logger Plugin - Development Plan

## Overview

A production-ready TypeScript plugin that captures all OpenCode activities as structured NDJSON logs with zero impact on streaming performance.

## Product Requirements

**Goal**: Real-time NDJSON stream to `.opencode/logs/agent.log` with automatic log rotation and configurable verbosity levels.

**Key Features**:
- Real-time NDJSON stream to `.opencode/logs/agent.log`
- Automatic log rotation (size/time-based)
- Configurable verbosity levels (debug, info, warn, error)
- Dual output: file + stdout compatibility
- Graceful handling of interruptions (SIGINT/SIGTERM)
- High-performance buffering with configurable flush intervals
- Security: Automatic sanitization of sensitive data (passwords, tokens, secrets)
- Performance: Truncation of massive outputs

## Architecture

### Directory Structure

```
opencode-agent-json-logging/
├── plugin/
│   └── agent-logger/
│       ├── package.json          # Plugin manifest
│       ├── tsconfig.json         # TypeScript configuration
│       ├── src/
│       │   ├── index.ts          # Main entry + hook registrations
│       │   ├── logger.ts         # Core logging engine
│       │   ├── rotator.ts        # File rotation logic
│       │   ├── serializers.ts    # Event transformers
│       │   ├── config.ts         # Settings manager
│       │   └── types.ts          # Shared interfaces
│       └── dist/                 # Compiled output
└── plans/
    └── oracle_rfc/
        └── opencode-agent-logger.md  # This plan
```

### Hook Coverage Strategy

Leverage all available plugin hooks for comprehensive logging:

| Hook | Data Captured | Frequency |
|------|--------------|-----------|
| `event` | System events, user input, LLM chunks | High |
| `tool.execute.before` | Tool input parameters | Per tool call |
| `tool.execute.after` | Tool output, errors, duration | Per tool call |
| `client.init` | Session metadata, model info | Session start |
| `client.close` | Session summary, exit code | Session end |
| `hook.error` | Plugin internal errors | Rare |

## Implementation Phases

### Phase 1: Core Types and Configuration

**Files**: `src/types.ts`, `src/config.ts`

Define all TypeScript interfaces and configuration schema with sensible defaults.

### Phase 2: Logger Engine

**File**: `src/logger.ts`

High-performance logger with:
- Non-blocking I/O using `fs.createWriteStream`
- Backpressure handling
- Buffered writes with periodic flush
- Synchronous flush on SIGINT/SIGTERM
- Crash safety

### Phase 3: Event Serializers

**File**: `src/serializers.ts`

Transform OpenCode events into consistent NDJSON schema with:
- Security sanitization (passwords, tokens, secrets)
- Performance truncation (massive outputs)
- Consistent timestamp formats

### Phase 4: Log Rotation

**File**: `src/rotator.ts`

Size-based and count-based rotation with:
- Automatic archival
- Old log cleanup
- Symlink to current log

### Phase 5: Plugin Integration

**File**: `src/index.ts`

Main plugin entry point registering all hooks and orchestrating components.

### Phase 6: Build and Installation

**Files**: `package.json`, `tsconfig.json`, `install.sh`

TypeScript compilation and installation automation.

## Configuration Schema

```typescript
interface LoggerConfig {
  // Output settings
  logDir: string;                    // Default: ".opencode/logs"
  filenamePattern: string;           // "agent-{YYYY-MM-DD}.ndjson"
  
  // Rotation settings
  rotation: {
    enabled: boolean;
    maxSizeMB: number;               // Rotate at 100MB
    maxFiles: number;                // Keep 10 files
    maxAgeDays: number;              // Delete after 30 days
  };
  
  // Filtering
  verbosity: "debug" | "info" | "warn" | "error";
  excludedEvents: string[];          // ["heartbeat", "token_usage"]
  
  // Formatting
  timestampFormat: "ISO" | "epoch" | "local";
  includeSessionContext: boolean;    // Inject session_id into every line
  
  // Performance
  buffering: {
    enabled: boolean;
    flushIntervalMs: number;         // 100ms
    highWatermarkBytes: number;      // 16KB
  };
}
```

## User Configuration

Add to user's `~/.config/opencode/opencode.json`:

```json
{
  "plugins": [
    "~/.config/opencode/plugin/agent-logger/dist/index.js"
  ],
  "agent-logger": {
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
}
```

## Success Metrics

| Metric | Target |
|--------|--------|
| Write throughput | >10,000 events/sec |
| Latency overhead | <1ms per log entry |
| Zero data loss | Handle crashes/SIGKILL gracefully |
| Disk usage | Automatic rotation keeps <1GB |
| JSON validity | 100% parseable output |

## Testing Strategy

1. Unit tests for each component
2. Integration test with actual OpenCode execution
3. Load testing for high-throughput scenarios
4. Verify NDJSON integrity
5. Test rotation under load

## Future Enhancements (Roadmap)

1. **Training Data Mode**: Output to OpenCode's fine-tuning format
2. **Real-time Streaming**: WebSocket server for external monitoring
3. **Log Analysis CLI**: SQL-like querying and replay capabilities
