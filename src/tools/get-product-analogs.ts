import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatAnalogsList } from '../lib/format.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';
import { IToolModule, JSON_SCHEMA_2020_12 } from './tool-module.js';

/** get_product_analogs → upstream vkusvill_product_analogs. */

const inputSchema: IToolInputSchema = {
  $schema: JSON_SCHEMA_2020_12,
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
  name: 'get_product_analogs',
  title: 'Аналоги товара',
  description:
    'Похожие товары (аналоги) для товара ВкусВилл по его id из search_products. Удобно для замены или сравнения.',
  inputSchema,
};

export const getProductAnalogsModule: IToolModule = {
  definition,
  handler: async (args, signal) => {
    const data = await getVkusvillClient().callTool('vkusvill_product_analogs', { id: args?.product_id }, signal);
    return asTextContent(formatAnalogsList(data));
  },
};
