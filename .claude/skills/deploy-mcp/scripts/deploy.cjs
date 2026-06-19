#!/usr/bin/env node
'use strict';

/**
 * deploy.cjs — развёртывание MCP-сервера на удалённый сервер по SSH.
 *
 * Все реквизиты берутся из deploy.yaml в корне проекта (см. deploy.example.yaml).
 * Скрипт идемпотентен: повторный запуск не ломает уже развёрнутый сервис.
 *
 * Шаги на сервере:
 *   1. Клонирование репозитория (SSH-адрес выводится из package.json).
 *   2. Создание .env и deploy/config.yml.
 *   3. direnv allow, выбор версии Node.js через nvm.
 *   4. Установка зависимостей и сборка (yarn install + yarn cb).
 *   5. Генерация секретов в config/local.yaml (только если файла ещё нет).
 *   6. Установка и запуск systemd-сервиса (deploy/srv.cjs).
 *   7. Настройка домена в Caddy (обратный прокси + автоматический TLS).
 *   8. Установка ежеминутного автообновления через cron (update.cjs).
 *
 * Использование:
 *   node .claude/skills/deploy-mcp/scripts/deploy.cjs [--config <path>] [--force-env] [--dry-run]
 */

const { randomUUID, randomBytes } = require('crypto');
const lib = require('./deploy-lib.cjs');

