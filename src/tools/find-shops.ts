import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatShopsList } from '../lib/format.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';
import { IToolModule, JSON_SCHEMA_2020_12 } from './tool-module.js';

/** find_shops → upstream vkusvill_shops. */

const inputSchema: IToolInputSchema = {
  $schema: JSON_SCHEMA_2020_12,
  type: 'object',
  properties: {
    page: {
      type: 'integer',
      description: 'Номер страницы (по 10 магазинов на странице, по умолчанию 1)',
      minimum: 1,
      maximum: 99999,
    },
    region_id: {
      type: 'integer',
      description: 'ID региона для фильтра (список id возвращается в блоке фильтров при page=1)',
      minimum: 0,
      maximum: 999999999,
    },
    city_id: { type: 'integer', description: 'ID города для фильтра', minimum: 0, maximum: 999999999 },
    subway_id: { type: 'integer', description: 'ID станции метро для фильтра', minimum: 0, maximum: 999999999 },
    feature_id: {
      type: 'integer',
      description: 'ID особенности магазина (например, кафе, мясная витрина)',
      minimum: 0,
      maximum: 999999999,
    },
  },
  required: [],
  additionalProperties: false,
};

const definition: Tool = {
  name: 'find_shops',
  title: 'Поиск магазинов',
  description:
    'Поиск магазинов ВкусВилл: адрес, координаты, телефон, режим работы, особенности. Чтобы узнать доступные id регионов, ' +
    'городов и метро для фильтров, вызовите без фильтров (page=1) — справочник придёт в блоке фильтров.',
  inputSchema,
};

export const findShopsModule: IToolModule = {
  definition,
  handler: async (args, signal) => {
    const data = await getVkusvillClient().callTool(
      'vkusvill_shops',
      {
        page: args?.page ?? 1,
        id_region_filter: args?.region_id ?? 0,
        id_city_filter: args?.city_id ?? 0,
        id_subway_filter: args?.subway_id ?? 0,
        id_feature_filter: args?.feature_id ?? 0,
      },
      signal,
    );
    return asTextContent(formatShopsList(data));
  },
};
