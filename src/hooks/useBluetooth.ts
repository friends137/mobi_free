import { useState, useCallback, useRef } from 'react';

// 你的设备 MB-MEH-3202G 专属FTMS UUID
export const UUIDS = {
  FTMS: {
    SERVICE: "00001826-0000-1000-8000-00805f9b34fb",
    CHARACTERISTIC: "00002ada-0000-1000-8000-00805f9b34fb",
    CONTROL_POINT: "00002ad9-0000-1000-8000-00805f9b34fb",
  },
} as const;

export interface BikeStats {
  instantPower: number;
  instantCadence: number;
  instantSpeed: number;
  totalDistance: number;
  elapsedTime: number;
  kcal: number;
  heartRate: number;
}

const INITIAL_STATS: BikeStats = {
  instantPower: 0,
  instantCadence: 0,
  instantSpeed: 0,
  totalDistance: 0,
  elapsedTime: 0,
  kcal: 0,
  heartRate: 0,
};

// ======================
// 🔥 终极修复：FTMS标准协议 Flag动态解析（解决数据全0）
// ======================
const parseFTMS = (data: DataView): BikeStats => {
  // 过滤短数据包，杜绝越界报错
  if (data.byteLength < 8) return INITIAL_STATS;

  const stats = { ...INITIAL_STATS };
  let offset = 0;
  const flags = data.getUint16(offset, true); offset += 2;

  // 按FTMS标准，根据Flag位读取对应数据
  if (flags & 0x01) { offset += 2; } // 瞬时速度
  if (flags & 0x02) { stats.instantCadence = data.getUint16(offset, true) / 2; offset += 2; }
  if (flags & 0x04) { stats.totalDistance = data.getUint32(offset, true); offset += 4; }
  if (flags & 0x08) { stats.instantPower = data.getUint16(offset, true); offset += 2; }
  if (flags & 0x10) { stats.elapsedTime = data.getUint16(offset, true); offset += 2; }
  if (flags & 0x20) { stats.kcal = data.getUint16(offset, true); offset += 2; }
  if (flags & 0x40) { // 心率
    const heartRateRaw = data.getUint8(offset);
    stats.heartRate = heartRateRaw === 255 ? 0 : heartRateRaw;
    offset += 1;
  }

  // 强制读取速度（兼容你的设备）
  offset = 2;
  stats.instantSpeed = data.getUint16(offset, true) / 100;

  return stats;
};

export function useBluetooth() {
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState<BikeStats>(INITIAL_STATS);
  const [error, setError] = useState('');
  
  const controlPoint = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const deviceRef = useRef<BluetoothDevice | null>(null);

  const connect = useCallback(async () => {
    try {
      setError('');
      if (!navigator.bluetooth) throw new Error('浏览器不支持蓝牙');

      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [UUIDS.FTMS.SERVICE] }],
      });

      deviceRef.current = device;
      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(UUIDS.FTMS.SERVICE);
      const chr = await service.getCharacteristic(UUIDS.FTMS.CHARACTERISTIC);
      
      await chr.startNotifications();
      chr.addEventListener('characteristicvaluechanged', (e) => {
        const v = (e.target as BluetoothRemoteGATTCharacteristic).value;
        if (v) setStats(parseFTMS(v));
      });

      controlPoint.current = await service.getCharacteristic(UUIDS.FTMS.CONTROL_POINT);
      setIsConnected(true);
      console.log('✅ 连接成功！');
    } catch (err: any) {
      console.error('❌ 连接失败:', err);
      setError(err.message);
    }
  }, []);

  const disconnect = useCallback(() => {
    deviceRef.current?.gatt?.disconnect();
    setIsConnected(false);
    setStats(INITIAL_STATS);
  }, []);

  const setResistance = useCallback(async (level: number) => {
    try {
      if (!controlPoint.current) return;
      const v = Math.max(1, Math.min(24, level));
      await controlPoint.current.writeValueWithResponse(new Uint8Array([0x04, 0x00, v]));
    } catch {}
  }, []);

  return { 
    isConnected, stats, error,
    connect, disconnect, setResistance 
  };
}
