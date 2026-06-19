import chalk from 'chalk';

import { asTextError, IToolHandlerParams, logger as lgr, ToolExecutionError, TToolHandlerResponse } from 'fa-mcp-sdk';

import { VkusvillApiError } from '../lib/vkusvill-client.js';
import { getToolModule } from './tools.js';

const logger = lgr.getSubLogger({ name: chalk.bgGrey('tools') });

/**
 * Central MCP tool dispatcher. Looks up the per-tool module in the registry and runs its handler.
 *
 * Tool-level upstream failures (invalid id, business errors) are returned as `asTextError` so the
 * LLM sees them in-conversation and can react. Only genuinely unknown tools throw a protocol error.
 */
export const handleToolCall = async (params: IToolHandlerParams): Promise<TToolHandlerResponse> => {
  const { name, arguments: args, signal } = params;
  logger.info(`Tool called: ${name}`);

  const module = getToolModule(name);
  if (!module) {
    throw new ToolExecutionError(name, `Unknown tool: ${name}`);
  }

  try {
    return await module.handler(args, signal);
  } catch (error: Error | any) {
    // Business / upstream errors → surface to the LLM as a tool-level error, do not throw.
    if (error instanceof VkusvillApiError) {
      logger.warn(`Upstream error for ${name}: ${error.message}`);
      return asTextError(`Сервис ВкусВилл не смог выполнить запрос: ${error.message}`);
    }
    logger.error(`Tool execution failed for ${name}:`, error);
    error.printed = true;
    throw error;
  }
};
