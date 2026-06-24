
import React from 'react';

interface LogoProps {
  className?: string;
  showText?: boolean;
  variant?: 'default' | 'professional';
}

const Logo: React.FC<LogoProps> = ({ className = "w-24 h-24", showText = true, variant = 'default' }) => {
  const handleNavigation = () => {
    window.location.href = 'https://app.hoopsatlas.com';
  };

  if (variant === 'professional') {
    return (
      <div onClick={handleNavigation} className="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-opacity">
        <div className="w-10 h-10 bg-gradient-to-br from-ha-brand to-ha-brandDim rounded-xl flex items-center justify-center border border-white/20 shadow-lg">
           <span className="text-white font-black italic transform -skew-x-12 text-sm leading-none">HA</span>
        </div>
        <h2 className="text-2xl font-black italic uppercase text-white tracking-tighter">
          HOOPS<span className="text-ha-brand">ATLAS</span> <span className="text-white/40 ml-1 font-medium not-italic text-sm tracking-widest">COMMAND</span>
        </h2>
      </div>
    );
  }

  return (
    <div onClick={handleNavigation} className={`flex flex-col items-center justify-center ${className} cursor-pointer hover:opacity-90 transition-opacity`}>
      <div className="relative group active:scale-95 transition-transform duration-300">
        {/* Glowing background effect */}
        <div className="absolute inset-0 bg-ha-brand/10 blur-3xl rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
        
        <div className="relative w-full h-full aspect-square flex items-center justify-center bg-gradient-to-br from-ha-brand to-blue-700 rounded-[2rem] border-2 border-white/20 shadow-[0_20px_50px_rgba(6,182,212,0.2)] transform -skew-x-6">
           <span className="text-white font-black italic text-[2.5rem] md:text-[3.5rem] leading-none select-none tracking-tighter">HA</span>
        </div>
      </div>

      {showText && (
        <div className="mt-6 flex flex-col items-center">
          <span className="text-[18px] font-black uppercase italic tracking-[0.3em] text-white flex items-center">
            HOOPS<span className="text-ha-brand ml-1">ATLAS</span>
          </span>
          <div className="h-0.5 w-12 bg-gradient-to-r from-transparent via-cyan-500 to-transparent mt-2 opacity-40"></div>
        </div>
      )}
    </div>
  );
};

export default Logo;
