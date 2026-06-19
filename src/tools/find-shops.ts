import { Tool } from '@modelcontextprotocol/sdk/types.js';

import { asTextContent, IToolInputSchema } from 'fa-mcp-sdk';

import { formatFilters, formatListMeta, num, stripHtml } from '../lib/format.js';
import { getVkusvillClient } from '../lib/vkusvill-client.js';

import { IToolModule } from '../_types_/common';

/** find_shops → upstream vkusvill_shops. */

const inputSchema: IToolInputSchema = {
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
  description: `Поиск магазинов ВкусВилл: адрес, координаты, телефон, режим работы, особенности. Чтобы узнать доступные id регионов, городов и метро для фильтров, вызовите без фильтров (page=1) — справочник придёт в блоке фильтров.`,
  inputSchema,
};

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

const formatShopsList = (data: { meta?: any; items?: IShop[] } | undefined): string => {
  const items = data?.items || [];
  if (!items.length) {
    return 'Магазины не найдены.';
  }
  const header = formatListMeta(data?.meta, 'магазинов');
  const blocks = items.map((s, i) => formatShop(s, i + 1));
  const filters = formatFilters(data?.meta?.filters);
  return [header, '', ...blocks, filters].filter(Boolean).join('\n\n');
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
