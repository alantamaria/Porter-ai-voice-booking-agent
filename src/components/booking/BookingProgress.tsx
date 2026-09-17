'use client';

import React from 'react';
import { BookingState } from '@/types/booking';
import { Check, Circle, AlertCircle } from 'lucide-react';

interface BookingProgressProps {
  state: BookingState;
}

export const BookingProgress: React.FC<BookingProgressProps> = ({ state }) => {
  const { pickup, dropoff, schedule, inventory, metadata } = state;

  const isTimeAmbiguous =
    metadata.uncertainties.some((u) => u.field.toLowerCase().includes('time') || u.field.toLowerCase().includes('schedule')) ||
    metadata.detectedAmbiguitiesInLastTurn.some((a) => a.toLowerCase().includes('time'));

  const items = [
    {
      id: 'pickup',
      label: 'Pickup',
      status: pickup.verified ? 'done' : 'missing',
    },
    {
      id: 'dropoff',
      label: 'Drop-off',
      status: dropoff.verified ? 'done' : 'missing',
    },
    {
      id: 'date',
      label: 'Date',
      status: schedule.isPastDate ? 'warning' : schedule.parsedDate ? 'done' : 'missing',
    },
    {
      id: 'time',
      label: 'Time',
      status: isTimeAmbiguous ? 'warning' : schedule.parsedTimeSlot ? 'done' : 'missing',
    },
    {
      id: 'inventory',
      label: 'Inventory',
      status: inventory.isVague ? 'warning' : inventory.items.length > 0 ? 'done' : 'missing',
    },
  ];

  return (
    <div className="booking-progress-block">
      <div className="progress-top-row">
        <span className="progress-title">Booking Progress</span>
        <span className="progress-score">{metadata.completionScore}% Complete</span>
      </div>

      {/* Progress Bar */}
      <div className="progress-track" role="progressbar" aria-valuenow={metadata.completionScore} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="progress-fill"
          style={{ width: `${Math.min(100, Math.max(0, metadata.completionScore))}%` }}
        />
      </div>

      {/* Checklist Pills */}
      <div className="progress-checklist">
        {items.map((item) => (
          <div
            key={item.id}
            className={`checklist-item item-${item.status}`}
            title={`${item.label}: ${item.status}`}
          >
            {item.status === 'done' ? (
              <Check className="checklist-icon text-emerald-400" aria-hidden="true" />
            ) : item.status === 'warning' ? (
              <AlertCircle className="checklist-icon text-amber-400" aria-hidden="true" />
            ) : (
              <Circle className="checklist-icon text-slate-400" aria-hidden="true" />
            )}
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
