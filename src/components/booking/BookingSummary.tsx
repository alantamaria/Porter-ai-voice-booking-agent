'use client';

import React from 'react';
import { BookingState } from '@/types/booking';
import { BookingField, FieldStatus } from './BookingField';
import { BookingProgress } from './BookingProgress';
import { RequirementsReview } from './RequirementsReview';
import { BookingConfirmation } from './BookingConfirmation';
import {
  MapPin,
  Calendar,
  Clock,
  Box,
  Truck,
  Users,
  AlertTriangle,
  ClipboardList,
} from 'lucide-react';

interface BookingSummaryProps {
  state: BookingState;
  onConfirmBooking: () => void;
  onMakeCorrection: () => void;
  onResetBooking: () => void;
}

export const BookingSummary: React.FC<BookingSummaryProps> = ({
  state,
  onConfirmBooking,
  onMakeCorrection,
  onResetBooking,
}) => {
  const { pickup, dropoff, schedule, inventory, logistics, metadata, phase } = state;

  // Determine field statuses
  const pickupStatus: FieldStatus = pickup.verified ? 'valid' : 'missing';
  const dropoffStatus: FieldStatus = dropoff.verified ? 'valid' : 'missing';

  let dateStatus: FieldStatus = 'missing';
  let dateMessage: string | undefined;
  if (schedule.isPastDate) {
    dateStatus = 'needs_clarification';
    dateMessage = 'Date is in the past. Please select today or a future date.';
  } else if (schedule.parsedDate) {
    dateStatus = 'valid';
  }

  let timeStatus: FieldStatus = 'missing';
  let timeMessage: string | undefined;
  const isTimeAmbiguous =
    metadata.uncertainties.some((u) => u.field.toLowerCase().includes('time') || u.field.toLowerCase().includes('schedule')) ||
    metadata.detectedAmbiguitiesInLastTurn.some((a) => a.toLowerCase().includes('time'));

  if (isTimeAmbiguous) {
    timeStatus = 'needs_clarification';
    timeMessage = 'Time window is ambiguous. Please provide a specific time like 10 AM or 3 PM.';
  } else if (schedule.parsedTimeSlot) {
    timeStatus = 'valid';
  }

  let inventoryStatus: FieldStatus = 'missing';
  let inventoryMessage: string | undefined;
  if (inventory.isVague) {
    inventoryStatus = 'needs_clarification';
    inventoryMessage = 'Vague inventory ("a few things"). Please list specific items like 1 sofa, 2 beds, or 4 boxes.';
  } else if (inventory.items.length > 0) {
    inventoryStatus = 'valid';
  }

  // Check if identical pickup and dropoff
  const isSameLocation =
    pickup.normalizedLocation &&
    dropoff.normalizedLocation &&
    pickup.normalizedLocation.toLowerCase() === dropoff.normalizedLocation.toLowerCase();

  return (
    <aside className="booking-summary-panel" aria-label="Current booking requirements summary">
      <div className="summary-header">
        <div className="summary-title-row">
          <ClipboardList className="icon-sm text-primary" aria-hidden="true" />
          <h2>Booking Details</h2>
        </div>
      </div>

      {/* Progress Indicator */}
      <BookingProgress state={state} />

      {/* Identical Location Guardrail Warning */}
      {isSameLocation && (
        <div className="validation-alert-banner" role="alert">
          <AlertTriangle className="icon-xs text-danger" aria-hidden="true" />
          <span>Pickup and drop-off locations cannot be identical. Please specify a different destination.</span>
        </div>
      )}

      {/* If confirmed: show confirmation card */}
      {phase === 'BOOKING_CONFIRMED' ? (
        <BookingConfirmation state={state} onReset={onResetBooking} />
      ) : phase === 'REQUIREMENTS_REVIEW' ? (
        /* If in review phase: show requirements review card */
        <RequirementsReview
          state={state}
          onConfirm={onConfirmBooking}
          onCorrection={onMakeCorrection}
        />
      ) : (
        /* Persistent collected fields */
        <div className="fields-container">
          {/* Pickup */}
          <BookingField
            label="Pickup Location"
            icon={<MapPin className="icon-xs text-primary" />}
            status={pickupStatus}
            value={pickup.normalizedLocation}
            details={
              pickup.normalizedLocation ? (
                <span className="access-meta">
                  Floor: <strong>{pickup.floor === 0 ? 'Ground' : pickup.floor ?? 'Not specified'}</strong> •
                  Elevator: <strong>{pickup.hasElevator === null ? 'Not specified' : pickup.hasElevator ? 'Yes' : 'No Lift'}</strong>
                </span>
              ) : null
            }
          />

          {/* Drop-off */}
          <BookingField
            label="Drop-off Location"
            icon={<MapPin className="icon-xs text-primary" />}
            status={dropoffStatus}
            value={dropoff.normalizedLocation}
            details={
              dropoff.normalizedLocation ? (
                <span className="access-meta">
                  Floor: <strong>{dropoff.floor === 0 ? 'Ground' : dropoff.floor ?? 'Not specified'}</strong> •
                  Elevator: <strong>{dropoff.hasElevator === null ? 'Not specified' : dropoff.hasElevator ? 'Yes' : 'No Lift'}</strong>
                </span>
              ) : null
            }
          />

          {/* Date */}
          <BookingField
            label="Move Date"
            icon={<Calendar className="icon-xs text-primary" />}
            status={dateStatus}
            value={schedule.parsedDate}
            statusMessage={dateMessage}
          />

          {/* Time Window */}
          <BookingField
            label="Move Time"
            icon={<Clock className="icon-xs text-primary" />}
            status={timeStatus}
            value={schedule.parsedTimeSlot}
            statusMessage={timeMessage}
          />

          {/* Inventory */}
          <BookingField
            label={`Inventory (${inventory.items.reduce((acc, i) => acc + i.quantity, 0)} items)`}
            icon={<Box className="icon-xs text-primary" />}
            status={inventoryStatus}
            statusMessage={inventoryMessage}
          >
            {inventory.items.length > 0 ? (
              <div className="inventory-chips-wrap">
                {inventory.items.map((item) => (
                  <span key={item.id} className="inventory-chip">
                    <strong>{item.quantity}x</strong> {item.name}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-val-empty">
                {inventory.isVague ? 'Vague description provided' : 'Not provided'}
              </span>
            )}
          </BookingField>

          {/* Logistics Recommendation (fleet & helpers) */}
          <div className="logistics-info-card">
            <div className="logistics-row">
              <div className="logistics-col">
                <span className="logistics-label">
                  <Truck className="icon-xxs text-primary" aria-hidden="true" /> Recommended Fleet
                </span>
                <span className="logistics-value">{logistics.vehicleDisplayName}</span>
              </div>
              <div className="logistics-col">
                <span className="logistics-label">
                  <Users className="icon-xxs text-primary" aria-hidden="true" /> Helpers
                </span>
                <span className="logistics-value">
                  {logistics.helpersRequired} Assistant{logistics.helpersRequired === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
