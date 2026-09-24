import React from 'react';

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
  size?: number | string;
}

export const SakuraIcon: React.FC<Props> = ({ className = '', size, alt = '🌸', ...props }) => {
  return (
    <img
      src="/sakura.png"
      alt={alt}
      className={`inline-block object-contain align-middle select-none pointer-events-none ${className}`}
      style={size ? { width: size, height: size } : undefined}
      {...props}
    />
  );
};
