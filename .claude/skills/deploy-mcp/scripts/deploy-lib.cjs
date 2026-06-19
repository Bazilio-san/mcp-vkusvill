'use strict';

/**
 * Общая библиотека для скриптов развёртывания MCP-сервера.
 *
 * Отвечает за:
 *  - чтение и проверку файла deploy.yaml из корня проекта;
 *  - вывод значений по умолчанию из package.json, .envrc и config/default.yaml;
 *  - формирование SSH-адреса репозитория из package.json → repository.url;
 *  - запуск команд на удалённом сервере по SSH.
 *
 * Запускается обычным `node` без сторонних зависимостей.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/* Корень проекта — на два уровня выше каталога scripts/ внутри скилла,
 * но фактически скрипты вызываются из корня проекта, поэтому берём cwd. */
const PROJECT_ROOT = process.cwd();

function fail(msg) {
  console.error(`\x1b[1;31m[deploy] ${msg}\x1b[0m`);
  process.exit(1);
}

function info(msg) {
  console.log(`\x1b[1;36m[deploy]\x1b[0m ${msg}`);
}

/* ----------------------------- Разбор YAML ----------------------------- */

/**
 * Минимальный разбор YAML под структуру deploy.yaml: вложенные карты с отступом
 * в 2 пробела и скалярными значениями. Списки не поддерживаются — в deploy.yaml их нет.
 */
function parseYaml(text) {
  const root = {};
  const stack = [{ indent: -1, node: root }];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, '  ');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].node;

    const m = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const rawVal = stripInlineComment(m[2]).trim();

    if (rawVal === '') {
      /* Нет значения в строке — это вложенная карта. Пустая строка в кавычках ('') —
       * это скалярное пустое значение и попадает в ветку else ниже. */
      const child = {};
      parent[key] = child;
      stack.push({ indent, node: child });
    } else {
      parent[key] = stripQuotes(rawVal);
    }
  }
  return root;
}

/* Удаляет хвостовой комментарий, начинающийся с пробела и решётки. */
function stripInlineComment(s) {
  const i = s.search(/\s#/);
  return i === -1 ? s : s.slice(0, i);
}

function stripQuotes(s) {
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === '\'' && s.endsWith('\'')))) {
    return s.slice(1, -1);
  }
  return s;
}

/* ----------------------- Значения по умолчанию ------------------------- */

