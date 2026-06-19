/**
 * Markdown formatters for VkusVill API payloads.
 *
 * This is the core value of the proxy layer: the upstream returns verbose JSON, and these helpers
 * turn it into compact, human-readable Markdown that an LLM can relay directly to the end user.
 * All shapes here are based on responses probed from the live API on 2026-06-19.
 */

/* ----------------------------------------------------------------------------------------------
 * Primitive helpers
 * -------------------------------------------------------------------------------------------- */

/** Strip the small set of HTML artefacts the API embeds in text fields. */
export const stripHtml = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/<br\s*\/?>(\s*)/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
};

/** Round a number to at most two decimals and drop a trailing `.0`. */
const num = (value: unknown): string => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return String(value ?? '');
  }
  return String(Math.round(n * 100) / 100);
};

type Price =
  | {
      current?: number | null;
      old?: number | null;
      currency?: string | null;
      discount_percent?: number | null;
      discount_info?: string | null;
    }
  | null
  | undefined;

/** Render a price object as `93 ₽` (with old price / discount when present). */
const formatPrice = (price: Price): string | null => {
  if (!price || price.current == null) {
    return null;
  }
  let line = `Цена: ${num(price.current)} ₽`;
  if (price.old != null && Number(price.old) > Number(price.current)) {
    line += ` (было ${num(price.old)} ₽`;
    if (price.discount_percent != null) {
      line += `, −${num(price.discount_percent)}%`;
    }
    line += ')';
  }
  return line;
};

/* ----------------------------------------------------------------------------------------------
 * Products
 * -------------------------------------------------------------------------------------------- */

interface IProduct {
  id?: number;
  xml_id?: number;
  name?: string;
  description?: string;
  brand?: string;
  price?: Price;
  unit?: string;
  weight?: { value?: number; unit?: string } | null;
  rating?: { average?: number; count?: number } | null;
  url?: string;
  category?: Array<{ name?: string }>;
  properties?: Array<{ name?: string; value?: string | null }>;
}

/** Compact one-product block used in search / analogs / discount lists. */
export const formatProductShort = (p: IProduct, index?: number): string => {
  const lines: string[] = [];
  const heading = index != null ? `### ${index}. ${stripHtml(p.name)}` : `### ${stripHtml(p.name)}`;
  lines.push(heading);

  const price = formatPrice(p.price);
  if (price) {
    lines.push(price);
  }
  if (p.price?.discount_info) {
    lines.push(`Акция: ${stripHtml(p.price.discount_info)}`);
  }
  if (p.rating?.average != null) {
    const count = p.rating.count != null ? ` (${p.rating.count} отзывов)` : '';
    lines.push(`Рейтинг: ${num(p.rating.average)}${count}`);
  }
  if (p.weight?.value != null) {
    lines.push(`Вес: ${num(p.weight.value)} ${p.weight.unit || ''}`.trim());
  }
  const ids: string[] = [];
  if (p.id != null) {
    ids.push(`ID ${p.id}`);
  }
  if (p.xml_id != null && p.xml_id !== p.id) {
    ids.push(`XML ID ${p.xml_id}`);
  }
  if (ids.length) {
    lines.push(ids.join(', '));
  }
  if (p.url) {
    lines.push(p.url);
  }
  return lines.join('\n');
};

interface IListMeta {
  q?: string | null;
  total?: number;
  page?: number;
  pages?: number;
  has_more?: boolean;
}

/** Header line summarising a paginated product list. */
const formatListMeta = (meta: IListMeta | undefined, noun: string): string => {
  if (!meta) {
    return '';
  }
  const parts: string[] = [];
  if (meta.total != null) {
    parts.push(`найдено ${noun}: ${meta.total}`);
  }
  if (meta.page != null && meta.pages != null) {
    parts.push(`страница ${meta.page} из ${meta.pages}`);
  }
  let line = parts.join(', ');
  if (meta.has_more) {
    line += ' (есть ещё — запросите следующую страницу)';
  }
  return line;
};

/** Full product list (search / discount): header + short blocks. */
export const formatProductsList = (
  data: { meta?: IListMeta; items?: IProduct[] } | undefined,
  noun = 'товаров',
): string => {
  const items = data?.items || [];
  if (!items.length) {
    return 'Товары не найдены.';
  }
  const header = formatListMeta(data?.meta, noun);
  const blocks = items.map((p, i) => formatProductShort(p, i + 1));
  return [header, '', ...blocks]
    .filter((s) => s !== undefined)
    .join('\n\n')
    .trim();
};

/** Analogs list: `{product_id,total,products[]}`. */
export const formatAnalogsList = (
  data: { product_id?: number; total?: number; products?: IProduct[] } | undefined,
): string => {
  const items = data?.products || [];
  if (!items.length) {
    return 'Аналоги не найдены.';
  }
  const header = `Аналоги товара ${data?.product_id ?? ''} — найдено ${data?.total ?? items.length}:`.trim();
  const blocks = items.map((p, i) => formatProductShort(p, i + 1));
  return [header, '', ...blocks].join('\n\n');
};

