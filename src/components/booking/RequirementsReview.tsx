'use client';

import React from 'react';
import { BookingState } from '@/types/booking';
import { CheckCircle2, Edit3, MapPin, Calendar, Clock, Box } from 'lucide-react';

interface RequirementsReviewProps {
  state: BookingState;
  onConfirm: () => void;
  onCorrection: () => void;
}

export const RequirementsReview: React.FC<RequirementsReviewProps> = ({
  state,
  onConfirm,
  onCorrection,
}) => {
  const { pickup, dropoff, schedule, inventory } = state;

  return (
    <div className="requirements-review-card" role="region" aria-label="Review your booking requirements">
      <div className="review-header">
        <div className="review-badge">
          <CheckCircle2 className="icon-xs text-emerald-400" aria-hidden="true" />
          <span>Ready for Review</span>
        </div>
        <h3 className="review-title">Review your booking</h3>
        <p className="review-subtitle">
          Please verify the collected details before confirming your move.
        </p>
      </div>

      <div className="review-items-grid">
        {/* Pickup */}
        <div className="review-item">
          <span className="review-item-label">
            <MapPin className="icon-xxs text-primary" aria-hidden="true" /> Pickup
          </span>
          <span className="review-item-value">{pickup.normalizedLocation || 'Not specified'}</span>
          <span className="review-item-sub">
            Floor: {pickup.floor === 0 ? 'Ground' : pickup.floor ?? 'Ground'} &bull; Lift:{' '}
            {pickup.hasElevator === null ? 'Not specified' : pickup.hasElevator ? 'Yes' : 'No Lift'}
          </span>
        </div>

        {/* Drop-off */}
        <div className="review-item">
          <span className="review-item-label">
            <MapPin className="icon-xxs text-primary" aria-hidden="true" /> Drop-off
          </span>
          <span className="review-item-value">{dropoff.normalizedLocation || 'Not specified'}</span>
          <span className="review-item-sub">
            Floor: {dropoff.floor === 0 ? 'Ground' : dropoff.floor ?? 'Ground'} &bull; Lift:{' '}
            {dropoff.hasElevator === null ? 'Not specified' : dropoff.hasElevator ? 'Yes' : 'No Lift'}
          </span>
        </div>

        {/* Date & Time */}
        <div className="review-item">
          <span className="review-item-label">
            <Calendar className="icon-xxs text-primary" aria-hidden="true" /> Date
          </span>
          <span className="review-item-value">{schedule.parsedDate || 'Not specified'}</span>
        </div>

        <div className="review-item">
          <span className="review-item-label">
            <Clock className="icon-xxs text-primary" aria-hidden="true" /> Time
          </span>
          <span className="review-item-value">{schedule.parsedTimeSlot || 'Flexible'}</span>
        </div>

        {/* Inventory */}
        <div className="review-item full-width">
          <span className="review-item-label">
            <Box className="icon-xxs text-primary" aria-hidden="true" /> Items to Move
          </span>
          <span className="review-item-value">
            {inventory.items.length > 0
              ? inventory.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')
              : 'Standard household items'}
          </span>
        </div>
      </div>

      <div className="review-actions-row">
        <button
          type="button"
          onClick={onConfirm}
          className="btn-review-confirm"
          aria-label="Confirm booking details"
        >
          <CheckCircle2 className="icon-sm" aria-hidden="true" />
          <span>Confirm booking</span>
        </button>

        <button
          type="button"
          onClick={onCorrection}
          className="btn-review-correct"
          aria-label="Make a correction to booking details"
        >
          <Edit3 className="icon-xs" aria-hidden="true" />
          <span>Make a correction</span>
        </button>
      </div>
    </div>
  );
};
