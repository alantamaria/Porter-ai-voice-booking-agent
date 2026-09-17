'use client';

import React from 'react';
import { CheckCircle2, AlertTriangle, Circle } from 'lucide-react';

export type FieldStatus = 'valid' | 'needs_clarification' | 'missing';

interface BookingFieldProps {
  label: string;
  icon?: React.ReactNode;
  status: FieldStatus;
  value?: string | null;
  statusMessage?: string;
  children?: React.ReactNode;
  details?: React.ReactNode;
}

export const BookingField: React.FC<BookingFieldProps> = ({
  label,
  icon,
  status,
  value,
  statusMessage,
  children,
  details,
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'valid':
        return (
          <span className="field-badge badge-valid">
            <CheckCircle2 className="icon-xxs text-emerald-400" aria-hidden="true" />
            <span>Collected</span>
          </span>
        );
      case 'needs_clarification':
        return (
          <span className="field-badge badge-clarification">
            <AlertTriangle className="icon-xxs text-amber-400" aria-hidden="true" />
            <span>Needs clarification</span>
          </span>
        );
      case 'missing':
      default:
        return (
          <span className="field-badge badge-missing">
            <Circle className="icon-xxs text-slate-400" aria-hidden="true" />
            <span>Missing</span>
          </span>
        );
    }
  };

  return (
    <div className={`booking-field-row field-status-${status}`}>
      <div className="field-header">
        <div className="field-label-group">
          {icon && <span className="field-icon" aria-hidden="true">{icon}</span>}
          <span className="field-label">{label}</span>
        </div>
        {getStatusBadge()}
      </div>

      <div className="field-content">
        {children ? (
          children
        ) : (
          <div className="field-value-text">
            {value ? (
              <span className="text-val-bold">{value}</span>
            ) : (
              <span className="text-val-empty">Not provided</span>
            )}
          </div>
        )}

        {details && <div className="field-details">{details}</div>}

        {status === 'needs_clarification' && statusMessage && (
          <div className="field-clarification-note">
            <AlertTriangle className="icon-xxs" aria-hidden="true" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
