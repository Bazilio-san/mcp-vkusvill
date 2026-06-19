# Configuration

Priority: environment variables > `config/local.yaml` > `config/{NODE_ENV}.yaml` > `config/default.yaml`.
Access values via `appConfig` from `fa-mcp-sdk`; extend the type in `src/_types_/custom-config.ts`.
Secrets and local overrides go into `config/local.yaml` (gitignored).

## Upstream access point

| Key                              | Description                       | Default                          |
|----------------------------------|-----------------------------------|----------------------------------|
| `accessPoints.vkusvillMcp.host`  | Upstream VkusVill MCP URL          | `https://mcp001.vkusvill.ru/mcp` |
| `accessPoints.vkusvillMcp.noConsul` | Resolve host directly, not via Consul | `true`                     |

## Web server

| Key                            | Description                          | Default      |
|--------------------------------|--------------------------------------|--------------|
| `webServer.host`               | Bind address                         | `127.0.0.1`  |
| `webServer.port`               | HTTP listen port                     | `9048`       |
| `webServer.originHosts`        | Hosts CORS skips                     | `[localhost, 0.0.0.0]` |
| `webServer.auth.enabled`       | Require MCP auth                     | `false`      |
| `webServer.auth.permanentServerTokens` | Static server-to-server tokens | `[]`     |
| `webServer.auth.jwtToken.mode` | JWT mode (`legacyAesCtr`/`embedded`/`localKey`/`remoteJwks`) | `legacyAesCtr` |
| `webServer.auth.jwtToken.encryptKey` | HS256 secret (legacyAesCtr)    | —            |
| `webServer.genJwtApiEnable`    | Expose `POST /gen-jwt`               | `false`      |
| `webServer.trustProxy`         | Trust `X-Forwarded-*` behind a proxy | `false`     |
| `webServer.metrics.enabled`    | Mount Prometheus `/metrics`          | `false`      |

## MCP

| Key                            | Description                                | Default  |
|--------------------------------|--------------------------------------------|----------|
| `mcp.transportType`            | Transport (`http` / `stdio`)               | `http`   |
| `mcp.tools.answerAs`           | Response format (`text`/`structuredContent`)| `text`  |
| `mcp.tools.validateInput`      | Validate `tools/call` args vs inputSchema  | `true`   |
| `mcp.limits.toolTimeoutMs`     | Per-tool execution timeout (ms)            | `30000`  |
| `mcp.limits.maxToolResultBytes`| Max serialized tool result (bytes)         | `10485760` |
| `mcp.rateLimit.maxRequests`    | Requests per `windowMs` per subject        | `100`    |
| `mcp.rateLimit.windowMs`       | Rate-limit window (ms)                      | `60000`  |

## Admin panel & Agent Tester

| Key                            | Description                                | Default  |
|--------------------------------|--------------------------------------------|----------|
| `adminPanel.enabled`           | Admin panel UI on/off                      | `true`   |
| `adminPanel.authType`          | Auth method(s) for `/admin`                | `[permanentServerTokens, jwtToken]` |
| `agentTester.enabled`          | Agent Tester UI on/off                     | `true`   |
| `agentTester.useAuth`          | Require MCP auth for the tester            | `false`  |
| `agentTester.openAi.apiKey`    | LLM API key (OpenAI-compatible)            | —        |
| `agentTester.openAi.baseURL`   | LLM endpoint override                      | —        |

## Other subsystems

| Key                            | Description                                | Default  |
|--------------------------------|--------------------------------------------|----------|
| `logger.level`                 | Log level (`silly`…`fatal`)                | `info`   |
| `cache.ttlSeconds`             | Default cache TTL (seconds)                | `300`    |
| `consul.service.enable`        | Register with Consul                       | `false`  |
| `swagger.servers`              | Servers listed in the Swagger UI           | (PROD)   |

For the full annotated reference, read `config/default.yaml` — every key carries inline documentation.
