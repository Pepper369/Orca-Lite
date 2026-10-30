import React from 'react';

export type MascotMood = 'happy' | 'calculating' | 'saving' | 'caution' | 'cheering' | 'waving';

export interface OrcaMascotProps {
  mood?: MascotMood;
  size?: number;
  className?: string;
  bubbleText?: string;
  showBadgeBackground?: boolean;
  interactive?: boolean;
  onMascotClick?: () => void;
}

export const OrcaMascot: React.FC<OrcaMascotProps> = () => null;
