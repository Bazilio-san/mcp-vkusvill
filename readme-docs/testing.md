# Testing

Two ways to exercise the MCP server end-to-end with a real LLM, plus protocol-level transport tests.

## Agent Tester UI

Open `http://localhost:9048/agent-tester` in a browser and chat naturally — each tool invocation is
shown with its arguments and raw JSON response. It is enabled by default (`agentTester.enabled: true`)
and, by default, is not behind auth (`agentTester.useAuth: false`).

It requires an OpenAI-compatible LLM key. Validate the key first:

```bash
npm run check-llm
```

Configuration under `agentTester.*`:

| Key                            | Description                                          |
|--------------------------------|------------------------------------------------------|
| `agentTester.enabled`          | Master on/off.                                       |
| `agentTester.useAuth`          | Require MCP-server auth to access the UI.            |
| `agentTester.toolCallTimeoutMs`| Per-tool-call timeout the tester waits (ms).         |
| `agentTester.openAi.apiKey`    | LLM API key (OpenAI-compatible).                     |
| `agentTester.openAi.baseURL`   | LLM endpoint (set for Azure / local models / proxies).|

## Headless Agent Tester API

Run tests without a browser. POST a message, get the agent's trace back as JSON.

```bash
curl -X POST http://localhost:9048/agent-tester/api/chat/test \
  -H "Content-Type: application/json" \
  -d '{"message": "Найди молоко 3.2 и собери корзину"}'
```

## MCP transport tests

The repository ships protocol tests for all three transports (shared cases in
`tests/mcp/test-cases.js`):

```bash
npm run test:mcp       # STDIO transport
npm run test:mcp-http  # HTTP transport
npm run test:mcp-sse   # SSE transport
```

Unit tests run with `npm test` (jest).
