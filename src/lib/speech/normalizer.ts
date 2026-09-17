/**
 * Phonetic Normalizer and Indian Logistics Entity Repair
 * Solves STT phonetic errors, colloquial Indian location names, and date/time phrases.
 */

// Common Bengaluru & Indian logistics hub phonetic mappings
const LOCALITY_PHONETIC_MAP: Record<string, string> = {
  // Koramangala variations
  'core mangala': 'Koramangala',
  'kora mangala': 'Koramangala',
  'kormangala': 'Koramangala',
  'cormangala': 'Koramangala',
  'kora mangla': 'Koramangala',
  'koramangla': 'Koramangala',

  // Whitefield variations
  'white field': 'Whitefield',
  'waite field': 'Whitefield',
  'white feild': 'Whitefield',
  'waitfield': 'Whitefield',

  // HSR Layout variations
  'h s r': 'HSR Layout',
  'h s r layout': 'HSR Layout',
  'hsr': 'HSR Layout',
  'hsr sect 1': 'HSR Layout Sector 1',
  'hsr sector one': 'HSR Layout Sector 1',

  // Indiranagar variations
  'indira nagar': 'Indiranagar',
  'indiranagar': 'Indiranagar',
  'indranagar': 'Indiranagar',
  'indra nagar': 'Indiranagar',

  // Bellandur variations
  'bellandur': 'Bellandur',
  'belandur': 'Bellandur',
  'belandur lake': 'Bellandur',

  // BTM variations
  'b t m': 'BTM Layout',
  'btm': 'BTM Layout',
  'b t m layout': 'BTM Layout',

  // Marathahalli variations
  'marathahalli': 'Marathahalli',
  'marathalli': 'Marathahalli',
  'marat halli': 'Marathahalli',
  'marthahalli': 'Marathahalli',

  // Electronic City
  'electronic city': 'Electronic City',
  'electronics city': 'Electronic City',
  'e city': 'Electronic City',
  'ecity': 'Electronic City',

  // Jayanagar
  'jaya nagar': 'Jayanagar',
  'jayanagar': 'Jayanagar',

  // Malleshwaram
  'malleswaram': 'Malleshwaram',
  'malleswaram 8th cross': 'Malleshwaram',
  'malleshwaram': 'Malleshwaram',

  // JP Nagar
  'j p nagar': 'JP Nagar',
  'jp nagar': 'JP Nagar',

  // Hebbal
  'hebbal': 'Hebbal',
  'hebal': 'Hebbal',

  // Sarjapur
  'sarjapur': 'Sarjapur',
  'sarjapura': 'Sarjapur',
  'sarjapur road': 'Sarjapur Road'
};

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  single: 1,
  double: 2,
  triple: 3,
  couple: 2,
  few: 3
};

/**
 * Normalizes an Indian location string against common STT transcription errors.
 * Replaces each misspelling exactly once without re-matching canonical values.
 */
