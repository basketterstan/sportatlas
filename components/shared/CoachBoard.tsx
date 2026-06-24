import React, { useState, useRef, useEffect } from 'react';
import { PlayerPosition, PlayerType, CourtType, DiagramLine, DiagramLineType, DiagramText } from '../../types';
import CoachBoardTour, { COACH_BOARD_TOUR_KEY } from '../misc/CoachBoardTour';

interface CoachBoardProps {
  initialPlayers?: PlayerPosition[];
  initialLines?: DiagramLine[];
  initialTexts?: DiagramText[];
  initialCourtType?: CourtType;
  onSave: (players: PlayerPosition[], lines: DiagramLine[], courtType: CourtType, texts: DiagramText[]) => void;
  onCancel: () => void;
  readOnly?: boolean;
  isFullscreen?: boolean;
  isPrinting?: boolean;
  animationSequence?: { players: PlayerPosition[], lines: DiagramLine[], texts?: DiagramText[], name?: string }[];
  forcePlayback?: boolean;
}

type ToolType = 'select' | 'run' | 'pass' | 'screen' | 'dribble' | 'shot' | 'draw' | 'text' | 'trash' | 'label';

interface DraggingLinePoint {
  lineId: string;
  type: 'start' | 'end' | 'control';
}

const CoachBoard: React.FC<CoachBoardProps> = ({ 
  initialPlayers = [], 
  initialLines = [],
  initialTexts = [],
  initialCourtType = 'half',
  onSave, 
  onCancel, 
  readOnly = false,
  isFullscreen = false,
  isPrinting = false,
  animationSequence = [],
  forcePlayback = false
}) => {
  const [players, setPlayers] = useState<PlayerPosition[]>(initialPlayers);
  const [lines, setLines] = useState<DiagramLine[]>(initialLines);
  const [texts, setTexts] = useState<DiagramText[]>(initialTexts);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [courtType, setCourtType] = useState<CourtType>(initialCourtType);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingType, setDraggingType] = useState<'player' | 'text' | 'linePoint' | null>(null);
  const [draggingLinePoint, setDraggingLinePoint] = useState<DraggingLinePoint | null>(null);
  const [drawingLine, setDrawingLine] = useState<DiagramLine | null>(null);
  
  const [textInput, setTextInput] = useState<{ x: number, y: number, value: string } | null>(null);
  const [playerLabelInput, setPlayerLabelInput] = useState<{ id: string, x: number, y: number, value: string } | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const playerLabelInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(forcePlayback);
  
  useEffect(() => {
    setIsPlaying(forcePlayback);
  }, [forcePlayback]);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [animatedPlayers, setAnimatedPlayers] = useState<PlayerPosition[]>(initialPlayers);
  const [playbackProgress, setPlaybackProgress] = useState(0); // 0 to 1
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [benchColors, setBenchColors] = useState<Record<string, string>>({
    home: '#ef4444', away: '#3b82f6', ball: '#f97316', cone: '#facc15', coach: '#64748b'
  });
  const [colorPickerType, setColorPickerType] = useState<string | null>(null);
  const [showTour, setShowTour] = useState(() => !readOnly && !localStorage.getItem(COACH_BOARD_TOUR_KEY));

  const PLAYER_COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#f8fafc', '#334155'];
  const getDefaultColor = (type: PlayerType) => type === 'home' ? '#ef4444' : type === 'away' ? '#3b82f6' : type === 'ball' ? '#f97316' : type === 'cone' ? '#facc15' : '#64748b';

  const playbackTimerRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const isFull = courtType === 'full';
  const isHorizontalLayout = isFull || isMobile;
  const isMultiRow = isMobile && !isFull;
  const viewWidth = isFull ? 188 : 100;
  const viewHeight = isFull ? 100 : 94;

  const boardRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const SNAP_THRESHOLD = 6.5;
  const LINE_HANDLE_THRESHOLD = 5.5;
  const lineColor = isPrinting ? "#000000" : "#f8fafc";
  const markerId = isPrinting ? "arrow-solid-print" : "arrow-solid";
  const dashedMarkerId = isPrinting ? "arrow-dashed-print" : "arrow-dashed";

  const getNearestHoop = (x: number, y: number) => {
    if (isFull) {
      const leftHoop = { x: 11, y: 50 };
      const rightHoop = { x: 177, y: 50 };
      const distLeft = Math.hypot(leftHoop.x - x, leftHoop.y - y);
      const distRight = Math.hypot(rightHoop.x - x, rightHoop.y - y);
      return distLeft < distRight ? leftHoop : rightHoop;
    }
    return { x: 50, y: 11 };
  };

  useEffect(() => {
    if (!isPlaying || animationSequence.length < 2) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      setAnimatedPlayers(players);
      return;
    }

    const FRAME_DURATION = 2000; // ms per frame transition
    const PAUSE_DURATION = 1000; // ms pause at each frame
    const TOTAL_CYCLE = FRAME_DURATION + PAUSE_DURATION;

    const animate = (time: number) => {
      if (!lastTickRef.current) lastTickRef.current = time;
      const elapsed = time - lastTickRef.current;
      
      const cycleProgress = (elapsed % TOTAL_CYCLE);
      const frameIdx = Math.floor(elapsed / TOTAL_CYCLE) % animationSequence.length;
      const nextFrameIdx = (frameIdx + 1) % animationSequence.length;
      
      setCurrentFrameIdx(frameIdx);

      const currentFrame = animationSequence[frameIdx];
      const nextFrame = animationSequence[nextFrameIdx];

      if (!currentFrame || !nextFrame) {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        return;
      }

      if (cycleProgress < FRAME_DURATION) {
        // Interpolating
        const p = cycleProgress / FRAME_DURATION;
        // Ease in-out
        const easedP = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        
        const interpolated = (currentFrame.players || []).map((startP, idx) => {
          const endP = (nextFrame.players || []).find(tp => tp.id === startP.id) || (nextFrame.players || [])[idx];
          if (!endP) return startP;
          return {
            ...startP,
            x: startP.x + (endP.x - startP.x) * easedP,
            y: startP.y + (endP.y - startP.y) * easedP
          };
        });
        setAnimatedPlayers(interpolated);
        setPlaybackProgress(easedP);
      } else {
        // Paused at frame
        setAnimatedPlayers(nextFrame.players);
        setPlaybackProgress(1);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    lastTickRef.current = performance.now();
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, animationSequence, players]);

  useEffect(() => {
    if (textInput && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [textInput]);

  useEffect(() => {
    if (playerLabelInput && playerLabelInputRef.current) {
      playerLabelInputRef.current.focus();
    }
  }, [playerLabelInput]);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const getSvgCoords = (clientX: number, clientY: number) => {
    if (!boardRef.current) return { x: 50, y: 50 };
    const svg = boardRef.current;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformedPoint = point.matrixTransform(svg.getScreenCTM()?.inverse());
    const x = Math.max(0, Math.min(viewWidth, transformedPoint.x));
    const y = Math.max(0, Math.min(viewHeight, transformedPoint.y));
    return { x, y };
  };

  const handlePointerDownBoard = (e: React.PointerEvent) => {
    if (colorPickerType) { setColorPickerType(null); }
    if (readOnly || isPlaying) return;
    
    if (textInput) {
      submitTextInput();
      return;
    }

    if (playerLabelInput) {
      submitPlayerLabelInput();
      return;
    }

    setSelectedTextId(null);
    setSelectedPlayerId(null);

    const coords = getSvgCoords(e.clientX, e.clientY);
    
    if (activeTool === 'text') {
      e.preventDefault();
      setTextInput({ x: coords.x, y: coords.y, value: "" });
      return;
    }

    if (activeTool === 'select') {
      for (const line of lines) {
        const distStart = Math.hypot(line.startX - coords.x, line.startY - coords.y);
        const distEnd = Math.hypot(line.endX - coords.x, line.endY - coords.y);
        
        // Check control point first if it exists
        if (line.controlX !== undefined && line.controlY !== undefined) {
          const distControl = Math.hypot(line.controlX - coords.x, line.controlY - coords.y);
          if (distControl < LINE_HANDLE_THRESHOLD) {
            setDraggingType('linePoint');
            setDraggingLinePoint({ lineId: line.id, type: 'control' });
            containerRef.current?.setPointerCapture(e.pointerId);
            return;
          }
        } else {
          // If no control point, check the midpoint to start bending
          const midX = (line.startX + line.endX) / 2;
          const midY = (line.startY + line.endY) / 2;
          const distMid = Math.hypot(midX - coords.x, midY - coords.y);
          if (distMid < LINE_HANDLE_THRESHOLD) {
            setDraggingType('linePoint');
            setDraggingLinePoint({ lineId: line.id, type: 'control' });
            // Initialize control point at midpoint
            setLines(current => current.map(l => l.id === line.id ? { ...l, controlX: coords.x, controlY: coords.y } : l));
            containerRef.current?.setPointerCapture(e.pointerId);
            return;
          }
        }

        if (distEnd < LINE_HANDLE_THRESHOLD) {
          setDraggingType('linePoint');
          setDraggingLinePoint({ lineId: line.id, type: 'end' });
          containerRef.current?.setPointerCapture(e.pointerId);
          return;
        }
        if (distStart < LINE_HANDLE_THRESHOLD) {
          setDraggingType('linePoint');
          setDraggingLinePoint({ lineId: line.id, type: 'start' });
          containerRef.current?.setPointerCapture(e.pointerId);
          return;
        }
      }
    }

    if (activeTool !== 'select' && activeTool !== 'trash') {
      const target = players.find(p => Math.hypot(p.x - coords.x, p.y - coords.y) < SNAP_THRESHOLD);
      const startX = target ? target.x : coords.x;
      const startY = target ? target.y : coords.y;

      let endX = coords.x;
      let endY = coords.y;

      if (activeTool === 'shot') {
        const hoop = getNearestHoop(coords.x, coords.y);
        endX = hoop.x;
        endY = hoop.y;
      }

      const newLine: DiagramLine = {
        id: crypto.randomUUID(),
        type: activeTool as DiagramLineType,
        startX: startX,
        startY: startY,
        endX: endX,
        endY: endY,
        points: [{ x: startX, y: startY }, { x: endX, y: endY }]
      };
      setDrawingLine(newLine);
      containerRef.current?.setPointerCapture(e.pointerId);
    }
  };

  const submitTextInput = () => {
    if (textInput && textInput.value.trim() !== "") {
      const newText: DiagramText = {
        id: crypto.randomUUID(),
        x: textInput.x,
        y: textInput.y,
        value: textInput.value.toUpperCase(),
        fontSize: 6
      };
      setTexts(prev => [...prev, newText]);
      setSelectedTextId(newText.id);
    }
    setTextInput(null);
  };

  const submitPlayerLabelInput = () => {
    if (playerLabelInput) {
      const val = playerLabelInput.value.trim().toUpperCase();
      setPlayers(prev => prev.map(p => p.id === playerLabelInput.id ? { ...p, label: val } : p));
    }
    setPlayerLabelInput(null);
  };

  const handlePointerDownPlayer = (e: React.PointerEvent, id: string) => {
    if (readOnly || isPlaying) return;
    
    if (textInput) submitTextInput();
    if (playerLabelInput) {
      const isSame = playerLabelInput.id === id;
      submitPlayerLabelInput();
      if (isSame) return;
    }
    
    if (activeTool === 'label') {
      e.stopPropagation();
      const p = players.find(pl => pl.id === id);
      if (p) {
        setPlayerLabelInput({ id: p.id, x: p.x, y: p.y, value: p.label || '' });
      }
      return;
    }

    e.stopPropagation();

    if (activeTool === 'trash') {
      setPlayers(prev => prev.filter(p => p.id !== id));
      return;
    }

    if (activeTool === 'select') {
      setDraggingId(id);
      setDraggingType('player');
      setSelectedPlayerId(id);
      setSelectedTextId(null);
      containerRef.current?.setPointerCapture(e.pointerId);
    } else {
      handlePointerDownBoard(e);
    }
  };

  const handlePointerDownText = (e: React.PointerEvent, id: string) => {
    if (readOnly || isPlaying) return;
    
    if (textInput) submitTextInput();
    if (playerLabelInput) submitPlayerLabelInput();

    if (activeTool === 'text' || activeTool === 'label') {
      handlePointerDownBoard(e);
      return;
    }

    e.stopPropagation();
    if (activeTool === 'trash') {
      setTexts(prev => prev.filter(t => t.id !== id));
      return;
    }
    if (activeTool === 'select') {
      setDraggingId(id);
      setDraggingType('text');
      setSelectedTextId(id);
      setSelectedPlayerId(null);
      containerRef.current?.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (readOnly || isPlaying || (!draggingType && !drawingLine)) return;
    const coords = getSvgCoords(e.clientX, e.clientY);

    if (draggingType === 'player' && draggingId) {
      setPlayers(current => current.map(p => p.id === draggingId ? { ...p, x: coords.x, y: coords.y } : p));
    } else if (draggingType === 'text' && draggingId) {
      setTexts(current => current.map(t => t.id === draggingId ? { ...t, x: coords.x, y: coords.y } : t));
    } else if (draggingType === 'linePoint' && draggingLinePoint) {
      const isShot = lines.find(l => l.id === draggingLinePoint.lineId)?.type === 'shot';
      
      const target = isShot ? null : players.find(p => Math.hypot(p.x - coords.x, p.y - coords.y) < SNAP_THRESHOLD);
      let finalX = target ? target.x : coords.x;
      let finalY = target ? target.y : coords.y;

      if (isShot && draggingLinePoint.type === 'end') {
        const hoop = getNearestHoop(coords.x, coords.y);
        finalX = hoop.x;
        finalY = hoop.y;
      }

      setLines(current => current.map(l => {
        if (l.id === draggingLinePoint.lineId) {
          if (draggingLinePoint.type === 'control') {
            return { ...l, controlX: coords.x, controlY: coords.y };
          }
          return draggingLinePoint.type === 'start' 
            ? { ...l, startX: finalX, startY: finalY }
            : { ...l, endX: finalX, endY: finalY };
        }
        return l;
      }));
    } else if (drawingLine) {
      const lastPoint = drawingLine.points?.[drawingLine.points.length - 1];
      const isTactical = ['run', 'pass', 'screen', 'dribble', 'shot', 'draw'].includes(drawingLine.type);
      
      if (isTactical) {
        if (!lastPoint || Math.hypot(lastPoint.x - coords.x, lastPoint.y - coords.y) > 0.8) {
          let finalX = coords.x;
          let finalY = coords.y;

          if (drawingLine.type === 'shot') {
            const hoop = getNearestHoop(coords.x, coords.y);
            finalX = hoop.x;
            finalY = hoop.y;
          } else {
            const target = players.find(p => Math.hypot(p.x - coords.x, p.y - coords.y) < SNAP_THRESHOLD);
            if (target) {
              finalX = target.x;
              finalY = target.y;
            }
          }

          setDrawingLine({
            ...drawingLine,
            points: [...(drawingLine.points || []), { x: finalX, y: finalY }],
            endX: finalX,
            endY: finalY
          });
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingType) {
      setDraggingId(null);
      setDraggingType(null);
      setDraggingLinePoint(null);
      containerRef.current?.releasePointerCapture(e.pointerId);
    } else if (drawingLine) {
      const dist = Math.hypot(drawingLine.endX - drawingLine.startX, drawingLine.endY - drawingLine.startY);
      if (dist > 1.5) setLines(prev => [...prev, drawingLine]);
      setDrawingLine(null);
      containerRef.current?.releasePointerCapture(e.pointerId);
    }
  };

  const handleStartDragFromBench = (e: React.PointerEvent, type: PlayerType) => {
    if (readOnly || isPlaying || textInput) return;
    setColorPickerType(null);
    setActiveTool('select');
    const getNextLabel = (t: PlayerType) => {
      if (t === 'ball' || t === 'cone' || t === 'coach') return "";
      const teamPlayers = players.filter(p => p.type === t);
      const existingLabels = teamPlayers.map(p => parseInt(p.label || '0')).filter(n => !isNaN(n));
      for (let i = 1; i <= 15; i++) if (!existingLabels.includes(i)) return i.toString();
      return (teamPlayers.length + 1).toString();
    };
    let label = (type === 'home' || type === 'away') ? getNextLabel(type) : "";
    const id = crypto.randomUUID();
    setPlayers(prev => [...prev, { id, x: viewWidth/2, y: viewHeight/2, type, label, color: benchColors[type] }]);
    setDraggingId(id);
    setDraggingType('player');
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const renderWavyLine = (l: DiagramLine, color: string) => {
    const arrowMarkerId = activeTool === 'trash' ? 'arrow-red' : markerId;
    const isCurved = l.controlX !== undefined && l.controlY !== undefined;

    if (isCurved) {
      const path = `M ${l.startX} ${l.startY} Q ${l.controlX} ${l.controlY} ${l.endX} ${l.endY}`;
      // Compute tangent at end of quadratic bezier for correct arrow direction
      const tx = l.endX - (l.controlX ?? l.endX);
      const ty = l.endY - (l.controlY ?? l.endY);
      const tlen = Math.hypot(tx, ty) || 1;
      const arrowLen = 6;
      const ax = l.endX - (tx / tlen) * arrowLen;
      const ay = l.endY - (ty / tlen) * arrowLen;
      return (
        <g>
          <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4,4" strokeLinejoin="round" strokeLinecap="round" />
          <line x1={ax} y1={ay} x2={l.endX} y2={l.endY} stroke={color} strokeWidth="1.5" strokeLinecap="round" markerEnd={`url(#${arrowMarkerId})`} />
        </g>
      );
    }

    const angle = Math.atan2(l.endY - l.startY, l.endX - l.startX);
    const dist = Math.hypot(l.endY - l.startY, l.endX - l.startX);

    const waveDist = Math.max(0, dist - 5);
    const steps = Math.floor(waveDist / 2);
    let path = `M ${l.startX} ${l.startY}`;

    for (let i = 1; i <= steps; i++) {
      const currentDist = (i / steps) * waveDist;
      const x = l.startX + Math.cos(angle) * currentDist;
      const y = l.startY + Math.sin(angle) * currentDist;
      const perpAngle = angle + Math.PI / 2;
      const offset = (i % 2 === 0 ? 1 : -1) * 1.5;
      const ox = x + Math.cos(perpAngle) * offset;
      const oy = y + Math.sin(perpAngle) * offset;
      path += ` L ${ox} ${oy}`;
    }

    // Arrowhead on a straight segment in the exact direction of travel
    const arrowLen = 6;
    const ax = l.endX - Math.cos(angle) * arrowLen;
    const ay = l.endY - Math.sin(angle) * arrowLen;

    return (
      <g>
        <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        <line x1={ax} y1={ay} x2={l.endX} y2={l.endY} stroke={color} strokeWidth="1.5" strokeLinecap="round" markerEnd={`url(#${arrowMarkerId})`} />
      </g>
    );
  };

  const renderCourtMarkings = (side: 'top' | 'bottom' | 'left' | 'right') => {
    const stroke = isPrinting ? "#7f1d1d" : "rgba(239,68,68,0.35)";
    const hoopStroke = "#f97316";
    if (side === 'left') return (
      <g pointerEvents="none">
        <rect x="0" y="34" width="38" height="32" fill="none" stroke={stroke} strokeWidth="1" />
        <line x1="8" y1="42" x2="8" y2="58" stroke={stroke} strokeWidth="1.5" />
        <circle cx="11" cy="50" r="2.5" fill="none" stroke={hoopStroke} strokeWidth="1.2" />
        <path d="M 0 10 L 28 10 A 40 40 0 0 1 28 90 L 0 90" fill="none" stroke={stroke} strokeWidth="1" />
        <circle cx="38" cy="50" r="12" fill="none" stroke={stroke} strokeWidth="0.8" />
      </g>
    );
    if (side === 'right') return (
      <g pointerEvents="none">
        <rect x="150" y="34" width="38" height="32" fill="none" stroke={stroke} strokeWidth="1" />
        <line x1="180" y1="42" x2="180" y2="58" stroke={stroke} strokeWidth="1.5" />
        <circle cx="177" cy="50" r="2.5" fill="none" stroke={hoopStroke} strokeWidth="1.2" />
        <path d="M 188 10 L 160 10 A 40 40 0 0 0 160 90 L 188 90" fill="none" stroke={stroke} strokeWidth="1" />
        <circle cx="150" cy="50" r="12" fill="none" stroke={stroke} strokeWidth="0.8" />
      </g>
    );
    let hoopY = side === 'top' ? 11 : viewHeight - 11;
    let backY = side === 'top' ? 8 : viewHeight - 8;
    let paintY = side === 'top' ? 0 : viewHeight - 38;
    let ftY = side === 'top' ? 38 : viewHeight - 38;
    let threeD = side === 'top' ? "M 10 0 L 10 28 A 40 40 0 0 0 90 28 L 90 0" : `M 10 ${viewHeight} L 10 ${viewHeight-28} A 40 40 0 0 1 90 ${viewHeight-28} L 90 ${viewHeight}`;
    return (
      <g pointerEvents="none">
        <rect x="34" y={paintY} width="32" height="38" fill="none" stroke={stroke} strokeWidth="1" />
        <line x1="42" y1={backY} x2="58" y2={backY} stroke={stroke} strokeWidth="1.5" />
        <circle cx="50" cy={hoopY} r="2.5" fill="none" stroke={hoopStroke} strokeWidth="1.2" />
        <path d={threeD} fill="none" stroke={stroke} strokeWidth="1" />
        <circle cx="50" cy={ftY} r="12" fill="none" stroke={stroke} strokeWidth="0.8" />
      </g>
    );
  };

  const activePlayers = isPlaying ? animatedPlayers : players;
  const activeLines = isPlaying ? (animationSequence[currentFrameIdx]?.lines || []) : lines;
  const activeTexts = isPlaying ? (animationSequence[currentFrameIdx]?.texts || []) : texts;
  const allLines = drawingLine ? [...activeLines, drawingLine] : activeLines;

  const renderFreehandLine = (l: DiagramLine, color: string) => {
    if (!l.points || l.points.length < 2) return null;
    
    const isDashed = l.type === 'pass';
    const isDribble = l.type === 'dribble';
    const isScreen = l.type === 'screen';
    const isShot = l.type === 'shot';
    const isDeleting = activeTool === 'trash';

    let path = "";
    if (isDribble) {
      let totalDist = 0;
      path = `M ${l.points[0].x} ${l.points[0].y}`;
      for (let i = 1; i < l.points.length; i++) {
        const p1 = l.points[i-1];
        const p2 = l.points[i];
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const perpAngle = angle + Math.PI / 2;
        const waveFreq = 2.5;
        const waveAmp = 1.2;
        const steps = Math.max(1, Math.floor(dist / 0.5));
        for (let j = 1; j <= steps; j++) {
          const t = j / steps;
          const currDist = totalDist + t * dist;
          const x = p1.x + (p2.x - p1.x) * t;
          const y = p1.y + (p2.y - p1.y) * t;
          const offset = Math.sin(currDist * (Math.PI * 2 / waveFreq)) * waveAmp;
          path += ` L ${x + Math.cos(perpAngle) * offset} ${y + Math.sin(perpAngle) * offset}`;
        }
        totalDist += dist;
      }
    } else {
      path = l.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    }

    const last = l.points[l.points.length - 1];
    const prev = l.points[l.points.length - 2];
    const endAngle = Math.atan2(last.y - prev.y, last.x - prev.x);

    return (
      <g onPointerDown={(e) => { e.stopPropagation(); if(isDeleting) setLines(prev => prev.filter(ln => ln.id !== l.id)); }}>
        <path 
          d={path} 
          fill="none" 
          stroke={color} 
          strokeWidth={isShot ? "3" : "1.5"} 
          strokeDasharray={isDashed ? "5,4" : "none"}
          strokeLinecap="round" 
          strokeLinejoin="round" 
          markerEnd={(!isScreen && l.type !== 'draw') ? `url(#${isDashed ? (isDeleting ? 'arrow-red' : dashedMarkerId) : (isDeleting ? 'arrow-red' : markerId)})` : undefined}
        />
        {isScreen && (
          <line 
            x1={last.x + Math.cos(endAngle + Math.PI/2) * 3} 
            y1={last.y + Math.sin(endAngle + Math.PI/2) * 3} 
            x2={last.x + Math.cos(endAngle - Math.PI/2) * 3} 
            y2={last.y + Math.sin(endAngle - Math.PI/2) * 3} 
            stroke={color} 
            strokeWidth="1.5" 
            strokeLinecap="round" 
          />
        )}
      </g>
    );
  };

  return (
    <div ref={containerRef} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} className={`flex bg-ha-bg select-none touch-none relative transition-all ${isFullscreen ? 'h-full w-full overflow-hidden' : 'h-full p-2 gap-2'} ${isHorizontalLayout ? 'flex-col' : 'flex-row'} ${isPrinting ? 'bg-white !p-0 !gap-0 w-full h-full' : ''}`}>
      <CoachBoardTour show={showTour} onDone={() => setShowTour(false)} />
      {selectedTextId && !readOnly && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2 bg-slate-900/90 backdrop-blur-xl p-2 rounded-2xl border border-slate-700 z-[200] shadow-2xl">
          <button 
            onClick={() => {
              setTexts(prev => prev.map(t => t.id === selectedTextId ? { ...t, fontSize: Math.max(2, (t.fontSize || 6) - 1) } : t));
            }}
            className="w-10 h-10 flex items-center justify-center bg-slate-800 text-white rounded-xl hover:bg-slate-700 active:scale-95 transition-all font-bold"
          >
            A-
          </button>
          <button 
            onClick={() => {
              setTexts(prev => prev.map(t => t.id === selectedTextId ? { ...t, fontSize: Math.min(30, (t.fontSize || 6) + 1) } : t));
            }}
            className="w-10 h-10 flex items-center justify-center bg-slate-800 text-white rounded-xl hover:bg-slate-700 active:scale-95 transition-all font-bold"
          >
            A+
          </button>
          <div className="w-px h-10 bg-slate-700 mx-1" />
          <button 
            onClick={() => {
              setTexts(prev => prev.filter(t => t.id !== selectedTextId));
              setSelectedTextId(null);
            }}
            className="w-10 h-10 flex items-center justify-center bg-red-950/50 text-red-400 rounded-xl hover:bg-red-600 hover:text-white active:scale-95 transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
          <button 
            onClick={() => setSelectedTextId(null)}
            className="w-10 h-10 flex items-center justify-center bg-slate-800 text-slate-400 rounded-xl hover:bg-slate-700 active:scale-95 transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      {selectedPlayerId && !readOnly && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 bg-slate-900/90 backdrop-blur-xl p-2.5 rounded-2xl border border-slate-700 z-[200] shadow-2xl">
          <div className="flex gap-2">
            <button
              onClick={() => {
                const p = players.find(pl => pl.id === selectedPlayerId);
                if (p) setPlayerLabelInput({ id: p.id, x: p.x, y: p.y, value: p.label || '' });
                setSelectedPlayerId(null);
              }}
              className="px-4 h-10 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 active:scale-95 transition-all font-bold text-sm"
            >
              EDIT #
            </button>
            <button
              onClick={() => {
                setPlayers(prev => prev.filter(p => p.id !== selectedPlayerId));
                setSelectedPlayerId(null);
              }}
              className="w-10 h-10 flex items-center justify-center bg-red-950/50 text-red-400 rounded-xl hover:bg-red-600 hover:text-white active:scale-95 transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
            </button>
            <button
              onClick={() => setSelectedPlayerId(null)}
              className="w-10 h-10 flex items-center justify-center bg-slate-800 text-slate-400 rounded-xl hover:bg-slate-700 active:scale-95 transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-center px-1">
            {PLAYER_COLORS.map(color => {
              const sel = players.find(p => p.id === selectedPlayerId);
              const cur = sel?.color || getDefaultColor(sel?.type || 'home');
              return (
                <button
                  key={color}
                  onClick={() => setPlayers(prev => prev.map(p => p.id === selectedPlayerId ? {...p, color} : p))}
                  className="w-7 h-7 rounded-full transition-all active:scale-90"
                  style={{
                    backgroundColor: color,
                    outline: cur === color ? '2.5px solid white' : 'none',
                    outlineOffset: '1.5px',
                    border: color === '#f8fafc' ? '1.5px solid #475569' : 'none'
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className={`flex-1 relative flex items-center justify-center min-h-0 ${isPrinting ? '!p-0' : 'p-4'}`}>
        <svg 
          ref={boardRef}
          viewBox={`0 0 ${viewWidth} ${viewHeight}`} 
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          className={`pointer-events-auto overflow-visible block ${isPrinting ? '' : 'border border-slate-800/20 shadow-3xl rounded-sm'}`}
          onPointerDown={handlePointerDownBoard}
          style={{ cursor: activeTool === 'text' || activeTool === 'label' ? 'text' : 'crosshair' }}
        >
          <defs>
            <marker id="arrow-solid" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="3.5" markerHeight="3.5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#f8fafc" /></marker>
            <marker id="arrow-dashed" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="3.5" markerHeight="3.5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#f8fafc" /></marker>
            <marker id="arrow-solid-print" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="3.5" markerHeight="3.5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#000000" /></marker>
            <marker id="arrow-dashed-print" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="3.5" markerHeight="3.5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#000000" /></marker>
            <marker id="arrow-red" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="3.5" markerHeight="3.5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" /></marker>
          </defs>

          <rect x="0" y="0" width={viewWidth} height={viewHeight} fill={isPrinting ? "#ffffff" : "#0f172a"} opacity={isPrinting ? 1 : 0.85} />
          {isFull && <g opacity={isPrinting ? 0.8 : 0.2} pointerEvents="none"><line x1="94" y1="0" x2="94" y2="100" stroke={isPrinting ? "#334155" : "#94a3b8"} strokeWidth="1" /><circle cx="94" cy="50" r="10" fill="none" stroke={isPrinting ? "#334155" : "#94a3b8"} strokeWidth="1" /></g>}
          {!isFull ? renderCourtMarkings('top') : <>{renderCourtMarkings('left')}{renderCourtMarkings('right')}</>}

          {allLines.map(l => {
            const isDeleting = activeTool === 'trash', curCol = isDeleting ? '#ef4444' : lineColor;
            const isSelected = activeTool === 'select';
            const isCurved = l.controlX !== undefined && l.controlY !== undefined;
            const isFreehand = l.points && l.points.length > 2;
            
            if (isFreehand) {
              return <g key={l.id}>{renderFreehandLine(l, curCol)}</g>;
            }

            let lineElement;
            const isDashed = l.type === 'pass', isScreen = l.type === 'screen', isDribble = l.type === 'dribble', isShot = l.type === 'shot';
            
            if (isScreen) {
              const ang = Math.atan2(l.endY-l.startY, l.endX-l.startX), cs = 3, x1 = l.endX+Math.cos(ang+Math.PI/2)*cs, y1 = l.endY+Math.sin(ang+Math.PI/2)*cs, x2 = l.endX+Math.cos(ang-Math.PI/2)*cs, y2 = l.endY+Math.sin(ang-Math.PI/2)*cs;
              if (isCurved) {
                const path = `M ${l.startX} ${l.startY} Q ${l.controlX} ${l.controlY} ${l.endX} ${l.endY}`;
                // For screen, we need the angle at the end of the curve
                const t = 1.0;
                const dx = 2 * (1 - t) * (l.controlX! - l.startX) + 2 * t * (l.endX - l.controlX!);
                const dy = 2 * (1 - t) * (l.controlY! - l.startY) + 2 * t * (l.endY - l.controlY!);
                const endAng = Math.atan2(dy, dx);
                const ex1 = l.endX+Math.cos(endAng+Math.PI/2)*cs, ey1 = l.endY+Math.sin(endAng+Math.PI/2)*cs, ex2 = l.endX+Math.cos(endAng-Math.PI/2)*cs, ey2 = l.endY+Math.sin(endAng-Math.PI/2)*cs;
                
                lineElement = (
                  <g key={l.id} onPointerDown={(e) => { e.stopPropagation(); if(isDeleting) setLines(prev => prev.filter(ln => ln.id !== l.id)); }}>
                    <path d={path} fill="none" stroke={curCol} strokeWidth="1.5" strokeLinecap="round" />
                    <line x1={ex1} y1={ey1} x2={ex2} y2={ey2} stroke={curCol} strokeWidth="1.5" strokeLinecap="round" />
                  </g>
                );
              } else {
                lineElement = <g key={l.id} onPointerDown={(e) => { e.stopPropagation(); if(isDeleting) setLines(prev => prev.filter(ln => ln.id !== l.id)); }}><line x1={l.startX} y1={l.startY} x2={l.endX} y2={l.endY} stroke={curCol} strokeWidth="1.5" strokeLinecap="round" /><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={curCol} strokeWidth="1.5" strokeLinecap="round" /></g>;
              }
            } else if (isDribble) {
              lineElement = <g key={l.id} onPointerDown={(e) => { e.stopPropagation(); if(isDeleting) setLines(prev => prev.filter(ln => ln.id !== l.id)); }}>{renderWavyLine(l, curCol)}</g>;
            } else if (isShot) {
              if (isCurved) {
                const path = `M ${l.startX} ${l.startY} Q ${l.controlX} ${l.controlY} ${l.endX} ${l.endY}`;
                lineElement = <g key={l.id} onPointerDown={(e) => { e.stopPropagation(); if(isDeleting) setLines(prev => prev.filter(ln => ln.id !== l.id)); }}><path d={path} fill="none" stroke={curCol} strokeWidth="3" markerEnd={`url(#${isDeleting ? 'arrow-red' : markerId})`} strokeLinecap="round" /></g>;
              } else {
                lineElement = <g key={l.id} onPointerDown={(e) => { e.stopPropagation(); if(isDeleting) setLines(prev => prev.filter(ln => ln.id !== l.id)); }}><line x1={l.startX} y1={l.startY} x2={l.endX} y2={l.endY} stroke={curCol} strokeWidth="3" markerEnd={`url(#${isDeleting ? 'arrow-red' : markerId})`} strokeLinecap="round" /></g>;
              }
            } else {
              if (isCurved) {
                const path = `M ${l.startX} ${l.startY} Q ${l.controlX} ${l.controlY} ${l.endX} ${l.endY}`;
                lineElement = <g key={l.id} onPointerDown={(e) => { e.stopPropagation(); if(isDeleting) setLines(prev => prev.filter(ln => ln.id !== l.id)); }}><path d={path} fill="none" stroke={curCol} strokeWidth="1.5" strokeDasharray={isDashed ? "5,4" : "none"} markerEnd={`url(#${isDashed ? (isDeleting ? 'arrow-red' : dashedMarkerId) : (isDeleting ? 'arrow-red' : markerId)})`} strokeLinecap="round" /></g>;
              } else {
                lineElement = <g key={l.id} onPointerDown={(e) => { e.stopPropagation(); if(isDeleting) setLines(prev => prev.filter(ln => ln.id !== l.id)); }}><line x1={l.startX} y1={l.startY} x2={l.endX} y2={l.endY} stroke={curCol} strokeWidth="1.5" strokeDasharray={isDashed ? "5,4" : "none"} markerEnd={`url(#${isDashed ? (isDeleting ? 'arrow-red' : dashedMarkerId) : (isDeleting ? 'arrow-red' : markerId)})`} strokeLinecap="round" /></g>;
              }
            }

            return (
              <g key={l.id + '_group'}>
                {lineElement}
                {isSelected && !readOnly && !isPlaying && (
                  <g>
                    <circle cx={l.startX} cy={l.startY} r="2" fill="cyan" opacity="0.7" className="cursor-move" />
                    <circle cx={l.endX} cy={l.endY} r="2" fill="cyan" opacity="0.7" className="cursor-move" />
                    {isCurved ? (
                      <circle cx={l.controlX} cy={l.controlY} r="2" fill="yellow" opacity="0.7" className="cursor-move" />
                    ) : (
                      <circle cx={(l.startX + l.endX) / 2} cy={(l.startY + l.endY) / 2} r="1.5" fill="yellow" opacity="0.4" className="cursor-move" />
                    )}
                  </g>
                )}
              </g>
            );
          })}
          
          {activeTexts.map(t => (
            <g key={t.id} onPointerDown={(e) => handlePointerDownText(e, t.id)} className={readOnly ? '' : (activeTool === 'select' ? 'cursor-move' : '')}>
              <rect x={t.x - (t.value.length * (t.fontSize || 6) * 0.4)} y={t.y - (t.fontSize || 6)} width={t.value.length * (t.fontSize || 6) * 0.8} height={t.fontSize || 6} fill={selectedTextId === t.id ? "rgba(34, 211, 238, 0.1)" : "transparent"} pointerEvents="all" />
              <text x={t.x} y={t.y} fontSize={t.fontSize || 6} fontWeight="900" fill={activeTool==='trash' ? '#ef4444' : (selectedTextId === t.id ? '#fff' : (isPrinting ? '#000' : '#22d3ee'))} textAnchor="middle" className="italic uppercase tracking-tighter" pointerEvents="none">{t.value}</text>
            </g>
          ))}

          {activePlayers.map(p => {
            const color = activeTool==='trash' ? '#ef4444' : (p.color || getDefaultColor(p.type));
            const isDragging = draggingId === p.id;
            const isEditing = playerLabelInput?.id === p.id;
            return <g key={p.id} onPointerDown={(e) => handlePointerDownPlayer(e, p.id)} style={{ transform: `translate(${p.x}px, ${p.y}px)`, zIndex: isDragging ? 100 : 1, opacity: isEditing ? 0.5 : 1 }} className={readOnly ? '' : (activeTool === 'select' ? 'cursor-grab' : (activeTool === 'text' || activeTool === 'label' ? 'cursor-text' : 'cursor-crosshair'))}>
              {p.type === 'ball' ? (
                <g>
                  <circle r="2.5" fill={color} stroke="#333" strokeWidth="0.4" />
                  {p.label && <text y="1" fontSize="3" fontWeight="900" fill="white" textAnchor="middle" pointerEvents="none">{p.label}</text>}
                </g>
              ) : p.type === 'cone' ? (
                <g>
                  <path d="M 0 -4 L 3.5 2.5 L -3.5 2.5 Z" fill={color} stroke={isPrinting ? "#000" : "#fff"} strokeWidth="0.4" />
                  {p.label && <text y="1.5" fontSize="3" fontWeight="900" fill="white" textAnchor="middle" pointerEvents="none">{p.label}</text>}
                </g>
              ) : p.type === 'coach' ? (
                <g>
                   <circle r="4.2" fill={color} stroke={isPrinting ? "#000" : "#fff"} strokeWidth="0.8" />
                   <text y="1.5" fontSize="4.5" fontStyle="italic" fontWeight="900" fill="white" textAnchor="middle" pointerEvents="none">{p.label || 'C'}</text>
                </g>
              ) : (
                <g>
                  <circle r="4.2" fill={color} stroke={isPrinting ? "#000" : "#fff"} strokeWidth="0.8" />
                  <text y="1.5" fontSize="4.5" fontStyle="italic" fontWeight="900" fill="white" textAnchor="middle" pointerEvents="none">{p.label}</text>
                </g>
              )}
            </g>;
          })}

          {playerLabelInput && (
            <foreignObject 
              x={playerLabelInput.x - 15} 
              y={playerLabelInput.y - 15} 
              width="30" 
              height="30"
              style={{ overflow: 'visible' }}
            >
              <div className="flex items-center justify-center w-full h-full" onPointerDown={e => e.stopPropagation()}>
                <input 
                  ref={playerLabelInputRef}
                  type="text"
                  maxLength={3}
                  value={playerLabelInput.value}
                  onChange={(e) => setPlayerLabelInput({ ...playerLabelInput, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitPlayerLabelInput();
                    if (e.key === 'Escape') setPlayerLabelInput(null);
                  }}
                  onBlur={submitPlayerLabelInput}
                  placeholder="#"
                  className="bg-white border-2 border-indigo-500 text-indigo-900 font-bold uppercase text-[10px] px-1 py-0.5 rounded shadow-lg outline-none w-12 text-center"
                />
              </div>
            </foreignObject>
          )}

          {textInput && (
            <foreignObject 
              x={textInput.x - 25} 
              y={textInput.y - 10} 
              width="50" 
              height="20"
              style={{ overflow: 'visible' }}
            >
              <div className="flex items-center justify-center w-full h-full" onPointerDown={e => e.stopPropagation()}>
                <input 
                  ref={textInputRef}
                  type="text"
                  value={textInput.value}
                  onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitTextInput();
                    if (e.key === 'Escape') setTextInput(null);
                  }}
                  onBlur={submitTextInput}
                  placeholder="TYPE..."
                  className="bg-slate-900 border border-ha-brand text-white font-black uppercase text-[6px] px-2 py-1 rounded-lg shadow-2xl outline-none w-full text-center"
                />
              </div>
            </foreignObject>
          )}

          {activeTool === 'text' && (
            <rect 
              x="0" y="0" 
              width={viewWidth} height={viewHeight} 
              fill="transparent" 
              pointerEvents="all" 
              onPointerDown={handlePointerDownBoard} 
              style={{ cursor: 'text' }}
            />
          )}
        </svg>
      </div>

      {!readOnly && (() => {
        const playerItems = [
          {t:'home', l:'OFF'},
          {t:'away', l:'DEF'},
          {t:'ball', l:'BALL'},
          {t:'cone', l:'CONE'},
          {t:'coach', l:'COACH'}
        ];
        const toolItems = [
          {id: 'select', label: 'SELECT', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>},
          {id: 'run', label: 'RUN', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>},
          {id: 'pass', label: 'PASS', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="4 2"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>},
          {id: 'dribble', label: 'DRIB', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 12c.5-1 1.5-2 3-2s2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2.5-2 3-2"/></svg>},
          {id: 'shot', label: 'SHOT', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>},
          {id: 'draw', label: 'DRAW', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-1.5"/><path d="M15 8.5L13.5 7"/><path d="M12 6L10.5 4.5"/><path d="M9 3.5L7.5 2"/><path d="M21 21l-2-2"/><path d="M3 21l18-18"/></svg>},
          {id: 'screen', label: 'SCREEN', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14"/><path d="M7 19h10"/></svg>},
          {id: 'label', label: 'LABEL', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>},
          {id: 'text', label: 'TEXT', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>},
          {id: 'trash', label: 'DEL', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>}
        ];
        const renderPlayerItem = (item: {t: string, l: string}, btnSize: string) => (
          <div key={item.t} className="relative flex flex-col items-center gap-0.5 flex-shrink-0">
            <button
              onPointerDown={(e) => handleStartDragFromBench(e, item.t as PlayerType)}
              className={`${btnSize} rounded-full flex items-center justify-center border-2 border-white/20 active:scale-90 shadow-xl overflow-hidden`}
              style={{ backgroundColor: benchColors[item.t] }}
            >
              {item.t === 'cone' ? (
                <svg viewBox="0 0 20 20" className="w-5 h-5 pointer-events-none"><path d="M 10 4 L 16 16 L 4 16 Z" fill="white"/></svg>
              ) : item.t === 'coach' ? (
                <span className="text-[10px] font-black italic text-white pointer-events-none">C</span>
              ) : (
                <svg viewBox="0 0 20 20" className="w-5 h-5 pointer-events-none"><g transform="translate(10,10)"><circle r="6" fill="none" stroke="white" strokeWidth="1.2" /><text y="3" fontSize="8" fontWeight="900" textAnchor="middle" fill="white">{item.t === 'ball' ? '' : '1'}</text></g></svg>
              )}
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setColorPickerType(colorPickerType === item.t ? null : item.t); }}
              className="w-3 h-3 rounded-full border border-white/40 hover:scale-125 transition-transform flex-shrink-0"
              style={{ backgroundColor: benchColors[item.t] }}
            />
            <span className="text-[7px] font-black text-slate-500 uppercase tracking-tighter">{item.l}</span>
            {colorPickerType === item.t && (
              <div
                className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[300] bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-xl p-2 grid grid-cols-5 gap-1.5 shadow-2xl"
                style={{ width: '130px' }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                {PLAYER_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => { setBenchColors(prev => ({...prev, [item.t]: color})); setColorPickerType(null); }}
                    className="w-6 h-6 rounded-full transition-all active:scale-90"
                    style={{ backgroundColor: color, outline: benchColors[item.t] === color ? '2px solid white' : 'none', outlineOffset: '1.5px', border: color === '#f8fafc' ? '1px solid #475569' : 'none' }}
                  />
                ))}
              </div>
            )}
          </div>
        );
        const saveAction = () => {
          let finalPlayers = players;
          let finalTexts = texts;
          if (playerLabelInput) {
            finalPlayers = players.map(p => p.id === playerLabelInput.id ? { ...p, label: playerLabelInput.value.trim().toUpperCase() } : p);
            setPlayerLabelInput(null);
          }
          if (textInput && textInput.value.trim()) {
            finalTexts = [...texts, { id: crypto.randomUUID(), x: textInput.x, y: textInput.y, value: textInput.value.trim().toUpperCase(), fontSize: 6 }];
            setTextInput(null);
          }
          onSave(finalPlayers, lines, courtType, finalTexts);
        };

        if (isMultiRow) {
          return (
            <div className="bg-[#0b1224] border-t border-slate-800 flex flex-col w-full z-[100] shadow-3xl flex-shrink-0 pb-[env(safe-area-inset-bottom)]">
              {/* Rij 1: Spelers */}
              <div className="flex items-center justify-around px-4 py-2 border-b border-slate-800/50">
                {playerItems.map(item => renderPlayerItem(item, 'w-10 h-10'))}
              </div>
              {/* Rij 2: Tools */}
              <div className="flex items-center justify-around px-2 py-1.5 border-b border-slate-800/50">
                {toolItems.map(tool => (
                  <div key={tool.id} className="flex flex-col items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => setActiveTool(tool.id as ToolType)}
                      className={`w-8 h-8 flex items-center justify-center rounded-xl border-2 transition-all ${activeTool === tool.id ? 'bg-ha-brand border-ha-brand text-slate-950 shadow-xl' : 'bg-ha-bg border-slate-800 text-slate-600'}`}
                    >
                      {tool.icon}
                    </button>
                    <span className="text-[6px] font-black text-slate-500 uppercase tracking-tighter">{tool.label}</span>
                  </div>
                ))}
              </div>
              {/* Rij 3: Acties */}
              <div className="flex items-center justify-between px-4 py-2">
                <button onClick={onCancel} className="w-9 h-9 bg-red-950/30 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-600 hover:text-white transition-all active:scale-95">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <div className="flex items-center gap-3">
                  {animationSequence.length > 1 && (
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className={`w-9 h-9 flex items-center justify-center rounded-xl border-2 transition-all ${isPlaying ? 'bg-indigo-600 border-indigo-400 text-white animate-pulse' : 'bg-slate-900 border-slate-800 text-indigo-400'}`}
                      >
                        {isPlaying
                          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                          : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="m5 3 14 9-14 9V3z"/></svg>}
                      </button>
                      <span className="text-[6px] font-black text-indigo-500 uppercase">{isPlaying ? 'STOP' : 'PLAY'}</span>
                    </div>
                  )}
                  <button onClick={() => setCourtType('full')} className="w-9 h-9 rounded-xl flex items-center justify-center border-2 transition-all bg-slate-900 border-slate-800 text-slate-500">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect width="18" height="12" x="3" y="6" rx="2"/><path d="M12 6v12"/></svg>
                  </button>
                  <button onClick={saveAction} className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-2xl active:scale-95 transition-all">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className={`bg-[#0b1224] backdrop-blur-3xl border-slate-800 flex items-center z-[100] shadow-3xl flex-shrink-0 pb-[env(safe-area-inset-bottom)] ${isHorizontalLayout ? 'flex-row w-full h-auto px-3 md:px-8 py-2 md:py-5 border-t gap-2 md:gap-8' : 'flex-col w-24 md:w-32 py-8 border-l h-full overflow-y-auto gap-6'}`}>
            <button onClick={onCancel} className="w-9 h-9 md:w-12 md:h-12 bg-red-950/30 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-600 hover:text-white transition-all shadow-inner active:scale-95 flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div id="cb-tour-players" className={`flex items-center ${isHorizontalLayout ? 'flex-row flex-1 overflow-x-auto no-scrollbar flex-nowrap gap-2 md:gap-6 px-1' : 'flex-col w-full gap-4'}`}>
              {playerItems.map(item => renderPlayerItem(item, isHorizontalLayout ? 'w-9 h-9' : 'w-10 h-10 md:w-12 md:h-12'))}
            </div>
            <div className={`${isHorizontalLayout ? 'h-9 w-px' : 'w-12 h-px'} bg-slate-800 flex-shrink-0`} />
            {animationSequence.length > 1 && (
              <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                <button onClick={() => setIsPlaying(!isPlaying)} className={`${isHorizontalLayout ? 'w-9 h-9' : 'w-12 h-12 md:w-14 md:h-14'} flex items-center justify-center rounded-xl border-2 transition-all ${isPlaying ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl animate-pulse' : 'bg-slate-900 border-slate-800 text-indigo-400'}`}>
                  {isPlaying ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><path d="m5 3 14 9-14 9V3z"/></svg>}
                </button>
                <span className="text-[7px] font-black text-indigo-500 uppercase tracking-tighter">{isPlaying ? 'STOP' : 'PLAY'}</span>
              </div>
            )}
            <div className={`${isHorizontalLayout ? 'h-9 w-px' : 'w-12 h-px'} bg-slate-800 flex-shrink-0`} />
            <div className={`flex items-center ${isHorizontalLayout ? 'flex-row flex-[3] overflow-x-auto no-scrollbar flex-nowrap gap-2 md:gap-4 px-1' : 'flex-col w-full gap-4'}`}>
              {toolItems.slice(0, 1).map(tool => (
                <div id="cb-tour-select" key={tool.id} className="flex flex-col items-center gap-0.5 flex-shrink-0">
                  <button onClick={() => setActiveTool(tool.id as ToolType)} className={`${isHorizontalLayout ? 'w-9 h-9' : 'w-10 h-10 md:w-12 md:h-12'} flex items-center justify-center rounded-xl border-2 transition-all ${activeTool === tool.id ? 'bg-ha-brand border-ha-brand text-slate-950 shadow-xl' : 'bg-ha-bg border-slate-800 text-slate-600'}`}>
                    {tool.icon}
                  </button>
                  <span className="text-[7px] font-black text-slate-500 uppercase tracking-tighter">{tool.label}</span>
                </div>
              ))}
              <div id="cb-tour-movements" className={`flex items-center ${isHorizontalLayout ? 'flex-row flex-nowrap gap-2 md:gap-4' : 'flex-col w-full gap-4'}`}>
                {toolItems.slice(1, 6).map(tool => (
                  <div key={tool.id} className="flex flex-col items-center gap-0.5 flex-shrink-0">
                    <button onClick={() => setActiveTool(tool.id as ToolType)} className={`${isHorizontalLayout ? 'w-9 h-9' : 'w-10 h-10 md:w-12 md:h-12'} flex items-center justify-center rounded-xl border-2 transition-all ${activeTool === tool.id ? 'bg-ha-brand border-ha-brand text-slate-950 shadow-xl' : 'bg-ha-bg border-slate-800 text-slate-600'}`}>
                      {tool.icon}
                    </button>
                    <span className="text-[7px] font-black text-slate-500 uppercase tracking-tighter">{tool.label}</span>
                  </div>
                ))}
              </div>
              <div id="cb-tour-extra" className={`flex items-center ${isHorizontalLayout ? 'flex-row flex-nowrap gap-2 md:gap-4' : 'flex-col w-full gap-4'}`}>
                {toolItems.slice(6).map(tool => (
                  <div key={tool.id} className="flex flex-col items-center gap-0.5 flex-shrink-0">
                    <button onClick={() => setActiveTool(tool.id as ToolType)} className={`${isHorizontalLayout ? 'w-9 h-9' : 'w-10 h-10 md:w-12 md:h-12'} flex items-center justify-center rounded-xl border-2 transition-all ${activeTool === tool.id ? 'bg-ha-brand border-ha-brand text-slate-950 shadow-xl' : 'bg-ha-bg border-slate-800 text-slate-600'}`}>
                      {tool.icon}
                    </button>
                    <span className="text-[7px] font-black text-slate-500 uppercase tracking-tighter">{tool.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div id="cb-tour-save" className={`flex gap-2 md:gap-5 flex-shrink-0 ${isHorizontalLayout ? 'flex-row' : 'flex-col mt-auto pb-8'}`}>
              <button onClick={() => setCourtType(courtType === 'half' ? 'full' : 'half')} className={`${isHorizontalLayout ? 'w-9 h-9 md:w-10 md:h-10' : 'w-12 h-12'} rounded-xl flex items-center justify-center border-2 transition-all ${courtType === 'full' ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect width="18" height="12" x="3" y="6" rx="2"/><path d="M12 6v12"/></svg>
              </button>
              <button onClick={saveAction} className={`${isHorizontalLayout ? 'w-9 h-9 md:w-12 md:h-12' : 'w-12 h-12 md:w-14 md:h-14'} bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-2xl active:scale-95 transition-all`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default CoachBoard;