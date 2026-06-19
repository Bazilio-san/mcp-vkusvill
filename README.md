# MCP VKUSVILL

MCP server for VkusVill. It proxies the official VkusVill MCP API and reformats its raw JSON into
readable Markdown, letting AI agents search products, look up composition and nutrition, find shops,
browse recipes, and build shareable cart links.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Server-DA7857)](https://modelcontextprotocol.io/)
[![fa-mcp-sdk](https://img.shields.io/badge/built%20with-fa--mcp--sdk-526CFE)](https://github.com/Bazilio-san/fa-mcp-sdk)

## Quick Links

- [Tools](#tools-7)
- [Quick Start](#quick-start)
- [MCP Client Integration](#mcp-client-integration)
- [Key Features](#key-features)
- [Configuration](#configuration-basics)
- [Build & Run](#build--run)
- [Authentication](#authentication)
- [Admin Panel](#admin-panel)
- [Agent Tester](#agent-tester)
- [Claude Code Skills](#claude-code-skills)

## Overview

This server sits between an AI agent and the official VkusVill MCP API
(`https://mcp001.vkusvill.ru/mcp`). The upstream is itself an MCP server (JSON-RPC 2.0 over
Streamable HTTP, anonymous — no credentials). This proxy performs the MCP handshake with it,
forwards `tools/call` requests, and converts the raw JSON responses into Markdown that is easy for
an LLM to read and present. It exposes 7 tools over HTTP/SSE or STDIO. Use it when you want VkusVill
grocery data inside an MCP-capable assistant.

## Tools (7)

All tools wrap one upstream VkusVill tool each and return formatted Markdown. Tool-level upstream
failures are surfaced to the LLM in-conversation (not thrown as protocol errors).

### Products

| Tool                   | Description                                                            |
|------------------------|-----------------------------------------------------------------------|
| `search_products`      | Text search for products (price, rating, weight, id, xml_id, url).    |
| `get_product_details`  | Composition, КБЖУ (nutrition), allergens, shelf life, manufacturer.   |
| `get_product_analogs`  | Similar / replacement products for a given product id.                |
| `get_discounts`        | Promo items with old → new price.                                     |

### Shops

| Tool          | Description                                                                      |
|---------------|---------------------------------------------------------------------------------|
| `find_shops`  | Shops (address, hours, phone, features) plus region/city/metro filter reference. |

### Recipes

| Tool             | Description                                                            |
|------------------|-----------------------------------------------------------------------|
| `search_recipes` | Recipes (ingredients, steps, nutrition) plus filter reference.        |

### Cart

| Tool                | Description                                                  |
|---------------------|-------------------------------------------------------------|
| `create_cart_link`  | Build a shareable cart link from `{xml_id, quantity}` items. |

Project-specific details on the proxy and formatting: [Upstream Proxy](./readme-docs/upstream-proxy.md).

## Quick Start

```bash
npm install
npm run build
npm start                       # HTTP mode, port 9048
```

For STDIO mode (Claude Desktop direct spawn):

```bash
node dist/src/start.js stdio
```

Verify the HTTP server is up:

```bash
curl http://localhost:9048/health
```

No configuration is required to talk to the upstream — it is anonymous. A `config/local.yaml`
(gitignored) is only needed when you enable MCP-server authentication or the Agent Tester LLM.

## MCP Client Integration

By default the MCP server's own authentication is **off** (`webServer.auth.enabled: false`), so no
auth header is needed. If you enable it, pass a JWT via the standard `Authorization: Bearer` header
(generate one with the `/gen-jwt` skill or `node scripts/generate-jwt.js`).

### Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "mcp-vkusvill": {
      "type": "http",
      "url": "http[s]://<host[:port]>/mcp"
    }
  }
}
```

When server auth is enabled, add a header:

```json
"headers": {
  "Authorization": "Bearer <jwt-token>"
}
```

### Claude Desktop

Add to `claude_desktop_config.json`.

**Option 1 — STDIO (local build, direct spawn):**

```json
{
  "mcpServers": {
    "mcp-vkusvill": {
      "command": "node",
      "args": ["<path>/mcp-vkusvill/dist/src/start.js", "stdio"],
      "env": {}
    }
  }
}
```

**Option 2 — HTTP (remote server via `mcp-remote`):**

```json
{
  "mcpServers": {
    "mcp-vkusvill": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "http[s]://<host[:port]>/mcp",
        "--allow-http",
        "--transport",
        "http-only"
      ]
    }
  }
}
```

### Qwen Code

Add to `~/.qwen/settings.json`:

```json
{
  "mcpServers": {
    "mcp-vkusvill": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "http[s]://<host[:port]>/mcp",
        "--allow-http",
        "--transport",
        "http-only"
      ]
    }
  }
}
```

### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.mcp-vkusvill]
url = "http[s]://<host[:port]>/mcp"
```

When server auth is enabled and you connect via `mcp-remote`, add
`--header "Authorization:Bearer <jwt-token>"` to the args — with **no space** after the `:`.

## Key Features

- **VkusVill MCP proxy** — performs the upstream MCP handshake, forwards `tools/call`, retries once on
  transient failures with session reset.
- **Markdown formatting** — every payload (products, nutrition, shops, recipes, cart) is rendered as
  readable Markdown in `src/lib/format.ts`.
- **Graceful tool errors** — upstream business errors reach the LLM as in-conversation text, not as
  protocol crashes.
- **Dual transport** — HTTP/SSE for web integrations, STDIO for direct Claude Desktop spawn.
- **Admin Panel** (`/admin`) — JWT / permanent-token generation and inspection UI.
- **Agent Tester** (`/agent-tester`) — built-in chat UI and headless API to drive the tools via an LLM.
- **MCP prompts & resources** — `agent_brief`, `agent_prompt`, and `tool_prompt` ship with the server.

## Transports

- **HTTP** — web integrations. Endpoints:
  - `/mcp` — MCP protocol (JSON-RPC 2.0)
  - `/health` — health check
  - `/docs` — Swagger UI (REST, tsoa-generated)
  - `/admin` — token generator UI
  - `/agent-tester` — Agent Tester web UI
  - `/` — home page with server status
- **STDIO** — for Claude Desktop direct spawn (no network).

Port is set in `config/default.yaml` → `webServer.port` (default `9048`).

## Configuration Basics

Priority: environment variables > `config/local.yaml` > `config/{NODE_ENV}.yaml` > `config/default.yaml`.

| Key                             | Description                                    | Default                          |
|---------------------------------|------------------------------------------------|----------------------------------|
| `accessPoints.vkusvillMcp.host` | Upstream VkusVill MCP URL                       | `https://mcp001.vkusvill.ru/mcp` |
| `webServer.port`                | HTTP server port                               | `9048`                           |
| `webServer.host`                | Bind address                                   | `127.0.0.1`                      |
| `webServer.auth.enabled`        | MCP server authorization on/off                | `false`                          |
| `mcp.transportType`             | Transport (`http` / `stdio`)                   | `http`                           |
| `mcp.tools.answerAs`            | Response format (`text` / `structuredContent`) | `text`                           |
| `adminPanel.enabled`            | Admin panel UI on/off                          | `true`                           |
| `agentTester.enabled`           | Agent Tester UI on/off                         | `true`                           |

Full reference: [Configuration](./readme-docs/configuration.md).

## Build & Run

```bash
npm run build        # tsc
npm start            # HTTP server
node dist/src/start.js stdio   # STDIO mode
```

Quality and tests:

```bash
npm run lint:fix       # oxlint --fix
npm run format:fix     # oxfmt
npm run typecheck      # tsc --noEmit
npm run test:mcp       # STDIO transport tests
npm run test:mcp-http  # HTTP transport tests
npm run test:mcp-sse   # SSE transport tests
```

Environment variables:

- `NODE_ENV` — picks the `config/{NODE_ENV}.yaml` overlay.

## Authentication

The upstream VkusVill API is anonymous, so the proxy needs no credentials to fetch data. The
**server's own** authentication (who may call this MCP server) is configured under `webServer.auth`
and is **disabled by default**. When enabled it supports permanent server tokens, JWT (Bearer), and
Basic. Tokens are minted via the Admin Panel, the `/gen-jwt` skill, or `node scripts/generate-jwt.js`.

Methods, JWT modes, and the admin-panel JWT claim requirement: [Authentication](./readme-docs/authentication.md).

## Admin Panel

A web UI at `/admin` generates and inspects tokens. It is enabled by default with
`authType: [permanentServerTokens, jwtToken]`. When JWT auth is used, the panel only accepts a JWT
whose payload contains `allow: 'gen-token'`. Setup and usage: [Admin Panel](./readme-docs/admin-panel.md).

## Agent Tester

A built-in chat UI at `/agent-tester` and a headless API at `/agent-tester/api/chat/test` drive the
tools through an LLM. Requires an OpenAI-compatible key in `agentTester.openAi`; run `npm run check-llm`
to validate the key first. Full guide: [Testing](./readme-docs/testing.md).

## Claude Code Skills

The project ships with custom skills in `.claude/skills/`:

| Command                     | Description                                                             |
|-----------------------------|-------------------------------------------------------------------------|
| `/gen-jwt`                  | Generate JWT tokens for MCP server authentication.                      |
| `/upgrade-sdk`              | Upgrade the `fa-mcp-sdk` dependency end-to-end (analyze, plan, apply).  |
| `/change-log`               | Generate a Keep a Changelog entry between versions.                     |
| `/feature-prompt-generator` | Turn a feature description into a self-sufficient prompt for an AI CLI. |
| `/readme-generator`         | Generate structured `README.md` + satellite `readme-docs/*.md`.        |
| `/mcp-app-create`           | Scaffold a new MCP App (interactive UI: tool + HTML resource).         |
| `/mcp-app-add-to-server`    | Enrich existing MCP server tools with interactive UIs.                  |
| `/create-mcp-wizard`        | End-to-end MCP server implementation from brief to live repo.          |

Details, launch modes, and examples: [SKILLS](./readme-docs/SKILLS.md).

The skills can also be shared with [OpenAI Codex](https://developers.openai.com/codex/) via
`.agents/skills/`. Run `npm run agents:link` once to create the link
(`npm run agents:link:status` / `npm run agents:link:remove` to inspect or undo it).

## Stack

- **Framework**: [fa-mcp-sdk](https://github.com/Bazilio-san/fa-mcp-sdk)
- **Transport**: MCP (STDIO, HTTP, SSE)
- **Language**: TypeScript (ESM, Node ≥ 20)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Tooling**: oxlint, oxfmt, jest

## License

MIT © Viacheslav Makarov. See [LICENSE](./LICENSE).
