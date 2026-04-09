import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Activity, Zap, Gauge, Bluetooth, BluetoothOff, RotateCcw,
  Plus, Minus, Timer, Flame, MapPin, Heart, History, Trash2,
  Download, Upload, Play, StopCircle, Bug
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
  const { 
    isConnected, 
    stats, 
    error, 
    protocol, 
    deviceName, 
    rawPacket,
    connect, 
    disconnect, 
    setResistance 
  } = useBluetooth();

  const [uiResistance, setUiResistance] = useState(10);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutRecord[]>([]);
  const maxHeartRateRef = useRef(0);
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [manualElapsedTime, setManualElapsedTime] = useState(0);
  const [showDebug, setShowDebug] = useState(false); // 调试面板开关
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初始化历史记录
  useEffect(() => {
    setWorkoutHistory(loadHistory());
  }, []);

  // 手动计时逻辑，点开始立刻走字
  useEffect(() => {
    if (isWorkoutActive) {
      timerRef.current = setInterval(() => {
        setManualElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isWorkoutActive]);

  // 记录心率峰值
  useEffect(() => {
    if (isConnected && stats.heartRate > 0) {
      if (stats.heartRate > maxHeartRateRef.current) {
        maxHeartRateRef.current = stats.heartRate;
      }
    }
  }, [stats.heartRate, isConnected]);

  // 保存运动记录
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

  // 阻力调节
  const updateResistance = useCallback(async (level: number) => {
    const v = Math.min(Math.max(level, 1), 24);
    setUiResistance(v);
    await setResistance(v);
  }, [setResistance]);

  // 开始按钮逻辑
  const handleStart = () => {
    if (!isConnected) {
      alert('请先连接椭圆机');
      return;
    }
    setManualElapsedTime(0);
    setIsWorkoutActive(true);
    maxHeartRateRef.current = 0;
  };

  // 停止按钮逻辑
  const handleStop = () => {
    setIsWorkoutActive(false);
    saveWorkoutRecord();
  };

  // 清空历史记录
  const clearHistory = () => {
    if (confirm('确定清空所有运动记录？')) {
      setWorkoutHistory([]);
      saveHistory([]);
    }
  };

  // 导出记录
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(workoutHistory, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.download = `mobi-workout-${new Date().toISOString().slice(0, 10)}.json`;
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // 导入记录
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const arr = JSON.parse(ev.target?.result as string);
        if (Array.isArray(arr)) {
          const newHistory = [...arr, ...workoutHistory];
          setWorkoutHistory(newHistory);
          saveHistory(newHistory);
          alert('导入成功');
        }
      } catch {
        alert('文件格式错误，导入失败');
      }
    };
    r.readAsText(f);
    e.target.value = '';
  };

  // 显示时长：运动中用手动计时，静止用设备时长
  const displayTime = isWorkoutActive ? manualElapsedTime : stats.elapsedTime;

  return (
    <div className="min-h-screen bg-black text-white p-2 font-sans">
      {/* 顶部标题+控制栏 */}
      <header className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="bg-amber-500 p-1.5 rounded-lg">
            <Activity className="text-black w-5 h-5" />
          </div>
          <h1 className="font-bold text-xl">MOBI 2.0</h1>
        </div>

        <div className="flex gap-1 flex-1 max-w-[170px]">
          <button
            onClick={handleStart}
            disabled={isWorkoutActive || !isConnected}
            className={`flex-1 h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1 ${isWorkoutActive || !isConnected ? 'bg-zinc-700 cursor-not-allowed' : 'bg-emerald-600'}`}
          >
            <Play size={14} />开始
          </button>
          <button
            onClick={handleStop}
            disabled={!isWorkoutActive}
            className={`flex-1 h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1 ${!isWorkoutActive ? 'bg-zinc-700 cursor-not-allowed' : 'bg-rose-600'}`}
          >
            <StopCircle size={14} />停止
          </button>
        </div>

        <button
          onClick={isConnected ? disconnect : connect}
          className="px-3 py-2 rounded-full bg-white text-black text-xs font-bold flex items-center gap-1"
        >
          {isConnected ? <BluetoothOff size={14} /> : <Bluetooth size={14} />}
          {isConnected ? '断开' : '连接'}
        </button>
      </header>

      <main className="space-y-2">
        {/* 错误提示 */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-2 text-xs">
            {error}
          </div>
        )}

        {/* 调试面板开关 */}
        <div className="flex justify-end">
          <button 
            onClick={() => setShowDebug(!showDebug)}
            className="flex items-center gap-1 text-xs text-cyan-400"
          >
            <Bug size={12} /> {showDebug ? '隐藏调试' : '显示调试'}
          </button>
        </div>

        {/* 调试面板 */}
        {showDebug && (
          <div className="bg-zinc-900 rounded-2xl p-3 border border-cyan-500/30 text-xs font-mono">
            <div className="mb-1">设备名: {deviceName}</div>
            <div className="mb-1">当前协议: {protocol}</div>
            <div className="mb-1">心率原始值: {stats.heartRateRaw}</div>
            <div className="mb-1">原始数据包: [{rawPacket.join(', ')}]</div>
            <div className="text-cyan-400">请打开浏览器F12控制台查看完整日志</div>
          </div>
        )}

        {/* 第一行：功率+时长 */}
        <div className="flex gap-2">
          <div className='flex-1 bg-gradient-to-br from-zinc-800 to-black rounded-2xl p-3 border border-white/5'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <Zap className='text-amber-500 w-3 h-3' /> 瞬时功率
            </div>
            <div className='text-3xl font-bold'>{stats.instantPower ?? 0} <span className='text-zinc-600 text-xs'>W</span></div>
          </div>
          <div className='flex-1 bg-zinc-900/50 rounded-2xl p-3 border border-white/5'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <Timer className='text-purple-400 w-3 h-3' /> 时长
            </div>
            <div className='text-3xl font-bold'>{formatTime(displayTime)}</div>
          </div>
        </div>

        {/* 第二行：心率+热量 */}
        <div className="flex gap-2">
          <div className='flex-1 bg-zinc-900/50 rounded-2xl p-3 border border-white/5'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <Heart className='text-red-500 w-3 h-3' /> 心率
            </div>
            <div className='text-3xl font-bold'>{stats.heartRate ?? 0} <span className='text-zinc-600 text-xs'>BPM</span></div>
          </div>
          <div className='flex-1 bg-zinc-900/50 rounded-2xl p-3 border border-white/5'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <Flame className='text-orange-500 w-3 h-3' /> 热量
            </div>
            <div className='text-3xl font-bold'>{(stats.kcal ?? 0).toFixed(0)} <span className='text-zinc-600 text-xs'>KCAL</span></div>
          </div>
        </div>

        {/* 第三行：踏频+速度+距离 */}
        <div className="flex gap-2">
          <div className='w-1/3 bg-zinc-900/50 rounded-2xl p-3 border border-white/5'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <RotateCcw className='text-blue-400 w-3 h-3' /> 踏频
            </div>
            <div className='text-3xl font-bold'>{stats.instantCadence ?? 0} <span className='text-zinc-600 text-xs'>RPM</span></div>
          </div>
          <div className='w-1/3 bg-zinc-900/50 rounded-2xl p-3 border border-white/5'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <Gauge className='text-emerald-400 w-3 h-3' /> 速度
            </div>
            <div className='text-3xl font-bold'>{(stats.instantSpeed ?? 0).toFixed(1)}</div>
          </div>
          <div className='w-1/3 bg-zinc-900/50 rounded-2xl p-3 border border-white/5'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <MapPin className='text-pink-400 w-3 h-3' /> 距离
            </div>
            <div className='text-3xl font-bold'>{((stats.totalDistance ?? 0)/1000).toFixed(2)}</div>
          </div>
        </div>

        {/* 阻力调节 */}
        <div className="bg-zinc-900 rounded-2xl p-3 border border-white/5">
          <div className="flex justify-between items-center mb-2">
            <div>
              <div className='text-zinc-500 text-[10px]'>阻力</div>
              <div className="text-2xl font-bold text-amber-500">L{uiResistance}</div>
            </div>
            <div className='text-zinc-600 text-[10px]'>1-24档</div>
          </div>
          <input
            type="range" min="1" max="24" value={uiResistance}
            onChange={(e) => setUiResistance(+e.target.value)}
            onMouseUp={() => updateResistance(uiResistance)}
            className="w-full h-2 bg-zinc-800 rounded-full appearance-none accent-amber-500 mb-2"
          />
          <div className="flex gap-1">
            <button onClick={() => updateResistance(uiResistance - 1)} className='flex-1 h-10 bg-zinc-800 rounded-xl'>
              <Minus size={16} />
            </button>
            <button onClick={() => updateResistance(uiResistance + 1)} className='flex-1 h-10 bg-zinc-800 rounded-xl'>
              <Plus size={16} />
            </button>
            {[1, 12, 24].map(l => (
              <button key={l} onClick={() => updateResistance(l)} className='px-2 h-10 rounded-xl text-xs bg-zinc-800'>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* 运动历史记录 */}
        <div className="bg-zinc-900 rounded-2xl p-2 border border-white/5">
          <div className="flex justify-between items-center">
            <div className='flex items-center gap-1 text-sm font-bold'>
              <History className='text-blue-400 w-4 h-4' /> 运动记录
            </div>
            <div className="flex gap-2">
              <button onClick={handleExport} className='text-green-400 text-xs flex items-center gap-1'>
                <Download size={12} />导出
              </button>
              <button onClick={() => fileInputRef.current?.click()} className='text-cyan-400 text-xs flex items-center gap-1'>
                <Upload size={12} />导入
              </button>
              <button onClick={clearHistory} className='text-rose-500'>
                <Trash2 size={12} />
              </button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
            </div>
          </div>
          <div className="max-h-28 overflow-y-auto space-y-1 mt-1">
            {workoutHistory.length === 0 ? (
              <div className='text-center text-zinc-500 text-xs py-1'>暂无运动记录</div>
            ) : (
              workoutHistory.map(item => (
                <div key={item.id} className='p-2 bg-zinc-800/50 rounded-xl text-[10px] leading-relaxed'>
                  <div className="flex justify-between text-zinc-400">
                    <span>{item.date.slice(5, -3)}</span>
                    <span>阻力 L{item.resistance}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>{item.duration} • {item.kcal}kcal • {item.distance}km</span>
                    <span>平均{item.avgHeartRate} • 峰值{item.maxHeartRate} BPM</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
