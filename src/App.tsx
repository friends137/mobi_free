import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Activity, Zap, Gauge, Bluetooth, BluetoothOff, RotateCcw,
  Plus, Minus, Timer, Flame, MapPin, Heart, History, Trash2,
  Download, Upload, Play, StopCircle,
} from 'lucide-react';
import { useBluetooth } from './hooks/useBluetooth';

interface WorkoutRecord {
  id: string;
  date: string;
  duration: string;
  kcal: number;
  distance: string;
  avgHeartRate: number;
  maxHeartRate: number;
  resistance: number;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const STORAGE_KEY = 'MOBI_WORKOUT_HISTORY';
const saveHistory = (data: WorkoutRecord[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
const loadHistory = (): WorkoutRecord[] => {
  const d = localStorage.getItem(STORAGE_KEY);
  return d ? JSON.parse(d) : [];
};

export default function App() {
  const { isConnected, stats, error, connect, disconnect, setResistance } = useBluetooth();

  const [uiResistance, setUiResistance] = useState(10);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutRecord[]>([]);
  const maxHeartRateRef = useRef(0);
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);

  // ========= 核心修复：手动计时 =========
  const [manualElapsedTime, setManualElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setWorkoutHistory(loadHistory());
  }, []);

  // ========= 修复：点开始就启动定时器 =========
  useEffect(() => {
    if (isWorkoutActive) {
      timerRef.current = setInterval(() => {
        setManualElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isWorkoutActive]);

  const saveWorkoutRecord = useCallback(() => {
    const durationSec = manualElapsedTime;
    if (durationSec < 5) return;

    const record: WorkoutRecord = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
      duration: formatTime(durationSec),
      kcal: Math.round(stats.kcal || 0),
      distance: ((stats.totalDistance || 0) / 1000).toFixed(2),
      avgHeartRate: stats.heartRate,
      maxHeartRate: maxHeartRateRef.current,
      resistance: uiResistance,
    };

    const newHistory = [record, ...workoutHistory];
    setWorkoutHistory(newHistory);
    saveHistory(newHistory);
    maxHeartRateRef.current = 0;
  }, [manualElapsedTime, stats, workoutHistory, uiResistance]);

  const updateResistance = useCallback(async (level: number) => {
    const v = Math.min(Math.max(level, 1), 24);
    setUiResistance(v);
    await setResistance(v);
  }, [setResistance]);

  // ========= 修复：开始按钮逻辑 =========
  const handleStart = () => {
    if (!isConnected) {
      alert('请先连接椭圆机');
      return;
    }
    setManualElapsedTime(0);
    setIsWorkoutActive(true);
    maxHeartRateRef.current = 0;
  };

  const handleStop = () => {
    setIsWorkoutActive(false);
    saveWorkoutRecord();
  };

  const clearHistory = () => {
    if (confirm('确定清空？')) {
      setWorkoutHistory([]);
      saveHistory([]);
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(workoutHistory, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.download = `mobi-${new Date().toISOString().slice(0, 10)}.json`;
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImport = (e: any) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const arr = JSON.parse(ev.target?.result as string);
        if (Array.isArray(arr)) {
          setWorkoutHistory([...arr, ...workoutHistory]);
          saveHistory([...arr, ...workoutHistory]);
        }
      } catch {}
    };
    r.readAsText(f);
    e.target.value = '';
  };

  // 显示：优先用手动计时，保证点开始就走
  const displayTime = isWorkoutActive ? manualElapsedTime : stats.elapsedTime;

  return (
    <div className="min-h-screen bg-black text-white p-2 font-sans">
      <header className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="bg-amber-500 p-1.5 rounded-lg"><Activity className="text-black w-5 h-5" /></div>
          <h1 className="font-bold text-xl">MOBI 1.8</h1>
        </div>
        <div className="flex gap-1 flex-1 max-w-[170px]">
          <button
            onClick={handleStart}
            disabled={isWorkoutActive || !isConnected}
            className="flex-1 h-9 rounded-xl bg-emerald-600 text-xs font-bold flex items-center justify-center gap-1"
          >
            <Play size={14} />开始
          </button>
          <button
            onClick={handleStop}
            disabled={!isWorkoutActive}
            className="flex-1 h-9 rounded-xl bg-rose-600 text-xs font-bold flex items-center justify-center gap-1"
          >
            <StopCircle size={14} />停止
          </button>
        </div>
        <button onClick={isConnected ? disconnect : connect}
          className="px-3 py-2 rounded-full bg-white text-black text-xs font-bold">
          {isConnected ? '断开' : '连接'}
        </button>
      </header>

      <main className="space-y-2">
        {error && <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-2 text-xs">{error}</div>}

        <div className="flex gap-2">
          <div className='flex-1 rounded-2xl p-3 border border-white/5 bg-zinc-800'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <Zap className='text-amber-500 w-3 h-3' /> 瞬时功率
            </div>
            <div className='text-3xl font-bold'>{stats.instantPower ?? 0}</div>
          </div>
          <div className='flex-1 rounded-2xl p-3 border border-white/5 bg-zinc-800'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <Timer className='text-purple-400 w-3 h-3' /> 时长
            </div>
            <div className='text-3xl font-bold'>{formatTime(displayTime)}</div>
          </div>
        </div>

        <div className="flex gap-2">
          <div className='flex-1 rounded-2xl p-3 border border-white/5 bg-zinc-800'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <Heart className='text-red-500 w-3 h-3' /> 心率
            </div>
            <div className='text-3xl font-bold'>{stats.heartRate ?? 0}</div>
          </div>
          <div className='flex-1 rounded-2xl p-3 border border-white/5 bg-zinc-800'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <Flame className='text-orange-500 w-3 h-3' /> 热量
            </div>
            <div className='text-3xl font-bold'>{(stats.kcal ?? 0).toFixed(0)}</div>
          </div>
        </div>

        <div className="flex gap-2">
          <div className='w-1/3 rounded-2xl p-3 border border-white/5 bg-zinc-800'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <RotateCcw className='text-blue-400 w-3 h-3' /> 踏频
            </div>
            <div className='text-3xl font-bold'>{stats.instantCadence ?? 0}</div>
          </div>
          <div className='w-1/3 rounded-2xl p-3 border border-white/5 bg-zinc-800'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <Gauge className='text-emerald-400 w-3 h-3' /> 速度
            </div>
            <div className='text-3xl font-bold'>{(stats.instantSpeed ?? 0).toFixed(1)}</div>
          </div>
          <div className='w-1/3 rounded-2xl p-3 border border-white/5 bg-zinc-800'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <MapPin className='text-pink-400 w-3 h-3' /> 距离
            </div>
            <div className='text-3xl font-bold'>{((stats.totalDistance ?? 0) / 1000).toFixed(2)}</div>
          </div>
        </div>

        <div className="bg-zinc-800 rounded-2xl p-3 border border-white/5">
          <div className="flex justify-between items-center">
            <div>
              <div className='text-zinc-500 text-[10px]'>阻力</div>
              <div className="text-2xl font-bold text-amber-500">L{uiResistance}</div>
            </div>
          </div>
          <input type="range" min="1" max="24" value={uiResistance}
            onChange={(e) => setUiResistance(+e.target.value)}
            onMouseUp={() => updateResistance(uiResistance)}
            className="w-full h-2 bg-zinc-700 rounded-full my-2"
          />
          <div className="flex gap-1">
            <button onClick={() => updateResistance(uiResistance - 1)} className='flex-1 h-10 rounded-xl bg-zinc-700'>-</button>
            <button onClick={() => updateResistance(uiResistance + 1)} className='flex-1 h-10 rounded-xl bg-zinc-700'>+</button>
          </div>
        </div>

        <div className="bg-zinc-800 rounded-2xl p-2 border border-white/5">
          <div className="flex justify-between items-center">
            <div className='text-sm font-bold'>运动记录</div>
            <div className="flex gap-2">
              <button onClick={handleExport} className="text-xs">导出</button>
              <button onClick={() => fileInputRef.current?.click()}>导入</button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
