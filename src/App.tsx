import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Activity, Zap, Gauge, Bluetooth, BluetoothOff, RotateCcw,
  Plus, Minus, Timer, Flame, MapPin, Heart, History, Trash2,
  Download, Upload, Play, StopCircle,
} from 'lucide-react';
import { useBluetooth } from './hooks/useBluetooth';
// 修复：确保useWakeLock路径正确，不存在则注释掉
// import { useWakeLock } from './hooks/useWakeLock';

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
  // 修复：useWakeLock存在则使用，否则注释
  // useWakeLock(isConnected);
  
  const [uiResistance, setUiResistance] = useState(10);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutRecord[]>([]);
  const maxHeartRateRef = useRef<number>(0);
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  // 新增：确保文件输入引用正确
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 修复：正确的初始化逻辑，依赖数组为空
  useEffect(() => {
    setWorkoutHistory(loadHistory());
  }, []);

  // 修复：开始按钮状态判断更清晰
  const isStartDisabled = !isConnected || isWorkoutActive;

  // 只记录心率峰值
  useEffect(() => {
    if (isConnected && stats.heartRate > 0) {
      if (stats.heartRate > maxHeartRateRef.current) 
        maxHeartRateRef.current = stats.heartRate;
    }
  }, [stats.heartRate, isConnected]);

  // 修复：正确的依赖数组，确保saveWorkoutRecord正常工作
  const saveWorkoutRecord = useCallback(() => {
    const durationSec = stats.elapsedTime || 0;
    if (durationSec < 10) return;

    const record: WorkoutRecord = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
      duration: formatTime(durationSec),
      kcal: Math.round(stats.kcal || 0),
      distance: ((stats.totalDistance || 0)/1000).toFixed(2),
      avgHeartRate: stats.heartRate,
      maxHeartRate: maxHeartRateRef.current,
      resistance: uiResistance,
    };

    const newHistory = [record, ...workoutHistory];
    setWorkoutHistory(newHistory);
    saveHistory(newHistory);
    
    maxHeartRateRef.current = 0;
  }, [stats, workoutHistory, uiResistance]);

  useEffect(() => {
    if (!isConnected && isWorkoutActive) {
      setIsWorkoutActive(false);
      saveWorkoutRecord();
    }
  }, [isConnected, isWorkoutActive, saveWorkoutRecord]);

  const updateResistance = useCallback(async (level: number) => {
    const v = Math.min(Math.max(level, 1), 24);
    try { 
      setUiResistance(v); 
      await setResistance(v); 
    } catch (err) {
      console.error('设置阻力失败:', err);
    }
  }, [setResistance]);

  // 修复：开始按钮处理函数，添加日志便于调试
  const handleStart = useCallback(() => {
    console.log('开始按钮点击 - 状态:', { isConnected, isWorkoutActive });
    if (!isConnected) { 
      alert('请先连接椭圆机'); 
      return; 
    }
    if (isWorkoutActive) {
      alert('锻炼已在进行中');
      return;
    }
    setIsWorkoutActive(true);
    maxHeartRateRef.current = 0;
    console.log('锻炼已开始');
  }, [isConnected, isWorkoutActive]);

  const handleStop = useCallback(() => {
    console.log('停止按钮点击');
    setIsWorkoutActive(false);
    saveWorkoutRecord();
    console.log('锻炼已停止，记录已保存');
  }, [isWorkoutActive, saveWorkoutRecord]);

  const clearHistory = () => {
    if (confirm('确定清空所有记录？')) {
      setWorkoutHistory([]);
      saveHistory([]);
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(workoutHistory, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.download = `mobi-${new Date().toISOString().slice(0,10)}.json`;
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const arr = JSON.parse(ev.target?.result as string);
        if (Array.isArray(arr) && confirm(`导入 ${arr.length} 条记录？`)) {
          setWorkoutHistory(prev => [...arr, ...prev]);
          saveHistory([...arr, ...workoutHistory]);
          alert('导入成功');
        }
      } catch { alert('文件错误'); }
    };
    r.readAsText(f);
    e.target.value = '';
  }, [workoutHistory]);

  return (
    <div className="min-h-screen bg-black text-white p-2 font-sans">
      <header className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="bg-amber-500 p-1.5 rounded-lg"><Activity className="text-black w-5 h-5" /></div>
          <h1 className="font-bold text-xl">MOBI 1.7</h1>
        </div>
        <div className="flex gap-1 flex-1 max-w-[170px]">
          {/* 修复：开始按钮禁用条件明确，事件绑定正确 */}
          <button 
            onClick={handleStart} 
            disabled={isStartDisabled}
            className={`flex-1 h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1 ${isStartDisabled ? 'bg-zinc-700 cursor-not-allowed' : 'bg-emerald-600'}`}
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
        <button onClick={isConnected ? disconnect : connect} 
          className="px-3 py-2 rounded-full bg-white text-black text-xs font-bold flex items-center gap-1">
          {isConnected ? <BluetoothOff size={14} /> : <Bluetooth size={14} />}
          {isConnected ? '断开' : '连接'}
        </button>
      </header>

      <main className="space-y-2">
        {error && <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-2 text-xs">{error}</div>}

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
            <div className='text-3xl font-bold'>{formatTime(stats.elapsedTime)}</div>
          </div>
        </div>

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

        <div className="bg-zinc-900 rounded-2xl p-3 border border-white/5">
          <div className="flex justify-between items-center mb-2">
            <div>
              <div className='text-zinc-500 text-[10px]'>阻力</div>
              <div className="text-2xl font-bold text-amber-500">L{uiResistance}</div>
            </div>
            <div className='text-zinc-600 text-[10px]'>1-24</div>
          </div>
          <input type="range" min="1" max="24" value={uiResistance}
            onChange={(e) => setUiResistance(+e.target.value)}
            onMouseUp={() => updateResistance(uiResistance)}
            className="w-full h-2 bg-zinc-800 rounded-full appearance-none accent-amber-500 mb-2"
          />
          <div className="flex gap-1">
            <button onClick={() => updateResistance(uiResistance-1)} className='flex-1 h-10 bg-zinc-800 rounded-xl'><Minus size={16} /></button>
            <button onClick={() => updateResistance(uiResistance+1)} className='flex-1 h-10 bg-zinc-800 rounded-xl'><Plus size={16} /></button>
            {[1,12,24].map(l => (
              <button key={l} onClick={() => updateResistance(l)} className='px-2 h-10 rounded-xl text-xs bg-zinc-800'>{l}</button>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-2 border border-white/5">
          <div className="flex justify-between items-center">
            <div className='flex items-center gap-1 text-sm font-bold'>
              <History className='text-blue-400 w-4 h-4' /> 运动记录
            </div>
            <div className="flex gap-1">
              <button onClick={handleExport} className='text-green-400 text-xs'><Download size={12} />导出</button>
              <button onClick={() => fileInputRef.current?.click()} className='text-cyan-400 text-xs'><Upload size={12} />导入</button>
              <button onClick={clearHistory} className='text-rose-500'><Trash2 size={12} /></button>
            </div>
          </div>
          <input 
            type="file" 
            accept=".json" 
            onChange={handleImport} 
            className="hidden"
            ref={fileInputRef}
          />
          <div className="max-h-28 overflow-y-auto space-y-1 mt-1">
            {workoutHistory.length === 0 ? (
              <div className='text-center text-zinc-500 text-xs py-1'>暂无记录</div>
            ) : (
              workoutHistory.map(item => (
                <div key={item.id} className='p-2 bg-zinc-800/50 rounded-xl text-[10px] leading-relaxed'>
                  <div className="flex justify-between text-zinc-400">
                    <span>{item.date.slice(5,-3)}</span>
                    <span>阻力 L{item.resistance}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>{item.duration} • {item.kcal}kcal • {item.distance}km</span>
                    <span>平均{item.avgHeartRate} • 峰{item.maxHeartRate} BPM</span>
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
