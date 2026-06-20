import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatProductShort } from '../lib/format.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';

import { IToolModule } from '../_types_/common';

/** get_product_analogs → upstream vkusvill_product_analogs. */

/** Price breakdown for an analog product item. */
export interface IAnalogProductPrice {
  current: number;
  currency: string;
  old: number | null;
  discount_percent: number | null;
  discount_info: string | null;
}

/** Physical weight of an analog product item. */
export interface IAnalogProductWeight {
  value: number;
  unit: string;
}

/** Aggregate rating of an analog product item. */
export interface IAnalogProductRating {
  average: number;
  count: number;
}

/** One image set (three resolutions) for an analog product item. */
export interface IAnalogProductImage {
  small: string;
  medium: string;
  large: string;
}

/** A single category breadcrumb attached to an analog product item. */
export interface IAnalogProductCategory {
  id: number;
  name: string;
  slug: string;
  url: string;
}

/** One property entry (nutrition / composition) of an analog product item. */
export interface IAnalogProductProperty {
  name: string;
  value: string | null;
}

/** A single product item returned inside the analogs list. */
export interface IAnalogProduct {
  id: number;
  xml_id: number;
  name: string;
  slug: string;
  description: string;
  price: IAnalogProductPrice;
  unit: string;
  weight: IAnalogProductWeight;
  rating: IAnalogProductRating;
  url: string;
  images: IAnalogProductImage[];
  category: IAnalogProductCategory[];
  properties: IAnalogProductProperty[];
}

/**
 * Unwrapped `data` payload returned by the upstream `vkusvill_product_analogs` tool.
 * Top-level fields: `product_id` — queried product, `total` — total analog count,
 * `products` — the analog items array.
 */
export interface IProductAnalogsData {
  product_id: number;
  total: number;
  products: IAnalogProduct[];
}

const inputSchema: IToolInputSchema = {
  type: 'object',
  properties: {
    product_id: {
      type: 'integer',
      description: 'Numeric VkusVill product ID (the id field from search_products results)',
      minimum: 1,
      maximum: 999999999,
    },
  },
  required: ['product_id'],
  additionalProperties: false,
};

const definition: Tool = {
  name: 'get_product_analogs',
  title: 'Product analogs',
  description: `Similar products (analogs) for a VkusVill product by its id from search_products. 
Handy for replacement or comparison.`,
  inputSchema,
};

/** Analogs list: `{product_id,total,products[]}`. */
const formatAnalogsList = (data: any): string => {
  const items = data?.products || [];
  if (!items.length) {
    return 'No analogs found.';
  }
  const header = `Analogs for product ${data?.product_id ?? ''} — ${data?.total ?? items.length} found:`.trim();
  const blocks = items.map((p: any, i: number) => formatProductShort(p, i + 1));
  return [header, '', ...blocks].join('\n\n');
};

export const getProductAnalogsModule: IToolModule = {
  definition,
  handler: async (args, signal) => {
    const data = await getVkusvillClient().callTool<IProductAnalogsData>(
      'vkusvill_product_analogs',
      { id: args?.product_id },
      signal,
    );
    return asTextContent(formatAnalogsList(data));
  },
};
