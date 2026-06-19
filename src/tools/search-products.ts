import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatProductsList } from '../lib/format.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';

import { IToolModule } from '../_types_/common';

/** search_products → upstream vkusvill_products_search. */

const inputSchema: IToolInputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Search query, e.g. "milk 3.2" or "yeast-free bread"' },
    page: {
      type: 'integer',
      description: 'Result page number (10 products per page, default 1)',
      minimum: 1,
      maximum: 99999,
    },
    sort: {
      type: 'string',
      description: `Sorting: popularity — by popularity (default), rating — by rating, price_asc — cheapest first, price_desc — most expensive first, new — newest`,
      enum: ['popularity', 'rating', 'price_asc', 'price_desc', 'new'],
    },
    vvonly: {
      type: 'integer',
      description: 'Search only VkusVill brand products: 1 — yes (default), 0 — all products',
      enum: [0, 1],
    },
  },
  required: ['query'],
  additionalProperties: false,
};

const definition: Tool = {
  name: 'search_products',
  title: 'VkusVill product search',
  description: `Search VkusVill products by a text query. 
Returns a list of products with price, rating, weight, link and identifiers (id, xml_id). 
10 products per page — increase page for further results.`,
  inputSchema,
};

const prompt = `The search_products tool searches VkusVill products by text.

- Pass the query in the required "query" field.
- In the response each product has an "id" (for get_product_details / get_product_analogs) and an "xml_id" (for create_cart_link).
- 10 products per page; increase "page" for further results.`;

export const searchProductsModule: IToolModule = {
  definition,
  prompt,
  handler: async (args, signal) => {
    const data = await getVkusvillClient().callTool(
      'vkusvill_products_search',
      {
        q: String(args?.query ?? ''),
        page: args?.page ?? 1,
        sort: args?.sort ?? 'popularity',
        vvonly: args?.vvonly ?? 1,
      },
      signal,
    );
    return asTextContent(formatProductsList(data, 'products'));
  },
};
