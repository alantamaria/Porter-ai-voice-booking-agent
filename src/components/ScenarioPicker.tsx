'use client';

import React from 'react';
import { Sparkles, Play } from 'lucide-react';

interface ScenarioPickerProps {
  onSelectScenario: (text: string) => void;
  disabled: boolean;
}

const EVALUATION_SCENARIOS = [
  {
    title: '1. Official Assessment Prompt (Vague Cargo)',
    text: 'I need to move a few things from Koramangala to Whitefield tomorrow evening.',
    description: 'Tests missing details detection & ambiguity handling ("a few things").'
  },
  {
    title: '2. Out-of-Order & Property Access',
    text: 'Pickup is 3rd floor no lift at HSR Layout. We have a double bed and 4 carton boxes.',
    description: 'Tests out-of-order slots, floor parsing, and helper crew estimation.'
  },
  {
    title: '3. Contradiction & Correction Recovery',
    text: 'Actually wait, change pickup to Indiranagar 100ft road, not Koramangala. And remove the sofa.',
    description: 'Tests slot overwrite detection, audit logging, and explicit confirmation.'
  },
  {
    title: '4. Negative Path: Past Date & Hazardous Goods',
    text: 'I want to schedule the move for yesterday with 2 gas cylinders and a pet dog.',
    description: 'Tests deterministic guardrails rejecting past dates and prohibited items.'
  },
  {
    title: '5. Negative Path: Off-Topic Detour',
    text: "What's the weather like in Bangalore right now?",
    description: 'Tests polite off-topic deflection and conversational recovery.'
  },
  {
    title: '6. Final Review & Verbal Confirmation',
    text: 'Yes, the summary looks completely accurate. Please confirm the booking.',
    description: 'Tests transition from requirements review to confirmed state.'
  }
];

export const ScenarioPicker: React.FC<ScenarioPickerProps> = ({ onSelectScenario, disabled }) => {
  return (
    <div className="scenario-card">
      <div className="scenario-header">
        <Sparkles className="icon-sm text-accent" />
        <span className="scenario-title">Evaluator Quick Scenarios (1-Click Test Runs)</span>
      </div>
      <p className="scenario-sub">
        Click any scenario below to evaluate how the agent handles clean and negative conversational paths:
      </p>
      <div className="scenarios-grid">
        {EVALUATION_SCENARIOS.map((sc, idx) => (
          <button
            key={idx}
            onClick={() => onSelectScenario(sc.text)}
            disabled={disabled}
            className="scenario-btn"
          >
            <div className="scenario-btn-top">
              <span className="scenario-btn-title">{sc.title}</span>
              <Play className="icon-xs scenario-play-icon" />
            </div>
            <p className="scenario-btn-quote">"{sc.text}"</p>
            <span className="scenario-btn-desc">{sc.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
