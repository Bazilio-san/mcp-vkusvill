import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatProductDetails } from '../lib/format.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';

import { IToolModule } from '../_types_/common';

/** get_product_details → upstream vkusvill_product_details. */

const inputSchema: IToolInputSchema = {
  type: 'object',
  properties: {
    product_id: {
      type: 'integer',
      description: 'Числовой ID товара ВкусВилл (поле id из результатов search_products)',
      minimum: 1,
      maximum: 999999999,
    },
  },
  required: ['product_id'],
  additionalProperties: false,
};

const definition: Tool = {
  name: 'get_product_details',
  title: 'Детали товара',
  description:
    'Детальная информация о товаре ВкусВилл по его id (берётся из search_products): состав, КБЖУ (пищевая ценность), ' +
    'аллергены, срок годности, условия хранения, производитель, цена и рейтинг.',
  inputSchema,
};

export const getProductDetailsModule: IToolModule = {
  definition,
  handler: async (args, signal) => {
    const data = await getVkusvillClient().callTool('vkusvill_product_details', { id: args?.product_id }, signal);
    return asTextContent(formatProductDetails(data));
  },
};
