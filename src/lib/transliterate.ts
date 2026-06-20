/**
 * Transliteration helpers for cross-script fuzzy search (Latin ↔ Cyrillic). Adapted from the
 * mcp-jira project. Used so that a Latin query ("moskva") can match a Cyrillic name ("Москва")
 * and vice versa before the similarity metric is applied.
 */

/** Transliterate Russian (Cyrillic) text to Latin. */
export const transliterate = (text: string): string => {
  // noinspection NonAsciiCharacters
  const translitMap: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'yo',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'kh',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'shch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
    ' ': ' ',
  };

  return text
    .toLowerCase()
    .split('')
    .map((char) => translitMap[char] ?? char)
    .join('');
};

// noinspection NonAsciiCharacters
const deTranslitMap: Record<string, string> = {
  a: 'а',
  b: 'б',
  v: 'в',
  g: 'г',
  d: 'д',
  e: 'е',
  yo: 'ё',
  zh: 'ж',
  z: 'з',
  i: 'и',
  y: 'й',
  k: 'к',
  l: 'л',
  m: 'м',
  n: 'н',
  o: 'о',
  p: 'п',
  r: 'р',
  s: 'с',
  t: 'т',
  u: 'у',
  f: 'ф',
  kh: 'х',
  ts: 'ц',
  ch: 'ч',
  sh: 'ш',
  shch: 'щ',
  yu: 'ю',
  ya: 'я',
  ' ': ' ',
};

// Multi-letter combinations (length > 1), sorted descending by length for correct replacement.
const multiChar: string[] = Object.keys(deTranslitMap)
  .filter((k) => k.length > 1)
  .sort((a, b) => b.length - a.length);

/** Reverse transliteration — from Latin to Cyrillic. */
export const transliterateRU = (text: string): string => {
  let result = text.toLowerCase();

  for (const combo of multiChar) {
    if (deTranslitMap[combo]) {
      result = result.replace(new RegExp(combo, 'g'), deTranslitMap[combo]);
    }
  }

  return result
    .split('')
    .map((char) => {
      const cyrillic = /[а-я]/i.test(char);
      if (cyrillic) {
        return char;
      }
      return deTranslitMap[char] ?? char;
    })
    .join('');
};
