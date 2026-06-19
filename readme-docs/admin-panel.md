# Admin Panel

Web UI at `/admin` for generating and inspecting tokens used to authenticate against this MCP server.

## Configuration

```yaml
adminPanel:
  enabled: true
  authType:
    - permanentServerTokens
    - jwtToken
```

`authType` accepts a single string or an array. When multiple types are set, the login page shows
tabs to choose between token and username/password authentication. The values `none` / null / empty
array open the panel without authentication — convenient for local development, never for production.

Credentials for `permanentServerTokens`, `basic`, and `jwtToken` come from the `webServer.auth`
section (see [Authentication](./authentication.md)).

## What you can do

- Generate a JWT for a given username, TTL, optional `request` scope, and IP allow-list.
- Inspect the decoded payload.
- Copy the generated token to the clipboard.

Tokens generated here are interchangeable with those produced by `node scripts/generate-jwt.js` and
the `/gen-jwt` skill.

## JWT claim requirement

When `authType` includes `jwtToken`, the panel accepts a JWT only if its payload contains
`allow: 'gen-token'`. This prevents tokens issued for other purposes from being replayed to mint new
long-lived tokens. Generate an admin-capable token with:

```bash
node scripts/generate-jwt.js -u admin -ttl 30d -p "allow=gen-token"
```
