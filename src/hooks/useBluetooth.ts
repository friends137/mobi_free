import { useState, useCallback, useRef, useEffect } from 'react';

// 匹配你的设备 MB-MEH-3202G 完整UUID
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
  heartRateRaw: number;
}

const INITIAL_STATS: BikeStats = {
  instantPower: 0,
  instantCadence: 0,
  instantSpeed: 0,
  totalDistance: 0,
  elapsedTime: 0,
  kcal: 0,
  heartRate: 0,
  heartRateRaw: 0,
};

// ======================
// 🔥 终极修复：加长度判断，杜绝越界报错！
// ======================
const parsers = {
  FTMS: (data: DataView): BikeStats => {
    // 关键：数据包长度不足，直接返回，不解析
    if (data.byteLength < 16) {
      return INITIAL_STATS;
    }

    console.log('【FTMS解析】有效数据包:', Array.from(new Uint8Array(data.buffer)));
    let offset = 2;
    const flags = data.getUint16(0, true);
    
    try {
      const instantSpeed = data.getUint16(offset, true) / 100; offset += 2;
      const instantCadence = data.getUint16(offset, true) / 2; offset += 2;
      const totalDistance = data.getUint32(offset, true); offset += 4;
      const instantPower = data.getUint16(offset, true); offset += 2;
      const elapsedTime = data.getUint16(offset, true); offset += 2;
      const kcal = data.getUint16(offset, true); offset += 2;
      
      const heartRateRaw = data.byteLength > offset ? data.getUint8(offset) : 0;
      const heartRate = (heartRateRaw === 255) ? 0 : heartRateRaw;

      return {
        instantSpeed, instantCadence, totalDistance, instantPower,
        elapsedTime, kcal, heartRate, heartRateRaw
      };
    } catch (e) {
      return INITIAL_STATS;
    }
  },
};

const protocolCommands = {
  FTMS: (level: number) => new Uint8Array([0x04, 0x00, level]),
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
        if (v) setStats(parsers.FTMS(v));
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
