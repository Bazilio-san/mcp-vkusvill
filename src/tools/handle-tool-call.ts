import chalk from 'chalk';

import {
  asTextContent,
  asTextError,
  IToolHandlerParams,
  logger as lgr,
  ToolExecutionError,
  TToolHandlerResponse,
} from 'fa-mcp-sdk';

import {
  formatAnalogsList,
  formatCartLink,
  formatProductDetails,
  formatProductsList,
  formatRecipesList,
  formatShopsList,
} from '../lib/format.js';
import { getVkusvillClient, VkusvillApiError } from '../lib/vkusvill-client.js';

const logger = lgr.getSubLogger({ name: chalk.bgGrey('tools') });

/**
 * Routes MCP tool calls to the VkusVill upstream and formats the result.
 *
 * Tool-level upstream failures (invalid id, business errors) are returned as `asTextError` so the
 * LLM sees them in-conversation and can react. Only genuinely unknown tools throw a protocol error.
 */
export const handleToolCall = async (params: IToolHandlerParams): Promise<TToolHandlerResponse> => {
  const { name, arguments: args, signal } = params;
  logger.info(`Tool called: ${name}`);

  const client = getVkusvillClient();

  try {
    switch (name) {
      case 'search_products': {
        const data = await client.callTool(
          'vkusvill_products_search',
          {
            q: String(args?.query ?? ''),
            page: args?.page ?? 1,
            sort: args?.sort ?? 'popularity',
            vvonly: args?.vvonly ?? 1,
          },
          signal,
        );
        return asTextContent(formatProductsList(data, 'товаров'));
      }

      case 'get_product_details': {
        const data = await client.callTool('vkusvill_product_details', { id: args?.product_id }, signal);
        return asTextContent(formatProductDetails(data));
      }

      case 'get_product_analogs': {
        const data = await client.callTool('vkusvill_product_analogs', { id: args?.product_id }, signal);
        return asTextContent(formatAnalogsList(data));
      }

      case 'get_discounts': {
        const data = await client.callTool(
          'vkusvill_products_discount',
          {
            type: args?.discount_type ?? 'card',
            page: args?.page ?? 1,
            sort: args?.sort ?? 'popularity',
            vvonly: args?.vvonly ?? 1,
          },
          signal,
        );
        return asTextContent(formatProductsList(data, 'акционных товаров'));
      }

      case 'find_shops': {
        const data = await client.callTool(
          'vkusvill_shops',
          {
            page: args?.page ?? 1,
            id_region_filter: args?.region_id ?? 0,
            id_city_filter: args?.city_id ?? 0,
            id_subway_filter: args?.subway_id ?? 0,
            id_feature_filter: args?.feature_id ?? 0,
          },
          signal,
        );
        return asTextContent(formatShopsList(data));
      }

      case 'search_recipes': {
        // Upstream marks every recipe param as required, so inject defaults for anything omitted.
        const data = await client.callTool(
          'vkusvill_recipes',
          {
            q: String(args?.query ?? ''),
            page: args?.page ?? 1,
            sort: args?.sort ?? 'popularity',
            id_feature_filter: args?.feature_id ?? 0,
            id_cooking_time_filter: args?.cooking_time_id ?? 0,
            id_cooking_method_filter: args?.cooking_method_id ?? 0,
            id_complexity_filter: args?.complexity_id ?? 0,
            id_category_filter: args?.category_id ?? 0,
            id_exclude_allergens_filter: Array.isArray(args?.exclude_allergens) ? args.exclude_allergens : [],
          },
          signal,
        );
        return asTextContent(formatRecipesList(data));
      }

      case 'create_cart_link': {
        const items = Array.isArray(args?.items) ? args.items : [];
        const products = items.map((it: any) => ({
          xml_id: Number(it?.xml_id),
          q: it?.quantity != null ? Number(it.quantity) : 1,
        }));
        const data = await client.callTool('vkusvill_cart_link_create', { products }, signal);
        return asTextContent(formatCartLink(data));
      }

      default:
        throw new ToolExecutionError(name, `Unknown tool: ${name}`);
    }
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
