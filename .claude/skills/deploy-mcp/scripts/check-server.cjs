#!/usr/bin/env node
'use strict';

/**
 * check-server.cjs — проверка состояния развёрнутого MCP-сервера.
 *
 * Реквизиты берутся из deploy.yaml (см. deploy.example.yaml). Скрипт по SSH проверяет:
 *   - активность systemd-сервиса;
 *   - прослушивание локального порта;
 *   - ответ на /health локально и по HTTPS через домен;
 *   - корректный ответ MCP на метод initialize;
 *   - наличие cron-задания автообновления.
 *
 * Использование: node .claude/skills/deploy-mcp/scripts/check-server.cjs [--config <path>]
 */

const lib = require('./deploy-lib.cjs');

function shq(v) {
  return `'${String(v).replace(/'/g, `'\\''`)}'`;
}

function buildScript(cfg) {
  const header = [
    'set -uo pipefail',
    `PROJECT_DIR=${shq(cfg.paths.projectDir)}`,
    `SERVICE_NAME=${shq(cfg.service.name)}`,
    `PORT=${shq(cfg.service.port)}`,
    `DOMAIN=${shq(cfg.domain.name || '')}`,
  ].join('\n');

  const body = String.raw`
echo "=== сервис ==="
systemctl is-active "$SERVICE_NAME"

echo "=== прослушивание порта $PORT ==="
ss -ltnp 2>/dev/null | grep ":$PORT" || echo "порт не слушается"

echo "=== локальный /health ==="
curl -s -m 8 -o /dev/null -w "http=%{http_code}\n" "http://127.0.0.1:$PORT/health"

if [ -n "$DOMAIN" ]; then
  echo "=== HTTPS /health ($DOMAIN) ==="
  curl -s -m 15 -o /dev/null -w "http=%{http_code}\n" "https://$DOMAIN/health"

  echo "=== MCP initialize (HTTPS) ==="
  curl -s -m 15 -X POST "https://$DOMAIN/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"check","version":"1"}}}' \
    | grep -o '"serverInfo":{[^}]*}' || echo "MCP не ответил"
fi

echo "=== cron автообновления ==="
crontab -l 2>/dev/null | grep -F "$PROJECT_DIR/update.cjs" || echo "cron-задание не найдено"
`;
  return `${header}\n${body}`;
}

function main() {
  const idx = process.argv.indexOf('--config');
  const cfg = lib.loadConfig(idx === -1 ? null : process.argv[idx + 1]);
  lib.info(`Проверка ${cfg.service.name} на ${cfg.ssh.user}@${cfg.ssh.host}`);
  lib.runRemoteScript(cfg, buildScript(cfg), { allowFail: true });
}

main();
