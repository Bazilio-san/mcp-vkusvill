import { TPromptContentFunction } from 'fa-mcp-sdk';

/**
 * Tool-specific prompts served by the built-in `tool_prompt` prompt.
 *
 * The `tool_prompt` prompt is always advertised over MCP, but it returns a non-empty string only
 * for the tools listed here. Clients pass the tool name in the required `tool` argument; the home
 * page catalog viewer additionally shows a dropdown of the tools that have a non-empty prompt.
 *
 * Add an entry keyed by the MCP tool name to attach usage instructions to that tool.
 */
const TOOL_PROMPTS: Record<string, string> = {
  search_products: `Инструмент search_products ищет товары ВкусВилл по тексту.

- Запрос передавай в обязательное поле "query".
- В ответе у каждого товара есть "id" (для get_product_details / get_product_analogs) и "xml_id" (для create_cart_link).
- На странице 10 товаров; для следующих результатов увеличивай "page".`,

  create_cart_link: `Инструмент create_cart_link собирает ссылку на корзину ВкусВилл.

- Передай массив "items"; для каждого товара нужен "xml_id" (берётся из search_products) и "quantity".
- Сначала найди товары через search_products, чтобы получить их xml_id — не угадывай идентификаторы.`,
};

export const toolPrompt: TPromptContentFunction = (_request, args) => {
  const tool = args?.tool;
  if (!tool) {
    return '';
  }
  return TOOL_PROMPTS[tool] ?? '';
};
