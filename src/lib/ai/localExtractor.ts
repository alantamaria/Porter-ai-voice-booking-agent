import { StateDelta } from '@/types/booking';
import { normalizeLocation } from '@/lib/speech/normalizer';
import { checkHazardousItem, KNOWN_ITEM_CATALOG } from '@/lib/validation/rules';

/**
 * Deterministic local extractor fallback for offline/local development without API credentials.
 * Fulfills .env.example: "If no API key is provided, the application runs seamlessly using its
 * built-in deterministic local state extractor and rule-based conversational synthesizer."
 */
export function parseLocalDelta(userUtterance: string): Partial<StateDelta> {
  const text = userUtterance.trim();
  const lower = text.toLowerCase();
  const delta: Partial<StateDelta> = {
    isOffTopic: false,
    isImpossibleOrHazardous: false,
    userIntent: 'PROVIDE_INFORMATION'
  };

  // 1. Off-topic
  if (
    lower.includes('weather') ||
    lower.includes('joke') ||
    lower.includes('who are you') ||
    lower.includes('cricket') ||
    lower.includes('capital of')
  ) {
    delta.isOffTopic = true;
    delta.offTopicSubject = 'general chitchat';
    delta.userIntent = 'OFF_TOPIC';
    return delta;
  }

  // 2. Confirmation
  if (
    lower === 'yes' ||
    lower === 'confirm' ||
    lower === 'yes confirm' ||
    lower.includes('confirm booking') ||
    lower.includes('confirm it') ||
    lower.includes('go ahead') ||
    lower.includes('looks good') ||
    lower.includes('proceed')
  ) {
    delta.userIntent = 'CONFIRMATION';
    return delta;
  }

  // 3. Cancellation
  if (lower.includes('cancel booking') || lower === 'cancel') {
    delta.isCancellation = true;
    delta.userIntent = 'CANCELLATION';
    return delta;
  }

  // 4. Restart
  if (lower.includes('restart') || lower.includes('start over') || lower.includes('new booking')) {
    delta.isRestart = true;
    delta.userIntent = 'RESTART';
    return delta;
  }

  // 5. Hazardous
  const hazard = checkHazardousItem(text);
  if (hazard.isHazardous) {
    delta.isImpossibleOrHazardous = true;
    delta.hazardReason = hazard.reason;
    return delta;
  }

  // 6. Correction
  if (
    lower.includes('actually') ||
    lower.includes('not ') ||
    lower.includes('instead') ||
    lower.includes('change pickup') ||
    lower.includes('change dropoff')
  ) {
    delta.userIntent = 'CORRECTION';
    const pickupMatch = lower.match(/(?:actually|change|pickup|from)\s+(?:pickup is|pickup to|is|to)?\s*([a-z0-9\s]+)/i);
    if (pickupMatch && !lower.includes('to whitefield') && !lower.includes('to indiranagar')) {
      delta.pickupLocation = normalizeLocation(pickupMatch[1].trim());
    }
  }

  // 7. Location from -> to
  const fromToMatch = text.match(/(?:from|pickup(?:\s+is)?)\s+([a-zA-Z0-9\s]+?)\s+(?:to|dropoff(?:\s+is)?)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:tomorrow|today|evening|morning|on|at)|\.|$)/i);
  if (fromToMatch) {
    delta.pickupLocation = normalizeLocation(fromToMatch[1].trim());
    delta.dropoffLocation = normalizeLocation(fromToMatch[2].trim());
  } else {
    const fromMatch = text.match(/(?:from|pickup(?:\s+is)?)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:to|tomorrow|today|\.|$))/i);
    if (fromMatch) delta.pickupLocation = normalizeLocation(fromMatch[1].trim());

    const toMatch = text.match(/(?:to|dropoff(?:\s+is)?)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:from|tomorrow|today|\.|$))/i);
    if (toMatch) delta.dropoffLocation = normalizeLocation(toMatch[1].trim());
  }

  // Standalone Indian localities
  const knownLocs = [
    'kakkanad',
    'whitefield',
    'vyttila',
    'hsr layout',
    'indiranagar',
    'koramangala',
    'bellandur',
    'btm layout',
    'jayanagar',
    'hebbal',
    'electronic city'
  ];
  for (const loc of knownLocs) {
    if (lower.includes(loc)) {
      if (!delta.pickupLocation) {
        delta.pickupLocation = normalizeLocation(loc);
      } else if (!delta.dropoffLocation && loc !== delta.pickupLocation.toLowerCase()) {
        delta.dropoffLocation = normalizeLocation(loc);
      }
    }
  }

  // 8. Dates
  if (lower.includes('tomorrow')) {
    delta.scheduleDate = 'tomorrow';
  } else if (lower.includes('today')) {
    delta.scheduleDate = 'today';
  } else if (lower.includes('yesterday')) {
    delta.scheduleDate = 'yesterday';
  }

  // 9. Time & Ambiguity
  if (lower.includes('evening') || lower.includes('morning') || lower.includes('afternoon') || lower.includes('night')) {
    if (!text.match(/\d{1,2}(?::\d{2})?\s*(?:am|pm)/i)) {
      delta.isTimeAmbiguous = true;
      delta.userIntent = 'CLARIFICATION';
    }
  }
  const timeMatch = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
  if (timeMatch) {
    delta.scheduleTime = timeMatch[1].toUpperCase();
    delta.isTimeAmbiguous = false;
  }

  // 10. Inventory
  if (
    lower.includes('few things') ||
    lower.includes('some items') ||
    lower.includes('stuff') ||
    lower.includes('some luggage') ||
    lower.includes('goods')
  ) {
    delta.isVagueInventory = true;
    delta.isInventoryAmbiguous = true;
  } else {
    const itemsToAdd: Array<{ name: string; quantity: number }> = [];
    for (const itemName of Object.keys(KNOWN_ITEM_CATALOG)) {
      if (lower.includes(itemName)) {
        const qtyMatch = lower.match(new RegExp(`(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)\\s+${itemName}`, 'i'));
        let qty = 1;
        if (qtyMatch) {
          const w = qtyMatch[1].toLowerCase();
          const wordMap: Record<string, number> = {
            one: 1, two: 2, three: 3, four: 4, five: 5,
            six: 6, seven: 7, eight: 8, nine: 9, ten: 10
          };
          qty = wordMap[w] || parseInt(w, 10) || 1;
        }
        itemsToAdd.push({ name: itemName, quantity: qty });
      }
    }
    if (itemsToAdd.length > 0) {
      delta.itemsToAdd = itemsToAdd;
      delta.isVagueInventory = false;
    }
  }

  return delta;
}
