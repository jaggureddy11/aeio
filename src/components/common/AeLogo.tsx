import React from 'react';
import logoMark from '../../assets/logo-mark.png';

interface Props {
  height?: number;
  className?: string;
  alt?: string;
}

export const AeLogo: React.FC<Props> = ({
  height = 20,
  className = '',
  alt = 'Aeio Logo',
}) => {
  // Ratio is 643 / 325 approx 1.98:1
  const width = Math.round(height * (643 / 325));

  return (
    <img
      src={logoMark}
      alt={alt}
      width={width}
      height={height}
      className={`aeio-brand-mark ${className}`}
      style={{
        height: `${height}px`,
        width: `${width}px`,
        objectFit: 'contain',
        display: 'inline-block',
        verticalAlign: 'middle',
      }}
      loading="eager"
    />
  );
};
