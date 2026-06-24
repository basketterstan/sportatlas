
import React, { useEffect } from 'react';

interface AdSenseHandlerProps {
  isPaid: boolean;
}

const AdSenseHandler: React.FC<AdSenseHandlerProps> = ({ isPaid }) => {
  useEffect(() => {
    if (isPaid) return;

    // AdSense script is now loaded in index.html
    // This component can be used for other AdSense-related logic if needed
  }, [isPaid]);

  return null;
};

export default AdSenseHandler;
