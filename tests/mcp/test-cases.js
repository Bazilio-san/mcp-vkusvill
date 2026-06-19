#!/usr/bin/env node

/**
 * Shared test cases for the template MCP server (src/template)
 * Covers: prompts, resources, tools
 *
 * Each test case is a function(client) -> Promise<{ name, passed, details? }>
 * where client provides methods:
 *   - listPrompts(), getPrompt(name, args?)
 *   - listResources(), readResource(uri)
 *   - listTools(), callTool(name, args?)
 */

const ok = (name, details) => ({ name, passed: true, details });
const fail = (name, details) => ({ name, passed: false, details });

// Utility: extract system text from prompts/get response
const extractPromptText = (resp) => {
  // resp may be raw result or wrapped; support both shapes used by clients
  const r = resp?.result || resp;
  const msg = r?.messages?.[0];
  const text = msg?.content?.text || msg?.content?.[0]?.text || r?.messages?.[0]?.content?.[0]?.text;
  return typeof text === 'string' ? text : undefined;
};

export const TEMPLATE_TESTS = {
  prompts: [
    async (client) => {
      const name = 'List prompts contains agent_brief and agent_prompt';
      try {
        const list = await client.listPrompts();
        const prompts = list?.prompts || list;
        const names = Array.isArray(prompts) ? prompts.map((p) => p.name) : [];
        const okBrief = names.includes('agent_brief');
        const okPrompt = names.includes('agent_prompt');
        return okBrief && okPrompt ? ok(name, { names }) : fail(name, { names });
      } catch (e) {
        return fail(name, { error: e?.message });
      }
    },
    async (client) => {
      const name = 'Get agent_brief returns text';
      try {
        const resp = await client.getPrompt('agent_brief');
        const text = extractPromptText(resp);
        return text ? ok(name, { text }) : fail(name, { text });
      } catch (e) {
        return fail(name, { error: e?.message });
      }
    },
    async (client) => {
      const name = 'Get agent_prompt returns text';
      try {
        const resp = await client.getPrompt('agent_prompt');
        const text = extractPromptText(resp);
        return text ? ok(name, { text }) : fail(name, { text });
      } catch (e) {
        return fail(name, { error: e?.message });
      }
    },
    async (client) => {
      const name = 'Get custom_prompt returns dynamic text';
      try {
        const resp = await client.getPrompt('custom_prompt', { sample: '1' });
        const text = extractPromptText(resp);
        const hasWord = typeof text === 'string' && text.includes('Custom prompt content');
        return hasWord ? ok(name, { text }) : fail(name, { text });
      } catch (e) {
        return fail(name, { error: e?.message });
      }
    },
  ],

  resources: [
    async (client) => {
      const name = 'List resources contains custom-resource://resource1';
      try {
        const list = await client.listResources();
        const resources = list?.resources || list;
        const uris = Array.isArray(resources) ? resources.map((r) => r.uri) : [];
        const found = uris.includes('custom-resource://resource1');
        return found ? ok(name, { uris }) : fail(name, { uris });
      } catch (e) {
        return fail(name, { error: e?.message });
      }
    },
    async (client) => {
      const name = 'Read resource custom-resource://resource1 returns content';
      try {
        const resp = await client.readResource('custom-resource://resource1');
        // Different clients return differently; normalize
        const r = resp?.result || resp;
        const text = r?.resource?.text || r?.contents?.[0]?.text || r?.text || r?.resource?.content;
        const okText = typeof text === 'string' && text.length > 0;
        return okText ? ok(name, { text }) : fail(name, { response: r });
      } catch (e) {
        return fail(name, { error: e?.message });
      }
    },
  ],

  tools: [
    async (client) => {
      const name = 'List tools contains the 7 VkusVill tools';
      try {
        const list = await client.listTools();
        const tools = list?.tools || list;
        const names = Array.isArray(tools) ? tools.map((t) => t.name) : [];
        const expected = [
          'search_products',
          'get_product_details',
          'get_product_analogs',
          'get_discounts',
          'find_shops',
          'search_recipes',
          'create_cart_link',
        ];
        const missing = expected.filter((n) => !names.includes(n));
        return missing.length === 0 ? ok(name, { names }) : fail(name, { missing, names });
      } catch (e) {
        return fail(name, { error: e?.message });
      }
    },
    async (client) => {
      const name = 'Call search_products returns formatted products (live API)';
      try {
        const resp = await client.callTool('search_products', { query: 'молоко 3.2' });
        const r = resp?.result || resp;
        const text = r?.content?.[0]?.text || r?.structuredContent?.text || JSON.stringify(r?.structuredContent || '');
        // Formatter prints "Цена: <n> ₽" for found products.
        const looksFormatted = typeof text === 'string' && (text.includes('₽') || text.includes('найдено'));
        return looksFormatted ? ok(name, { sample: String(text).slice(0, 200) }) : fail(name, { response: r });
      } catch (e) {
        return fail(name, { error: e?.message });
      }
    },
    async (client) => {
      const name = 'Call get_product_details for id 173 returns composition/nutrition (live API)';
      try {
        const resp = await client.callTool('get_product_details', { product_id: 173 });
        const r = resp?.result || resp;
        const text = r?.content?.[0]?.text || '';
        const hasInfo =
          typeof text === 'string' && (text.includes('Состав') || text.includes('ценность') || text.includes('₽'));
        return hasInfo ? ok(name, { sample: String(text).slice(0, 200) }) : fail(name, { response: r });
      } catch (e) {
        return fail(name, { error: e?.message });
      }
    },
    async (client) => {
      const name = 'Call get_product_details with absurd id yields a tool-level error';
      try {
        const resp = await client.callTool('get_product_details', { product_id: 999999999 });
        const r = resp?.result || resp;
        const isError = r?.isError === true;
        const text = r?.content?.[0]?.text || '';
        const looksError = isError || (typeof text === 'string' && /ошиб|не смог|не найден/i.test(text));
        return looksError ? ok(name, { sample: String(text).slice(0, 160) }) : fail(name, { response: r });
      } catch (e) {
        // A thrown JSON-RPC error is also an acceptable signal of rejection.
        return ok(name, { error: e?.message });
      }
    },
  ],
};

export default TEMPLATE_TESTS;
