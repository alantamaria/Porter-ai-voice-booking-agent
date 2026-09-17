'use client';

import React, { useEffect } from 'react';
import { BookingState } from '@/types/booking';
import { CheckCircle2, Download, RefreshCcw, X, Truck, Calendar, MapPin, Box } from 'lucide-react';
import confetti from 'canvas-confetti';

interface ConfirmationModalProps {
  isOpen: boolean;
  state: BookingState;
  onClose: () => void;
  onReset: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  state,
  onClose,
  onReset
}) => {
  useEffect(() => {
    if (isOpen) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (e) {
        // ignore
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownloadJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `porter-booking-${state.sessionId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <CheckCircle2 className="icon-md text-success" />
            <h3>Porter Booking Confirmed</h3>
          </div>
          <button onClick={onClose} className="btn-close-modal">
            <X className="icon-sm" />
          </button>
        </div>

        <div className="modal-body">
          <div className="booking-ref-banner">
            <span className="ref-label">Booking Reference ID</span>
            <span className="ref-value">#PTR-9021</span>
          </div>

          <div className="summary-grid">
            {/* Route */}
            <div className="summary-item">
              <div className="summary-item-header">
                <MapPin className="icon-xs text-primary" />
                <span>Move Route</span>
              </div>
              <p>
                <strong>From:</strong> {state.pickup.normalizedLocation || 'Not provided'} (Floor {state.pickup.floor}, {state.pickup.hasElevator ? 'Elevator' : 'Stairs'})
              </p>
              <p>
                <strong>To:</strong> {state.dropoff.normalizedLocation || 'Not provided'} (Floor {state.dropoff.floor}, {state.dropoff.hasElevator ? 'Elevator' : 'Stairs'})
              </p>
            </div>

            {/* Schedule */}
            <div className="summary-item">
              <div className="summary-item-header">
                <Calendar className="icon-xs text-primary" />
                <span>Moving Date & Time</span>
              </div>
              <p><strong>Date:</strong> {state.schedule.parsedDate || 'Pending'}</p>
              <p><strong>Slot:</strong> {state.schedule.parsedTimeSlot || 'Flexible'}</p>
            </div>

            {/* Cargo */}
            <div className="summary-item">
              <div className="summary-item-header">
                <Box className="icon-xs text-primary" />
                <span>Inventory ({state.inventory.items.length} unique items)</span>
              </div>
              <p>
                {state.inventory.items.map(i => `${i.quantity}x ${i.name}`).join(', ') || 'Household goods'}
              </p>
              <p className="text-muted text-xs">
                Total volume: ~{state.inventory.estimatedTotalVolumeCuFt} cu. ft. | Weight: ~{state.inventory.estimatedWeightKg} kg
              </p>
            </div>

            {/* Vehicle & Price */}
            <div className="summary-item">
              <div className="summary-item-header">
                <Truck className="icon-xs text-primary" />
                <span>Logistics & Pricing</span>
              </div>
              <p><strong>Fleet Assigned:</strong> {state.logistics.vehicleDisplayName}</p>
              <p><strong>Helpers:</strong> {state.logistics.helpersRequired} Porter Driver Assistant(s)</p>
              <p><strong>Estimated Fare:</strong> ₹{state.logistics.estimatedBasePriceInr}</p>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={handleDownloadJson} className="btn-secondary">
            <Download className="icon-xs" />
            <span>Export Requirements JSON</span>
          </button>
          <button
            onClick={() => {
              onClose();
              onReset();
            }}
            className="btn-primary"
          >
            <RefreshCcw className="icon-xs" />
            <span>Start New Booking</span>
          </button>
        </div>
      </div>
    </div>
  );
};
