import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatFilters, formatListMeta, num, stripHtml } from '../lib/format.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';

import { IToolModule } from '../_types_/common';

/** search_recipes → upstream vkusvill_recipes. */

// Filter reference taken from the upstream `meta.filters` block (search-recipes.json). Each enum value maps to the
// numeric filter id the upstream expects; the handler resolves the id by the unambiguous English name below.

/** Способ приготовления — cooking method. */
const COOKING_METHOD: Record<string, number> = {
  slow_cooker: 305757, // В мультиварке
  pan: 305758, // На сковороде
  oven_or_grill: 305759, // В духовке или на гриле
  steamed_or_boiled: 305760, // На пару или отварное
  no_heat: 305762, // Без термообработки
};

/** Время готовки — cooking time. */
const COOKING_TIME: Record<string, number> = {
  up_to_20_min: 397967, // до 20 минут
  up_to_40_min: 305736, // до 40 минут
  up_to_1_hour: 305738, // до 1 часа
  between_1_and_2_hours: 305739, // 1-2 часа
  over_2_hours: 305740, // более 2 часов
};

/** Сложность — complexity. */
const COMPLEXITY: Record<string, number> = {
  easy: 393, // Легкий
  medium: 394, // Средний
  pro: 395, // Профи
};

/** Особенности — recipe feature. */
const FEATURE: Record<string, number> = {
  video: 305745, // Видеорецепты
  from_social: 2405562, // Из соцсетей
  seasonal: 5770634, // Сезонное
  chef: 5770635, // Рецепт от шефа
};

/** Исключить аллергены — allergens to exclude. */
const ALLERGEN: Record<string, number> = {
  nuts: 305746, // Орехи
  gluten: 305747, // Глютен
  lactose: 305748, // Лактоза
  onion: 305749, // Лук
  eggs: 305751, // Яйца
  sugar: 305752, // Сахар
  sesame: 305754, // Кунжут
  mustard: 305756, // Горчица
};

/** Категория — recipe category (all groups flattened into a single enum). */
const CATEGORY: Record<string, number> = {
  // Тематические рецепты
  holiday: 345, // На праздник
  new_year: 346, // Новый год
  easter: 348, // Пасха
  bbq: 648, // Шашлык
  birthday: 1291, // День рождения
  maslenitsa: 1292, // Масленица
  // По типу блюда
  soup: 330, // Суп
  sauces: 331, // Соусы
  main_course: 332, // Горячее
  snacks: 335, // Закуски
  baking: 336, // Выпечка
  salads: 338, // Салаты
  desserts: 340, // Десерты
  pancakes: 349, // Блины
  drinks: 350, // Напитки
  casseroles: 2318, // Запеканки
  // Особое питание
  vegetarian: 344, // Вегетарианцам
  vegan: 353, // Веганам
  for_kids: 649, // Детям
  high_protein: 2368, // Много белка
  low_calorie: 2370, // Низкокалорийное
  sugar_free: 2372, // Без сахара
  allergen_free: 2374, // Без аллергенов
  lenten: 2392, // Постное
  // По ингредиенту
  meat: 333, // Мясо
  pasta: 341, // Паста и лапша
  seafood: 342, // Морепродукты
  vegetables: 343, // Овощи
  fish: 644, // Рыба
  poultry: 1263, // Птица
  grains: 1283, // Крупы
  cottage_cheese: 1290, // Творог
  fruits_berries: 2350, // Фрукты и ягоды
  mushrooms: 2362, // Грибы
  eggs: 2398, // Яйца
  cheese: 2400, // Сыр
  legumes: 2402, // Бобовые
  // Способ приготовления (category group, separate from the cooking_method filter)
  cat_no_heat: 2279, // Без термообработки
  oven: 2281, // В духовке
  grill: 2283, // На гриле и в аэрогриле
  cat_slow_cooker: 2285, // В мультиварке
  cat_steamed_or_boiled: 2287, // На пару или отварное
  cat_pan: 2289, // На сковороде
  // На каждый день
  simple: 334, // Простые рецепты
  breakfast: 339, // На завтрак
  lunch: 2273, // На обед
  dinner: 2277, // На ужин
  // От читателей
  user_recipes: 1763, // Рецепты пользователей
};

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
    feature: {
      type: 'string',
      description: 'Recipe feature: video, from_social, seasonal, chef',
      enum: Object.keys(FEATURE),
    },
    cooking_time: {
      type: 'string',
      description: 'Cooking time bucket',
      enum: Object.keys(COOKING_TIME),
    },
    cooking_method: {
      type: 'string',
      description: 'Cooking method',
      enum: Object.keys(COOKING_METHOD),
    },
    complexity: {
      type: 'string',
      description: 'Complexity: easy, medium, pro',
      enum: Object.keys(COMPLEXITY),
    },
    category: {
      type: 'string',
      description: 'Recipe category (dish type, ingredient, special diet, cooking method group, occasion)',
      enum: Object.keys(CATEGORY),
    },
    exclude_allergens: {
      type: 'array',
      description: 'Allergens to exclude from results',
      items: { type: 'string', enum: Object.keys(ALLERGEN) },
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
  slug?: string;
  description?: string;
  show_counter?: number | null;
  complexity?: { id?: number; name?: string } | null;
  portions?: number | null;
  cooking_time?: { id?: number; name?: string } | null;
  cooking_method?: { id?: number; name?: string } | null;
  url?: string;
  image?: string | null;
  rating?: number | null;
  products_id?: number | null;
  ingredients?: Array<{ name?: string; quantity?: string | null; ids?: string[] }> | null;
  steps?: Array<{ step_number?: number; text?: string; img?: string | null }> | null;
  nutritional?: { calories?: number; proteins?: number; fats?: number; carbs?: number } | null;
  allergens?: Array<{ id?: number; name?: string }> | null;
  sections?: Array<{ id?: number; id_parent?: number | null; name?: string }> | null;
  categories?: Array<{ name?: string; items?: Array<{ id?: number; name?: string }> }> | null;
  feature?: Array<{ id?: number; name?: string }> | null;
}

