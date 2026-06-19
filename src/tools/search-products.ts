import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatProductsList } from '../lib/format.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';
import { IToolModule, JSON_SCHEMA_2020_12 } from './tool-module.js';

/** search_products → upstream vkusvill_products_search. */

const inputSchema: IToolInputSchema = {
  $schema: JSON_SCHEMA_2020_12,
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Поисковый запрос, например «молоко 3.2» или «хлеб бездрожжевой»' },
    page: {
      type: 'integer',
      description: 'Номер страницы результатов (по 10 товаров на странице, по умолчанию 1)',
      minimum: 1,
      maximum: 99999,
    },
    sort: {
      type: 'string',
      description:
        'Сортировка: popularity — по популярности (по умолчанию), rating — по рейтингу, ' +
        'price_asc — дешевле сначала, price_desc — дороже сначала, new — новинки',
      enum: ['popularity', 'rating', 'price_asc', 'price_desc', 'new'],
    },
    vvonly: {
      type: 'integer',
      description: 'Искать только товары бренда ВкусВилл: 1 — да (по умолчанию), 0 — все товары',
      enum: [0, 1],
    },
  },
  required: ['query'],
  additionalProperties: false,
};

const definition: Tool = {
  name: 'search_products',
  title: 'Поиск товаров ВкусВилл',
  description:
    'Поиск товаров ВкусВилл по текстовому запросу. Возвращает список товаров с ценой, рейтингом, весом, ' +
    'ссылкой и идентификаторами (id, xml_id). По 10 товаров на странице — для следующих результатов увеличивайте page.',
  inputSchema,
};

const prompt = `Инструмент search_products ищет товары ВкусВилл по тексту.

- Запрос передавай в обязательное поле "query".
- В ответе у каждого товара есть "id" (для get_product_details / get_product_analogs) и "xml_id" (для create_cart_link).
- На странице 10 товаров; для следующих результатов увеличивай "page".`;

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
    return asTextContent(formatProductsList(data, 'товаров'));
  },
};
