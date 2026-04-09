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

// 🔥 修复：补充参数名 data
const saveHistory = (data: WorkoutRecord[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('保存历史记录失败:', e);
    return false;
  }
};

const loadHistory = (): WorkoutRecord[] => {
  try {
    const d = localStorage.getItem(STORAGE_KEY);
    return d ? JSON.parse(d) : [];
  } catch (e) {
    console.error('加载历史记录失败:', e);
    return [];
  }
};

export default function App() {
  const { 
    isConnected, 
    stats, 
    error, 
    connect, 
    disconnect, 
    setResistance 
  } = useBluetooth();

  const [uiResistance, setUiResistance] = useState(10);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutRecord[]>([]);
  
  // 🔥 心率统计 Ref（全程平均：累加和 + 有效计数，内存 O(1)）
  const maxHeartRateRef = useRef(0);
  const heartRateSumRef = useRef(0);
  const heartRateCountRef = useRef(0);
  
  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [manualElapsedTime, setManualElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初始化加载历史记录
  useEffect(() => {
    setWorkoutHistory(loadHistory());
  }, []);

  // 手动计时器
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

  // 🔥 心率数据采集（全程平均模式）
  useEffect(() => {
    if (isConnected && isWorkoutActive && stats.heartRate > 0) {
      const hr = stats.heartRate;
      // 双重保险：过滤无效值 (Hook 层已过滤，此处防漏)
      if (hr < 30 || hr > 200) return;
      
      if (hr > maxHeartRateRef.current) {
        maxHeartRateRef.current = hr;
      }
      // 🔥 累加计算全程平均（无论运动多久，都是从头到尾的平均值）
      heartRateSumRef.current += hr;
      heartRateCountRef.current += 1;
    }
  }, [stats.heartRate, isConnected, isWorkoutActive]);

  // 保存运动记录
  const saveWorkoutRecord = useCallback(() => {
    const durationSec = manualElapsedTime;
    if (durationSec < 5) {
      console.log('运动时间不足5秒，不保存记录');
      return;
    }

    // 🔥 全程平均心率计算
    const avgHeartRate = heartRateCountRef.current > 0 
      ? Math.round(heartRateSumRef.current / heartRateCountRef.current)
      : 0;

    const record: WorkoutRecord = {
      id: Date.now().toString(),
      date: new Date().toLocaleString('zh-CN'),
      duration: formatTime(durationSec),
      kcal: Math.round(stats.kcal || 0),
      distance: ((stats.totalDistance || 0) / 1000).toFixed(2),
      avgHeartRate: avgHeartRate,
      maxHeartRate: maxHeartRateRef.current,
      resistance: uiResistance,
    };

    // 函数式更新避免闭包陷阱
    setWorkoutHistory(prevHistory => {
      const newHistory = [record, ...prevHistory];
      saveHistory(newHistory);
      return newHistory;
    });

    // 重置统计
    maxHeartRateRef.current = 0;
    heartRateSumRef.current = 0;
    heartRateCountRef.current = 0;
    
    console.log('✅ 运动记录已保存:', record);
  }, [manualElapsedTime, stats, uiResistance]);

  // 阻力调节
  const updateResistance = useCallback(async (level: number) => {
    const v = Math.min(Math.max(level, 1), 24);
    setUiResistance(v);
    await setResistance(v);
  }, [setResistance]);

  // 开始按钮
  const handleStart = () => {
    if (!isConnected) {
      alert('请先连接椭圆机');
      return;
    }
    setManualElapsedTime(0);
    setIsWorkoutActive(true);
    // 重置心率统计
    maxHeartRateRef.current = 0;
    heartRateSumRef.current = 0;
    heartRateCountRef.current = 0;
  };

  // 停止按钮
  const handleStop = () => {
    saveWorkoutRecord();
    setIsWorkoutActive(false);
  };

  // 清空记录
  const clearHistory = () => {
    if (confirm('确定清空所有运动记录？此操作不可恢复。')) {
      setWorkoutHistory([]);
      saveHistory([]);
      alert('已清空所有记录');
    }
  };

  // 导出优化
  const handleExport = () => {
    if (workoutHistory.length === 0) {
      alert('暂无运动记录可导出');
      return;
    }
    try {
      const blob = new Blob([JSON.stringify(workoutHistory, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.download = `mobi-workout-${new Date().toISOString().slice(0, 10)}.json`;
      a.href = URL.createObjectURL(blob);
      a.click();
      URL.revokeObjectURL(a.href);
      alert('导出成功！');
    } catch (e) {
      console.error('导出失败:', e);
      alert('导出失败，请重试');
    }
  };

  // 导入优化
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    
    if (!f.name.endsWith('.json')) {
      alert('请选择 .json 格式的文件');
      e.target.value = '';
      return;
    }
    
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const arr = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(arr)) throw new Error('文件格式不正确');
        
        const validRecords = arr.filter((item: any) => 
          item?.id && item?.date && typeof item?.kcal === 'number'
        );
        if (validRecords.length === 0) {
          alert('文件中没有有效的运动记录');
          return;
        }
        
        const existingIds = new Set(workoutHistory.map(r => r.id));
        const newRecords = validRecords.filter((r: WorkoutRecord) => !existingIds.has(r.id));
        if (newRecords.length === 0) {
          alert('导入的记录已存在，无需重复添加');
          return;
        }
        
        setWorkoutHistory(prev => {
          const merged = [...newRecords, ...prev];
          saveHistory(merged);
          alert(`✅ 成功导入 ${newRecords.length} 条记录`);
          return merged;
        });
      } catch (err) {
        console.error('导入失败:', err);
        alert('❌ 文件解析失败，请检查文件格式');
      }
    };
    r.onerror = () => alert('文件读取失败，请重试');
    r.readAsText(f);
    e.target.value = '';
  };

  const displayTime = isWorkoutActive ? manualElapsedTime : stats.elapsedTime;

  return (
    <div className="min-h-screen bg-black text-white p-2 font-sans">
      <header className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="bg-amber-500 p-1.5 rounded-lg">
            <Activity className="text-black w-5 h-5" />
          </div>
          {/* 🔥 版本号 v3.1 */}
          <h1 className="font-bold text-xl">MOBI 3.1</h1>
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
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-2 text-xs">
            {error}
          </div>
        )}

        {/* 功率+时长 */}
        <div className="flex gap-2">
          <div className='flex-1 bg-zinc-800 rounded-2xl p-3 border border-white/5'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <Zap className='text-amber-500 w-3 h-3' /> 瞬时功率
            </div>
            <div className='text-3xl font-bold'>{stats.instantPower ?? 0} W</div>
          </div>
          <div className='flex-1 bg-zinc-800 rounded-2xl p-3 border border-white/5'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <Timer className='text-purple-400 w-3 h-3' /> 时长
            </div>
            <div className='text-3xl font-bold'>{formatTime(displayTime)}</div>
          </div>
        </div>

        {/* 心率+热量 */}
        <div className="flex gap-2">
          <div className='flex-1 bg-zinc-800 rounded-2xl p-3 border border-white/5'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <Heart className='text-red-500 w-3 h-3' /> 心率
            </div>
            <div className='text-3xl font-bold'>{stats.heartRate ?? 0} BPM</div>
          </div>
          <div className='flex-1 bg-zinc-800 rounded-2xl p-3 border border-white/5'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <Flame className='text-orange-500 w-3 h-3' /> 热量
            </div>
            <div className='text-3xl font-bold'>{(stats.kcal ?? 0).toFixed(0)} KCAL</div>
          </div>
        </div>

        {/* 踏频+速度+距离 */}
        <div className="flex gap-2">
          <div className='w-1/3 bg-zinc-800 rounded-2xl p-3 border border-white/5'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <RotateCcw className='text-blue-400 w-3 h-3' /> 踏频
            </div>
            <div className='text-3xl font-bold'>{stats.instantCadence ?? 0} RPM</div>
          </div>
          <div className='w-1/3 bg-zinc-800 rounded-2xl p-3 border border-white/5'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <Gauge className='text-emerald-400 w-3 h-3' /> 速度
            </div>
            <div className='text-3xl font-bold'>{(stats.instantSpeed ?? 0).toFixed(1)}</div>
          </div>
          <div className='w-1/3 bg-zinc-800 rounded-2xl p-3 border border-white/5'>
            <div className='flex items-center gap-1 text-zinc-500 text-[10px] mb-1'>
              <MapPin className='text-pink-400 w-3 h-3' /> 距离
            </div>
            <div className='text-3xl font-bold'>{((stats.totalDistance ?? 0)/1000).toFixed(2)} km</div>
          </div>
        </div>

        {/* 🔥 阻力调节：-/+ 加长，L10/L24 缩短至约 1/3 宽度 */}
        <div className="bg-zinc-800 rounded-2xl p-3 border border-white/5">
          <div className="flex justify-between items-center mb-2">
            <div>
              <div className='text-zinc-500 text-[10px]'>阻力</div>
              <div className="text-2xl font-bold text-amber-500">L{uiResistance}</div>
            </div>
          </div>
          <input
            type="range" min="1" max="24" value={uiResistance}
            onChange={(e) => setUiResistance(+e.target.value)}
            onMouseUp={() => updateResistance(uiResistance)}
            onTouchEnd={() => updateResistance(uiResistance)}
            className="w-full h-2 bg-zinc-700 rounded-full accent-amber-500 mb-2"
          />
          <div className="flex gap-1">
            {/* 🔥 flex-[3] 占 3/8 宽度，L10/L24 占 1/8 宽度，比例 3:1 */}
            <button onClick={() => updateResistance(uiResistance - 1)} className='flex-[3] h-10 bg-zinc-700 hover:bg-zinc-600 rounded-xl text-sm font-bold transition'>-</button>
            <button onClick={() => updateResistance(uiResistance + 1)} className='flex-[3] h-10 bg-zinc-700 hover:bg-zinc-600 rounded-xl text-sm font-bold transition'>+</button>
            <button onClick={() => updateResistance(10)} className='flex-1 h-10 bg-amber-600/80 hover:bg-amber-600 rounded-xl text-[10px] font-bold transition'>L10</button>
            <button onClick={() => updateResistance(24)} className='flex-1 h-10 bg-rose-600/80 hover:bg-rose-600 rounded-xl text-[10px] font-bold transition'>L24</button>
          </div>
        </div>

        {/* 🔥 运动记录：显示 日期 | 时长 | kcal | km | 平均心率 */}
        <div className="bg-zinc-800 rounded-2xl p-2 border border-white/5">
          <div className="flex justify-between items-center px-2 py-1">
            <div className='text-sm font-bold flex items-center gap-1'>
              <History size={14} /> 运动记录 ({workoutHistory.length})
            </div>
            <div className="flex gap-2">
              <button onClick={handleExport} className="text-xs flex items-center gap-1 hover:text-amber-400 transition">
                <Download size={12} /> 导出
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="text-xs flex items-center gap-1 hover:text-amber-400 transition">
                <Upload size={12} /> 导入
              </button>
              <button onClick={clearHistory} className='text-rose-500 hover:text-rose-400 transition' title="清空记录">
                <Trash2 size={14} />
              </button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
            </div>
          </div>
          
          {workoutHistory.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto space-y-1 px-2">
              {workoutHistory.slice(0, 10).map(record => (
                <div key={record.id} className="text-[10px] text-zinc-300 flex justify-between items-center py-1.5 px-1 rounded hover:bg-zinc-700/50 transition">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-zinc-400">{record.date.split(' ')[0]}</span>
                    <span className="font-medium">{record.duration}</span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-amber-400 font-bold">{record.kcal}kcal</span>
                    <span className="text-zinc-400">{record.distance}km</span>
                  </div>
                  {/* 🔥 平均心率列 */}
                  <div className="flex items-center gap-1 pl-2 border-l border-zinc-600 ml-2">
                    <Heart size={10} className="text-red-500" />
                    <span className={record.avgHeartRate > 0 ? 'font-bold text-red-400' : 'text-zinc-500'}>
                      {record.avgHeartRate > 0 ? `${record.avgHeartRate}` : '-'}
                    </span>
                  </div>
                </div>
              ))}
              {workoutHistory.length > 10 && (
                <div className="text-[10px] text-zinc-500 text-center py-1">
                  + {workoutHistory.length - 10} 条更多记录
                </div>
              )}
            </div>
          )}
          {workoutHistory.length === 0 && (
            <div className="text-[10px] text-zinc-500 text-center py-3">
              暂无运动记录，开始锻炼吧！🚴
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
