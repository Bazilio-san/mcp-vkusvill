import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { TToolHandlerResponse } from 'fa-mcp-sdk';

/**
 * A self-contained tool module: its MCP declaration, its execution handler, and an optional
 * tool-specific prompt — all colocated in one file per tool.
 *
 * The handler should just do the work and return a formatted response. Business / upstream errors
 * (e.g. {@link VkusvillApiError}) should be thrown — the central dispatcher in handle-tool-call.ts
 * maps them to a tool-level error result.
 */
export interface IToolModule {
  /** MCP tool declaration (name, title, description, inputSchema). */
  definition: Tool;
  /** Optional instructions served via the built-in `tool_prompt` MCP prompt for this tool. */
  prompt?: string;
  /** Executes the tool with the validated arguments and an optional cancellation signal. */
  handler: (args: any, signal?: AbortSignal) => Promise<TToolHandlerResponse>;
}

/** JSON Schema dialect required by the implementation standard (draft 2020-12). */
export const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
