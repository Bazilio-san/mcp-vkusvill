import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatRecipesList } from '../lib/format.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';

import { IToolModule } from '../_types_/common';

/** search_recipes → upstream vkusvill_recipes. */

const inputSchema: IToolInputSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Поисковый запрос по рецептам, например «блины» (необязательно)',
      maxLength: 255,
    },
    page: {
      type: 'integer',
      description: 'Номер страницы (по 10 рецептов на странице, по умолчанию 1)',
      minimum: 1,
      maximum: 99999,
    },
    sort: {
      type: 'string',
      description: 'Сортировка: popularity — по популярности (по умолчанию), new — новинки',
      enum: ['popularity', 'new'],
    },
    feature_id: {
      type: 'integer',
      description: 'ID особенности рецепта (см. блок фильтров при page=1)',
      minimum: 0,
      maximum: 999999999,
    },
    cooking_time_id: { type: 'integer', description: 'ID времени готовки', minimum: 0, maximum: 999999999 },
    cooking_method_id: { type: 'integer', description: 'ID способа приготовления', minimum: 0, maximum: 999999999 },
    complexity_id: { type: 'integer', description: 'ID сложности', minimum: 0, maximum: 999999999 },
    category_id: { type: 'integer', description: 'ID категории', minimum: 0, maximum: 999999999 },
    exclude_allergens: {
      type: 'array',
      description: 'Массив ID аллергенов, которые нужно исключить (см. блок фильтров при page=1)',
      items: { type: 'integer', minimum: 1, maximum: 999999999 },
    },
  },
  required: [],
  additionalProperties: false,
};

const definition: Tool = {
  name: 'search_recipes',
  title: 'Поиск рецептов',
  description:
    'Поиск рецептов ВкусВилл по запросу и фильтрам. Возвращает ингредиенты, КБЖУ на 100 г, пошаговое приготовление, аллергены. ' +
    'Чтобы узнать id фильтров (время готовки, способ, сложность, аллергены), вызовите с page=1 — справочник придёт в блоке фильтров.',
  inputSchema,
};

export const searchRecipesModule: IToolModule = {
  definition,
  handler: async (args, signal) => {
    // Upstream marks every recipe param as required, so inject defaults for anything omitted.
    const data = await getVkusvillClient().callTool(
      'vkusvill_recipes',
      {
        q: String(args?.query ?? ''),
        page: args?.page ?? 1,
        sort: args?.sort ?? 'popularity',
        id_feature_filter: args?.feature_id ?? 0,
        id_cooking_time_filter: args?.cooking_time_id ?? 0,
        id_cooking_method_filter: args?.cooking_method_id ?? 0,
        id_complexity_filter: args?.complexity_id ?? 0,
        id_category_filter: args?.category_id ?? 0,
        id_exclude_allergens_filter: Array.isArray(args?.exclude_allergens) ? args.exclude_allergens : [],
      },
      signal,
    );
    return asTextContent(formatRecipesList(data));
  },
};
