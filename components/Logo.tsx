import React from 'react';

interface LogoProps {
  variant?: 'icon' | 'wordmark' | 'compact';
  className?: string;
  size?: number;
  glow?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
  variant = 'icon',
  className = '',
  size = 40,
  glow = false,
}) => {
  const renderIcon = (iconSize: number, includeGlow: boolean) => (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="pathGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#7B87F4', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#5E6AD2', stopOpacity: 1 }} />
        </linearGradient>
        {includeGlow && (
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* Outer circle */}
      <circle cx="100" cy="100" r="90" stroke="#2A2A2A" strokeWidth="2" fill="none" />

      {/* Maze rings - outer */}
      <path d="M 100 10 A 90 90 0 0 1 190 100" stroke="#2A2A2A" strokeWidth="2" fill="none" />
      <path d="M 190 100 A 90 90 0 0 1 100 190" stroke="#2A2A2A" strokeWidth="2" fill="none" />
      <path d="M 100 190 A 90 90 0 0 1 10 100" stroke="#2A2A2A" strokeWidth="2" fill="none" />

      {/* Second ring */}
      <circle cx="100" cy="100" r="70" stroke="#2A2A2A" strokeWidth="2" fill="none" />
      <path d="M 30 100 A 70 70 0 0 1 100 30" stroke="#2A2A2A" strokeWidth="2" fill="none" />
      <path d="M 100 30 A 70 70 0 0 1 170 100" stroke="#2A2A2A" strokeWidth="2" fill="none" />
      <path d="M 170 100 A 70 70 0 0 1 100 170" stroke="#2A2A2A" strokeWidth="2" fill="none" />

      {/* Third ring */}
      <circle cx="100" cy="100" r="50" stroke="#2A2A2A" strokeWidth="2" fill="none" />
      <path d="M 100 50 A 50 50 0 0 1 150 100" stroke="#2A2A2A" strokeWidth="2" fill="none" />
      <path d="M 150 100 A 50 50 0 0 1 100 150" stroke="#2A2A2A" strokeWidth="2" fill="none" />
      <path d="M 100 150 A 50 50 0 0 1 50 100" stroke="#2A2A2A" strokeWidth="2" fill="none" />

      {/* Fourth ring */}
      <circle cx="100" cy="100" r="30" stroke="#2A2A2A" strokeWidth="2" fill="none" />
      <path d="M 70 100 A 30 30 0 0 1 100 70" stroke="#2A2A2A" strokeWidth="2" fill="none" />
      <path d="M 100 70 A 30 30 0 0 1 130 100" stroke="#2A2A2A" strokeWidth="2" fill="none" />
      <path d="M 130 100 A 30 30 0 0 1 100 130" stroke="#2A2A2A" strokeWidth="2" fill="none" />

      {/* Radial walls */}
      <line x1="100" y1="10" x2="100" y2="50" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="145" y1="25" x2="125" y2="55" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="175" y1="55" x2="145" y2="75" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="190" y1="100" x2="150" y2="100" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="175" y1="145" x2="145" y2="125" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="145" y1="175" x2="125" y2="145" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="100" y1="190" x2="100" y2="150" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="55" y1="175" x2="75" y2="145" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="25" y1="145" x2="55" y2="125" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="10" y1="100" x2="50" y2="100" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="25" y1="55" x2="55" y2="75" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="55" y1="25" x2="75" y2="55" stroke="#2A2A2A" strokeWidth="2" />

      {/* Additional complexity walls */}
      <line x1="170" y1="70" x2="150" y2="70" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="130" y1="70" x2="110" y2="50" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="70" y1="70" x2="90" y2="50" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="30" y1="70" x2="50" y2="70" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="30" y1="130" x2="50" y2="130" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="70" y1="130" x2="90" y2="150" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="110" y1="150" x2="130" y2="130" stroke="#2A2A2A" strokeWidth="2" />
      <line x1="170" y1="130" x2="150" y2="130" stroke="#2A2A2A" strokeWidth="2" />

      {/* THE SOLUTION PATH - Glowing purple gradient */}
      <g filter={includeGlow ? 'url(#glow)' : undefined}>
        <path d="M 100 10 L 100 30" stroke="url(#pathGradient)" strokeWidth="4" strokeLinecap="round" />
        <path d="M 100 30 A 70 70 0 0 1 145 55" stroke="url(#pathGradient)" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M 145 55 L 145 75" stroke="url(#pathGradient)" strokeWidth="4" strokeLinecap="round" />
        <path d="M 145 75 A 50 50 0 0 1 125 125" stroke="url(#pathGradient)" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M 125 125 L 105 125" stroke="url(#pathGradient)" strokeWidth="4" strokeLinecap="round" />
        <path d="M 105 125 A 30 30 0 0 1 75 105" stroke="url(#pathGradient)" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M 75 105 L 75 95" stroke="url(#pathGradient)" strokeWidth="4" strokeLinecap="round" />
        <path d="M 75 95 A 25 25 0 0 1 100 85" stroke="url(#pathGradient)" strokeWidth="4" strokeLinecap="round" fill="none" />
        <circle cx="100" cy="85" r="3" fill="url(#pathGradient)" />
      </g>

      {/* Center goal - glowing dot */}
      <circle cx="100" cy="100" r="8" fill="url(#pathGradient)" filter={includeGlow ? 'url(#glow)' : undefined} />
      <circle cx="100" cy="100" r="4" fill="#FFFFFF" />
    </svg>
  );

  if (variant === 'compact') {
    return renderIcon(size, glow);
  }

  if (variant === 'wordmark') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {renderIcon(size, glow)}
        <span className="text-2xl font-bold bg-gradient-to-r from-[#7B87F4] to-[#5E6AD2] bg-clip-text text-transparent">
          Interview<span className="text-white">LM</span>
        </span>
      </div>
    );
  }

  return renderIcon(size, glow);
};

export default Logo;
