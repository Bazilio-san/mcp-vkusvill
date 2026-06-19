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
      description: 'Page number (10 shops per page, default 1)',
      minimum: 1,
      maximum: 99999,
    },
    region_id: {
      type: 'integer',
      description: 'Region ID for filtering (the list of ids is returned in the filters block at page=1)',
      minimum: 0,
      maximum: 999999999,
    },
    city_id: { type: 'integer', description: 'City ID for filtering', minimum: 0, maximum: 999999999 },
    subway_id: { type: 'integer', description: 'Metro station ID for filtering', minimum: 0, maximum: 999999999 },
    feature_id: {
      type: 'integer',
      description: 'Shop feature ID (e.g. cafe, meat counter)',
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
To find the available region, city and metro ids for filters, call without filters (page=1) — the reference will come in the filters block.`,
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
    lines.push(`Coordinates: ${num(s.lat)}, ${num(s.lon)}`);
  }
  if (s.url) {
    lines.push(s.url);
  }
  return lines.join('\n');
};

const formatShopsList = (data: { meta?: any; items?: IShop[] } | undefined): string => {
  const items = data?.items || [];
  if (!items.length) {
    return 'No shops found.';
  }
  const header = formatListMeta(data?.meta, 'shops');
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
