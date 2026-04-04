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
} from 'lucide-react';
import { useBluetooth } from './hooks/useBluetooth';
import { useWakeLock } from './hooks/useWakeLock';
import { logEvent } from './services/analytics';

// 运动记录类型定义
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

/**
 * UI 组件
 */
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
  const { isConnected, stats, error, connect, disconnect, setResistance, logs } = useBluetooth();
  useWakeLock(isConnected);
  const [uiResistance, setUiResistance] = useState(10);
  const [ignoreRemoteUpdatesUntil, setIgnoreRemoteUpdatesUntil] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const maxHeartRateRef = useRef<number>(0);

  // 加载历史记录
  useEffect(() => {
    setWorkoutHistory(loadHistory());
  }, []);

  // 追踪最大心率
  useEffect(() => {
    if (isConnected && stats.heartRate && stats.heartRate > 0) {
      if (stats.heartRate > maxHeartRateRef.current) {
        maxHeartRateRef.current = stats.heartRate;
      }
    }
  }, [stats.heartRate, isConnected]);

  // 断开连接时自动保存运动记录
  useEffect(() => {
    if (!isConnected && stats.elapsedTime && stats.elapsedTime > 10) {
      const record: WorkoutRecord = {
        id: Date.now().toString(),
        date: new Date().toLocaleString(),
        duration: formatTime(stats.elapsedTime),
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
    }
  }, [isConnected]);

  const updateResistance = useCallback(async (level: number) => {
    const safeLevel = Math.min(Math.max(level, 1), 24);
    try {
      setUiResistance(safeLevel);
      setIgnoreRemoteUpdatesUntil(Date.now() + 1000);
      await setResistance(safeLevel);
      if ('vibrate' in navigator) navigator.vibrate(50);
    } catch (e) {
      console.error("设置阻力失败", e);
    }
  }, [setResistance]);

  const handleManualAdjust = (delta: number) => {
    updateResistance(uiResistance + delta);
  };

  // 清空历史记录
  const clearHistory = () => {
    if (confirm('确定要清空所有运动记录吗？')) {
      setWorkoutHistory([]);
      saveHistory([]);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 sm:p-6 font-sans">
      <header className="w-full flex justify-between items-center mb-10">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 p-2 rounded-xl">
            <Activity className="text-black w-6 h-6" strokeWidth={3} />
          </div>
          <h1 className="font-black italic text-2xl tracking-tighter">MOBI-FREE</h1>
        </div>
        <button
          onClick={isConnected ? disconnect : connect}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold transition-all shadow-xl ${isConnected ? 'bg-zinc-800 text-zinc-400' : 'bg-white text-black hover:scale-105 active:scale-95'
            }`}
        >
          {isConnected ? <BluetoothOff size={18} /> : <Bluetooth size={18} />}
          {isConnected ? "断开" : "连接椭圆机"}
        </button>
      </header>

      <main className="w-full space-y-6">
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-3xl p-6 flex gap-4 items-start">
            <div className="text-sm text-rose-200/70 leading-relaxed">
              {error}
            </div>
          </div>
        )}

        {/* 数据面板 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="瞬时功率"
            value={stats.instantPower ?? 0}
            unit="W"
            icon={<Zap className="text-amber-500 w-4 h-4" />}
            highlight
          />
          <StatCard
            title="实时心率"
            value={stats.heartRate ?? 0}
            unit="BPM"
            icon={<Heart className="text-red-500 w-4 h-4" />}
          />
          <StatCard
            title="实时踏频"
            value={stats.instantCadence ?? 0}
            unit="RPM"
            icon={<RotateCcw className="text-blue-400 w-4 h-4" />}
          />
          <StatCard
            title="即时速度"
            value={(stats.instantSpeed ?? 0).toFixed(1)}
            unit="KM/H"
            icon={<Gauge className="text-emerald-400 w-4 h-4" />}
          />

          <StatCard
            title="运动时长"
            value={formatTime(stats.elapsedTime ?? 0)}
            unit=""
            icon={<Timer className="text-purple-400 w-4 h-4" />}
          />
          <StatCard
            title="消耗热量"
            value={(stats.kcal ?? 0).toFixed(0)}
            unit="KCAL"
            icon={<Flame className="text-orange-500 w-4 h-4" />}
          />
          <StatCard
            title="骑行距离"
            value={((stats.totalDistance ?? 0) / 1000).toFixed(2)}
            unit="KM"
            icon={<MapPin className="text-pink-400 w-4 h-4" />}
          />
        </div>

        {/* 阻力调节 */}
        <div className="bg-zinc-900 rounded-[2.5rem] p-6 sm:p-8 border border-white/5 shadow-2xl">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h2 className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-1">阻力强度调节</h2>
              <div className="text-6xl font-black italic text-amber-500 tracking-tighter">
                L{uiResistance}
              </div>
            </div>
            <div className="text-zinc-600 text-[10px] font-bold uppercase">范围: 1 - 24</div>
          </div>

          <input
            type="range"
            min="1"
            max="24"
            step="1"
            value={uiResistance}
            onChange={(e) => setUiResistance(parseInt(e.target.value))}
            onMouseDown={() => setIsDragging(true)}
            onTouchStart={() => setIsDragging(true)}
            onMouseUp={() => { setIsDragging(false); updateResistance(uiResistance); }}
            onTouchEnd={() => { setIsDragging(false); updateResistance(uiResistance); }}
            className="w-full h-3 bg-zinc-800 rounded-full appearance-none accent-amber-500 mb-10 cursor-pointer"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex gap-3">
              <ControlButton onClick={() => handleManualAdjust(-1)}><Minus /></ControlButton>
              <ControlButton onClick={() => handleManualAdjust(1)}><Plus /></ControlButton>
            </div>
            <div className="flex gap-2">
              {[1, 12, 24].map(level => (
                <button
                  key={level}
                  onClick={() => updateResistance(level)}
                  className={`flex-1 rounded-2xl text-xs font-black transition-all border-2 ${uiResistance === level
                    ? 'bg-amber-500/10 border-amber-500 text-amber-500'
                    : 'bg-zinc-800 border-transparent text-zinc-500 hover:bg-zinc-700'
                    }`}
                >
                  档位 {level}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 运动历史记录 */}
        <div className="bg-zinc-900 rounded-[2.5rem] p-6 sm:p-8 border border-white/5 shadow-2xl">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <History className="text-blue-400 w-5 h-5" />
              <h2 className="text-lg font-bold">运动历史记录</h2>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className="text-sm text-zinc-400 hover:text-white"
              >
                {showHistory ? '收起' : '展开'}
              </button>
              <button 
                onClick={clearHistory}
                className="text-sm text-rose-500 hover:text-rose-400"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {showHistory && (
            <div className="max-h-96 overflow-y-auto space-y-3 mt-4">
              {workoutHistory.length === 0 ? (
                <div className="text-center text-zinc-500 py-8">暂无运动记录</div>
              ) : (
                workoutHistory.map((item) => (
                  <div key={item.id} className="p-4 bg-zinc-800/50 rounded-xl border border-white/5">
                    <div className="flex justify-between text-sm text-zinc-400 mb-2">
                      <span>{item.date}</span>
                      <span>阻力 L{item.resistance}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-zinc-500">时长</div>
                        <div className="font-bold">{item.duration}</div>
                      </div>
                      <div>
                        <div className="text-zinc-500">热量</div>
                        <div className="font-bold">{item.kcal} kcal</div>
                      </div>
                      <div>
                        <div className="text-zinc-500">距离</div>
                        <div className="font-bold">{item.distance} km</div>
                      </div>
                      <div>
                        <div className="text-zinc-500">平均心率</div>
                        <div className="font-bold text-red-400">{item.avgHeartRate} BPM</div>
                      </div>
                      <div>
                        <div className="text-zinc-500">最大心率</div>
                        <div className="font-bold text-rose-500">{item.maxHeartRate} BPM</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* 连接提示 */}
        {!isConnected && (
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-3xl p-6 flex gap-4 items-start">
            <div className="text-sm text-blue-200/60 leading-relaxed">
              <p className="font-bold text-blue-400 mb-1 tracking-tight">连接说明</p>
              请确保您的椭圆机处于开机状态，且未被其他 App 连接。点击上方按钮扫描并选择您的设备即可。
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
