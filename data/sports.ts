import { Sport } from '../types';

export interface SportConfig {
  id: Sport;
  labelEn: string;
  labelNl: string;
  labelEs: string;
  emoji: string;
  skills: string[];
  defaultCourtType: string;
  courtTypes: { value: string; labelEn: string; labelNl: string }[];
  playerTypes: { value: string; labelEn: string; color: string }[];
}

export const SPORTS: SportConfig[] = [
  {
    id: Sport.BASKETBALL,
    labelEn: 'Basketball',
    labelNl: 'Basketball',
    labelEs: 'Baloncesto',
    emoji: '🏀',
    skills: ['Shooting', 'Passing', 'Ball-handling', 'Defense', 'Conditioning', 'Team offense', 'Team defense'],
    defaultCourtType: 'half',
    courtTypes: [
      { value: 'half', labelEn: 'Half court', labelNl: 'Half court' },
      { value: 'full', labelEn: 'Full court', labelNl: 'Full court' },
    ],
    playerTypes: [
      { value: 'home', labelEn: 'Home', color: '#ef4444' },
      { value: 'away', labelEn: 'Away', color: '#3b82f6' },
      { value: 'ball', labelEn: 'Ball', color: '#f97316' },
      { value: 'cone', labelEn: 'Cone', color: '#facc15' },
      { value: 'coach', labelEn: 'Coach', color: '#64748b' },
    ],
  },
  {
    id: Sport.SOCCER,
    labelEn: 'Soccer',
    labelNl: 'Voetbal',
    labelEs: 'Fútbol',
    emoji: '⚽',
    skills: ['Passing', 'Shooting', 'Dribbling', 'Defense', 'Conditioning', 'Team offense', 'Team defense', 'Set pieces'],
    defaultCourtType: 'field-full',
    courtTypes: [
      { value: 'field-full', labelEn: 'Full field', labelNl: 'Heel veld' },
      { value: 'field-half', labelEn: 'Half field', labelNl: 'Half veld' },
    ],
    playerTypes: [
      { value: 'home', labelEn: 'Home', color: '#ef4444' },
      { value: 'away', labelEn: 'Away', color: '#3b82f6' },
      { value: 'ball', labelEn: 'Ball', color: '#f97316' },
      { value: 'cone', labelEn: 'Cone', color: '#facc15' },
      { value: 'coach', labelEn: 'Coach', color: '#64748b' },
    ],
  },
  {
    id: Sport.VOLLEYBALL,
    labelEn: 'Volleyball',
    labelNl: 'Volleybal',
    labelEs: 'Voleibol',
    emoji: '🏐',
    skills: ['Serving', 'Passing', 'Setting', 'Attacking', 'Blocking', 'Defense', 'Team play'],
    defaultCourtType: 'volleyball-court',
    courtTypes: [
      { value: 'volleyball-court', labelEn: 'Court', labelNl: 'Veld' },
    ],
    playerTypes: [
      { value: 'home', labelEn: 'Home', color: '#ef4444' },
      { value: 'away', labelEn: 'Away', color: '#3b82f6' },
      { value: 'ball', labelEn: 'Ball', color: '#f97316' },
      { value: 'cone', labelEn: 'Cone', color: '#facc15' },
      { value: 'coach', labelEn: 'Coach', color: '#64748b' },
    ],
  },
  {
    id: Sport.AMERICAN_FOOTBALL,
    labelEn: 'American Football',
    labelNl: 'American Football',
    labelEs: 'Fútbol Americano',
    emoji: '🏈',
    skills: ['Passing', 'Rushing', 'Blocking', 'Defense', 'Special teams', 'Conditioning', 'Playbook'],
    defaultCourtType: 'football-full',
    courtTypes: [
      { value: 'football-full', labelEn: 'Full field', labelNl: 'Heel veld' },
      { value: 'football-half', labelEn: 'Half field', labelNl: 'Half veld' },
    ],
    playerTypes: [
      { value: 'home', labelEn: 'Offense', color: '#ef4444' },
      { value: 'away', labelEn: 'Defense', color: '#3b82f6' },
      { value: 'ball', labelEn: 'Ball', color: '#f97316' },
      { value: 'cone', labelEn: 'Cone', color: '#facc15' },
      { value: 'coach', labelEn: 'Coach', color: '#64748b' },
    ],
  },
  {
    id: Sport.RUGBY,
    labelEn: 'Rugby',
    labelNl: 'Rugby',
    labelEs: 'Rugby',
    emoji: '🏉',
    skills: ['Passing', 'Kicking', 'Tackling', 'Scrum', 'Lineout', 'Defense', 'Conditioning'],
    defaultCourtType: 'rugby-full',
    courtTypes: [
      { value: 'rugby-full', labelEn: 'Full pitch', labelNl: 'Heel veld' },
      { value: 'rugby-half', labelEn: 'Half pitch', labelNl: 'Half veld' },
    ],
    playerTypes: [
      { value: 'home', labelEn: 'Home', color: '#ef4444' },
      { value: 'away', labelEn: 'Away', color: '#3b82f6' },
      { value: 'ball', labelEn: 'Ball', color: '#f97316' },
      { value: 'cone', labelEn: 'Cone', color: '#facc15' },
      { value: 'coach', labelEn: 'Coach', color: '#64748b' },
    ],
  },
  {
    id: Sport.TENNIS,
    labelEn: 'Tennis',
    labelNl: 'Tennis',
    labelEs: 'Tenis',
    emoji: '🎾',
    skills: ['Serve', 'Forehand', 'Backhand', 'Volley', 'Movement', 'Tactics', 'Conditioning'],
    defaultCourtType: 'tennis-court',
    courtTypes: [
      { value: 'tennis-court', labelEn: 'Full court (doubles)', labelNl: 'Heel baan (dubbel)' },
      { value: 'tennis-singles', labelEn: 'Singles court', labelNl: 'Enkel baan' },
    ],
    playerTypes: [
      { value: 'home', labelEn: 'Player 1', color: '#ef4444' },
      { value: 'away', labelEn: 'Player 2', color: '#3b82f6' },
      { value: 'ball', labelEn: 'Ball', color: '#f97316' },
      { value: 'cone', labelEn: 'Cone', color: '#facc15' },
      { value: 'coach', labelEn: 'Coach', color: '#64748b' },
    ],
  },
];

export function getSportConfig(sport: Sport): SportConfig {
  return SPORTS.find(s => s.id === sport) ?? SPORTS[0];
}

export function getSportLabel(sport: Sport, lang: 'en' | 'nl' | 'es' = 'en'): string {
  const config = getSportConfig(sport);
  if (lang === 'nl') return config.labelNl;
  if (lang === 'es') return config.labelEs;
  return config.labelEn;
}
