import { useState, useRef, useCallback, useEffect } from 'react';
import { BluetoothManager } from '../bluetooth/manager';
import type { WorkoutData } from '../bluetooth/protocols/types';

export const useBluetooth = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const managerRef = useRef(new BluetoothManager());
  const lastActivityTimeRef = useRef(0);

  const [stats, setStats] = useState({
    instantSpeed: 0,
    instantCadence: 0,
    instantPower: 0,
    resistanceLevel: 10,
    totalDistance: 0,
    kcal: 0,
    heartRate: 0,
    elapsedTime: 0
  });

  const log = useCallback((msg: string) => {
    console.log(msg);
    setLogs(prev => [...prev.slice(-40), `${new Date().toLocaleTimeString()} - ${msg}`]);
  }, []);

  useEffect(() => {
    managerRef.current.setLogger(log);
  }, [log]);

  // 本地计时器
  useEffect(() => {
    if (!isConnected) return;
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - lastActivityTimeRef.current < 5000) {
        setStats(prev => ({
          ...prev,
          elapsedTime: (prev.elapsedTime || 0) + 1
        }));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isConnected]);

  const connect = useCallback(async () => {
    try {
      setError(null);
      log("Initializing Bluetooth Manager...");

      const protocolName = await managerRef.current.connect();
      log(`Connected using protocol: ${protocolName}`);

      // 重置所有数据
      setStats({
        instantSpeed: 0,
        instantCadence: 0,
        instantPower: 0,
        resistanceLevel: 10,
        totalDistance: 0,
        kcal: 0,
        heartRate: 0,
        elapsedTime: 0
      });
      lastActivityTimeRef.current = 0;

      setIsConnected(true);

      await managerRef.current.startNotifications((data) => {
        // 检测运动状态
        if ((data.instantSpeed && data.instantSpeed > 0) || (data.instantCadence && data.instantCadence > 0)) {
          lastActivityTimeRef.current = Date.now();
        }

        // 🔥 关键修复：心率数据过滤 + 合并逻辑
        setStats(prev => {
          const newData = { ...prev, ...data };
          
          // 🔥 过滤无效心率值 (255/0/超出范围)
          if (data.heartRate !== undefined) {
            if (data.heartRate >= 30 && data.heartRate <= 200) {
              // 有效心率：更新
              newData.heartRate = data.heartRate;
            } else if (data.heartRate === 0 || data.heartRate === 255) {
              // 无效值：保持原值，不更新
              newData.heartRate = prev.heartRate;
            }
            // 其他异常值也保持原值
          }
          
          return newData;
        });
      });

      log("Data stream started.");

    } catch (err) {
      console.error("Connection failed:", err);
      let msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("User cancelled")) {
        msg = "用户取消了连接";
      } else if (msg === "2" || msg.includes("error 2") || (typeof err === "number" && err === 2)) {
        msg = "连接失败 (Error 2): 请检查蓝牙是否开启，设备是否开机，或尝试重启 Bluefy 浏览器。";
      }
      setError(msg);
      setIsConnected(false);
    }
  }, [log]);

  const disconnect = useCallback(() => {
    managerRef.current.disconnect();
    setIsConnected(false);
    log("Disconnected.");
  }, [log]);

  const setResistance = useCallback(async (level: number) => {
    try {
      await managerRef.current.setResistance(level);
    } catch (e) {
      console.error("Failed to set resistance:", e);
    }
  }, []);

  return { isConnected, stats, error, connect, disconnect, setResistance, logs };
};
