import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Activity,
  Zap,
  Gauge,
  Bluetooth,
  BluetoothOff,
  RotateCcw,
  Plus,
  Minus,
  Timer,
  Flame,
  MapPin,
  Heart,
  History,
  Trash2,
  Download,
  Upload,
  Play,
  StopCircle,
} from 'lucide-react';
import { useBluetooth } from './hooks/useBluetooth';
import { useWakeLock } from './hooks/useWakeLock';
import { logEvent } from './services/analytics';

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

type StatCardProps = {
  title: string;
  value: number | string;
  unit: string;
  icon: React.ReactNode;
  highlight?: boolean;
};
const StatCard = ({ title, value, unit, icon, highlight }: StatCardProps) => (
  <div className={`p-4 rounded-2xl border border-white/5 transition-all hover:border-white/10 ${highlight ? 'bg-gradient-to-br from-zinc-800 to-black col-span-2' : 'bg-zinc-900/50'}`}>
    <div className="flex items-center gap-1 text-zinc-500 text-[9px] font-bold uppercase mb-2">
      {icon} {title}
    </div>
    <div className="flex items-baseline gap-1">
      <span className={`${highlight ? 'text-5xl' : 'text-3xl'} font-black tabular-nums tracking-tighter`}>
        {value}
      </span>
      <span className="text-zinc-600 font-bold text-xs uppercase">{unit}</span>
    </div>
  </div>
);

type ControlButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
};
const ControlButton = ({ children, onClick }: ControlButtonProps) => (
  <button
    onClick={onClick}
    className="flex-1 h-12 bg-zinc-800 rounded-xl flex items-center justify-center hover:bg-zinc-700 active:scale-95 transition-all text-white shadow-lg"
  >
    {children}
  </button>
);

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const STORAGE_KEY = 'MOBI_WORKOUT_HISTORY';
const saveHistory = (data: WorkoutRecord[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};
const loadHistory = (): WorkoutRecord[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export default function App() {
  const { isConnected, stats, error, connect, disconnect, setResistance } = useBluetooth();
  useWakeLock(isConnected);
  
  const [uiResistance, setUiResistance] = useState(10);
  const [ignoreRemoteUpdatesUntil, setIgnoreRemoteUpdatesUntil] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutRecord[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const maxHeartRateRef = useRef<number>(0);
  
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [manualElapsedTime, setManualElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setWorkoutHistory(loadHistory());
  }, []);

  useEffect(() => {
    if (isConnected && stats.heartRate && stats.heartRate > 0) {
      if (stats.heartRate > maxHeartRateRef.current) maxHeartRateRef.current = stats.heartRate;
    }
  }, [stats.heartRate, isConnected]);

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
    const duration = manualElapsedTime > 10 ? manualElapsedTime : (stats.elapsedTime || 0);
    if (duration < 10) return;

    const record: WorkoutRecord = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
      duration: formatTime(duration),
      kcal: Math.round(stats.kcal || 0),
      distance: ((stats.totalDistance || 0) / 1000).toFixed(2),
      avgHeartRate: Math.round(stats.heartRate || 0),
      maxHeartRate: maxHeartRateRef.current,
      resistance: uiResistance,
    };

    const newHistory = [record, ...workoutHistory];
    setWorkoutHistory(newHistory);
    saveHistory(newHistory);
    maxHeartRateRef.current = 0;
  }, [manualElapsedTime, stats, workoutHistory, uiResistance]);

  useEffect(() => {
    if (!isConnected && isWorkoutActive) {
      setIsWorkoutActive(false);
      saveWorkoutRecord();
    }
  }, [isConnected]);

  const updateResistance = useCallback(async (level: number) => {
    const safeLevel = Math.min(Math.max(level, 1), 24);
    try {
      setUiResistance(safeLevel);
      setIgnoreRemoteUpdatesUntil(Date.now() + 1000);
      await setResistance(safeLevel);
      if ('vibrate' in navigator) navigator.vibrate(50);
    } catch (e) { console.error("设置阻力失败", e); }
  }, [setResistance]);

  const handleManualAdjust = (delta: number) => {
    updateResistance(uiResistance + delta);
  };

  const clearHistory = () => {
    if (confirm('确定清空所有记录？')) {
      setWorkoutHistory([]);
      saveHistory([]);
    }
  };

  const handleExport = () => {
    const data = JSON.stringify(workoutHistory, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = `mobi-workout-${new Date().toISOString().slice(0,10)}.json`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(imported)) throw new Error('格式错误');
        const valid = imported.filter(item => item.id && item.date && typeof item.kcal === 'number');
        if (valid.length === 0) { alert('无有效记录'); return; }
        if (confirm(`导入 ${valid.length} 条记录？`)) {
          const merged = [...valid, ...workoutHistory];
          setWorkoutHistory(merged);
          saveHistory(merged);
          alert('导入成功！');
        }
      } catch { alert('文件格式错误'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleStartWorkout = () => {
    if (!isConnected) { alert('请先连接椭圆机'); return; }
    setManualElapsedTime(0);
    setIsWorkoutActive(true);
    maxHeartRateRef.current = 0;
  };

  const handleStopWorkout = () => {
    setIsWorkoutActive(false);
    saveWorkoutRecord();
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-3 font-sans">
      {/* 顶部一体化导航：标题 + 启停按钮 + 蓝牙按钮 */}
      <header className="w-full flex items-center justify-between gap-2 mb-4">
        {/* 左侧Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="bg-amber-500 p-1.5 rounded-lg"><Activity className="text-black w-5 h-5" /></div>
          <h1 className="font-black text-lg tracking-tighter">MOBI-FREE</h1>
        </div>

        {/* 中间：开始/停止按钮（核心优化） */}
        <div className="flex gap-1 flex-1 max-w-[180px]">
          <button
            onClick={handleStartWorkout}
            disabled={isWorkoutActive || !isConnected}
            className="flex-1 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 flex items-center justify-center gap-1 text-xs font-bold transition-all"
          >
            <Play size={14} /> 开始
          </button>
          <button
            onClick={handleStopWorkout}
            disabled={!isWorkoutActive}
            className="flex-1 h-9 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-600 flex items-center justify-center gap-1 text-xs font-bold transition-all"
          >
            <StopCircle size={14} /> 停止
          </button>
        </div>

        {/* 右侧蓝牙连接按钮 */}
        <button
          onClick={isConnected ? disconnect : connect}
          className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-full font-bold text-xs transition-all bg-white text-black hover:scale-105"
        >
          {isConnected ? <BluetoothOff size={14} /> : <Bluetooth size={14} />}
          {isConnected ? "断开" : "连接"}
        </button>
      </header>

      <main className="space-y-3">
        {error && <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3 text-xs text-rose-200/70">{error}</div>}

        {/* 紧凑型数据面板 */}
        <div className="grid grid-cols-2 gap-2">
          <StatCard title="瞬时功率" value={stats.instantPower ?? 0} unit="W" icon={<Zap className="text-amber-500 w-3 h-3" />} highlight />
          <div className="grid grid-cols-2 gap-2">
            <StatCard title="心率" value={stats.heartRate ?? 0} unit="BPM" icon={<Heart className="text-red-500 w-3 h-3" />} />
            <StatCard title="踏频" value={stats.instantCadence ?? 0} unit="RPM" icon={<RotateCcw className="text-blue-400 w-3 h-3" />} />
            <StatCard title="速度" value={(stats.instantSpeed ?? 0).toFixed(1)} unit="KM/H" icon={<Gauge className="text-emerald-400 w-3 h-3" />} />
            <StatCard title="时长" value={formatTime(isWorkoutActive ? manualElapsedTime : (stats.elapsedTime || 0))} unit="" icon={<Timer className="text-purple-400 w-3 h-3" />} />
          </div>
          <StatCard title="热量" value={(stats.kcal ?? 0).toFixed(0)} unit="KCAL" icon={<Flame className="text-orange-500 w-3 h-3" />} />
          <StatCard title="距离" value={((stats.totalDistance ?? 0) / 1000).toFixed(2)} unit="KM" icon={<MapPin className="text-pink-400 w-3 h-3" />} />
        </div>

        {/* 紧凑型阻力调节 */}
        <div className="bg-zinc-900 rounded-2xl p-3 border border-white/5 shadow-xl">
          <div className="flex justify-between items-end mb-3">
            <div>
              <h2 className="text-zinc-500 text-[9px] font-bold uppercase mb-1">阻力调节</h2>
              <div className="text-3xl font-bold text-amber-500">L{uiResistance}</div>
            </div>
            <div className="text-zinc-600 text-[9px] font-bold">1-24</div>
          </div>

          <input
            type="range" min="1" max="24" value={uiResistance}
            onChange={(e) => setUiResistance(parseInt(e.target.value))}
            onMouseUp={() => updateResistance(uiResistance)}
            onTouchEnd={() => updateResistance(uiResistance)}
            className="w-full h-2 bg-zinc-800 rounded-full appearance-none accent-amber-500 mb-3 cursor-pointer"
          />

          <div className="flex gap-2">
            <ControlButton onClick={() => handleManualAdjust(-1)}><Minus size={16} /></ControlButton>
            <ControlButton onClick={() => handleManualAdjust(1)}><Plus size={16} /></ControlButton>
            {[1,12,24].map(l => (
              <button key={l} onClick={() => updateResistance(l)} 
                className={`px-2 py-2 rounded-xl text-xs font-bold ${uiResistance===l ? 'bg-amber-500/10 text-amber-500' : 'bg-zinc-800 text-zinc-500'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* 紧凑型运动历史 */}
        <div className="bg-zinc-900 rounded-2xl p-3 border border-white/5 shadow-xl">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-1"><History className="text-blue-400 w-4 h-4" /><h2 className="text-sm font-bold">运动记录</h2></div>
            <div className="flex gap-1 items-center">
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
              <button onClick={handleExport} className="text-green-400 text-xs"><Download size={12} />导出</button>
              <button onClick={() => fileInputRef.current?.click()} className="text-cyan-400 text-xs"><Upload size={12} />导入</button>
              <button onClick={clearHistory} className="text-rose-500"><Trash2 size={12} /></button>
            </div>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {workoutHistory.length === 0 ? <div className="text-center text-zinc-500 text-xs py-2">暂无记录</div> :
              workoutHistory.slice(0,3).map(item => (
                <div key={item.id} className="p-2 bg-zinc-800/50 rounded-xl border border-white/5 text-xs">
                  <div className="flex justify-between text-zinc-400 text-[10px]">
                    <span>{item.date.slice(5,-3)}</span><span>L{item.resistance}</span>
                  </div>
                  <div className="flex justify-between gap-1 mt-1">
                    <span>{item.duration}</span>
                    <span>{item.kcal}kcal</span>
                    <span>{item.distance}km</span>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </main>
    </div>
  );
}
