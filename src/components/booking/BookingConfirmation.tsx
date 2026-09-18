'use client';

import React from 'react';
import { BookingState } from '@/types/booking';
import { CheckCircle2, RotateCcw, MapPin, Calendar, Box, Truck, Download } from 'lucide-react';

interface BookingConfirmationProps {
  state: BookingState;
  onReset: () => void;
}

export const BookingConfirmation: React.FC<BookingConfirmationProps> = ({ state, onReset }) => {
  const { pickup, dropoff, schedule, inventory, logistics } = state;

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `porter-booking-requirements-${state.sessionId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="booking-confirmation-card" role="region" aria-label="Booking confirmed details">
      <div className="confirmation-header">
        <div className="confirmation-icon-circle" aria-hidden="true">
          <CheckCircle2 className="icon-lg text-emerald-400" />
        </div>
        <h3 className="confirmation-title">Booking confirmed</h3>
        <p className="confirmation-subtitle">
          Your booking details have been confirmed in this assistant.
        </p>
        <div className="confirmation-disclaimer" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.4rem 0.8rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)' }}>
          Confirmed within this assistant (No official Porter booking created &bull; No external driver dispatched)
        </div>
      </div>

      <div className="confirmed-summary-box">
        <h4 className="summary-box-title">Confirmed Move Requirements</h4>

        <div className="confirmed-items-list">
          {/* Pickup & Dropoff */}
          <div className="confirmed-item-row">
            <span className="confirmed-item-key">
              <MapPin className="icon-xxs text-primary" aria-hidden="true" /> Route
            </span>
            <span className="confirmed-item-val">
              {pickup.normalizedLocation || 'Pickup'} &rarr; {dropoff.normalizedLocation || 'Drop-off'}
            </span>
          </div>

          {/* Schedule */}
          <div className="confirmed-item-row">
            <span className="confirmed-item-key">
              <Calendar className="icon-xxs text-primary" aria-hidden="true" /> Date & Time
            </span>
            <span className="confirmed-item-val">
              {schedule.parsedDate || 'Today/Tomorrow'}
              {schedule.parsedTimeSlot ? ` at ${schedule.parsedTimeSlot}` : ''}
            </span>
          </div>

          {/* Items */}
          <div className="confirmed-item-row">
            <span className="confirmed-item-key">
              <Box className="icon-xxs text-primary" aria-hidden="true" /> Items
            </span>
            <span className="confirmed-item-val">
              {inventory.items.length > 0
                ? inventory.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')
                : 'Household goods'}
            </span>
          </div>

          {/* Fleet Recommendation */}
          <div className="confirmed-item-row">
            <span className="confirmed-item-key">
              <Truck className="icon-xxs text-primary" aria-hidden="true" /> Fleet & Helpers
            </span>
            <span className="confirmed-item-val">
              {logistics.vehicleDisplayName} ({logistics.helpersRequired} Assistant{logistics.helpersRequired === 1 ? '' : 's'})
            </span>
          </div>
        </div>
      </div>

      <div className="confirmation-actions">
        <button
          type="button"
          onClick={onReset}
          className="btn-new-booking"
          aria-label="Start a new booking session"
        >
          <RotateCcw className="icon-xs" aria-hidden="true" />
          <span>Start a new booking</span>
        </button>

        <button
          type="button"
          onClick={handleExportJson}
          className="btn-export-json"
          aria-label="Download requirements JSON"
          title="Download verified requirements JSON"
        >
          <Download className="icon-xs" aria-hidden="true" />
          <span>Export requirements JSON</span>
        </button>
      </div>
    </div>
  );
};
