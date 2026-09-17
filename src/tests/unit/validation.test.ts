import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRecommendedVehicle,
  calculateHelpersRequirement,
  checkHazardousItem,
  validateRoute
} from '../../lib/validation/rules';
import {
  normalizeLocation,
  parseRelativeDate,
  parseFloorAndLift,
  isInventoryDescriptionVague
} from '../../lib/speech/normalizer';
import { InventoryItem, LocationDetail } from '../../types/booking';

describe('Validation & Domain Rules Unit Tests', () => {
  it('should reject past dates and accept future dates', () => {
    const fixedNow = new Date('2026-09-17T12:00:00Z');

    const tomorrow = parseRelativeDate('tomorrow', fixedNow);
    assert.equal(tomorrow.isPast, false);
    assert.equal(tomorrow.isoDate, '2026-09-18');

    const yesterday = parseRelativeDate('yesterday', fixedNow);
    assert.equal(yesterday.isPast, true);
    assert.equal(yesterday.isoDate, '2026-09-16');

    const explicitPast = parseRelativeDate('2025-01-01', fixedNow);
    assert.equal(explicitPast.isPast, true);

    const explicitFuture = parseRelativeDate('2026-10-01', fixedNow);
    assert.equal(explicitFuture.isPast, false);
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
    assert.equal(isInventoryDescriptionVague('a few things'), true);
    assert.equal(isInventoryDescriptionVague('some stuff'), true);
    assert.equal(isInventoryDescriptionVague('household items'), true);
    assert.equal(isInventoryDescriptionVague('1 double bed and 3 boxes'), false);
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
    const locA: LocationDetail = {
      rawText: 'Koramangala',
      normalizedLocation: 'Koramangala',
      city: 'Bengaluru',
      floor: 0,
      hasElevator: null,
      isServiceable: true,
      verified: true
    };
    const locB: LocationDetail = {
      rawText: 'Koramangala',
      normalizedLocation: 'Koramangala',
      city: 'Bengaluru',
      floor: 1,
      hasElevator: null,
      isServiceable: true,
      verified: true
    };
    const route = validateRoute(locA, locB);
    assert.equal(route.isValid, false);
  });
});
