import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatProductsList } from '../lib/format.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';
import { IToolModule, JSON_SCHEMA_2020_12 } from './tool-module.js';

/** get_discounts → upstream vkusvill_products_discount. */

const inputSchema: IToolInputSchema = {
  $schema: JSON_SCHEMA_2020_12,
  type: 'object',
  properties: {
    discount_type: {
      type: 'string',
      description: 'Тип скидки: card — по карте лояльности (по умолчанию), quantity — при покупке нескольких товаров',
      enum: ['card', 'quantity'],
    },
    page: {
      type: 'integer',
      description: 'Номер страницы (по 10 товаров на странице, по умолчанию 1)',
      minimum: 1,
      maximum: 99999,
    },
    sort: {
      type: 'string',
      description: 'Сортировка: popularity (по умолчанию), rating, price_asc, price_desc, new, name_asc, name_desc',
      enum: ['popularity', 'rating', 'price_asc', 'price_desc', 'new', 'name_asc', 'name_desc'],
    },
    vvonly: {
      type: 'integer',
      description: 'Только товары бренда ВкусВилл: 1 — да (по умолчанию), 0 — все',
      enum: [0, 1],
    },
  },
  required: [],
  additionalProperties: false,
};

const definition: Tool = {
  name: 'get_discounts',
  title: 'Акционные товары',
  description:
    'Список акционных товаров ВкусВилл со скидками. Тип скидки: card — по карте лояльности, quantity — при покупке нескольких ' +
    'товаров. Показывает старую и новую цену, размер и условия скидки.',
  inputSchema,
};

export const getDiscountsModule: IToolModule = {
  definition,
  handler: async (args, signal) => {
    const data = await getVkusvillClient().callTool(
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
  },
};
