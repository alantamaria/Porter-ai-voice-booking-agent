'use client';

import React from 'react';
import { BookingState } from '@/types/booking';
import { MapPin, Calendar, Truck, Box, CheckCircle2, AlertCircle, ArrowRight, UserCheck } from 'lucide-react';

interface BookingCardProps {
  state: BookingState;
  onConfirmClick?: () => void;
}

export const BookingCard: React.FC<BookingCardProps> = ({ state, onConfirmClick }) => {
  const { pickup, dropoff, schedule, inventory, logistics, metadata, phase } = state;
  const isComplete = metadata.completionScore >= 95 || phase === 'REQUIREMENTS_REVIEW' || phase === 'BOOKING_CONFIRMED';

  return (
    <div className="booking-card">
      <div className="booking-card-header">
        <div>
          <span className="booking-badge">PORTER SMART BOOKING</span>
          <h2 className="booking-card-title">Live Requirements</h2>
        </div>
        <div className="completion-container">
          <div className="completion-ring">
            <span className="completion-number">{metadata.completionScore}%</span>
          </div>
          <span className="completion-label">Complete</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="progress-bar-bg">
        <div
          className="progress-bar-fill"
          style={{ width: `${metadata.completionScore}%` }}
        />
      </div>

      {/* Missing Fields Warning Bar */}
      {metadata.missingMandatoryFields.length > 0 && phase !== 'BOOKING_CONFIRMED' && (
        <div className="missing-fields-banner">
          <AlertCircle className="icon-sm icon-warning" />
          <span>
            <strong>Needed:</strong> {metadata.missingMandatoryFields.join(', ')}
          </span>
        </div>
      )}

      {/* Route Section */}
      <div className="card-section">
        <div className="section-title">
          <MapPin className="icon-sm text-primary" />
          <span>Route & Property Access</span>
        </div>
        <div className="route-grid">
          {/* Pickup */}
          <div className={`route-box ${pickup.verified ? 'verified' : 'pending'}`}>
            <div className="route-header">
              <span className="route-tag pickup-tag">PICKUP</span>
              {pickup.verified && <CheckCircle2 className="icon-xs text-success" />}
            </div>
            <div className="location-name">
              {pickup.normalizedLocation || <span className="text-muted">Not specified</span>}
            </div>
            <div className="access-details">
              Floor: <strong>{pickup.floor === 0 ? 'Ground' : pickup.floor}</strong> •
              Elevator: <strong>{pickup.hasElevator === null ? 'Unknown' : pickup.hasElevator ? 'Yes' : 'No Lift'}</strong>
            </div>
          </div>

          <div className="route-arrow">
            <ArrowRight className="icon-md text-muted" />
          </div>

          {/* Dropoff */}
          <div className={`route-box ${dropoff.verified ? 'verified' : 'pending'}`}>
            <div className="route-header">
              <span className="route-tag drop-tag">DROPOFF</span>
              {dropoff.verified && <CheckCircle2 className="icon-xs text-success" />}
            </div>
            <div className="location-name">
              {dropoff.normalizedLocation || <span className="text-muted">Not specified</span>}
            </div>
            <div className="access-details">
              Floor: <strong>{dropoff.floor === 0 ? 'Ground' : dropoff.floor}</strong> •
              Elevator: <strong>{dropoff.hasElevator === null ? 'Unknown' : dropoff.hasElevator ? 'Yes' : 'No Lift'}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule Section */}
      <div className="card-section">
        <div className="section-title">
          <Calendar className="icon-sm text-primary" />
          <span>Moving Schedule</span>
        </div>
        <div className="schedule-row">
          <div className="schedule-pill">
            <span className="pill-label">Date</span>
            <span className="pill-val">
              {schedule.parsedDate ? (
                <span className={schedule.isPastDate ? 'text-danger' : 'text-bold'}>
                  {schedule.parsedDate} {schedule.isPastDate && '(PAST DATE!)'}
                </span>
              ) : (
                <span className="text-muted">Not selected</span>
              )}
            </span>
          </div>
          <div className="schedule-pill">
            <span className="pill-label">Time Window</span>
            <span className="pill-val">
              {schedule.parsedTimeSlot || <span className="text-muted">Anytime</span>}
            </span>
          </div>
        </div>
      </div>

      {/* Inventory Section */}
      <div className="card-section">
        <div className="section-title">
          <Box className="icon-sm text-primary" />
          <span>Cargo & Inventory ({inventory.items.reduce((acc, i) => acc + i.quantity, 0)} items)</span>
        </div>
        {inventory.items.length === 0 ? (
          <div className="empty-inventory">
            {inventory.isVague ? (
              <span className="text-warning">Vague description provided ("a few things"). Needs specifics.</span>
            ) : (
              <span className="text-muted">No items added yet. Speak your items to add them.</span>
            )}
          </div>
        ) : (
          <div className="inventory-chips">
            {inventory.items.map(item => (
              <span key={item.id} className="inventory-chip">
                <strong>{item.quantity}x</strong> {item.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Logistics & Vehicle Recommendation */}
      <div className="card-section logistics-section">
        <div className="section-title">
          <Truck className="icon-sm text-primary" />
          <span>Porter Fleet Assignment</span>
        </div>
        <div className="vehicle-card">
          <div className="vehicle-info">
            <h4 className="vehicle-title">{logistics.vehicleDisplayName}</h4>
            <div className="vehicle-meta">
              <span>Helpers: <strong>{logistics.helpersRequired} Driver Assistant(s)</strong></span> •
              <span> Est. Vol: <strong>{inventory.estimatedTotalVolumeCuFt} cu. ft.</strong></span>
            </div>
          </div>
          <div className="fare-badge">
            <span className="fare-label">Est. Base Fare</span>
            <span className="fare-amount">₹{logistics.estimatedBasePriceInr}</span>
          </div>
        </div>
      </div>

      {/* Final Action / Review Status */}
      {phase === 'BOOKING_CONFIRMED' ? (
        <div className="confirmed-status-banner">
          <UserCheck className="icon-md" />
          <div>
            <strong>Booking Confirmed (#PTR-9021)</strong>
            <p>Driver partner assigned. Confirmation details dispatched.</p>
          </div>
        </div>
      ) : isComplete && onConfirmClick ? (
        <button onClick={onConfirmClick} className="btn-confirm-review">
          <CheckCircle2 className="icon-sm" />
          <span>Confirm & Lock Requirements</span>
        </button>
      ) : null}
    </div>
  );
};