function readPackageJson() {
  const p = path.join(PROJECT_ROOT, 'package.json');
  if (!fs.existsSync(p)) fail(`Не найден package.json в ${PROJECT_ROOT}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Преобразует https-адрес репозитория из package.json в SSH-адрес для клонирования.
 * Пример: git+https://github.com/Bazilio-san/mcp-vkusvill.git → git@github.com:Bazilio-san/mcp-vkusvill.git
 */
function deriveSshUrl(repositoryUrl) {
  if (!repositoryUrl) return '';
  let url = String(repositoryUrl).replace(/^git\+/, '').trim();
  if (url.startsWith('git@')) return url;
  const m = url.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) return '';
  const host = m[1];
  const repoPath = m[2].replace(/\/$/, '');
  return `git@${host}:${repoPath}.git`;
}

function detectNodeVersion() {
  const envrc = path.join(PROJECT_ROOT, '.envrc');
  if (fs.existsSync(envrc)) {
    const m = fs.readFileSync(envrc, 'utf8').match(/nvm\s+use\s+([0-9]+\.[0-9]+\.[0-9]+)/);
    if (m) return m[1];
  }
  return '';
}

function detectPort() {
  const cfg = path.join(PROJECT_ROOT, 'config', 'default.yaml');
  if (fs.existsSync(cfg)) {
    const text = fs.readFileSync(cfg, 'utf8');
    /* Ищем webServer: ... port: NNNN — берём первый порт после ключа webServer. */
    const m = text.match(/webServer:[\s\S]*?\n\s*port:\s*([0-9]{2,5})/);
    if (m) return m[1];
  }
  return '';
}

/* ----------------------------- Конфигурация ---------------------------- */

/**
 * Загружает deploy.yaml и дополняет его значениями по умолчанию.
 * Возвращает нормализованный объект конфигурации и проверяет обязательные поля.
 */
function loadConfig(explicitPath) {
  const file = explicitPath || path.join(PROJECT_ROOT, 'deploy.yaml');
  if (!fs.existsSync(file)) {
    fail(`Не найден файл ${file}. Скопируйте .claude/skills/deploy-mcp/deploy.example.yaml `
      + 'в корень проекта под именем deploy.yaml и заполните реквизиты.');
  }
  const cfg = parseYaml(fs.readFileSync(file, 'utf8'));
  const pkg = readPackageJson();

  cfg.ssh = cfg.ssh || {};
  cfg.paths = cfg.paths || {};
  cfg.git = cfg.git || {};
  cfg.node = cfg.node || {};
  cfg.service = cfg.service || {};
  cfg.domain = cfg.domain || {};
  cfg.deploy = cfg.deploy || {};

  /* Значения по умолчанию. */
  if (!cfg.service.name) cfg.service.name = pkg.name;
  if (!cfg.service.port) cfg.service.port = detectPort();
  if (!cfg.git.branch) cfg.git.branch = 'master';
  if (!cfg.git.sshUrl) cfg.git.sshUrl = deriveSshUrl(pkg.repository && pkg.repository.url);
  if (!cfg.node.version) cfg.node.version = detectNodeVersion();
  if (!cfg.paths.nodeProjectsDir && cfg.paths.projectDir) {
    cfg.paths.nodeProjectsDir = path.posix.dirname(cfg.paths.projectDir);
  }
  if (!cfg.paths.projectDir && cfg.paths.nodeProjectsDir) {
    cfg.paths.projectDir = path.posix.join(cfg.paths.nodeProjectsDir, cfg.service.name);
  }
  if (!cfg.domain.upstream && cfg.service.port) cfg.domain.upstream = `127.0.0.1:${cfg.service.port}`;

  /* Проверка обязательных полей. */
  const missing = [];
  if (!cfg.ssh.host) missing.push('ssh.host');
  if (!cfg.ssh.user) missing.push('ssh.user');
  if (!cfg.paths.projectDir) missing.push('paths.projectDir');
  if (!cfg.git.sshUrl) missing.push('git.sshUrl (не выведен из package.json → repository.url)');
  if (!cfg.node.version) missing.push('node.version (не найден в .envrc)');
  if (!cfg.service.port) missing.push('service.port (не найден в config/default.yaml)');
  if (missing.length) fail(`В deploy.yaml не хватает обязательных значений: ${missing.join(', ')}`);

  return cfg;
}

/* ------------------------------- SSH ----------------------------------- */

function sshArgs(cfg) {
  const args = [];
  if (cfg.ssh.key) args.push('-i', cfg.ssh.key);
  args.push('-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=20');
  args.push(`${cfg.ssh.user}@${cfg.ssh.host}`);
  return args;
}

/**
 * Выполняет bash-скрипт на сервере, передавая его через стандартный ввод (`bash -s`).
 * Это снимает проблему экранирования больших скриптов. Вывод транслируется в консоль.
 */
function runRemoteScript(cfg, script, opts = {}) {
  const args = sshArgs(cfg).concat(['bash -s']);
  const res = spawnSync('ssh', args, {
    input: script,
    stdio: ['pipe', opts.capture ? 'pipe' : 'inherit', opts.capture ? 'pipe' : 'inherit'],
    encoding: 'utf8',
  });
  if (res.error) fail(`Ошибка запуска ssh: ${res.error.message}`);
  if (!opts.allowFail && res.status !== 0) {
    if (opts.capture) {
      process.stderr.write(res.stdout || '');
      process.stderr.write(res.stderr || '');
    }
    fail(`Удалённый скрипт завершился с кодом ${res.status}`);
  }
  return res;
}

module.exports = {
  PROJECT_ROOT,
  fail,
  info,
  parseYaml,
  deriveSshUrl,
  loadConfig,
  sshArgs,
  runRemoteScript,
};
