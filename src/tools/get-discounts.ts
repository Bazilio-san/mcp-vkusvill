import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatProductsList } from '../lib/format.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';

import { IToolModule } from '../_types_/common';

/** Pagination metadata returned alongside the discounted products list. */
export interface IDiscountsMeta {
  q: string | null;
  limit: number;
  total: number;
  page: number;
  pages: number;
  has_more: boolean;
}

/** Image URLs in three sizes for a single product. */
export interface IDiscountProductImage {
  small: string;
  medium: string;
  large: string;
}

/** Breadcrumb category entry attached to each product. */
export interface IDiscountProductCategory {
  id: number;
  name: string;
  slug: string;
  url: string;
}

/** Arbitrary product property (e.g. nutritional info, composition). Value may be absent. */
export interface IDiscountProductProperty {
  name: string;
  value: string | null;
}

/** Pricing block that carries both current and original price plus discount details. */
export interface IDiscountProductPrice {
  current: number;
  currency: string;
  old: number;
  discount_percent: number;
  /** Human-readable description of the discount condition, e.g. "Скидка по карте лояльности по 21.06". */
  discount_info: string;
}

/** Weight of the product. */
export interface IDiscountProductWeight {
  value: number;
  unit: string;
}

/** Aggregate customer rating. */
export interface IDiscountProductRating {
  average: number;
  count: number;
}

/** A single discounted product as returned by the upstream `vkusvill_products_discount` tool. */
export interface IDiscountProduct {
  id: number;
  xml_id: number;
  name: string;
  slug: string;
  description: string;
  price: IDiscountProductPrice;
  unit: string;
  weight: IDiscountProductWeight;
  rating: IDiscountProductRating;
  url: string;
  images: IDiscountProductImage[];
  category: IDiscountProductCategory[];
  properties: IDiscountProductProperty[];
}

/**
 * Unwrapped `data` payload returned by `callTool('vkusvill_products_discount', …)`.
 * Top-level fields: `meta` (pagination) and `items` (discounted products array).
 */
export interface IDiscountsData {
  meta: IDiscountsMeta;
  items: IDiscountProduct[];
}

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
    const data = await getVkusvillClient().callTool<IDiscountsData>(
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
