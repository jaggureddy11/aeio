import React from 'react';

interface Props {
  size?: number;
  className?: string;
  color?: string;
}

export const ClaudeAsterisk: React.FC<Props> = ({
  size = 20,
  className = '',
  color = '#D97757',
}) => {
  // Replicates Claude's signature terracotta radiating asterisk/sunburst
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <g stroke={color} strokeWidth="2.4" strokeLinecap="round">
        {/* 12 radiating arms around center (0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330 deg) */}
        <line x1="12" y1="2.5" x2="12" y2="7" />
        <line x1="12" y1="17" x2="12" y2="21.5" />
        <line x1="2.5" y1="12" x2="7" y2="12" />
        <line x1="17" y1="12" x2="21.5" y2="12" />
        <line x1="5.28" y1="5.28" x2="8.46" y2="8.46" />
        <line x1="15.54" y1="15.54" x2="18.72" y2="18.72" />
        <line x1="5.28" y1="18.72" x2="8.46" y2="15.54" />
        <line x1="15.54" y1="8.46" x2="18.72" y2="5.28" />
        <line x1="7.25" y1="3.77" x2="9.5" y2="7.67" />
        <line x1="14.5" y1="16.33" x2="16.75" y2="20.23" />
        <line x1="3.77" y1="7.25" x2="7.67" y2="9.5" />
        <line x1="16.33" y1="14.5" x2="20.23" y2="16.75" />
      </g>
    </svg>
  );
};
