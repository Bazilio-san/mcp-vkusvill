import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { IToolInputSchema } from 'fa-mcp-sdk';

/**
 * VkusVill MCP proxy tools.
 *
 * Each tool wraps a tool of the official VkusVill MCP API (https://mcp001.vkusvill.ru/mcp) and
 * reformats its raw JSON into readable Markdown (see src/lib/format.ts). Schemas follow JSON Schema
 * draft 2020-12 and reject unknown fields (`additionalProperties: false`).
 *
 * Mapping (our tool → upstream tool):
 *   search_products      → vkusvill_products_search
 *   get_product_details  → vkusvill_product_details
 *   get_product_analogs  → vkusvill_product_analogs
 *   get_discounts        → vkusvill_products_discount
 *   find_shops           → vkusvill_shops
 *   search_recipes       → vkusvill_recipes
 *   create_cart_link     → vkusvill_cart_link_create
 */

const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

const PRODUCT_SORT = ['popularity', 'rating', 'price_asc', 'price_desc', 'new'] as const;

const searchProductsSchema: IToolInputSchema = {
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
      enum: [...PRODUCT_SORT],
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

const productIdSchema: IToolInputSchema = {
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

const discountsSchema: IToolInputSchema = {
  $schema: JSON_SCHEMA_2020_12,
  type: 'object',
  properties: {
    discount_type: {
      type: 'string',
      description: 'Тип скидки: card — по карте лояльности (по умолчанию), quantity — при покупке нескольких товаров',
      enum: ['card', 'quantity'],
    },
    page: {
      type: 'integer',
      description: 'Номер страницы (по 10 товаров на странице, по умолчанию 1)',
      minimum: 1,
      maximum: 99999,
    },
    sort: {
      type: 'string',
      description: 'Сортировка: popularity (по умолчанию), rating, price_asc, price_desc, new, name_asc, name_desc',
      enum: ['popularity', 'rating', 'price_asc', 'price_desc', 'new', 'name_asc', 'name_desc'],
    },
    vvonly: {
      type: 'integer',
      description: 'Только товары бренда ВкусВилл: 1 — да (по умолчанию), 0 — все',
      enum: [0, 1],
    },
  },
  required: [],
  additionalProperties: false,
};

const shopsSchema: IToolInputSchema = {
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
    city_id: {
      type: 'integer',
      description: 'ID города для фильтра',
      minimum: 0,
      maximum: 999999999,
    },
    subway_id: {
      type: 'integer',
      description: 'ID станции метро для фильтра',
      minimum: 0,
      maximum: 999999999,
    },
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

const recipesSchema: IToolInputSchema = {
  $schema: JSON_SCHEMA_2020_12,
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

const cartLinkSchema: IToolInputSchema = {
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

export const tools: Tool[] = [
  {
    name: 'search_products',
    title: 'Поиск товаров ВкусВилл',
    description:
      'Поиск товаров ВкусВилл по текстовому запросу. Возвращает список товаров с ценой, рейтингом, весом, ' +
      'ссылкой и идентификаторами (id, xml_id). По 10 товаров на странице — для следующих результатов увеличивайте page.',
    inputSchema: searchProductsSchema,
  },
  {
    name: 'get_product_details',
    title: 'Детали товара',
    description:
      'Детальная информация о товаре ВкусВилл по его id (берётся из search_products): состав, КБЖУ (пищевая ценность), ' +
      'аллергены, срок годности, условия хранения, производитель, цена и рейтинг.',
    inputSchema: productIdSchema,
  },
  {
    name: 'get_product_analogs',
    title: 'Аналоги товара',
    description:
      'Похожие товары (аналоги) для товара ВкусВилл по его id из search_products. Удобно для замены или сравнения.',
    inputSchema: productIdSchema,
  },
  {
    name: 'get_discounts',
    title: 'Акционные товары',
    description:
      'Список акционных товаров ВкусВилл со скидками. Тип скидки: card — по карте лояльности, quantity — при покупке нескольких ' +
      'товаров. Показывает старую и новую цену, размер и условия скидки.',
    inputSchema: discountsSchema,
  },
  {
    name: 'find_shops',
    title: 'Поиск магазинов',
    description:
      'Поиск магазинов ВкусВилл: адрес, координаты, телефон, режим работы, особенности. Чтобы узнать доступные id регионов, ' +
      'городов и метро для фильтров, вызовите без фильтров (page=1) — справочник придёт в блоке фильтров.',
    inputSchema: shopsSchema,
  },
  {
    name: 'search_recipes',
    title: 'Поиск рецептов',
    description:
      'Поиск рецептов ВкусВилл по запросу и фильтрам. Возвращает ингредиенты, КБЖУ на 100 г, пошаговое приготовление, аллергены. ' +
      'Чтобы узнать id фильтров (время готовки, способ, сложность, аллергены), вызовите с page=1 — справочник придёт в блоке фильтров.',
    inputSchema: recipesSchema,
  },
  {
    name: 'create_cart_link',
    title: 'Создать ссылку на корзину',
    description:
      'Создаёт ссылку на корзину ВкусВилл с выбранными товарами. На вход — массив items с xml_id товара (из search_products) ' +
      'и количеством. Возвращает ссылку, по которой товары добавляются в корзину одним переходом.',
    inputSchema: cartLinkSchema,
  },
];

// Helper to get tool by name
export const getToolByName = (name: string): Tool | undefined => {
  return tools.find((tool) => tool.name === name);
};

// Helper to get all tool names
export const getToolNames = (): string[] => {
  return tools.map((tool) => tool.name);
};
