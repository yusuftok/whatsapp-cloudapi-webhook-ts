# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚀 Development Commands

### Core Development Workflow
```bash
# Development with hot reload and debug logging
npm run dev

# Build TypeScript to JavaScript
npm run build

# Production start (requires build first)
npm start
```

### Critical Port Management
```bash
# Safe port checking before starting server
lsof -i:3100

# Safe process termination (ONLY use this pattern)
lsof -ti:3100 | xargs kill -9

# Health checks
curl http://localhost:3100/healthz
curl http://localhost:3100/readyz
```

### ⚠️ CRITICAL SECURITY RULES
**NEVER use these dangerous commands:**
- `pkill -f "node"` or `pkill -f "node.*server.js"`
- `killall node`
- Any general pattern process killing

Always use port-specific killing: `lsof -ti:3100 | xargs kill -9`

## 🏗️ Architecture Overview

### WhatsApp Cloud API Webhook System
This is a TypeScript-based webhook server for WhatsApp Cloud API that implements a **finite state machine (FSM)** for conversational flows.

### Core Flow Architecture
The system manages a streamlined conversation flow where users:
1. Send media (image/video) → triggers workflow start
2. Share location → identify where the media was captured
3. Provide one or more descriptions via text or audio → capture contextual details
4. Confirm completion via interactive button → triggers processing and forwarding
5. (Optional) Send another media item mid-flow → user can choose to start a new workflow or continue the current one

### Key Components

**State Management (`src/state/session.ts`)**
- Session-based FSM with 3 states: idle, awaiting_location, awaiting_description
- TTL-based session storage (1 hour expiry)
- Per-user conversation state tracking with 2-minute inactivity cleanup

**Message Processing (`src/server.ts`)**
- Webhook signature verification with `APP_SECRET`
- Idempotency handling via TTL cache
- Message normalization for different WhatsApp message types
- Interactive button handling for user decisions
- Media download and forwarding capabilities

**Type System (`src/types/whatsapp.ts`)**
- Comprehensive WhatsApp webhook message types
- Normalized message format for internal processing
- Status update handling

**Utilities**
- `TTLCache` for webhook/idempotency tracking
- Structured logging with Pino (Turkish timezone, pretty formatting in dev)
- Graph API client with request/response interceptors

### Environment Configuration
Required variables:
- `WHATSAPP_ACCESS_TOKEN` - Graph API token
- `WHATSAPP_PHONE_NUMBER_ID` - Business phone number ID
- `VERIFY_TOKEN` - Webhook verification token
- `APP_SECRET` - Signature verification secret

Optional:
- `FORWARD_URL` - External system for job updates
- `FORWARD_AUTH_HEADER` - Authorization for forwarding
- `WHATSAPP_ENABLE_LOCATION_REQUEST` - Native location request support
- `LOG_LEVEL` - Logging verbosity (debug in dev)

### Interactive Message Patterns
- **Buttons**: Workflow branching and completion confirmations (max 3 buttons)  
- **Location requests**: Native WhatsApp location sharing when enabled

### External Integration
- Job updates forwarded to `FORWARD_URL` with retry logic (5 attempts, exponential backoff)
- Media handling via ephemeral URLs or base64 embedding
- Status update forwarding for delivery tracking

## 🔧 Development Notes

### TypeScript Configuration
- Strict mode enabled with `noUncheckedIndexedAccess`
- CommonJS modules targeting ES2022
- Source in `src/`, output in `dist/`

### Logging Strategy
- Development: Pretty console output + file logging (`debug.log`)
- Production: Structured JSON logging
- Comprehensive request/response logging for Graph API calls
- Security-conscious logging (masks tokens/auth headers)

### Media Processing
- Downloads media via Graph API ephemeral URLs
- Configurable size limits (`MEDIA_MAX_BYTES`)
- Base64 embedding option for small files
- Automatic cleanup and error handling

### Testing Endpoints
- `POST /send/text` - Direct message sending for testing
- `GET /healthz`, `GET /readyz` - Health checks
- `GET /whatsapp/webhook` - Webhook verification endpoint

## 🎯 Key Design Principles

1. **Stateful Conversations**: FSM-based approach for complex multi-step flows
2. **Idempotency**: Prevents duplicate processing of webhooks
3. **Security**: Signature verification and safe credential handling  
4. **Observability**: Comprehensive structured logging throughout
5. **Resilience**: Retry mechanisms and graceful error handling
6. **Modularity**: Clear separation of concerns across files
