import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { getVkusvillClient } from '../lib/vkusvill-client.js';

import { IToolModule } from '../_types_/common';

/** create_cart_link → upstream vkusvill_cart_link_create. */

const inputSchema: IToolInputSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'Cart items (1 to 30 entries)',
      minItems: 1,
      maxItems: 30,
      items: {
        type: 'object',
        properties: {
          xml_id: {
            type: 'integer',
            description: 'Product XML ID (the xml_id field from search results)',
            minimum: 1,
            maximum: 999999999,
          },
          quantity: {
            type: 'number',
            description: 'Quantity (0.01 to 40, default 1)',
            minimum: 0.01,
            maximum: 40,
          },
        },
        required: ['xml_id'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

const definition: Tool = {
  name: 'create_cart_link',
  title: 'Create cart link',
  description: `Creates a VkusVill cart link with the selected products. 
Takes an items array with the product xml_id (from search_products) and a quantity. 
Returns a link that adds the products to the cart in a single click.`,
  inputSchema,
};

const prompt = `The create_cart_link tool builds a VkusVill cart link.

- Pass an "items" array; each product needs an "xml_id" (taken from search_products) and a "quantity".
- First find the products via search_products to get their xml_id — do not guess the identifiers.`;

const formatCartLink = (data: { link?: string } | undefined): string => {
  const link = data?.link;
  if (!link) {
    return 'Failed to create the cart link.';
  }
  return `VkusVill cart link:\n${link}\n\nFollow the link to add the products to your cart and place the order.`;
};

export const createCartLinkModule: IToolModule = {
  definition,
  prompt,
  handler: async (args, signal) => {
    const items = Array.isArray(args?.items) ? args.items : [];
    const products = items.map((it: any) => ({
      xml_id: Number(it?.xml_id),
      q: it?.quantity != null ? Number(it.quantity) : 1,
    }));
    const data = await getVkusvillClient().callTool('vkusvill_cart_link_create', { products }, signal);
    return asTextContent(formatCartLink(data));
  },
};
