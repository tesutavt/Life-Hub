import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { openMissionsDiary } from '../components/missions/missionsBus';

/** Старый адрес /daily-missions: открываем дневник поверх дэшборда. */
export default function DailyMissions() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/dashboard', { replace: true });
    window.setTimeout(openMissionsDiary, 0);
  }, [navigate]);
  return null;
}
