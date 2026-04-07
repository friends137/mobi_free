import { useState, useCallback, useRef } from 'react';

// 原作者原始UUID（完全不动）
const FTMS_SERVICE = 0x1826;
const FTMS_CHARACTERISTIC = 0x2ADA;
const INDOOR_BIKE_CONTROL_POINT = 0x2AD9;

export interface BikeStats {
  instantPower: number;
  instantCadence: number;
  instantSpeed: number;
  totalDistance: number;
  elapsedTime: number;
  kcal: number;
  heartRate: number; // 原作者已定义，仅补全赋值
}

export function useBluetooth() {
  const [isConnected, setIsConnected] = useState(false);
  // 原作者原始初始值（完全不动）
  const [stats, setStats] = useState<BikeStats>({
    instantPower: 0,
    instantCadence: 0,
    instantSpeed: 0,
    totalDistance: 0,
    elapsedTime: 0,
    kcal: 0,
    heartRate: 0,
  });
  const [error, setError] = useState('');
  const controlPoint = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const deviceRef = useRef<BluetoothDevice | null>(null);

  // ==============================================
  // 🔥 原作者原始解析函数 100% 保留
  // 仅添加：莫比椭圆机 心率读取 + 255过滤（2行代码）
  // ==============================================
  const parseFTMSData = (data: DataView) => {
    try {
      const flags = data.getUint16(0, true);
      let offset = 2;

      // 原作者原始解析（完全不动，保证所有数据正常）
      const instantaneousSpeed = data.getUint16(offset, true) / 100; offset += 2;
      const instantaneousCadence = data.getUint16(offset, true) / 2; offset += 2;
      const totalDistance = data.getUint32(offset, true); offset += 4;
      const instantaneousPower = data.getUint16(offset, true); offset += 2;
      const elapsedTime = data.getUint16(offset, true); offset += 2;
      const kcal = data.getUint16(offset, true); offset += 2;

      // ==========================================
      // ✅ 唯一修复：读取莫比椭圆机心率（仅这1行新增）
      // ==========================================
      const heartRateRaw = data.getUint8(offset);
      const heartRate = heartRateRaw === 255 ? 0 : heartRateRaw;

      // 原作者原始赋值（仅添加 heartRate）
      setStats(prev => ({
        ...prev,
        instantSpeed: instantaneousSpeed,
        instantCadence: instantaneousCadence,
        totalDistance: totalDistance,
        instantPower: instantaneousPower,
        elapsedTime: elapsedTime,
        kcal: kcal,
        heartRate: heartRate // ✅ 修复：赋值心率
      }));
    } catch (e) {
      console.error('解析错误', e);
    }
  };

  // ==============================================
  // 原作者原始连接/断开/阻力代码 100% 完全不动
  // ==============================================
  const connect = useCallback(async () => {
    try {
      setError('');
      if (!navigator.bluetooth) throw new Error('浏览器不支持蓝牙');

      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [FTMS_SERVICE] }],
      });

      deviceRef.current = device;
      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(FTMS_SERVICE);
      const chr = await service.getCharacteristic(FTMS_CHARACTERISTIC);
      
      await chr.startNotifications();
      chr.addEventListener('characteristicvaluechanged', (e) => {
        const v = (e.target as BluetoothRemoteGATTCharacteristic).value;
        if (v) parseFTMSData(v);
      });

      controlPoint.current = await service.getCharacteristic(INDOOR_BIKE_CONTROL_POINT);
      setIsConnected(true);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const disconnect = useCallback(() => {
    deviceRef.current?.gatt?.disconnect();
    setIsConnected(false);
    controlPoint.current = null;
  }, []);

  const setResistance = useCallback(async (level: number) => {
    try {
      if (!controlPoint.current) throw new Error('未连接设备');
      const clamped = Math.max(1, Math.min(24, level));
      await controlPoint.current.writeValueWithResponse(new Uint8Array([0x04, 0x00, clamped]));
    } catch {}
  }, []);

  return { isConnected, stats, error, connect, disconnect, setResistance };
}
