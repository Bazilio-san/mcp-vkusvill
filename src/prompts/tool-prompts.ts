import { TPromptContentFunction } from 'fa-mcp-sdk';

import { toolModules } from '../tools/tools.js';

/**
 * Tool-specific prompts served by the built-in `tool_prompt` prompt.
 *
 * The source of truth for each prompt lives in its own tool module (one file per tool). This
 * aggregator collects the non-empty ones and serves them by tool name, which is what the SDK's
 * `tool_prompt` prompt expects (the tool name arrives in the required `tool` argument).
 */
const TOOL_PROMPTS: Record<string, string> = Object.fromEntries(
  toolModules.filter((m) => m.prompt).map((m) => [m.definition.name, m.prompt as string]),
);

export const toolPrompt: TPromptContentFunction = (_request, args) => {
  const tool = args?.tool;
  if (!tool) {
    return '';
  }
  return TOOL_PROMPTS[tool] ?? '';
};
