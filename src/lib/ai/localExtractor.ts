import { StateDelta, BookingState } from '@/types/booking';
import { normalizeLocation, isUnusableAudio, detectSTTUncertainty } from '@/lib/speech/normalizer';
import { checkHazardousItem, KNOWN_ITEM_CATALOG } from '@/lib/validation/rules';

/**
 * Deterministic local extractor fallback for offline/local development without API credentials.
 * Fulfills .env.example: "If no API key is provided, the application runs seamlessly using its
 * built-in deterministic local state extractor and rule-based conversational synthesizer."
 */
export function parseLocalDelta(userUtterance: string, currentState?: BookingState): Partial<StateDelta> {
  const text = userUtterance.trim();
  // Strip trailing sentence punctuation for cleaner regex matching
  const cleanedText = text.replace(/[.!,?]+$/g, '').trim();
  const lower = cleanedText.toLowerCase();
  const lowerOriginal = text.toLowerCase();
  const delta: Partial<StateDelta> = {
    isOffTopic: false,
    isImpossibleOrHazardous: false,
    userIntent: 'PROVIDE_INFORMATION'
  };

  // 0. Inaudible / unusable audio
  if (isUnusableAudio(text)) {
    delta.userIntent = 'UNKNOWN';
    return delta;
  }

  // 0.1 STT Uncertainty detection (e.g. "somewhere near Kakkanad")
  const sttUnc = detectSTTUncertainty(text);
  if (sttUnc?.isUncertain) {
    delta.ambiguities = [
      {
        field: sttUnc.field,
        suspectedValues: [],
        userUtterance: text,
        severity: 'BLOCKING',
        clarificationPrompt: sttUnc.clarificationPrompt
      }
    ];
    delta.userIntent = 'CLARIFICATION';
  }

  // 0.2 Greeting / casual conversation / filler detection (before off-topic)
  // Only treat as non-booking if there's no booking-related content in the utterance
  const greetingPatterns = [
    /^hi[,!.\s]*$/,
    /^hello[,!.\s]*$/,
    /^hey[,!.\s]*$/,
    /^good\s+(morning|afternoon|evening|night)[,!.\s]*$/,
    /^howdy[,!.\s]*$/,
    /^greetings[,!.\s]*$/
  ];

  const conversationalPatterns = [
    /^how\s+are\s+you/,
    /^what'?s\s+up/,
    /^how\s+do\s+you\s+do/,
    /^how'?s\s+it\s+going/,
    /^what\s+is\s+up/
  ];

  // Filler / idle / waiting phrases — user is NOT requesting booking action
  const fillerPatterns = [
    /^(i'?m|i\s+am)\s+(still\s+)?listening/i,
    /^still\s+listening/i,
    /^(i'?m|i\s+am)\s+listening/i,
    /^just\s+listening/i,
    /^(i'?m|i\s+am)\s+here/i,
    /^still\s+here/i,
    /^(please\s+)?wait(\s+(a\s+)?(second|moment|minute|sec|min))?[.!,\s]*$/i,
    /^one\s+(moment|second|minute|sec|min)[.!,\s]*$/i,
    /^(hold|hang)\s+on(\s+(a\s+)?(second|moment|minute|sec|min))?[.!,\s]*$/i,
    /^just\s+a\s+(second|moment|minute|sec|min)[.!,\s]*$/i,
    /^give\s+me\s+a\s+(second|moment|minute|sec|min)[.!,\s]*$/i,
    /^let\s+me\s+think/i,
    /^thinking/i,
    /^hmm+/i,
    /^umm+/i,
    /^ok(ay)?[.!,\s]*$/i,
    /^sure[.!,\s]*$/i,
    /^alright[.!,\s]*$/i,
    /^thanks?(\s+you)?[.!,\s]*$/i,
    /^thank\s+you[.!,\s]*$/i,
    /^no\s+problem[.!,\s]*$/i,
    /^nothing(\s+yet)?[.!,\s]*$/i,
    /^not\s+yet[.!,\s]*$/i,
    /^(i'?m|i\s+am)\s+good[.!,\s]*$/i,
    /^that'?s\s+(all|it)[.!,\s]*$/i,
    /^never\s*mind[.!,\s]*$/i
  ];

  // Check if the input contains any booking-related action keywords
  const bookingContentRegex =
    /\b(book|booking|move|moving|shift|shifting|transport|deliver|delivery|send|sending|pickup|pick\s+up|pick-up|drop\s+off|dropoff|drop-off|truck|porter|furniture|items|package|parcel|tempo)\b/i;
  const hasBookingContent = bookingContentRegex.test(lower);

  if (!hasBookingContent) {
    const isGreeting = greetingPatterns.some(p => p.test(lower));
    const isConversational = conversationalPatterns.some(p => p.test(lower));
    const isFiller = fillerPatterns.some(p => p.test(lower));

    // Also detect compound greetings like "hi, hello. how are you?"
    const compoundGreetingParts = lower
      .replace(/[.,!?]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const greetWords = ['hi', 'hello', 'hey', 'howdy', 'greetings'];
    const conversationalWords = ['how', 'are', 'you', "what's", 'up', 'whats', 'going'];
    const allWordsAreGreetingOrConversational = compoundGreetingParts.every(
      w => greetWords.includes(w) || conversationalWords.includes(w) || ['good', 'morning', 'afternoon', 'evening', 'night', 'doing'].includes(w)
    );

    if (isGreeting || isConversational || isFiller || (compoundGreetingParts.length > 0 && allWordsAreGreetingOrConversational)) {
      delta.userIntent = 'GREETING';
      return delta;
    }
  }

  // Explicit booking intent phrases
  const bookingIntentPatterns = [
    /\b(i\s+want\s+to|i\s+need\s+to|can\s+i|please|help\s+me)\s+(book|schedule|hire)\b/i,
    /\b(i\s+want\s+to|i\s+need\s+to|can\s+i|please|help\s+me)\s+(move|shift|transport|send|deliver)\b/i,
    /\b(book\s+a\s+(porter|truck|tempo|vehicle|move|delivery|pickup))\b/i,
    /\b(need\s+a\s+(porter|truck|tempo|vehicle|mini\s+truck))\b/i,
    /\b(book\s+(porter|move|truck|tempo))\b/i,
    /\b(want\s+to\s+book|need\s+to\s+book)\b/i
  ];
  if (bookingIntentPatterns.some(p => p.test(text))) {
    delta.userIntent = 'BOOKING';
  }

  // 1. Off-topic
  if (
    lower.includes('weather') ||
    lower.includes('raining') ||
    lower.includes('rain') ||
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

  // 6. Correction detection
  const isCorrectionUtterance =
    lower.includes('actually') ||
    lower.includes('not ') ||
    lower.includes('instead') ||
    lower.includes('change pickup') ||
    lower.includes('change dropoff') ||
    lower.includes('change my pickup') ||
    lower.includes('change my dropoff') ||
    lower.includes('change my drop off') ||
    lower.includes('change my drop-off');

  if (isCorrectionUtterance) {
    delta.userIntent = 'CORRECTION';
  }

  // 6a. Contextual relative correction: "Change to <Location>" / "Change it to <Location>"
  // When user says "change to X" without specifying pickup/dropoff, infer from current state.
  const changeToMatch = lower.match(/^change\s+(?:it\s+)?to\s+(.+)$/i);
  if (changeToMatch) {
    delta.userIntent = 'CORRECTION';
    const targetLoc = normalizeLocation(changeToMatch[1].trim());
    // Determine which field to update based on revision history or most recent missing context
    if (currentState) {
      const revHistory = currentState.metadata?.revisionHistory || [];
      const lastLocRevision = [...revHistory].reverse().find(
        r => r.field === 'pickup.location' || r.field === 'dropoff.location'
      );
      if (lastLocRevision?.field === 'dropoff.location') {
        delta.dropoffLocation = targetLoc;
      } else {
        // Default to pickup (most common correction target)
        delta.pickupLocation = targetLoc;
      }
    } else {
      delta.pickupLocation = targetLoc;
    }
  }

  // 6b. Explicit correction with field keyword:
  // "Change my pickup location to X", "Actually my pickup is X", etc.
  // Extract the LAST location entity after the field keyword phrase.
  if (isCorrectionUtterance && !changeToMatch) {
    // Handle mid-sentence self-correction FIRST: "Pickup is X. No, actually Y."
    // When "actually" appears, it signals the user's FINAL intent — prioritize it.
    if (lower.includes('actually')) {
      const actuallyMatch = lower.match(/actually\s+(.+)$/i);
      if (actuallyMatch) {
        const afterActually = actuallyMatch[1].trim();
        // Check if it specifies pickup or dropoff explicitly
        const afterPickup = afterActually.match(
          /(?:pick-?up(?:\s+location)?|pick\s+up(?:\s+location)?|from)\s+(?:is|to)?\s*(.+)$/i
        );
        const afterDropoff = afterActually.match(
          /(?:drop-?off(?:\s+location)?|drop\s+off(?:\s+location)?|destination|to)\s+(?:is|to)?\s*(.+)$/i
        );
        if (afterPickup) {
          delta.pickupLocation = normalizeLocation(afterPickup[1].trim());
        } else if (afterDropoff) {
          delta.dropoffLocation = normalizeLocation(afterDropoff[1].trim());
        } else {
          // Just a bare location name after "actually" — treat as pickup correction by default
          delta.pickupLocation = normalizeLocation(afterActually);
        }
      }
    }

    // Only try explicit field-keyword regex if "actually" didn't extract anything
    if (!delta.pickupLocation && !delta.dropoffLocation) {
      // Try to find pickup location entity after pickup-related keywords
      const pickupCorrectionMatch = lower.match(
        /(?:pick-?up(?:\s+location)?|pick\s+up(?:\s+location)?)\s+(?:is|to)\s+(.+)$/i
      );
      if (pickupCorrectionMatch) {
        delta.pickupLocation = normalizeLocation(pickupCorrectionMatch[1].trim());
      }

      // Try to find dropoff location entity after dropoff-related keywords
      const dropoffCorrectionMatch = lower.match(
        /(?:drop-?off(?:\s+location)?|drop\s+off(?:\s+location)?|destination)\s+(?:is|to)\s+(.+)$/i
      );
      if (dropoffCorrectionMatch) {
        delta.dropoffLocation = normalizeLocation(dropoffCorrectionMatch[1].trim());
      }
    }
  }

  // 7. Location from -> to (only if correction didn't already extract locations)
  // Support both "pick-up", "pickup" and "pick up" (with space)
  if (!delta.pickupLocation && !delta.dropoffLocation) {
    const fromToMatch = cleanedText.match(
      /(?:from|pick-?up(?:\s+is)?|pick\s+up(?:\s+is)?)\s+([a-zA-Z0-9\s]+?)\s+(?:to|drop-?off(?:\s+is)?|drop\s+off(?:\s+is)?)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:tomorrow|today|evening|morning|on|at)|$)/i
    );
    if (fromToMatch) {
      const rawPickup = fromToMatch[1].trim();
      if (!rawPickup.toLowerCase().includes('somewhere near') && !rawPickup.toLowerCase().includes('near about')) {
        delta.pickupLocation = normalizeLocation(rawPickup);
      }
      delta.dropoffLocation = normalizeLocation(fromToMatch[2].trim());
    } else {
      // Check explicit drop-off phrase
      // Standalone 'to' must NOT be followed by a verb (book, move, send, etc.) to avoid
      // misinterpreting intent phrases like "I want to book" as a drop-off location.
      const toMatch = cleanedText.match(
        /(?:drop-?off(?:\s+is)?|drop\s+off(?:\s+is)?|destination(?:\s+is)?|to)\s+(?:also\s+)?([a-zA-Z0-9\s]+?)(?:\s+(?:from|tomorrow|today)|$)/i
      );
      if (toMatch) {
        const captured = toMatch[1].trim().toLowerCase();
        // Reject if the captured text starts with a verb (intent phrase, not a location)
        const verbPrefixes = /^(book|move|send|shift|deliver|schedule|hire|transport|pick|get|arrange|find|need|want|have)\b/i;
        if (!verbPrefixes.test(captured)) {
          delta.dropoffLocation = normalizeLocation(toMatch[1].trim());
        }
      }

      // Check explicit pickup phrase
      // Handle patterns: "from X", "pickup is X", "pickup is from X", "pick up X"
      const fromMatch = cleanedText.match(
        /(?:from|pick-?up(?:\s+is(?:\s+from)?)?|pick\s+up(?:\s+is(?:\s+from)?)?)\s+([a-zA-Z0-9\s]+?)(?:\s+(?:to|tomorrow|today)|$)/i
      );
      if (fromMatch) {
        let rawPickup = fromMatch[1].trim();
        // Strip accidental leading 'from ' if present
        rawPickup = rawPickup.replace(/^from\s+/i, '');
        if (!rawPickup.toLowerCase().includes('somewhere near') && !rawPickup.toLowerCase().includes('near about')) {
          delta.pickupLocation = normalizeLocation(rawPickup);
        }
      }
    }
  }

  // Standalone Indian localities
  const knownLocs = [
    'kakkanad',
    'whitefield',
    'vyttila',
    'edappally',
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
      if (lower.includes('drop-off') || lower.includes('dropoff') || lower.includes('destination') || lower.includes('to ' + loc)) {
        delta.dropoffLocation = normalizeLocation(loc);
      } else if (!lower.includes('somewhere near ' + loc) && !lower.includes('somewhere around ' + loc)) {
        if (!delta.pickupLocation) {
          delta.pickupLocation = normalizeLocation(loc);
        } else if (!delta.dropoffLocation && loc !== delta.pickupLocation.toLowerCase()) {
          delta.dropoffLocation = normalizeLocation(loc);
        }
      }
    }
  }


  // 8. Dates
  if (
    lower.includes('day after tomorrow') ||
    lower.includes('the day after tomorrow') ||
    lower.includes('after tomorrow')
  ) {
    delta.scheduleDate = 'day after tomorrow';
  } else if (lower.includes('tomorrow')) {
    delta.scheduleDate = 'tomorrow';
  } else if (lower.includes('day before yesterday')) {
    delta.scheduleDate = 'day before yesterday';
  } else if (lower.includes('yesterday')) {
    delta.scheduleDate = 'yesterday';
  } else if (lower.includes('today') || lower.includes('tonight')) {
    delta.scheduleDate = 'today';
  } else {
    const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    let weekdayFound = false;
    for (const wd of weekdays) {
      if (new RegExp(`\\b(next\\s+|this\\s+|on\\s+)?${wd}\\b`, 'i').test(lower)) {
        delta.scheduleDate = wd;
        weekdayFound = true;
        break;
      }
    }

    // Natural date strings: "21st September 2026", "September 21 2026", "3rd October"
    if (!weekdayFound) {
      const naturalDateMatch = cleanedText.match(
        /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/i
      ) || cleanedText.match(
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i
      );
      if (naturalDateMatch) {
        // Normalize ordinal suffixes and pass through to validateBookingDate
        const cleanedDateStr = cleanedText
          .replace(/(\d+)(?:st|nd|rd|th)\b/gi, (m: string, d: string) => d)
          .trim();
        delta.scheduleDate = cleanedDateStr;
      }
    }
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
    const sortedItemNames = Object.keys(KNOWN_ITEM_CATALOG).sort((a, b) => b.length - a.length);
    for (const itemName of sortedItemNames) {
      // Use word boundary matching to prevent substring false positives
      // e.g. 'ac' must not match inside 'actually'
      const itemBoundaryRegex = new RegExp(`\\b${itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (itemBoundaryRegex.test(lowerOriginal)) {
        // Prevent duplicate matching for box / boxes and bed / double bed
        if (itemName === 'box' && itemsToAdd.some(i => i.name === 'boxes' || i.name === 'carton box')) {
          continue;
        }
        if (itemName === 'bed' && itemsToAdd.some(i => i.name.includes('bed'))) {
          continue;
        }
        if (itemName === 'sofa' && itemsToAdd.some(i => i.name.includes('sofa'))) {
          continue;
        }

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
