# Upstream Proxy

This server is a thin proxy in front of the official VkusVill MCP API that reformats raw JSON into
readable Markdown — that formatting layer is the core value of the project.

## Overview

The upstream (`https://mcp001.vkusvill.ru/mcp`) is itself an MCP server: it speaks JSON-RPC 2.0 over
Streamable HTTP and requires no authentication. Each tool this server exposes maps one-to-one to an
upstream tool. The handler calls the upstream, then runs a formatter that turns the JSON payload into
Markdown an LLM can present directly.

## Tool mapping

| Our tool               | Upstream tool                | Purpose                                          |
|------------------------|------------------------------|--------------------------------------------------|
| `search_products`      | `vkusvill_products_search`   | Text search (price, rating, weight, id, xml_id). |
| `get_product_details`  | `vkusvill_product_details`   | Composition, КБЖУ, allergens, shelf life.        |
| `get_product_analogs`  | `vkusvill_product_analogs`   | Similar / replacement products.                  |
| `get_discounts`        | `vkusvill_products_discount` | Promo items with old → new price.                |
| `find_shops`           | `vkusvill_shops`             | Shops + filter reference (region/city/metro ids).|
| `search_recipes`       | `vkusvill_recipes`           | Recipes + filter reference.                       |
| `create_cart_link`     | `vkusvill_cart_link_create`  | Build a shareable cart link.                      |

## How it works

1. **Handshake.** On the first tool call the client (`src/lib/vkusvill-client.ts`) sends
   `initialize`, captures the `mcp-session-id` header if present, then sends
   `notifications/initialized`. The session is kept warm across calls.
2. **Transport parsing.** Responses may arrive as plain JSON or as an SSE (`text/event-stream`)
   body — both are parsed; the last complete `data:` event holds the JSON-RPC message.
3. **Envelope unwrap.** The upstream wraps payloads as
   `{ ok, data?, error?: { code, message, http_status, retryable } }`. An `ok:false` envelope
   becomes a typed `VkusvillApiError`.
4. **Retry.** A transient failure retries once after resetting the session (1 s back-off).
   Non-retryable errors (e.g. invalid input) propagate immediately.
5. **Formatting.** Handlers call a formatter in `src/lib/format.ts` that writes against the real API
   response shapes (objects for price/rating/weight, `properties[]` for composition/nutrition,
   numeric `nutritional` for recipes).

## Error handling

Tool-level upstream errors (`ok:false`, invalid id, business errors) are returned via `asTextError`,
so the LLM sees them in-conversation and can react. Only a genuinely unknown tool throws a JSON-RPC
protocol error. See the dispatcher in `src/tools/tools.ts`.

## Configuration

```yaml
accessPoints:
  vkusvillMcp:
    host: https://mcp001.vkusvill.ru/mcp
    noConsul: true
```

The client reads `appConfig.accessPoints.vkusvillMcp.host` and falls back to the same default URL if
it is missing. The per-request timeout is 25 seconds.

## Caveats

- The upstream is anonymous; do not add credentials to outbound calls.
- The session is in-process only and is reset automatically on a transient error.
