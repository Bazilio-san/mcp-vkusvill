import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatProductsList } from '../lib/format.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';

import { IToolModule } from '../_types_/common';

/** get_discounts → upstream vkusvill_products_discount. */

const inputSchema: IToolInputSchema = {
  type: 'object',
  properties: {
    discount_type: {
      type: 'string',
      description: 'Discount type: card — loyalty card discount (default), quantity — when buying several items',
      enum: ['card', 'quantity'],
    },
    page: {
      type: 'integer',
      description: 'Page number (10 products per page, default 1)',
      minimum: 1,
      maximum: 99999,
    },
    sort: {
      type: 'string',
      description: 'Sorting: popularity (default), rating, price_asc, price_desc, new, name_asc, name_desc',
      enum: ['popularity', 'rating', 'price_asc', 'price_desc', 'new', 'name_asc', 'name_desc'],
    },
    vvonly: {
      type: 'integer',
      description: 'VkusVill brand products only: 1 — yes (default), 0 — all',
      enum: [0, 1],
    },
  },
  required: [],
  additionalProperties: false,
};

const definition: Tool = {
  name: 'get_discounts',
  title: 'Discounted products',
  description: `A list of discounted VkusVill products. 
Discount type: card — loyalty card discount, quantity — when buying several items. 
Shows the old and new price, the discount size and conditions.`,
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
    return asTextContent(formatProductsList(data, 'discounted products'));
  },
};
