import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatListMeta, num, stripHtml } from '../lib/format.js';
import { filterItemLabel, getShopsReference, IFilterItem, resolveFilter } from '../lib/shops-reference.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';

import { IToolModule } from '../_types_/common';

/** find_shops → upstream vkusvill_shops. */

const inputSchema: IToolInputSchema = {
  type: 'object',
  properties: {
    page: {
      type: 'integer',
      description: 'Page number (10 shops per page, default 1)',
      minimum: 1,
      maximum: 99999,
    },
    region: {
      type: 'string',
      description: `Region name for filtering (fuzzy text search, e.g. "Москва", "Татарстан"). If several regions match, the tool asks you to clarify.`,
      maxLength: 255,
    },
    city: {
      type: 'string',
      description: `City name for filtering (fuzzy text search, e.g. "Казань"). Clarification is requested on ambiguity.`,
      maxLength: 255,
    },
    subway: {
      type: 'string',
      description: `Metro station name for filtering (fuzzy text search, e.g. "Сокольники"). If several stations match, the tool returns the options to choose from.`,
      maxLength: 255,
    },
    feature_id: {
      type: 'integer',
      description: 'Shop feature ID (e.g. cafe, meat counter). See the feature_id reference in the tool description.',
      minimum: 0,
      maximum: 999999999,
    },
  },
  required: [],
  additionalProperties: false,
};

const definition: Tool = {
  name: 'find_shops',
  title: 'Find shops',
  description: `Search VkusVill shops: address, coordinates, phone, opening hours, features.
Filter by region / city / metro using plain names — they are matched by fuzzy search. 
For the feature filter pass feature_id:
\`\`\`csv
feature_id,feature_ru
7488,Пекарня
7491,Сокомат
7740,Мясная витрина
21257,Снятие наличных
25791,Сбор пластиковых карт
26465,Кофе с собой
36178,Кафе
44806,Рыбная витрина
76205,Отдел без упаковки
80920,Цветы
89747,Фандоматы
90760,ВкусВилл Айс
916754,Сбор книг
916756,Сбор блистеров
5048867,Винный отдел
5048868,Сбор крышечек
5048869,Сбор батареек
5048870,Сбор вещей
5048871,Сбор детских вещей
5048872,Экообменники: крышечки
5048873,Бытовая химия на розлив
5048874,Бокс помощи нуждающимся
5048875,Бокс помощи животным
5048877,ВкусВилл Мини
5051431,Грейстор
5051432,Даркстор
5657354,Экообменники: батарейки
\`\`\``,
  inputSchema,
};

interface IShopSubwayStation {
  id?: number;
  name?: string;
  line?: string;
}

interface IShop {
  id?: number;
  url?: string;
  region?: { id?: number; name?: string };
  city?: { id?: number; name?: string };
  address?: string;
  /** `null` when no nearby station; array of station objects otherwise. */
  subway?: IShopSubwayStation[] | null;
  phone?: string[];
  lat?: number;
  lon?: number;
  rating?: number;
  schedule?: string;
  schedule_holidays?: string | null;
  description?: string | null;
  features?: Array<{ id?: number; name?: string }>;
}

/** A single named filter (region / city / subway / feature) returned inside `meta.filters`. */
export interface IShopsFilter {
  name?: string;
  param?: string;
  items?: Array<{ id?: number; name?: string; line?: string }>;
}

/** Pagination + filter-reference block returned as `data.meta` by the upstream `vkusvill_shops` tool. */
export interface IShopsMeta {
  limit?: number;
  total?: number;
  page?: number;
  pages?: number;
  has_more?: boolean;
  filters?: IShopsFilter[];
  filters_applied?: unknown[];
}

/**
 * Shape of the `data` field unwrapped from the upstream `vkusvill_shops` envelope.
 * Top-level fields: `meta` (pagination + filter reference) and `items` (shop list).
 */
export interface IShopsData {
  meta?: IShopsMeta;
  items?: IShop[];
}

const formatShop = (s: IShop, index?: number): string => {
  const title = [s.city?.name, s.address].filter(Boolean).map(stripHtml).join(', ') || `Shop ${s.id}`;
  const lines: string[] = [index != null ? `### ${index}. ${title}` : `### ${title}`];

  if (s.subway) {
    lines.push(`Metro: ${stripHtml(s.subway)}`);
  }
  if (s.schedule) {
    lines.push(`Opening hours: ${stripHtml(s.schedule)}`);
  }
  if (s.phone?.length) {
    lines.push(`Phone: ${s.phone.join(', ')}`);
  }
  if (s.rating != null) {
    lines.push(`Rating: ${num(s.rating)}`);
  }
  if (s.features?.length) {
    const feats = s.features
      .map((f) => stripHtml(f.name))
      .filter(Boolean)
      .join(', ');
    if (feats) {
      lines.push(`Features: ${feats}`);
    }
  }
  if (s.lat != null && s.lon != null) {
    lines.push(`Coordinates: ${s.lat}, ${s.lon}`);
  }
  if (s.url) {
    lines.push(s.url);
  }
  return lines.join('\n');
};

const formatShopsList = (data: IShopsData | undefined): string => {
  const items = data?.items || [];
  if (!items.length) {
    return 'No shops found.';
  }
  const header = formatListMeta(data?.meta, 'shops');
  const blocks = items.map((s, i) => formatShop(s, i + 1));
  // The filter reference (region/city/subway/feature) is resolved internally and exposed via the tool prompt,
  // so it is intentionally not dumped into the shop list output anymore.
  return [header, '', ...blocks].filter(Boolean).join('\n\n');
};

/** Resolve a free-text filter; returns its id, or a clarification block when the match is ambiguous/missing. */
const resolveTextFilter = (
  label: string,
  items: IFilterItem[],
  query: unknown,
): { id: number } | { problem: string } => {
  if (typeof query !== 'string' || !query.trim()) {
    return { id: 0 };
  }
  const outcome = resolveFilter(items, query);
  if (outcome.status === 'resolved') {
    return { id: outcome.item.id };
  }
  if (outcome.status === 'none') {
    return {
      problem: `По запросу «${query}» в справочнике «${label}» не найдено ни одного подходящего варианта. Уточните название.`,
    };
  }
  const list = outcome.candidates.map((c) => `- ${filterItemLabel(c)}`).join('\n');
  return {
    problem: `По запросу «${query}» в справочнике «${label}» найдено несколько подходящих вариантов. Уточните, какой из них имеется в виду:\n${list}`,
  };
};

export const findShopsModule: IToolModule = {
  definition,
  handler: async (args, signal) => {
    const ref = await getShopsReference(signal);

    const region = resolveTextFilter('Регион', ref.region, args?.region);
    const city = resolveTextFilter('Город', ref.city, args?.city);
    const subway = resolveTextFilter('Метро', ref.subway, args?.subway);

    // If any text filter could not be resolved unambiguously, ask the user to clarify before querying shops.
    const problems = [region, city, subway]
      .filter((r): r is { problem: string } => 'problem' in r)
      .map((r) => r.problem);
    if (problems.length) {
      return asTextContent(problems.join('\n\n'));
    }

    const data = await getVkusvillClient().callTool<IShopsData>(
      'vkusvill_shops',
      {
        page: args?.page ?? 1,
        id_region_filter: (region as { id: number }).id,
        id_city_filter: (city as { id: number }).id,
        id_subway_filter: (subway as { id: number }).id,
        id_feature_filter: args?.feature_id ?? 0,
      },
      signal,
    );
    const text = formatShopsList(data);
    return asTextContent(text);
  },
};
