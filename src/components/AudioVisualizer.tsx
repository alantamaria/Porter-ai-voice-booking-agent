'use client';

import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  state: 'idle' | 'listening' | 'thinking' | 'speaking';
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ state }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let phase = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      // Draw subtle background glow
      const gradient = ctx.createRadialGradient(width / 2, centerY, 5, width / 2, centerY, 70);
      if (state === 'listening') {
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.25)'); // Vibrant Porter blue
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
      } else if (state === 'thinking') {
        gradient.addColorStop(0, 'rgba(234, 179, 8, 0.25)'); // Amber
        gradient.addColorStop(1, 'rgba(234, 179, 8, 0)');
      } else if (state === 'speaking') {
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.25)'); // Emerald green
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
      } else {
        gradient.addColorStop(0, 'rgba(148, 163, 184, 0.1)');
        gradient.addColorStop(1, 'rgba(148, 163, 184, 0)');
      }

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Draw dynamic sine waves
      const waveCount = state === 'idle' ? 2 : 4;
      for (let i = 0; i < waveCount; i++) {
        ctx.beginPath();
        ctx.lineWidth = 2.5;

        if (state === 'listening') {
          ctx.strokeStyle = `rgba(37, 99, 235, ${0.4 + i * 0.2})`;
        } else if (state === 'thinking') {
          ctx.strokeStyle = `rgba(217, 119, 6, ${0.4 + i * 0.2})`;
        } else if (state === 'speaking') {
          ctx.strokeStyle = `rgba(5, 150, 105, ${0.4 + i * 0.2})`;
        } else {
          ctx.strokeStyle = `rgba(100, 116, 139, ${0.2 + i * 0.1})`;
        }

        const frequency = state === 'idle' ? 0.015 : 0.035 + i * 0.01;
        const amplitude = state === 'idle' ? 4 : (state === 'listening' ? 24 : 18) - i * 3;
        const speed = state === 'idle' ? 0.02 : 0.08;

        for (let x = 0; x < width; x++) {
          const y = centerY + Math.sin(x * frequency + phase * (i + 1) * speed) * amplitude * Math.sin((x / width) * Math.PI);
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      phase += 1;
      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [state]);

  return (
    <div className="audio-visualizer-container">
      <canvas
        ref={canvasRef}
        width={320}
        height={80}
        className="audio-canvas"
      />
    </div>
  );
};
