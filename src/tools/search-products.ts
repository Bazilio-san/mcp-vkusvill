import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatProductsList } from '../lib/format.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';

import { IToolModule } from '../_types_/common';

/** search_products → upstream vkusvill_products_search. */

/** Pagination metadata returned alongside the product list. */
export interface ISearchProductsMeta {
  /** Original search query string echoed back by the upstream. */
  q: string;
  limit: number;
  total: number;
  page: number;
  pages: number;
  has_more: boolean;
}

export interface IProductImage {
  small?: string;
  medium?: string;
  large?: string;
}

export interface IProductCategory {
  id?: number;
  name?: string;
  slug?: string;
  url?: string;
}

/** Named attribute / nutritional fact attached to a product. */
export interface IProductProperty {
  name?: string;
  value?: string | number | null;
}

export interface IProductPrice {
  current?: number | null;
  currency?: string | null;
  old?: number | null;
  /** Percentage discount when a loyalty-card promo is active. */
  discount_percent?: number | null;
  /** Human-readable promo description, e.g. "Скидка по карте лояльности по 21.06". */
  discount_info?: string | null;
}

export interface IProductWeight {
  value?: number | null;
  unit?: string | null;
}

export interface IProductRating {
  average?: number | null;
  count?: number | null;
}

export interface IProduct {
  id?: number;
  /** Stable identifier used for cart link creation (xml_id field in create_cart_link). */
  xml_id?: number;
  name?: string;
  slug?: string;
  description?: string | null;
  price?: IProductPrice;
  /** Unit of sale, e.g. "шт". */
  unit?: string | null;
  weight?: IProductWeight;
  rating?: IProductRating;
  url?: string;
  images?: IProductImage[];
  category?: IProductCategory[];
  properties?: IProductProperty[];
}

/** Unwrapped `data` payload returned by the upstream `vkusvill_products_search` tool. */
export interface ISearchProductsData {
  meta?: ISearchProductsMeta;
  items?: IProduct[];
}

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
    const data = await getVkusvillClient().callTool<ISearchProductsData>(
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
