import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatProductShort, stripHtml } from '../lib/format.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';

import { IToolModule } from '../_types_/common';

/** get_product_details → upstream vkusvill_product_details. */

/** Unwrapped `data` payload returned by the upstream `vkusvill_product_details` tool. */
export interface IProductDetailsData {
  id: number;
  xml_id: number;
  name: string;
  slug: string;
  description?: string;
  brand?: string;
  price: {
    current: number;
    currency: string;
    old: number | null;
    discount_percent: number | null;
  };
  unit?: string;
  weight?: {
    value: number;
    unit: string;
  };
  rating?: {
    average: number;
    count: number;
  };
  url?: string;
  images?: Array<{
    small: string;
    medium: string;
    large: string;
  }>;
  /** Breadcrumb categories from most-specific to root. */
  category?: Array<{
    id: number;
    name: string;
    slug: string;
    url: string;
  }>;
  /** Composition, nutrition, allergens, shelf life, storage, manufacturer, etc. */
  properties?: Array<{
    name: string;
    value: string;
  }>;
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
  name: 'get_product_details',
  title: 'Product details',
  description: `Detailed information about a VkusVill product by its id (taken from search_products): 
composition, nutrition (calories, proteins, fats, carbs), allergens, shelf life, storage conditions, manufacturer, price and rating.`,
  inputSchema,
};

/** Detailed product view: short block + brand + composition / nutrition / storage properties. */
const formatProductDetails = (p: any): string => {
  if (!p || (p.id == null && p.name == null)) {
    return 'Product not found.';
  }
  const lines: string[] = [formatProductShort(p)];

  if (p.brand) {
    lines.push(`Brand: ${stripHtml(p.brand)}`);
  }
  if (p.category?.length) {
    const cats = p.category
      .map((c: any) => stripHtml(c.name))
      .filter(Boolean)
      .join(' / ');
    if (cats) {
      lines.push(`Category: ${cats}`);
    }
  }
  if (p.description) {
    lines.push(`\n**Description:**\n${stripHtml(p.description)}`);
  }
  for (const prop of p.properties || []) {
    const value = stripHtml(prop.value);
    if (value) {
      lines.push(`\n**${stripHtml(prop.name)}:**\n${value}`);
    }
  }
  return lines.join('\n');
};

export const getProductDetailsModule: IToolModule = {
  definition,
  handler: async (args, signal) => {
    const data = await getVkusvillClient().callTool<IProductDetailsData>(
      'vkusvill_product_details',
      { id: args?.product_id },
      signal,
    );
    return asTextContent(formatProductDetails(data));
  },
};