export function normalizeLocation(input: string): string {
  if (!input) return '';
  let cleaned = input.trim();

  // Sort by length descending so longer phrases match first
  const sortedEntries = Object.entries(LOCALITY_PHONETIC_MAP).sort(
    (a, b) => b[0].length - a[0].length
  );

  for (const [misspelling, canonical] of sortedEntries) {
    // If canonical is already in the string at that position, don't replace
    const regex = new RegExp(`\\b${misspelling.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    cleaned = cleaned.replace(regex, () => canonical);
  }

  // Clean any accidental duplicate word artifacts like "HSR Layout Layout" -> "HSR Layout"
  cleaned = cleaned.replace(/\bHSR Layout\s+Layout\b/gi, 'HSR Layout');
  cleaned = cleaned.replace(/\bsect 1\b/gi, 'Sector 1');
  cleaned = cleaned.replace(/\bsector one\b/gi, 'Sector 1');

  return cleaned;
}

/**
 * Parses colloquial relative dates like "tomorrow", "day after tomorrow", "today"
 * relative to the provided base date.
 */
export function parseRelativeDate(dateStr: string, baseDate: Date = new Date()): { isoDate: string; isPast: boolean } {
  const lower = dateStr.toLowerCase().trim();
  const target = new Date(baseDate);

  if (lower.includes('day after tomorrow')) {
    target.setDate(target.getDate() + 2);
  } else if (lower.includes('tomorrow')) {
    target.setDate(target.getDate() + 1);
  } else if (lower.includes('today') || lower.includes('tonight')) {
    // today is kept
  } else if (lower.includes('yesterday') || lower.includes('day before yesterday')) {
    target.setDate(target.getDate() - 1);
    const iso = target.toISOString().split('T')[0];
    return { isoDate: iso, isPast: true };
  } else {
    // Attempt standard ISO or natural parse
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      const todayZero = new Date(baseDate);
      todayZero.setHours(0, 0, 0, 0);
      const isPast = parsed.getTime() < todayZero.getTime();
      return { isoDate: parsed.toISOString().split('T')[0], isPast };
    }
  }

  const iso = target.toISOString().split('T')[0];
  const todayZero = new Date(baseDate);
  todayZero.setHours(0, 0, 0, 0);
  const targetZero = new Date(target);
  targetZero.setHours(0, 0, 0, 0);

  return {
    isoDate: iso,
    isPast: targetZero.getTime() < todayZero.getTime()
  };
}

/**
 * Extracts floor number and lift presence from informal voice expressions
 * e.g. "3rd floor no lift", "ground floor", "second floor with elevator"
 */
export function parseFloorAndLift(text: string): { floor?: number; hasElevator?: boolean } {
  const lower = text.toLowerCase();
  const result: { floor?: number; hasElevator?: boolean } = {};

  // Elevator detection
  if (lower.includes('no lift') || lower.includes('no elevator') || lower.includes('without lift') || lower.includes('stairs only')) {
    result.hasElevator = false;
  } else if (
    lower.includes('with lift') ||
    lower.includes('has lift') ||
    lower.includes('has elevator') ||
    lower.includes('with elevator') ||
    lower.includes('lift available') ||
    lower.includes('elevator available') ||
    lower.includes('elevator') ||
    lower.includes('lift')
  ) {
    result.hasElevator = true;
  }

  // Floor detection
  if (lower.includes('ground floor') || lower.includes('ground')) {
    result.floor = 0;
  } else if (lower.includes('basement')) {
    result.floor = -1;
  } else {
    const floorMatch = lower.match(/(\d+)(?:st|nd|rd|th)?\s+floor/);
    if (floorMatch) {
      result.floor = parseInt(floorMatch[1], 10);
    } else {
      // Check word numbers
      for (const [word, num] of Object.entries(NUMBER_WORDS)) {
        if (lower.includes(`${word} floor`)) {
          result.floor = num;
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Detects whether cargo description is too vague (e.g. "a few things", "some stuff")
 */
export function isInventoryDescriptionVague(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const vaguePhrases = [
    'a few things',
    'few things',
    'some things',
    'some items',
    'some stuff',
    'a couple of things',
    'household items',
    'luggage',
    'not much',
    'just stuff',
    'normal things',
    'random things',
    'little stuff'
  ];

  // If text is extremely short and matches vague phrases
  for (const phrase of vaguePhrases) {
    if (lower === phrase || lower.includes(phrase)) {
      // If it doesn't mention specific items like "bed", "sofa", "fridge", "boxes"
      const specificKeywords = ['bed', 'sofa', 'fridge', 'refrigerator', 'tv', 'table', 'chair', 'box', 'boxes', 'almirah', 'wardrobe', 'washing machine', 'bike', 'mattress'];
      const hasSpecific = specificKeywords.some(k => lower.includes(k));
      if (!hasSpecific) return true;
    }
  }

  return false;
}
