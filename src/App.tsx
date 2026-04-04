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

// 运动记录类型
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

// 数据卡片组件
type StatCardProps = {
  title: string;
  value: number | string;
  unit: string;
  icon: React.ReactNode;
  highlight?: boolean;
};
const StatCard = ({ title, value, unit, icon, highlight }: StatCardProps) => (
  <div className={`p-6 rounded-3xl border border-white/5 transition-all hover:border-white/10 ${highlight ? 'bg-gradient-to-br from-zinc-800 to-black col-span-2 md:col-span-2' : 'bg-zinc-900/50'}`}>
    <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-bold uppercase mb-4">
      {icon} {title}
    </div>
    <div className="flex items-baseline gap-2">
      <span className={`${highlight ? 'text-7xl' : 'text-4xl'} font-black tabular-nums tracking-tighter`}>
        {value}
      </span>
      <span className="text-zinc-600 font-bold text-sm uppercase">{unit}</span>
    </div>
  </div>
);

// 控制按钮组件
type ControlButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
};
const ControlButton = ({ children, onClick }: ControlButtonProps) => (
  <button
    onClick={onClick}
    className="flex-1 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center hover:bg-zinc-700 active:scale-95 transition-all text-white shadow-lg"
  >
    {children}
  </button>
);

// 时间格式化
const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// 本地存储工具
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
  
  // 阻力控制
  const [uiResistance, setUiResistance] = useState(10);
  const [ignoreRemoteUpdatesUntil, setIgnoreRemoteUpdatesUntil] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  
  // 运动历史
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const maxHeartRateRef = useRef<number>(0);
  
  // 手动运动控制（新增核心）
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [manualElapsedTime, setManualElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载历史记录
  useEffect(() => {
    setWorkoutHistory(loadHistory());
  }, []);

  // 追踪最大心率
  useEffect(() => {
    if (isConnected && stats.heartRate && stats.heartRate > 0) {
      if (stats.heartRate > maxHeartRateRef.current) maxHeartRateRef.current = stats.heartRate;
    }
  }, [stats.heartRate, isConnected]);

  // 手动计时逻辑
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

  // 保存运动记录（通用函数）
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

  // 蓝牙断开自动保存
  useEffect(() => {
    if (!isConnected && isWorkoutActive) {
      setIsWorkoutActive(false);
      saveWorkoutRecord();
    }
  }, [isConnected]);

  // 阻力调节
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

  // 清空历史
  const clearHistory = () => {
    if (confirm('确定要清空所有运动记录吗？')) {
      setWorkoutHistory([]);
      saveHistory([]);
    }
  };

  // 导出记录
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

  // 导入记录
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

  // 开始运动
  const handleStartWorkout = () => {
    if (!isConnected) { alert('请先连接椭圆机'); return; }
    setManualElapsedTime(0);
    setIsWorkoutActive(true);
    maxHeartRateRef.current = 0;
  };

  // 停止运动 + 保存记录
  const handleStopWorkout = () => {
    setIsWorkoutActive(false);
    saveWorkoutRecord();
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 sm:p-6 font-sans">
      {/* 顶部导航 */}
      <header className="w-full flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 p-2 rounded-xl"><Activity className="text-black w-6 h-6" /></div>
          <h1 className="font-black italic text-2xl tracking-tighter">MOBI-FREE</h1>
        </div>
        <button
          onClick={isConnected ? disconnect : connect}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold ${isConnected ? 'bg-zinc-800 text-zinc-400' : 'bg-white text-black hover:scale-105'}`}
        >
          {isConnected ? <BluetoothOff size={18} /> : <Bluetooth size={18} />}
          {isConnected ? "断开" : "连接椭圆机"}
        </button>
      </header>

      <main className="space-y-6">
        {error && <div className="bg-rose-500/10 border border-rose-500/20 rounded-3xl p-6 text-sm text-rose-200/70">{error}</div>}

        {/* 运动控制按钮（新增核心） */}
        <div className="flex gap-4">
          <button
            onClick={handleStartWorkout}
            disabled={isWorkoutActive || !isConnected}
            className="flex-1 py-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 flex items-center justify-center gap-2 font-bold text-lg transition-all"
          >
            <Play size={20} /> 开始运动
          </button>
          <button
            onClick={handleStopWorkout}
            disabled={!isWorkoutActive}
            className="flex-1 py-5 rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-600 flex items-center justify-center gap-2 font-bold text-lg transition-all"
          >
            <StopCircle size={20} /> 停止运动
          </button>
        </div>

        {/* 数据面板 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="瞬时功率" value={stats.instantPower ?? 0} unit="W" icon={<Zap className="text-amber-500" />} highlight />
          <StatCard title="实时心率" value={stats.heartRate ?? 0} unit="BPM" icon={<Heart className="text-red-500" />} />
          <StatCard title="实时踏频" value={stats.instantCadence ?? 0} unit="RPM" icon={<RotateCcw className="text-blue-400" />} />
          <StatCard title="即时速度" value={(stats.instantSpeed ?? 0).toFixed(1)} unit="KM/H" icon={<Gauge className="text-emerald-400" />} />
          <StatCard title="运动时长" value={formatTime(isWorkoutActive ? manualElapsedTime : (stats.elapsedTime || 0))} unit="" icon={<Timer className="text-purple-400" />} />
          <StatCard title="消耗热量" value={(stats.kcal ?? 0).toFixed(0)} unit="KCAL" icon={<Flame className="text-orange-500" />} />
          <StatCard title="骑行距离" value={((stats.totalDistance ?? 0) / 1000).toFixed(2)} unit="KM" icon={<MapPin className="text-pink-400" />} />
        </div>

        {/* 阻力调节 */}
        <div className="bg-zinc-900 rounded-[2.5rem] p-6 sm:p-8 border border-white/5 shadow-2xl">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h2 className="text-zinc-500 text-[10px] font-bold uppercase mb-1">阻力强度调节</h2>
              <div className="text-6xl font-black italic text-amber-500">L{uiResistance}</div>
            </div>
            <div className="text-zinc-600 text-[10px] font-bold uppercase">范围: 1 - 24</div>
          </div>
          <input
            type="range" min="1" max="24" value={uiResistance}
            onChange={(e) => setUiResistance(parseInt(e.target.value))}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => { setIsDragging(false); updateResistance(uiResistance); }}
            className="w-full h-3 bg-zinc-800 rounded-full appearance-none accent-amber-500 mb-10 cursor-pointer"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex gap-3">
              <ControlButton onClick={() => handleManualAdjust(-1)}><Minus /></ControlButton>
              <ControlButton onClick={() => handleManualAdjust(1)}><Plus /></ControlButton>
            </div>
            <div className="flex gap-2">
              {[1,12,24].map(l => (
                <button key={l} onClick={() => updateResistance(l)} className={`flex-1 rounded-2xl text-xs font-black ${uiResistance===l ? 'bg-amber-500/10 border-amber-500 text-amber-500' : 'bg-zinc-800 text-zinc-500'}`}>档位 {l}</button>
              ))}
            </div>
          </div>
        </div>

        {/* 运动历史 + 导入导出 */}
        <div className="bg-zinc-900 rounded-[2.5rem] p-6 sm:p-8 border border-white/5 shadow-2xl">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2"><History className="text-blue-400" /><h2 className="text-lg font-bold">运动历史</h2></div>
            <div className="flex gap-2 items-center">
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
              <button onClick={handleExport} className="text-green-400 text-sm flex items-center gap-1"><Download size={16} />导出</button>
              <button onClick={() => fileInputRef.current?.click()} className="text-cyan-400 text-sm flex items-center gap-1"><Upload size={16} />导入</button>
              <button onClick={() => setShowHistory(!showHistory)} className="text-zinc-400 text-sm">{showHistory ? '收起' : '展开'}</button>
              <button onClick={clearHistory} className="text-rose-500"><Trash2 size={16} /></button>
            </div>
          </div>
          {showHistory && (
            <div className="max-h-96 overflow-y-auto space-y-3 mt-4">
              {workoutHistory.length === 0 ? <div className="text-center text-zinc-500 py-8">暂无记录</div> :
                workoutHistory.map(item => (
                  <div key={item.id} className="p-4 bg-zinc-800/50 rounded-xl border border-white/5">
                    <div className="flex justify-between text-sm text-zinc-400 mb-2">
                      <span>{item.date}</span><span>阻力 L{item.resistance}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div><div className="text-zinc-500">时长</div><div className="font-bold">{item.duration}</div></div>
                      <div><div className="text-zinc-500">热量</div><div className="font-bold">{item.kcal} kcal</div></div>
                      <div><div className="text-zinc-500">距离</div><div className="font-bold">{item.distance} km</div></div>
                      <div><div className="text-zinc-500">平均心率</div><div className="font-bold text-red-400">{item.avgHeartRate} BPM</div></div>
                      <div><div className="text-zinc-500">最大心率</div><div className="font-bold text-rose-500">{item.maxHeartRate} BPM</div></div>
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </div>

        {!isConnected && <div className="bg-blue-500/5 border border-blue-500/10 rounded-3xl p-6 text-sm text-blue-200/60">请先连接椭圆机</div>}
      </main>
    </div>
  );
}