function shq(v) {
  return `'${String(v).replace(/'/g, `'\\''`)}'`;
}

function parseArgs(argv) {
  const a = { configPath: null, forceEnv: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--config': a.configPath = argv[++i]; break;
      case '--force-env': a.forceEnv = true; break;
      case '--dry-run': a.dryRun = true; break;
      default: lib.fail(`Неизвестный аргумент: ${argv[i]}`);
    }
  }
  return a;
}

function buildRemoteScript(cfg, args) {
  const encryptKey = randomUUID();
  const permToken = randomBytes(16).toString('hex');
  /* Базовый алиас для утилиты restart — первые буквы слов имени сервиса (mcp-vkusvill -> mv). */
  const aliasBase = String(cfg.service.name).split(/[-_]+/).filter(Boolean).map((w) => w[0]).join('');

  const header = [
    'set -euo pipefail',
    `PROJECT_DIR=${shq(cfg.paths.projectDir)}`,
    `NODE_DIR=${shq(cfg.paths.nodeProjectsDir)}`,
    `SSH_URL=${shq(cfg.git.sshUrl)}`,
    `BRANCH=${shq(cfg.git.branch)}`,
    `NODE_VERSION=${shq(cfg.node.version)}`,
    `SERVICE_NAME=${shq(cfg.service.name)}`,
    `PORT=${shq(cfg.service.port)}`,
    `DOMAIN=${shq(cfg.domain.name || '')}`,
    `UPSTREAM=${shq(cfg.domain.upstream || '')}`,
    `EMAIL=${shq(cfg.deploy.email || '')}`,
    `PERM_TOKEN=${shq(permToken)}`,
    `ENCRYPT_KEY=${shq(encryptKey)}`,
    `ALIAS_BASE=${shq(aliasBase)}`,
    `FORCE_ENV=${args.forceEnv ? '1' : '0'}`,
  ].join('\n');

  /* Тело — статический bash. Использует только $VAR (без ${...}), чтобы не сталкиваться
   * с интерполяцией шаблонных строк JavaScript. */
  const body = String.raw`
say() { printf '\033[1;36m[remote]\033[0m %s\n' "$1"; }

NODE_BIN="$HOME/.nvm/versions/node/v$NODE_VERSION/bin/node"

# --- 1. Клонирование репозитория ---
mkdir -p "$NODE_DIR"
if [ -d "$PROJECT_DIR/.git" ]; then
  say "репозиторий уже клонирован: $PROJECT_DIR"
else
  say "клонирую $SSH_URL -> $PROJECT_DIR"
  git clone "$SSH_URL" "$PROJECT_DIR"
fi
cd "$PROJECT_DIR"

# --- 2. Файлы окружения ---
if [ ! -f .env ] || [ "$FORCE_ENV" = "1" ]; then
  printf 'SERVICE_NAME=%s\nNODE_ENV=production\nDEBUG=config-info\n' "$SERVICE_NAME" > .env
  say "записан .env"
else
  say ".env уже существует (сохранён)"
fi
printf 'branch: %s\nemail: %s\n' "$BRANCH" "$EMAIL" > deploy/config.yml
say "записан deploy/config.yml"

# --- 3. Права на запуск и direnv ---
chmod +x deploy/srv.cjs update.cjs 2>/dev/null || true
if command -v direnv >/dev/null 2>&1; then direnv allow . 2>/dev/null || true; fi

# --- 4. Node.js через nvm, установка зависимостей и сборка ---
if [ -f .envrc ]; then set +u; source .envrc; set -u; fi
if [ ! -x "$NODE_BIN" ]; then NODE_BIN="$(command -v node)"; fi
say "Node.js: $NODE_BIN ($($NODE_BIN -v))"
say "установка зависимостей (yarn install --frozen-lockfile)"
yarn install --frozen-lockfile
say "сборка (yarn cb)"
yarn cb

# --- 5. Секреты config/local.yaml (только при отсутствии файла) ---
if [ ! -f config/local.yaml ]; then
  cat > config/local.yaml <<LOCALEOF
webServer:
  auth:
    permanentServerTokens:
      - $PERM_TOKEN
    jwtToken:
      encryptKey: $ENCRYPT_KEY
LOCALEOF
  say "сгенерирован config/local.yaml (encryptKey + permanentServerToken)"
else
  say "config/local.yaml уже существует (секреты сохранены)"
fi

# --- 6. systemd-сервис ---
"$NODE_BIN" deploy/srv.cjs install || true
systemctl restart "$SERVICE_NAME"
sleep 3
if [ "$(systemctl is-active "$SERVICE_NAME")" != "active" ]; then
  say "СЕРВИС НЕ ЗАПУСТИЛСЯ — последние строки журнала:"
  journalctl -o cat -u "$SERVICE_NAME" -n 25 --no-pager || true
  exit 1
fi
say "сервис $SERVICE_NAME активен, порт $PORT"

# --- 7. Домен в Caddy (если задан) ---
if [ -n "$DOMAIN" ] && [ -f /etc/caddy/Caddyfile ]; then
  if grep -q "$DOMAIN" /etc/caddy/Caddyfile; then
    say "домен $DOMAIN уже настроен в Caddy"
  else
    # Caddy работает под пользователем caddy и не может сам создать новый лог-файл —
    # создаём его заранее с нужным владельцем.
    install -o caddy -g caddy -m 0644 /dev/null "/opt/log/caddy/$DOMAIN.log" 2>/dev/null || true
    cat >> /etc/caddy/Caddyfile <<CADDYEOF

# $DOMAIN — $SERVICE_NAME
$DOMAIN {
	reverse_proxy $UPSTREAM {
		transport http {
			read_timeout 120s
			write_timeout 120s
		}
	}
	log {
		output file /opt/log/caddy/$DOMAIN.log
	}
}
CADDYEOF
    caddy validate --config /etc/caddy/Caddyfile
    systemctl reload caddy
    say "домен $DOMAIN добавлен в Caddy, сертификат выпустится автоматически"
  fi
else
  say "домен не задан или Caddy не установлен — публикация пропущена"
fi

# --- 8. Автообновление через cron ---
CRON_LINE="* * * * * $NODE_BIN $PROJECT_DIR/update.cjs >/dev/null 2>&1"
if crontab -l 2>/dev/null | grep -qF "$PROJECT_DIR/update.cjs"; then
  say "cron-задание автообновления уже установлено"
else
  ( crontab -l 2>/dev/null; echo "$CRON_LINE" ) | crontab -
  say "добавлено cron-задание автообновления (ежеминутно)"
fi

# --- 9. Алиас для утилиты restart ---
if command -v restart >/dev/null 2>&1; then
  if restart ls 2>/dev/null | grep -qE "\-> $SERVICE_NAME\$"; then
    say "алиас restart для $SERVICE_NAME уже зарегистрирован"
  else
    ALIAS="$ALIAS_BASE"; N=2
    while restart ls 2>/dev/null | grep -qE "^[[:space:]]*$ALIAS[[:space:]]*->"; do
      ALIAS="$ALIAS_BASE$N"; N=$((N + 1))
    done
    restart add "$ALIAS" "$SERVICE_NAME" >/dev/null 2>&1 || true
    say "зарегистрирован алиас restart: $ALIAS -> $SERVICE_NAME"
  fi
else
  say "утилита restart не найдена — шаг с алиасом пропущен"
fi

say "развёртывание завершено"
`;
  return `${header}\n${body}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = lib.loadConfig(args.configPath);

  lib.info(`Сервер:   ${cfg.ssh.user}@${cfg.ssh.host}`);
  lib.info(`Проект:   ${cfg.paths.projectDir}`);
  lib.info(`Репо:     ${cfg.git.sshUrl} (ветка ${cfg.git.branch})`);
  lib.info(`Сервис:   ${cfg.service.name}, порт ${cfg.service.port}, Node.js ${cfg.node.version}`);
  lib.info(`Домен:    ${cfg.domain.name || '(не задан)'} -> ${cfg.domain.upstream || '-'}`);

  const script = buildRemoteScript(cfg, args);
  if (args.dryRun) {
    console.log('\n----- remote script (--dry-run) -----\n');
    console.log(script);
    return;
  }
  lib.runRemoteScript(cfg, script);
  lib.info('Готово. Проверьте сервис: node .claude/skills/deploy-mcp/scripts/check-server.cjs');
}

main();
