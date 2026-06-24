import React from 'react';
import CoachBoard from '../shared/CoachBoard';

interface MatchBoardProps {
  onBack: () => void;
}

const MatchBoard: React.FC<MatchBoardProps> = ({ onBack }) => {
  return (
    <div className="fixed inset-0 z-[100] bg-ha-bg">
      <CoachBoard 
        initialPlayers={[]}
        initialLines={[]}
        initialCourtType="full"
        isFullscreen={true}
        onSave={() => {}} // No storage needed for live sessions
        onCancel={onBack}
      />
    </div>
  );
};

export default MatchBoard;