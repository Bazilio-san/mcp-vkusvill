/**
 * Shared Markdown formatting primitives for VkusVill API payloads.
 *
 * The upstream returns verbose JSON; these helpers turn it into compact, human-readable Markdown.
 * Formatters used by only one tool live in that tool's module (src/tools/<tool>.ts). The helpers
 * here are the ones shared by several tools. All shapes are based on the live API (probed 2026-06-19).
 */

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
export const num = (value: unknown): string => {
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

/** Header line summarising a paginated list (products / shops / recipes). */
export const formatListMeta = (meta: IListMeta | undefined, noun: string): string => {
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

/** Full product list (search / discount): header + short blocks. Shared by two tools. */
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

interface IFilterGroup {
  name?: string;
  param?: string;
  items?: Array<{ id?: number; name?: string }>;
}

/** Render a `meta.filters` reference (region / city / metro / feature / allergen ids) compactly. */
export const formatFilters = (filters: IFilterGroup[] | undefined): string => {
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
