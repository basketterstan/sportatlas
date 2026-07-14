
import React from 'react';

interface LogoProps {
  className?: string;
  showText?: boolean;
  variant?: 'default' | 'professional';
}

const Logo: React.FC<LogoProps> = ({ className = "w-24 h-24", showText = true, variant = 'default' }) => {
  const handleNavigation = () => {
    window.location.href = 'https://app.sportatlas.com';
  };

  if (variant === 'professional') {
    return (
      <div onClick={handleNavigation} className="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity">
        <img src="/sportatlas-logo.png" alt="SportAtlas" className="h-10 w-auto" style={{ mixBlendMode: 'screen' }} />
      </div>
    );
  }

  return (
    <div onClick={handleNavigation} className={`flex flex-col items-center justify-center ${className} cursor-pointer hover:opacity-90 transition-opacity`}>
      <img src="/sportatlas-logo.png" alt="SportAtlas" className="w-full h-auto" style={{ mixBlendMode: 'screen' }} />
    </div>
  );
};

export default Logo;