/** Detailed product view: short block + brand + composition / nutrition / storage properties. */
export const formatProductDetails = (p: IProduct | undefined): string => {
  if (!p || (p.id == null && p.name == null)) {
    return 'Товар не найден.';
  }
  const lines: string[] = [formatProductShort(p)];

  if (p.brand) {
    lines.push(`Бренд: ${stripHtml(p.brand)}`);
  }
  if (p.category?.length) {
    const cats = p.category
      .map((c) => stripHtml(c.name))
      .filter(Boolean)
      .join(' / ');
    if (cats) {
      lines.push(`Категория: ${cats}`);
    }
  }
  if (p.description) {
    lines.push(`\n**Описание:**\n${stripHtml(p.description)}`);
  }
  for (const prop of p.properties || []) {
    const value = stripHtml(prop.value);
    if (value) {
      lines.push(`\n**${stripHtml(prop.name)}:**\n${value}`);
    }
  }
  return lines.join('\n');
};

/* ----------------------------------------------------------------------------------------------
 * Shops
 * -------------------------------------------------------------------------------------------- */

interface IShop {
  id?: number;
  url?: string;
  region?: { name?: string };
  city?: { name?: string };
  address?: string;
  subway?: string | null;
  phone?: string[];
  lat?: number;
  lon?: number;
  rating?: number;
  schedule?: string;
  schedule_holidays?: string | null;
  features?: Array<{ name?: string }>;
}

const formatShop = (s: IShop, index?: number): string => {
  const title = [s.city?.name, s.address].filter(Boolean).map(stripHtml).join(', ') || `Магазин ${s.id}`;
  const lines: string[] = [index != null ? `### ${index}. ${title}` : `### ${title}`];

  if (s.subway) {
    lines.push(`Метро: ${stripHtml(s.subway)}`);
  }
  if (s.schedule) {
    lines.push(`Режим работы: ${stripHtml(s.schedule)}`);
  }
  if (s.phone?.length) {
    lines.push(`Телефон: ${s.phone.join(', ')}`);
  }
  if (s.rating != null) {
    lines.push(`Рейтинг: ${num(s.rating)}`);
  }
  if (s.features?.length) {
    const feats = s.features
      .map((f) => stripHtml(f.name))
      .filter(Boolean)
      .join(', ');
    if (feats) {
      lines.push(`Особенности: ${feats}`);
    }
  }
  if (s.lat != null && s.lon != null) {
    lines.push(`Координаты: ${num(s.lat)}, ${num(s.lon)}`);
  }
  if (s.url) {
    lines.push(s.url);
  }
  return lines.join('\n');
};

interface IFilterGroup {
  name?: string;
  param?: string;
  items?: Array<{ id?: number; name?: string }>;
}

/** Render the `meta.filters` reference (region / city / metro / feature ids) compactly. */
const formatFilters = (filters: IFilterGroup[] | undefined): string => {
  if (!filters?.length) {
    return '';
  }
  const groups = filters.map((g) => {
    const items = (g.items || [])
      .slice(0, 40)
      .map((it) => `${stripHtml(it.name)} (id ${it.id})`)
      .join(', ');
    const more = (g.items?.length || 0) > 40 ? ', …' : '';
    return `**${stripHtml(g.name)}** (${g.param}): ${items}${more}`;
  });
  return ['\n**Доступные фильтры** (передайте нужный id в параметрах):', ...groups].join('\n');
};

export const formatShopsList = (
  data: { meta?: IListMeta & { filters?: IFilterGroup[] }; items?: IShop[] } | undefined,
): string => {
  const items = data?.items || [];
  if (!items.length) {
    return 'Магазины не найдены.';
  }
  const header = formatListMeta(data?.meta, 'магазинов');
  const blocks = items.map((s, i) => formatShop(s, i + 1));
  const filters = formatFilters(data?.meta?.filters);
  return [header, '', ...blocks, filters].filter(Boolean).join('\n\n');
};

/* ----------------------------------------------------------------------------------------------
 * Recipes
 * -------------------------------------------------------------------------------------------- */

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

export const formatRecipesList = (
  data: { meta?: IListMeta & { filters?: IFilterGroup[] }; items?: IRecipe[] } | undefined,
): string => {
  const items = data?.items || [];
  if (!items.length) {
    return 'Рецепты не найдены.';
  }
  const header = formatListMeta(data?.meta, 'рецептов');
  const blocks = items.map((r, i) => formatRecipe(r, i + 1));
  const filters = formatFilters(data?.meta?.filters);
  return [header, '', ...blocks, filters].filter(Boolean).join('\n\n');
};

/* ----------------------------------------------------------------------------------------------
 * Cart link
 * -------------------------------------------------------------------------------------------- */

export const formatCartLink = (data: { link?: string } | undefined): string => {
  const link = data?.link;
  if (!link) {
    return 'Не удалось создать ссылку на корзину.';
  }
  return `Ссылка на корзину ВкусВилл:\n${link}\n\nПерейдите по ссылке, чтобы товары добавились в корзину для оформления заказа.`;
};
