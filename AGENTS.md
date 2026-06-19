# mcp-vkusvill

Guidance for AI agents working in this repository.

## What This Is

An MCP (Model Context Protocol) server built on the `fa-mcp-sdk` framework. It **proxies the official
VkusVill MCP API** (`https://mcp001.vkusvill.ru/mcp`) and reformats its raw JSON responses into
readable Markdown. Exposed over STDIO or HTTP/SSE transports.

The upstream is itself an MCP server (JSON-RPC 2.0 over Streamable HTTP, anonymous — no auth). This
server performs the MCP handshake with it, forwards `tools/call`, and formats the result.

## Tools

All 7 upstream tools are proxied (our tool → upstream tool):

| Our tool | Upstream tool | Purpose |
|----------|---------------|---------|
| `search_products` | `vkusvill_products_search` | Text search (price, rating, weight, id, xml_id, url) |
| `get_product_details` | `vkusvill_product_details` | Composition, КБЖУ, allergens, shelf life, manufacturer |
| `get_product_analogs` | `vkusvill_product_analogs` | Similar / replacement products |
| `get_discounts` | `vkusvill_products_discount` | Promo items with old→new price |
| `find_shops` | `vkusvill_shops` | Shops + filter reference (region/city/metro ids) |
| `search_recipes` | `vkusvill_recipes` | Recipes (ingredients, steps, nutrition) + filter reference |
| `create_cart_link` | `vkusvill_cart_link_create` | Build a shareable cart link from `{xml_id, quantity}` |

Tool-level upstream errors arrive as `{ok:false, error}`; they are surfaced to the LLM via
`asTextError` (not thrown as JSON-RPC errors).

## Architecture

```
src/
├── start.ts                  # Entry point — assembles McpServerData, calls initMcpServer()
├── _types_/
│   ├── common.d.ts           # IToolModule interface
│   └── custom-config.ts      # Custom AppConfig extensions
├── lib/
│   ├── vkusvill-client.ts    # MCP client to the upstream (handshake, retry, SSE/JSON parse, errors)
│   └── format.ts             # Markdown formatters for every payload type (the core value)
├── tools/
│   ├── tools.ts              # Registry + central dispatcher (handleToolCall)
│   ├── search-products.ts    # One file per tool: definition + handler + optional prompt (IToolModule)
│   ├── get-product-details.ts
│   ├── get-product-analogs.ts
│   ├── get-discounts.ts
│   ├── find-shops.ts
│   ├── search-recipes.ts
│   └── create-cart-link.ts
├── prompts/
│   ├── agent-brief.ts        # Short agent description
│   ├── agent-prompt.ts       # Full system prompt
│   └── tool-prompts.ts       # Aggregates per-tool prompts for the tool_prompt MCP prompt
└── api/router.ts             # REST endpoints (tsoa decorators) — health only

config/
├── default.yaml              # Base config (incl. accessPoints.vkusvillMcp — the upstream host)
├── development.yaml / production.yaml   # Env overrides
├── local.yaml                # Local secrets / dev overrides (gitignored)
└── custom-environment-variables.yaml    # Env var → config mapping

tests/mcp/                    # MCP tool tests (STDIO, HTTP, SSE) — test-cases.js is shared
```

### Conventions

- **One file per tool.** Each `src/tools/<tool>.ts` exports an `IToolModule` (definition + handler +
  optional prompt). `tools.ts` collects them into the `tools` array and dispatches `tools/call`.
- **All formatting lives in `src/lib/format.ts`.** Handlers call the upstream via the client, then a
  formatter. They write against the **real** API response shapes (objects for price/rating/weight,
  `properties[]` for product composition/nutrition, numeric `nutritional` for recipes).
- **ESM imports** from `fa-mcp-sdk` and local modules use `.js` extensions.
- **No `+` string concatenation** for multi-line strings — use template literals.

### Upstream connection

The upstream host is declared in `config/default.yaml` under `accessPoints.vkusvillMcp.host`
(`noConsul: true`). The client reads it via `appConfig.accessPoints.vkusvillMcp.host` and falls back
to the same URL if missing.

## Commands

```bash
yarn cb                    # clean dist/ + build (tsc)
yarn start                 # node dist/src/start.js (HTTP mode)
node dist/src/start.js stdio   # STDIO mode

yarn lint:fix              # oxlint --fix
yarn format:fix            # oxfmt
yarn typecheck             # tsc --noEmit

yarn test:mcp              # STDIO transport tests
yarn test:mcp-http         # HTTP transport tests
yarn test:mcp-sse          # SSE transport tests

yarn check-llm             # Validate OpenAI API key for Agent Tester
node scripts/kill-port.js <port>   # Force-stop the server (port from config/default.yaml → webServer.port)
```

## Config System

Priority: environment variables > `local.yaml` > `{NODE_ENV}.yaml` > `default.yaml`. Access via
`appConfig` from `fa-mcp-sdk`. Extend the type in `src/_types_/custom-config.ts`.

## Agent Tester

A built-in chat UI + headless API at `/agent-tester` drives the tools through an LLM (requires an
OpenAI-compatible key in `agentTester.openAi`). Run `yarn check-llm` before using it. Headless test
endpoint: `POST /agent-tester/api/chat/test`. Detailed SDK docs live in `FA-MCP-SDK-DOC/`.

## Formatting

MD lines ≤120 chars. Break at 120. Target 100-120. No short lines (60-80). Fill to ~120.
Exceptions: URLs, code blocks, tables — no wrap.

### Visual line breaks in lists and legends

When a sentence introduces a set of short parallel items (a legend, a status key, an enumeration of short clauses —
e.g. `Обозначения:`, `Стек:`), render each item on its own visual line instead of running them together on one line:

- Put the introducing phrase (`Обозначения:`) on its own line, ended with a hard break.
- Put each item on its own line, each ended with a Markdown hard break.
- Inside a bullet or paragraph, a labeled sub-clause (`**Осознанно отложено:** …`, `**Why:** …`, `**How to apply:** …`)
  starts on a new visual line: end the preceding line with a hard break so the label is not glued to the prior sentence.

The hard break is a trailing backslash `\` — use it as the default, because it is visible in the source and survives
editors that trim trailing whitespace. Two trailing spaces are an equivalent fallback. These hard-broken lines are
intentionally short and are **exempt** from the "fill to ~120 / no short lines" rule above. The ≤120-char soft wrap
still applies to the continuation lines of a long item.

## Strings (JS)

Never build a string with `+` concatenation. Whenever a string would overflow the 120-column limit and needs to span
several source lines, write it as a single multi-line template literal (backticks) instead of joining `'…' + '…' +`
fragments. Use `${expr}` interpolation rather than `'…' + value` to splice values in. Short single-line strings that
fit within 120 columns stay as plain quotes. For user-facing text where the exact spacing matters (no stray line
breaks), keep the wording on one logical line inside the backticks even if that line is long — the formatter leaves
template-literal contents untouched, which is exactly why they replace `+` wrapping.
