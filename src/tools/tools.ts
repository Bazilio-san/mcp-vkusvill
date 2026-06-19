import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { createCartLinkModule } from './create-cart-link.js';
import { findShopsModule } from './find-shops.js';
import { getDiscountsModule } from './get-discounts.js';
import { getProductAnalogsModule } from './get-product-analogs.js';
import { getProductDetailsModule } from './get-product-details.js';
import { searchProductsModule } from './search-products.js';
import { searchRecipesModule } from './search-recipes.js';
import { IToolModule } from './tool-module.js';

/**
 * Tool registry — one module per tool (definition + handler + optional prompt colocated).
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
