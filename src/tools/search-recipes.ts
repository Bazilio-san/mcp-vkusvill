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
      description: 'Recipe search query, e.g. "pancakes" (optional)',
      maxLength: 255,
    },
    page: {
      type: 'integer',
      description: 'Page number (10 recipes per page, default 1)',
      minimum: 1,
      maximum: 99999,
    },
    sort: {
      type: 'string',
      description: 'Sorting: popularity — by popularity (default), new — newest',
      enum: ['popularity', 'new'],
    },
    feature_id: {
      type: 'integer',
      description: 'Recipe feature ID (see the filters block at page=1)',
      minimum: 0,
      maximum: 999999999,
    },
    cooking_time_id: { type: 'integer', description: 'Cooking time ID', minimum: 0, maximum: 999999999 },
    cooking_method_id: { type: 'integer', description: 'Cooking method ID', minimum: 0, maximum: 999999999 },
    complexity_id: { type: 'integer', description: 'Complexity ID', minimum: 0, maximum: 999999999 },
    category_id: { type: 'integer', description: 'Category ID', minimum: 0, maximum: 999999999 },
    exclude_allergens: {
      type: 'array',
      description: 'Array of allergen IDs to exclude (see the filters block at page=1)',
      items: { type: 'integer', minimum: 1, maximum: 999999999 },
    },
  },
  required: [],
  additionalProperties: false,
};

const definition: Tool = {
  name: 'search_recipes',
  title: 'Find recipes',
  description: `Search VkusVill recipes by query and filters. 
Returns ingredients, nutrition per 100 g (calories, proteins, fats, carbs), step-by-step instructions, allergens. 
To find the filter ids (cooking time, method, complexity, allergens), call with page=1 — the reference will come in the filters block.`,
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
    meta.push(`complexity: ${stripHtml(r.complexity.name)}`);
  }
  if (r.cooking_time?.name) {
    meta.push(`time: ${stripHtml(r.cooking_time.name)}`);
  }
  if (r.portions != null) {
    meta.push(`portions: ${r.portions}`);
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
      `Nutrition per 100 g: ${num(n.calories)} kcal, proteins ${num(n.proteins)} g, fats ${num(n.fats)} g, carbs ${num(n.carbs)} g`,
    );
  }
  if (r.allergens?.length) {
    const a = r.allergens
      .map((x) => stripHtml(x.name))
      .filter(Boolean)
      .join(', ');
    if (a) {
      lines.push(`Allergens: ${a}`);
    }
  }
  if (r.ingredients?.length) {
    const ing = r.ingredients
      .map((it) => {
        const name = stripHtml(it.name);
        return it.quantity ? `- ${name} — ${stripHtml(it.quantity)}` : `- ${name}`;
      })
      .join('\n');
    lines.push(`\n**Ingredients:**\n${ing}`);
  }
  if (r.steps?.length) {
    const steps = r.steps.map((s) => `${s.step_number ?? ''}. ${stripHtml(s.text)}`.trim()).join('\n');
    lines.push(`\n**Instructions:**\n${steps}`);
  }
  if (r.url) {
    lines.push(`\n${r.url}`);
  }
  return lines.join('\n');
};

const formatRecipesList = (data: { meta?: any; items?: IRecipe[] } | undefined): string => {
  const items = data?.items || [];
  if (!items.length) {
    return 'No recipes found.';
  }
  const header = formatListMeta(data?.meta, 'recipes');
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
