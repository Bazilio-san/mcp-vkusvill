import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatFilters, formatListMeta, num, stripHtml } from '../lib/format.js';
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
  description: `Поиск рецептов ВкусВилл по запросу и фильтрам. Возвращает ингредиенты, КБЖУ на 100 г, пошаговое приготовление, аллергены. Чтобы узнать id фильтров (время готовки, способ, сложность, аллергены), вызовите с page=1 — справочник придёт в блоке фильтров.`,
  inputSchema,
};

interface IRecipe {
  id?: number;
  name?: string;
  description?: string;
  complexity?: { name?: string } | null;
  portions?: number | null;
  cooking_time?: { name?: string } | null;
  url?: string;
  image?: string;
  ingredients?: Array<{ name?: string; quantity?: string | null }> | null;
  steps?: Array<{ step_number?: number; text?: string }> | null;
  nutritional?: { calories?: number; proteins?: number; fats?: number; carbs?: number } | null;
  allergens?: Array<{ name?: string }> | null;
}

const formatRecipe = (r: IRecipe, index?: number): string => {
  const lines: string[] = [index != null ? `### ${index}. ${stripHtml(r.name)}` : `### ${stripHtml(r.name)}`];

  const meta: string[] = [];
  if (r.complexity?.name) {
    meta.push(`сложность: ${stripHtml(r.complexity.name)}`);
  }
  if (r.cooking_time?.name) {
    meta.push(`время: ${stripHtml(r.cooking_time.name)}`);
  }
  if (r.portions != null) {
    meta.push(`порций: ${r.portions}`);
  }
  if (meta.length) {
    lines.push(meta.join(', '));
  }
  if (r.description) {
    lines.push(stripHtml(r.description));
  }
  if (r.nutritional && r.nutritional.calories != null) {
    const n = r.nutritional;
    lines.push(
      `КБЖУ на 100 г: ${num(n.calories)} ккал, белки ${num(n.proteins)} г, жиры ${num(n.fats)} г, углеводы ${num(n.carbs)} г`,
    );
  }
  if (r.allergens?.length) {
    const a = r.allergens
      .map((x) => stripHtml(x.name))
      .filter(Boolean)
      .join(', ');
    if (a) {
      lines.push(`Аллергены: ${a}`);
    }
  }
  if (r.ingredients?.length) {
    const ing = r.ingredients
      .map((it) => {
        const name = stripHtml(it.name);
        return it.quantity ? `- ${name} — ${stripHtml(it.quantity)}` : `- ${name}`;
      })
      .join('\n');
    lines.push(`\n**Ингредиенты:**\n${ing}`);
  }
  if (r.steps?.length) {
    const steps = r.steps.map((s) => `${s.step_number ?? ''}. ${stripHtml(s.text)}`.trim()).join('\n');
    lines.push(`\n**Приготовление:**\n${steps}`);
  }
  if (r.url) {
    lines.push(`\n${r.url}`);
  }
  return lines.join('\n');
};

const formatRecipesList = (data: { meta?: any; items?: IRecipe[] } | undefined): string => {
  const items = data?.items || [];
  if (!items.length) {
    return 'Рецепты не найдены.';
  }
  const header = formatListMeta(data?.meta, 'рецептов');
  const blocks = items.map((r, i) => formatRecipe(r, i + 1));
  const filters = formatFilters(data?.meta?.filters);
  return [header, '', ...blocks, filters].filter(Boolean).join('\n\n');
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
