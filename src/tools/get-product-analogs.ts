import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatProductShort } from '../lib/format.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';

import { IToolModule } from '../_types_/common';

/** get_product_analogs → upstream vkusvill_product_analogs. */

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
  name: 'get_product_analogs',
  title: 'Аналоги товара',
  description:
    'Похожие товары (аналоги) для товара ВкусВилл по его id из search_products. Удобно для замены или сравнения.',
  inputSchema,
};

/** Analogs list: `{product_id,total,products[]}`. */
const formatAnalogsList = (data: any): string => {
  const items = data?.products || [];
  if (!items.length) {
    return 'Аналоги не найдены.';
  }
  const header = `Аналоги товара ${data?.product_id ?? ''} — найдено ${data?.total ?? items.length}:`.trim();
  const blocks = items.map((p: any, i: number) => formatProductShort(p, i + 1));
  return [header, '', ...blocks].join('\n\n');
};

export const getProductAnalogsModule: IToolModule = {
  definition,
  handler: async (args, signal) => {
    const data = await getVkusvillClient().callTool('vkusvill_product_analogs', { id: args?.product_id }, signal);
    return asTextContent(formatAnalogsList(data));
  },
};
