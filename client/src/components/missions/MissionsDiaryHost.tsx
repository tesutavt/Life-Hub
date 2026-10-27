import React, { useEffect, useState } from 'react';
import MissionsDiary from './MissionsDiary';
import { onOpenMissionsDiary } from './missionsBus';
import { trackClientAction } from '../../achievements';

/** Глобальный дневник заданий: открывается из меню, профиля, поиска. */
export default function MissionsDiaryHost() {
  const [open, setOpen] = useState(false);
  useEffect(
    () =>
      onOpenMissionsDiary(() => {
        setOpen(true);
        trackClientAction('visit.missions');
      }),
    []
  );
  return <MissionsDiary open={open} onClose={() => setOpen(false)} />;
}
