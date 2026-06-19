import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatCartLink } from '../lib/format.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';
import { IToolModule, JSON_SCHEMA_2020_12 } from './tool-module.js';

/** create_cart_link → upstream vkusvill_cart_link_create. */

const inputSchema: IToolInputSchema = {
  $schema: JSON_SCHEMA_2020_12,
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'Товары для корзины (от 1 до 30 позиций)',
      minItems: 1,
      maxItems: 30,
      items: {
        type: 'object',
        properties: {
          xml_id: {
            type: 'integer',
            description: 'XML ID товара (поле xml_id из результатов поиска)',
            minimum: 1,
            maximum: 999999999,
          },
          quantity: {
            type: 'number',
            description: 'Количество (от 0.01 до 40, по умолчанию 1)',
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
  title: 'Создать ссылку на корзину',
  description:
    'Создаёт ссылку на корзину ВкусВилл с выбранными товарами. На вход — массив items с xml_id товара (из search_products) ' +
    'и количеством. Возвращает ссылку, по которой товары добавляются в корзину одним переходом.',
  inputSchema,
};

const prompt = `Инструмент create_cart_link собирает ссылку на корзину ВкусВилл.

- Передай массив "items"; для каждого товара нужен "xml_id" (берётся из search_products) и "quantity".
- Сначала найди товары через search_products, чтобы получить их xml_id — не угадывай идентификаторы.`;

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
