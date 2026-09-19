import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRecommendedVehicle,
  calculateHelpersRequirement,
  checkHazardousItem,
  validateBookingDate,
  validateSameLocation,
  validateRouteServiceability,
  isBookingComplete,
  isInventoryVague
} from '../../lib/validation/rules';
import {
  normalizeLocation,
  parseFloorAndLift,
  isUnusableAudio,
  detectSTTUncertainty
} from '../../lib/speech/normalizer';
import { createInitialBookingState } from '../../lib/state/stateMachine';
import { InventoryItem, LocationDetail } from '../../types/booking';

describe('Validation & Domain Rules Unit Tests', () => {
  it('should reject past dates and accept future dates', () => {
    const fixedNow = new Date('2026-09-17T12:00:00Z');

    const tomorrow = validateBookingDate('tomorrow', fixedNow);
    assert.equal(tomorrow.isPast, false);
    assert.equal(tomorrow.isoDate, '2026-09-18');

    const yesterday = validateBookingDate('yesterday', fixedNow);
    assert.equal(yesterday.isPast, true);

    const explicitPast = validateBookingDate('2025-01-01', fixedNow);
    assert.equal(explicitPast.isPast, true);

    const explicitFuture = validateBookingDate('2026-10-01', fixedNow);
    assert.equal(explicitFuture.isPast, false);
  });

  it('should correctly resolve relative dates: today, tomorrow, and day after tomorrow', () => {
    const baseDate = new Date('2026-09-19T10:00:00');

    // today = current date (2026-09-19)
    const today = validateBookingDate('today', baseDate);
    assert.equal(today.isValid, true);
    assert.equal(today.isPast, false);
    assert.equal(today.isoDate, '2026-09-19');

    // tomorrow = current date + 1 (2026-09-20)
    const tomorrow = validateBookingDate('tomorrow', baseDate);
    assert.equal(tomorrow.isValid, true);
    assert.equal(tomorrow.isPast, false);
    assert.equal(tomorrow.isoDate, '2026-09-20');

    // day after tomorrow = current date + 2 (2026-09-21)
    const dayAfter = validateBookingDate('day after tomorrow', baseDate);
    assert.equal(dayAfter.isValid, true);
    assert.equal(dayAfter.isPast, false);
    assert.equal(dayAfter.isoDate, '2026-09-21');

    // the day after tomorrow variation
    const theDayAfter = validateBookingDate('the day after tomorrow', baseDate);
    assert.equal(theDayAfter.isValid, true);
    assert.equal(theDayAfter.isoDate, '2026-09-21');

    // yesterday = current date - 1 (2026-09-18)
    const yesterday = validateBookingDate('yesterday', baseDate);
    assert.equal(yesterday.isValid, false);
    assert.equal(yesterday.isPast, true);
    assert.equal(yesterday.isoDate, '2026-09-18');
  });

  it('should correctly resolve weekdays to upcoming dates across calendar boundaries', () => {
    // baseDate: Saturday, September 19, 2026
    const baseDate = new Date('2026-09-19T10:00:00');

    // Monday should resolve to September 21, 2026
    const monday = validateBookingDate('Monday', baseDate);
    assert.equal(monday.isValid, true);
    assert.equal(monday.isPast, false);
    assert.equal(monday.isoDate, '2026-09-21');

    // on Monday
    const onMonday = validateBookingDate('on Monday', baseDate);
    assert.equal(onMonday.isValid, true);
    assert.equal(onMonday.isoDate, '2026-09-21');

    // Tuesday -> 2026-09-22
    const tuesday = validateBookingDate('Tuesday', baseDate);
    assert.equal(tuesday.isValid, true);
    assert.equal(tuesday.isoDate, '2026-09-22');

    // Sunday -> 2026-09-20 (tomorrow)
    const sunday = validateBookingDate('Sunday', baseDate);
    assert.equal(sunday.isValid, true);
    assert.equal(sunday.isoDate, '2026-09-20');

    // Weekday spanning month boundary:
    // Friday September 25, 2026 -> next Thursday is October 1, 2026
    const sep25Friday = new Date('2026-09-25T10:00:00');
    const octThursday = validateBookingDate('Thursday', sep25Friday);
    assert.equal(octThursday.isoDate, '2026-10-01');
  });

  it('should correctly handle month and year boundaries in relative date arithmetic', () => {
    // Month boundary: End of September (30 days)
    const endOfSept = new Date('2026-09-30T10:00:00');
    const septTomorrow = validateBookingDate('tomorrow', endOfSept);
    assert.equal(septTomorrow.isoDate, '2026-10-01');

    const septDayAfter = validateBookingDate('day after tomorrow', endOfSept);
    assert.equal(septDayAfter.isoDate, '2026-10-02');

    // Month boundary: 31-day month (October)
    const endOfOct = new Date('2026-10-31T10:00:00');
    const octTomorrow = validateBookingDate('tomorrow', endOfOct);
    assert.equal(octTomorrow.isoDate, '2026-11-01');

    // Non-leap year February (2026: 28 days)
    const feb28NonLeap = new Date('2026-02-28T10:00:00');
    const nonLeapTomorrow = validateBookingDate('tomorrow', feb28NonLeap);
    assert.equal(nonLeapTomorrow.isoDate, '2026-03-01');

    const nonLeapDayAfter = validateBookingDate('day after tomorrow', feb28NonLeap);
    assert.equal(nonLeapDayAfter.isoDate, '2026-03-02');

    // Leap year February (2028: 29 days)
    const feb28Leap = new Date('2028-02-28T10:00:00');
    const leapTomorrow = validateBookingDate('tomorrow', feb28Leap);
    assert.equal(leapTomorrow.isoDate, '2028-02-29');

    const leapDayAfter = validateBookingDate('day after tomorrow', feb28Leap);
    assert.equal(leapDayAfter.isoDate, '2028-03-01');

    // Year boundary: Dec 31 to Jan 1 of next year
    const newYearsEve = new Date('2026-12-31T10:00:00');
    const newYearTomorrow = validateBookingDate('tomorrow', newYearsEve);
    assert.equal(newYearTomorrow.isoDate, '2027-01-01');

    const dec30 = new Date('2026-12-30T10:00:00');
    const newYearDayAfter = validateBookingDate('day after tomorrow', dec30);
    assert.equal(newYearDayAfter.isoDate, '2027-01-01');
  });

  it('should normalize Indian logistics localities with STT phonetics', () => {
    assert.equal(normalizeLocation('Core Mangala 4th block'), 'Koramangala 4th block');
    assert.equal(normalizeLocation('I want to go to White Field'), 'I want to go to Whitefield');
    assert.equal(normalizeLocation('Pickup at H S R layout sect 1'), 'Pickup at HSR Layout Sector 1');
    assert.equal(normalizeLocation('Indira Nagar 100ft road'), 'Indiranagar 100ft road');
  });

  it('should parse floor and elevator accessibility from colloquial voice input', () => {
    const res1 = parseFloorAndLift('3rd floor no lift');
    assert.equal(res1.floor, 3);
    assert.equal(res1.hasElevator, false);

    const res2 = parseFloorAndLift('ground floor');
    assert.equal(res2.floor, 0);

    const res3 = parseFloorAndLift('second floor with elevator');
    assert.equal(res3.floor, 2);
    assert.equal(res3.hasElevator, true);
  });

  it('should detect vague cargo descriptions that require follow-up', () => {
    assert.equal(isInventoryVague('a few things'), true);
    assert.equal(isInventoryVague('some stuff'), true);
    assert.equal(isInventoryVague('household items'), true);
    assert.equal(isInventoryVague('1 double bed and 3 boxes'), false);
  });

  it('should calculate correct Porter fleet vehicle recommendation', () => {
    const smallLoad: InventoryItem[] = [
      {
        id: '1',
        name: 'Carton Box',
        category: 'BOXES',
        quantity: 2,
        size: 'SMALL',
        isHazardous: false,
        approxVolumeCuFt: 6,
        approxWeightKg: 10
      }
    ];
    const smallSizing = calculateRecommendedVehicle(smallLoad);
    assert.equal(smallSizing.vehicle, 'TWO_WHEELER');

    const houseMove: InventoryItem[] = [
      {
        id: '2',
        name: 'Double Bed',
        category: 'FURNITURE',
        quantity: 1,
        size: 'LARGE',
        isHazardous: false,
        approxVolumeCuFt: 60,
        approxWeightKg: 70
      },
      {
        id: '3',
        name: '3-Seater Sofa',
        category: 'FURNITURE',
        quantity: 1,
        size: 'LARGE',
        isHazardous: false,
        approxVolumeCuFt: 55,
        approxWeightKg: 65
      },
      {
        id: '4',
        name: 'Refrigerator',
        category: 'APPLIANCE',
        quantity: 1,
        size: 'LARGE',
        isHazardous: false,
        approxVolumeCuFt: 35,
        approxWeightKg: 60
      }
    ];
    const houseSizing = calculateRecommendedVehicle(houseMove);
    assert.equal(houseSizing.vehicle, 'TATA_ACE');
  });

  it('should block prohibited and hazardous items', () => {
    const petCheck = checkHazardousItem('My pet dog and 2 cats');
    assert.equal(petCheck.isHazardous, true);

    const gasCheck = checkHazardousItem('2 gas cylinders');
    assert.equal(gasCheck.isHazardous, true);

    const furnitureCheck = checkHazardousItem('1 wooden dining table');
    assert.equal(furnitureCheck.isHazardous, false);
  });

  it('should require extra helpers when high floor without elevator', () => {
    const heavyItems: InventoryItem[] = [
      {
        id: '1',
        name: 'Double Bed',
        category: 'FURNITURE',
        quantity: 1,
        size: 'LARGE',
        isHazardous: false,
        approxVolumeCuFt: 60,
        approxWeightKg: 70
      }
    ];
    const pickupWithStairs: LocationDetail = {
      rawText: '3rd floor',
      city: 'Bengaluru',
      floor: 3,
      hasElevator: false,
      isServiceable: true,
      verified: true
    };
    const dropoffWithLift: LocationDetail = {
      rawText: 'Ground',
      city: 'Bengaluru',
      floor: 0,
      hasElevator: true,
      isServiceable: true,
      verified: true
    };

    const helperCalc = calculateHelpersRequirement(heavyItems, pickupWithStairs, dropoffWithLift);
    assert.equal(helperCalc.helpersNeeded, 2);
  });

  it('should reject identical pickup and dropoff locations', () => {
    const sameLocCheck = validateSameLocation('Koramangala', 'Koramangala');
    assert.equal(sameLocCheck.isValid, false);
  });


  it('should validate route serviceability within supported operational hubs', () => {
    // Both in Kochi hub
    const kochiRoute = validateRouteServiceability('Kakkanad', 'Vyttila');
    assert.equal(kochiRoute.isServiceable, true);

    // Both in Bengaluru hub
    const blrRoute = validateRouteServiceability('Koramangala', 'Whitefield');
    assert.equal(blrRoute.isServiceable, true);

    // Out-of-scope international destination
    const internationalRoute = validateRouteServiceability('Kakkanad', 'London');
    assert.equal(internationalRoute.isServiceable, false);
    assert.ok(internationalRoute.error?.includes('service'));

    const nyRoute = validateRouteServiceability('Whitefield', 'New York');
    assert.equal(nyRoute.isServiceable, false);

    // Unsupported cross-city routes
    const blrToKochiRoute = validateRouteServiceability('Bengaluru', 'Kochi');
    assert.equal(blrToKochiRoute.isServiceable, false);
    assert.ok(blrToKochiRoute.error?.includes('inter-city') || blrToKochiRoute.error?.includes('outside'));

    const delhiRoute = validateRouteServiceability('Bengaluru', 'Delhi');
    assert.equal(delhiRoute.isServiceable, false);
  });

  it('should distinguish genuine STT uncertainty from known phonetic variations', () => {
    // Genuine locality uncertainty
    const unc1 = detectSTTUncertainty('somewhere near Kakkanad');
    assert.ok(unc1?.isUncertain);

    const unc2 = detectSTTUncertainty('around Kakkanad');
    assert.ok(unc2?.isUncertain);

    const unc3 = detectSTTUncertainty('maybe Kakkanad');
    assert.ok(unc3?.isUncertain);

    const unc4 = detectSTTUncertainty('Kakkanad or Vyttila');
    assert.ok(unc4?.isUncertain);

    // Definitive locality with phonetic spelling should NOT be marked uncertain
    const definitive = detectSTTUncertainty('Pickup is Kakkanad');
    assert.equal(definitive, null);

    const normalized = normalizeLocation('kakkad');
    assert.equal(normalized, 'Kakkanad');
  });


  it('should reject booking completeness when cargo exceeds standard fleet capacity', () => {
    const state = createInitialBookingState('overload-test');
    state.pickup.normalizedLocation = 'Kakkanad';
    state.pickup.verified = true;
    state.dropoff.normalizedLocation = 'Vyttila';
    state.dropoff.verified = true;
    state.schedule.parsedDate = '2026-09-18';
    state.schedule.parsedTimeSlot = '2:00 PM';
    state.schedule.isValid = true;
    // 50 double beds (> 3000 kg and > 2500 cu ft)
    state.inventory.items = [{
      id: 'heavy-1',
      name: 'Double Bed',
      category: 'FURNITURE',
      quantity: 50,
      size: 'LARGE',
      isHazardous: false,
      approxVolumeCuFt: 60,
      approxWeightKg: 70
    }];
    const sizing = calculateRecommendedVehicle(state.inventory.items);
    state.logistics.recommendedVehicle = sizing.vehicle;
    assert.equal(state.logistics.recommendedVehicle, 'UNSERVICEABLE_OVERLOAD');
    assert.equal(isBookingComplete(state), false);
  });

  it('should detect inaudible, garbled or unusable audio transcripts', () => {
    assert.equal(isUnusableAudio('[inaudible]'), true);
    assert.equal(isUnusableAudio('[unintelligible]'), true);
    assert.equal(isUnusableAudio('[noise]'), true);
    assert.equal(isUnusableAudio('...???'), true);
    assert.equal(isUnusableAudio('umm uhh'), true);
    assert.equal(isUnusableAudio('I want to move a sofa'), false);
    assert.equal(isUnusableAudio('Tomorrow at 3 PM'), false);
  });
});

