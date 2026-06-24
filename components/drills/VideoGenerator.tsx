
import React, { useState, useEffect, useRef } from 'react';
import { Drill, DiagramBoard, PlayerPosition, DiagramLine } from '../../types';

interface VideoGeneratorProps {
  drill: Drill;
  activeBoard: DiagramBoard;
  onClose: () => void;
  onVideoGenerated: (url: string, blob: Blob) => void;
}

const VideoGenerator: React.FC<VideoGeneratorProps> = ({ drill, activeBoard, onClose, onVideoGenerated }) => {
  const [status, setStatus] = useState<'preview' | 'recording' | 'finalizing'>('preview');
  const [progress, setProgress] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const animationRef = useRef<number | null>(null);

  // Configuration
  const FPS = 30;
  const TRANSITION_DURATION = 2000; 
  const PAUSE_DURATION = 1000; 
  const CANVAS_WIDTH = 1280;
  const CANVAS_HEIGHT = 720;

  const startRecording = async () => {
    setStatus('recording');
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stream = canvas.captureStream(FPS);
    let options: MediaRecorderOptions = { mimeType: 'video/webm;codecs=vp9' };
    
    if (typeof MediaRecorder.isTypeSupported === 'function') {
      if (options.mimeType && !MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
        if (options.mimeType && !MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'video/mp4' };
        }
      }
    }

    const recorder = new MediaRecorder(stream, options);
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      onVideoGenerated(url, blob);
    };

    recorderRef.current = recorder;
    recorder.start();

    await animateSequence();
    
    recorder.stop();
    setStatus('finalizing');
  };

  const animateSequence = async () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const totalBoards = drill.boards.length;
    
    for (let i = 0; i < totalBoards; i++) {
      const currentBoard = drill.boards[i];
      const nextBoard = drill.boards[i + 1];
      
      setProgress(Math.round(((i + 0.5) / totalBoards) * 100));

      await renderStatic(ctx, currentBoard, PAUSE_DURATION);

      if (nextBoard) {
        await renderTransition(ctx, currentBoard, nextBoard, TRANSITION_DURATION);
      }
    }
    setProgress(100);
  };

  const renderStatic = (ctx: CanvasRenderingContext2D, board: DiagramBoard, duration: number) => {
    return new Promise<void>((resolve) => {
      const startTime = performance.now();
      const loop = (now: number) => {
        drawFrame(ctx, board.players, board.lines, board.courtType);
        if (now - startTime < duration) {
          animationRef.current = requestAnimationFrame(loop);
        } else {
          resolve();
        }
      };
      animationRef.current = requestAnimationFrame(loop);
    });
  };

  const renderTransition = (ctx: CanvasRenderingContext2D, from: DiagramBoard, to: DiagramBoard, duration: number) => {
    return new Promise<void>((resolve) => {
      const startTime = performance.now();
      
      const loop = (now: number) => {
        const elapsed = now - startTime;
        const p = Math.min(elapsed / duration, 1);
        
        const currentPos: PlayerPosition[] = from.players.map((startPlayer, idx) => {
          const endPlayer = to.players.find(tp => tp.id === startPlayer.id) || to.players[idx];
          if (!endPlayer) return startPlayer;
          
          return {
            ...startPlayer,
            x: startPlayer.x + (endPlayer.x - startPlayer.x) * p,
            y: startPlayer.y + (endPlayer.y - startPlayer.y) * p,
          };
        });

        drawFrame(ctx, currentPos, from.lines, from.courtType, p);

        if (p < 1) {
          animationRef.current = requestAnimationFrame(loop);
        } else {
          resolve();
        }
      };
      animationRef.current = requestAnimationFrame(loop);
    });
  };

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawFrame(ctx, activeBoard.players, activeBoard.lines, activeBoard.courtType);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawFrame = (ctx: CanvasRenderingContext2D, players: PlayerPosition[], lines: DiagramLine[], courtType: string, transitionP: number = 1) => {
    // Background
    ctx.fillStyle = '#0E1013';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const isFull = courtType === 'full';
    const courtWidth = isFull ? 188 : 100;
    const courtHeight = isFull ? 100 : 94;

    // Calculate scale to fit in the 1280x720 frame with margin
    const scale = Math.min(CANVAS_WIDTH / courtWidth, CANVAS_HEIGHT / courtHeight) * 0.85;
    const offsetX = (CANVAS_WIDTH - (courtWidth * scale)) / 2;
    const offsetY = (CANVAS_HEIGHT - (courtHeight * scale)) / 2;

    const tx = (val: number) => (val * scale) + offsetX;
    const ty = (val: number) => (val * scale) + offsetY;

    // --- DRAW COURT ---
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 3;

    // Outline
    ctx.strokeRect(offsetX, offsetY, courtWidth * scale, courtHeight * scale);

    const drawHalfCourtMarkings = (centerX: number, isTop: boolean) => {
      const hoopY = isTop ? 11 : courtHeight - 11;
      const backboardY = isTop ? 8 : courtHeight - 8;
      const paintY = isTop ? 0 : courtHeight - 38;
      const ftY = isTop ? 38 : courtHeight - 38;
      const threePtRadius = 36;
      const paintWidth = 32;
      const paintHeight = 38;

      // Paint (Bucket)
      ctx.strokeRect(tx(centerX - (paintWidth/2)), ty(paintY), paintWidth * scale, paintHeight * scale);
      
      // Hoop (Ring)
      ctx.beginPath();
      ctx.strokeStyle = '#f97316'; // Safety Orange
      ctx.arc(tx(centerX), ty(hoopY), 2.5 * scale, 0, Math.PI * 2);
      ctx.stroke();

      // Backboard
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.moveTo(tx(centerX - 8), ty(backboardY));
      ctx.lineTo(tx(centerX + 8), ty(backboardY));
      ctx.stroke();
      
      // Free throw circle
      ctx.beginPath();
      ctx.arc(tx(centerX), ty(ftY), 12 * scale, 0, Math.PI * 2);
      ctx.stroke();

      // 3-point line
      ctx.beginPath();
      if (isTop) {
        ctx.moveTo(tx(centerX - threePtRadius), ty(0));
        ctx.lineTo(tx(centerX - threePtRadius), ty(hoopY));
        ctx.arc(tx(centerX), ty(hoopY), threePtRadius * scale, Math.PI, 0, true);
        ctx.lineTo(tx(centerX + threePtRadius), ty(0));
      } else {
        ctx.moveTo(tx(centerX - threePtRadius), ty(courtHeight));
        ctx.lineTo(tx(centerX - threePtRadius), ty(hoopY));
        ctx.arc(tx(centerX), ty(hoopY), threePtRadius * scale, Math.PI, 0, false);
        ctx.lineTo(tx(centerX + threePtRadius), ty(courtHeight));
      }
      ctx.stroke();
    };

    if (isFull) {
      // Midline
      ctx.beginPath();
      ctx.moveTo(tx(94), ty(0));
      ctx.lineTo(tx(94), ty(100));
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(tx(94), ty(50), 12 * scale, 0, Math.PI * 2);
      ctx.stroke();

      // Full court markings
      const drawFullCourtEnd = (isLeft: boolean) => {
        const hoopX = isLeft ? 11 : 188 - 11;
        const backboardX = isLeft ? 8 : 188 - 8;
        const paintX = isLeft ? 0 : 188 - 38;
        const threePtRadius = 36;
        const centerY = 50;

        ctx.strokeRect(tx(paintX), ty(centerY - 16), 38 * scale, 32 * scale);
        ctx.beginPath();
        ctx.moveTo(tx(backboardX), ty(centerY - 8));
        ctx.lineTo(tx(backboardX), ty(centerY + 8));
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = '#f97316';
        ctx.arc(tx(hoopX), ty(centerY), 2.5 * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        if (isLeft) {
          ctx.moveTo(tx(0), ty(centerY - threePtRadius));
          ctx.lineTo(tx(hoopX), ty(centerY - threePtRadius));
          ctx.arc(tx(hoopX), ty(centerY), threePtRadius * scale, -Math.PI/2, Math.PI/2, false);
          ctx.lineTo(tx(0), ty(centerY + threePtRadius));
        } else {
          ctx.moveTo(tx(188), ty(centerY - threePtRadius));
          ctx.lineTo(tx(hoopX), ty(centerY - threePtRadius));
          ctx.arc(tx(hoopX), ty(centerY), threePtRadius * scale, -Math.PI/2, Math.PI/2, true);
          ctx.lineTo(tx(188), ty(centerY + threePtRadius));
        }
        ctx.stroke();
      };

      drawFullCourtEnd(true);
      drawFullCourtEnd(false);
    } else {
      drawHalfCourtMarkings(50, true);
    }

    // --- DRAW PLAYERS ---
    players.forEach(p => {
      ctx.beginPath();
      ctx.arc(tx(p.x), ty(p.y), 4.5 * scale, 0, Math.PI * 2);
      ctx.fillStyle = p.type === 'home' ? '#ef4444' : p.type === 'away' ? '#3b82f6' : p.type === 'ball' ? '#f97316' : p.type === 'cone' ? '#facc15' : '#64748b';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (p.label) {
        ctx.fillStyle = 'white';
        ctx.font = `bold ${5 * scale}px Inter`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, tx(p.x), ty(p.y) + (0.5 * scale));
      }
    });

    // --- DRAW LINES ---
    const drawArrowHead = (fromX: number, fromY: number, toX: number, toY: number, size: number) => {
      const angle = Math.atan2(toY - fromY, toX - fromX);
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    };

    lines.forEach(l => {
      const sx = tx(l.startX), sy = ty(l.startY);
      const ex = tx(l.endX), ey = ty(l.endY);
      const hasCurve = l.controlX !== undefined && l.controlY !== undefined;
      const cx = hasCurve ? tx(l.controlX!) : (sx + ex) / 2;
      const cy = hasCurve ? ty(l.controlY!) : (sy + ey) / 2;

      // Tangent direction at t=1 of quadratic bezier for correct arrow angle
      const tangentX = hasCurve ? ex - cx : ex - sx;
      const tangentY = hasCurve ? ey - cy : ey - sy;

      const lineW = l.type === 'shot' ? 3 * scale : 1.5 * scale;
      const arrowSize = 8 * scale;

      ctx.lineWidth = lineW;
      ctx.strokeStyle = '#f8fafc';
      ctx.fillStyle = '#f8fafc';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (l.type === 'dribble') {
        // Wavy line using sin waves along the path
        const dx = ex - sx, dy = ey - sy;
        const len = Math.hypot(dx, dy);
        if (len === 0) return;
        const nx = -dy / len, ny = dx / len; // perpendicular
        const waves = Math.max(3, Math.round(len / (15 * scale)));
        const amp = 4 * scale;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        for (let w = 0; w <= waves * 8; w++) {
          const t = w / (waves * 8);
          const px = sx + dx * t + nx * Math.sin(t * waves * 2 * Math.PI) * amp;
          const py = sy + dy * t + ny * Math.sin(t * waves * 2 * Math.PI) * amp;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      } else if (l.type === 'screen') {
        // Line to the screen point, then perpendicular bar
        ctx.beginPath();
        if (hasCurve) {
          ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, ex, ey);
        } else {
          ctx.moveTo(sx, sy); ctx.lineTo(ex, ey);
        }
        ctx.stroke();
        // Perpendicular bar at end
        const angle = Math.atan2(tangentY, tangentX);
        const barSize = 6 * scale;
        const perpX = Math.cos(angle + Math.PI / 2);
        const perpY = Math.sin(angle + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(ex - perpX * barSize, ey - perpY * barSize);
        ctx.lineTo(ex + perpX * barSize, ey + perpY * barSize);
        ctx.stroke();
      } else if (l.type === 'draw' && l.points && l.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(tx(l.points[0].x), ty(l.points[0].y));
        for (let i = 1; i < l.points.length; i++) {
          ctx.lineTo(tx(l.points[i].x), ty(l.points[i].y));
        }
        ctx.stroke();
      } else {
        // run, pass, shot — solid or dashed with arrowhead
        if (l.type === 'pass') {
          ctx.setLineDash([5 * scale, 4 * scale]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        if (hasCurve) {
          ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, ex, ey);
        } else {
          ctx.moveTo(sx, sy); ctx.lineTo(ex, ey);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        drawArrowHead(sx + tangentX * 0.01, sy + tangentY * 0.01, ex, ey, arrowSize);
      }
    });
    ctx.setLineDash([]);

    // Watermark
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = 'bold 20px Inter';
    ctx.textAlign = 'right';
    ctx.fillText('HOOPSATLAS PRO • DIGITAL TACTICS', CANVAS_WIDTH - 40, CANVAS_HEIGHT - 40);
  };

  return (
    <div className="fixed inset-0 z-[150] bg-ha-bg/98 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-[#0b1224] border border-slate-800 rounded-[3rem] p-10 w-full max-w-2xl shadow-3xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-600/10 blur-[100px] rounded-full"></div>
        
        {status === 'preview' ? (
          <div className="space-y-10 relative z-10">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <h3 className="text-4xl font-black italic uppercase text-white tracking-tighter leading-none">Motion <span className="text-indigo-400">Engine</span></h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Ready for HQ Synthesis</p>
              </div>
              <button onClick={onClose} className="p-3 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl hover:text-white transition-all">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="bg-ha-bg border border-slate-800 rounded-3xl overflow-hidden aspect-video relative shadow-2xl flex items-center justify-center">
                <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="w-full h-full object-contain" />
            </div>

            <button 
              onClick={startRecording}
              className="w-full py-8 bg-gradient-to-br from-indigo-600 to-indigo-900 text-white rounded-[2rem] font-black uppercase text-sm tracking-[0.3em] shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-4"
            >
              Generate Motion Video
            </button>
          </div>
        ) : (
          <div className="py-24 flex flex-col items-center justify-center space-y-12">
            <div className="w-32 h-32 rounded-[3.5rem] bg-indigo-500/10 border-2 border-indigo-500/30 flex items-center justify-center mx-auto shadow-3xl">
              <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="text-center space-y-4">
              <h3 className="text-4xl font-black italic uppercase text-white tracking-tighter">Encoding...</h3>
              <p className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.5em]">
                {status === 'recording' ? `Synthesizing: ${progress}%` : 'Finalizing...'}
              </p>
            </div>
            <div className="w-full max-w-xs h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoGenerator;
