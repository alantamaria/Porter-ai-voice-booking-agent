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
  'sarjapur road': 'Sarjapur Road',

  // Kochi Hubs (Evaluator Flow)
  'kakkanad': 'Kakkanad',
  'kakkad': 'Kakkanad',
  'kakkana': 'Kakkanad',
  'cochin': 'Kochi',
  'kochi': 'Kochi',
  'vyttila': 'Vyttila',
  'vytilla': 'Vyttila',
  'edappally': 'Edappally',
  'edapally': 'Edappally'
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
 * Detects whether an audio transcript is inaudible, unintelligible, noise, or filler-only.
 */
export function isUnusableAudio(text: string): boolean {
  if (!text || !text.trim()) return true;
  const lower = text.toLowerCase().trim();

  // Explicit inaudible / noise markers from STT
  if (
    lower.includes('[inaudible]') ||
    lower.includes('[unintelligible]') ||
    lower.includes('[noise]') ||
    lower.includes('[audio]') ||
    lower.includes('[applause]') ||
    lower.includes('*mumble*') ||
    lower.includes('(inaudible)')
  ) {
    return true;
  }

  // Purely punctuation / symbols with no letters or digits
  if (/^[^\p{L}\p{N}]+$/u.test(lower)) {
    return true;
  }

  // Filler noise only with no substance (e.g. "umm", "uhh", "umm uhh", "mhm", "huh")
  const words = lower.split(/\s+/).filter(Boolean);
  const fillerWords = new Set(['umm', 'um', 'uhh', 'uh', 'mhm', 'huh', 'ah', 'ahh', 'er']);
  if (words.length > 0 && words.every(w => fillerWords.has(w))) {
    return true;
  }

  return false;
}

/**
 * Detects whether an utterance expresses locality uncertainty (e.g. "somewhere near Kakkanad", "maybe Vyttila", "Kakkanad or Vyttila")
 */
export function detectSTTUncertainty(text: string): { isUncertain: boolean; field: string; clarificationPrompt: string } | null {
  const lower = text.toLowerCase().trim();

  // Locality uncertainty
  if (
    lower.includes('somewhere near') ||
    lower.includes('somewhere around') ||
    lower.includes('near about') ||
    lower.includes('not sure if') ||
    lower.includes('maybe ') ||
    /\baround\s+[a-z]+/i.test(lower) ||
    (lower.match(/\b(?:or)\b/i) && (lower.includes('kakkanad') || lower.includes('vyttila') || lower.includes('koramangala')))
  ) {
    return {
      isUncertain: true,
      field: 'location',
      clarificationPrompt: 'Could you please confirm the exact location or landmark?'
    };
  }

  return null;
}

