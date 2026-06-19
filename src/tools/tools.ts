import { Tool } from '@modelcontextprotocol/sdk/types.js';
import chalk from 'chalk';

import { asTextError, IToolHandlerParams, logger as lgr, ToolExecutionError, TToolHandlerResponse } from 'fa-mcp-sdk';

import { IToolModule } from '../_types_/common';
import { VkusvillApiError } from '../lib/vkusvill-client.js';
import { createCartLinkModule } from './create-cart-link.js';
import { findShopsModule } from './find-shops.js';
import { getDiscountsModule } from './get-discounts.js';
import { getProductAnalogsModule } from './get-product-analogs.js';
import { getProductDetailsModule } from './get-product-details.js';
import { searchProductsModule } from './search-products.js';
import { searchRecipesModule } from './search-recipes.js';

/**
 * Tool registry + dispatcher.
 *
 * One module per tool (definition + handler + optional prompt colocated in src/tools/<tool>.ts).
 * This file collects them into the `tools` array passed to the server and routes incoming
 * `tools/call` requests to the matching handler.
 *
 * Each MCP tool wraps a tool of the official VkusVill MCP API (https://mcp001.vkusvill.ru/mcp) and
 * reformats its raw JSON into readable Markdown (see src/lib/format.ts).
 *
 * Mapping (our tool → upstream tool):
 *   search_products      → vkusvill_products_search
 *   get_product_details  → vkusvill_product_details
 *   get_product_analogs  → vkusvill_product_analogs
 *   get_discounts        → vkusvill_products_discount
 *   find_shops           → vkusvill_shops
 *   search_recipes       → vkusvill_recipes
 *   create_cart_link     → vkusvill_cart_link_create
 */
export const toolModules: IToolModule[] = [
  searchProductsModule,
  getProductDetailsModule,
  getProductAnalogsModule,
  getDiscountsModule,
  findShopsModule,
  searchRecipesModule,
  createCartLinkModule,
];

const moduleByName = new Map<string, IToolModule>(toolModules.map((m) => [m.definition.name, m]));

// MCP tool declarations passed to the server.
export const tools: Tool[] = toolModules.map((m) => m.definition);

// Lookup the full module (definition + handler + prompt) by tool name.
export const getToolModule = (name: string): IToolModule | undefined => moduleByName.get(name);

// Helper to get tool declaration by name
export const getToolByName = (name: string): Tool | undefined => moduleByName.get(name)?.definition;

// Helper to get all tool names
export const getToolNames = (): string[] => tools.map((tool) => tool.name);

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
      return asTextError(`The VkusVill service could not complete the request: ${error.message}`);
    }
    logger.error(`Tool execution failed for ${name}:`, error);
    error.printed = true;
    throw error;
  }
};