/** A single filter item with a numeric id and display name. */
interface IRecipesFilterItem {
  id: number;
  name: string;
}

/**
 * A filter group as it appears in `meta.filters`. Most groups have a flat `items` array of
 * `IRecipesFilterItem`, but the "Категория" group nests sub-groups that themselves carry `items`.
 */
interface IRecipesFilterGroup {
  name: string;
  param?: string;
  items: Array<IRecipesFilterItem | { name: string; items: IRecipesFilterItem[] }>;
}

/** Pagination and filter reference metadata returned inside `data.meta`. */
interface IRecipesMeta {
  limit?: number;
  total?: number;
  page?: number;
  pages?: number;
  has_more?: boolean;
  filters?: IRecipesFilterGroup[];
  filters_applied?: unknown[];
}

/** Shape of the `data` field returned by the upstream `vkusvill_recipes` tool (envelope unwrapped). */
export interface IRecipesData {
  meta?: IRecipesMeta;
  items?: IRecipe[];
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
    // Resolve each enum name to the numeric filter id the upstream expects; 0 means "no filter".
    const idOf = (map: Record<string, number>, name: unknown): number => (typeof name === 'string' && map[name]) || 0;
    const allergenIds = Array.isArray(args?.exclude_allergens)
      ? args.exclude_allergens.map((name: unknown) => ALLERGEN[name as string]).filter(Boolean)
      : [];
    // Upstream marks every recipe param as required, so inject defaults for anything omitted.
    const data = await getVkusvillClient().callTool<IRecipesData>(
      'vkusvill_recipes',
      {
        q: String(args?.query ?? ''),
        page: args?.page ?? 1,
        sort: args?.sort ?? 'popularity',
        id_feature_filter: idOf(FEATURE, args?.feature),
        id_cooking_time_filter: idOf(COOKING_TIME, args?.cooking_time),
        id_cooking_method_filter: idOf(COOKING_METHOD, args?.cooking_method),
        id_complexity_filter: idOf(COMPLEXITY, args?.complexity),
        id_category_filter: idOf(CATEGORY, args?.category),
        id_exclude_allergens_filter: allergenIds,
      },
      signal,
    );
    return asTextContent(formatRecipesList(data));
  },
};
