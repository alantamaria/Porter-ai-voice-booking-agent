'use client';

import React, { useState } from 'react';
import { BookingState } from '@/types/booking';
import { RefreshCw, AlertTriangle, ShieldCheck, History, ChevronDown, ChevronUp } from 'lucide-react';

interface NegativePathBadgesProps {
  state: BookingState;
}

export const NegativePathBadges: React.FC<NegativePathBadgesProps> = ({ state }) => {
  const [showHistory, setShowHistory] = useState(false);
  const { metadata, phase } = state;

  const hasCorrections = metadata.detectedCorrectionsInLastTurn.length > 0;
  const hasAmbiguities = metadata.detectedAmbiguitiesInLastTurn.length > 0;
  const hasWarnings = metadata.systemWarnings.length > 0;
  const historyCount = metadata.revisionHistory.length;

  return (
    <div className="inspector-card">
      <div className="inspector-header">
        <div className="inspector-title-row">
          <ShieldCheck className="icon-sm text-primary" />
          <span className="inspector-title">AI Reasoning & Negative Paths Inspector</span>
        </div>
        <span className={`phase-badge phase-${phase.toLowerCase()}`}>
          Phase: {phase.replace('_', ' ')}
        </span>
      </div>

      {/* Badges Bar */}
      <div className="badges-grid">
        {/* Corrections Badge */}
        <div className={`status-badge-item ${hasCorrections ? 'badge-active badge-correction' : 'badge-inactive'}`}>
          <RefreshCw className="icon-xs" />
          <span>
            {hasCorrections
              ? `Correction Handled: ${metadata.detectedCorrectionsInLastTurn[0]}`
              : 'Corrections: None in last turn'}
          </span>
        </div>

        {/* Ambiguity Badge */}
        <div className={`status-badge-item ${hasAmbiguities ? 'badge-active badge-ambiguity' : 'badge-inactive'}`}>
          <AlertTriangle className="icon-xs" />
          <span>
            {hasAmbiguities
              ? `Ambiguity Flagged: ${metadata.detectedAmbiguitiesInLastTurn[0]}`
              : 'Ambiguity: Clear'}
          </span>
        </div>

        {/* Guardrail Warning */}
        {hasWarnings && (
          <div className="status-badge-item badge-active badge-danger">
            <AlertTriangle className="icon-xs" />
            <span>Guardrail Alert: {metadata.systemWarnings[0]}</span>
          </div>
        )}
      </div>

      {/* Expandable State Revision History Audit Trail */}
      <div className="audit-toggle-container">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="btn-audit-toggle"
        >
          <History className="icon-xs" />
          <span>State Mutation Audit Trail ({historyCount} events)</span>
          {showHistory ? <ChevronUp className="icon-xs" /> : <ChevronDown className="icon-xs" />}
        </button>

        {showHistory && (
          <div className="audit-table-wrapper">
            {historyCount === 0 ? (
              <p className="text-muted text-sm" style={{ padding: '0.5rem' }}>
                No slot modifications recorded yet. As the user alters details or makes corrections, state mutations will appear here.
              </p>
            ) : (
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Turn</th>
                    <th>Field</th>
                    <th>Old Value</th>
                    <th>New Value</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {metadata.revisionHistory.map((entry, idx) => (
                    <tr key={idx}>
                      <td>#{entry.turnIndex}</td>
                      <td><code>{entry.field}</code></td>
                      <td className="text-danger">{String(entry.oldValue)}</td>
                      <td className="text-success">{String(entry.newValue)}</td>
                      <td><span className="reason-tag">{entry.reason}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
