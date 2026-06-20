/**
 * Client for the official VkusVill MCP API (https://mcp001.vkusvill.ru/mcp).
 *
 * The upstream is itself an MCP server speaking JSON-RPC 2.0 over Streamable HTTP. This client
 * performs the MCP handshake (initialize → optional `mcp-session-id` → notifications/initialized),
 * then forwards `tools/call` requests. Responses may arrive either as plain JSON or as an SSE
 * (`text/event-stream`) body — both are parsed. The upstream wraps every tool payload as
 * `{ ok: boolean, data?: ..., error?: { code, message, http_status, retryable } }`; an `ok:false`
 * payload is surfaced as a typed {@link VkusvillApiError}.
 */

import chalk from 'chalk';

import { appConfig, logger as lgr } from 'fa-mcp-sdk';

const logger = lgr.getSubLogger({ name: chalk.bgGrey('vkusvill-client') });

const DEFAULT_HOST = 'https://mcp001.vkusvill.ru/mcp';
const REQUEST_TIMEOUT_MS = 25_000;

/** Tool-level error returned by the upstream as `{ ok:false, error:{...} }`. */
export class VkusvillApiError extends Error {
  code: string;
  httpStatus: number | undefined;
  retryable: boolean;

  constructor(message: string, code = 'upstream_error', httpStatus?: number, retryable = false) {
    super(message);
    this.name = 'VkusvillApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

interface IUpstreamEnvelope<T = any> {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; http_status?: number; retryable?: boolean };
}

/** Resolve the upstream base URL from the configured access point, falling back to the default. */
const resolveHost = (): string => {
  const ap = (appConfig as any)?.accessPoints?.vkusvillMcp;
  const host = ap?.host || ap?.url;
  return typeof host === 'string' && host.length > 0 ? host : DEFAULT_HOST;
};

/** Parse a Streamable-HTTP response body that may be JSON or an SSE event stream. */
const parseBody = (contentType: string, text: string): any => {
  if (contentType.includes('text/event-stream')) {
    const dataLines = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    // The final complete `data:` event holds the JSON-RPC message.
    for (const chunk of [...dataLines].reverse()) {
      try {
        return JSON.parse(chunk);
      } catch {
        // try the next candidate
      }
    }
    return { raw: text };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

export class VkusvillClient {
  private readonly mcpUrl: string;
  private sessionId: string | null = null;
  private nextId = 1;

  constructor(mcpUrl?: string) {
    this.mcpUrl = mcpUrl || resolveHost();
  }

  private baseHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }
    return headers;
  }

  /** POST a JSON-RPC message and return the parsed body. Captures `mcp-session-id` when present. */
  private async post(payload: Record<string, any>, signal?: AbortSignal): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    // Combine the caller's cancellation signal with our timeout.
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const response = await fetch(this.mcpUrl, {
        method: 'POST',
        headers: this.baseHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const sid = response.headers.get('mcp-session-id');
      if (sid) {
        this.sessionId = sid;
      }
      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      if (!response.ok) {
        throw new VkusvillApiError(
          `The VkusVill service returned HTTP ${response.status}`,
          'http_error',
          response.status,
          response.status >= 500,
        );
      }
      return parseBody(contentType, text);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /** Perform the MCP handshake with the upstream server. */
  private async initSession(signal?: AbortSignal): Promise<void> {
    await this.post(
      {
        jsonrpc: '2.0',
        id: this.nextId++,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'mcp-vkusvill-proxy', version: '1.0' },
        },
      },
      signal,
    );
    // Notify the server the client is ready. One-way message — no response expected.
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, signal);
  }

  /** Single `tools/call` round-trip. Throws on JSON-RPC error or `ok:false` envelope. */
  private async callOnce<T = any>(name: string, args: Record<string, any>, signal?: AbortSignal): Promise<T> {
    if (!this.sessionId) {
      await this.initSession(signal);
    }
    const body = await this.post(
      {
        jsonrpc: '2.0',
        id: this.nextId++,
        method: 'tools/call',
        params: { name, arguments: args },
      },
      signal,
    );

    if (body?.error) {
      const msg = body.error?.message || JSON.stringify(body.error);
      throw new VkusvillApiError(`MCP protocol error: ${msg}`, 'jsonrpc_error');
    }

    const result = body?.result ?? body;
    const content = result?.content;
    let payload: any = result;
    if (Array.isArray(content) && typeof content[0]?.text === 'string') {
      try {
        payload = JSON.parse(content[0].text);
      } catch {
        payload = { text: content[0].text };
      }
    }

    const envelope = payload as IUpstreamEnvelope;
    if (envelope && envelope.ok === false) {
      const err = envelope.error || {};
      throw new VkusvillApiError(
        err.message || 'The VkusVill service returned an error',
        err.code || 'upstream_error',
        err.http_status,
        Boolean(err.retryable),
      );
    }
    // Unwrap the standard envelope when present; otherwise return the raw payload.
    return envelope && envelope.ok === true ? envelope.data : payload;
  }

  /**
   * Call an upstream tool by name. Retries once on a transient failure, resetting the MCP session
   * first (mirrors the original Python client's retry-with-reset behaviour). Non-retryable
   * {@link VkusvillApiError}s (e.g. invalid input) propagate immediately without a retry.
   */
  async callTool<T = any>(name: string, args: Record<string, any>, signal?: AbortSignal): Promise<T> {
    try {
      return await this.callOnce<T>(name, args, signal);
    } catch (error) {
      if (error instanceof VkusvillApiError && !error.retryable) {
        throw error;
      }
      if (signal?.aborted) {
        throw error;
      }
      logger.warn(`Retrying call ${name} after error: ${(error as Error).message}`);
      this.sessionId = null;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return this.callOnce<T>(name, args, signal);
    }
  }
}

let singleton: VkusvillClient | null = null;

/** Shared client instance (keeps the MCP session warm across tool calls). */
export const getVkusvillClient = (): VkusvillClient => {
  if (!singleton) {
    singleton = new VkusvillClient();
  }
  return singleton;
};
