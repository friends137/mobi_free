import { useState, useCallback, useRef, useEffect } from 'react';

// ======================
// 🔥 修复：FTMS完整UUID（匹配你的设备 MB-MEH-3202G）
// ======================
export const UUIDS = {
  FTMS: {
    SERVICE: "00001826-0000-1000-8000-00805f9b34fb", // 你的设备真实UUID
    CHARACTERISTIC: "00002ada-0000-1000-8000-00805f9b34fb",
    CONTROL_POINT: "00002ad9-0000-1000-8000-00805f9b34fb",
  },
  MobiV2: {
    SERVICE: '0000ffb0-0000-1000-8000-00805f9b34fb',
    CHARACTERISTIC: '0000ffb2-0000-1000-8000-00805f9b34fb',
    CONTROL_POINT: '0000ffb1-0000-1000-8000-00805f9b34fb',
  },
  MobiV1: {
    SERVICE: '0000fff0-0000-1000-8000-00805f9b34fb',
    CHARACTERISTIC: '0000fff4-0000-1000-8000-00805f9b34fb',
    CONTROL_POINT: '0000fff2-0000-1000-8000-00805f9b34fb',
  },
  HuanTong: {
    SERVICE: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    CHARACTERISTIC: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    CONTROL_POINT: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  }
} as const;

export type ProtocolType = 'FTMS' | 'MobiV2' | 'MobiV1' | 'HuanTong' | 'Unknown';

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
// FTMS标准解析（适配你的设备，心率255→0）
// ======================
const parsers = {
  FTMS: (data: DataView): BikeStats => {
    console.log('【FTMS解析】原始数据包:', Array.from(new Uint8Array(data.buffer)));
    let offset = 2;
    const flags = data.getUint16(0, true);
    
    const instantSpeed = data.getUint16(offset, true) / 100; offset += 2;
    const instantCadence = data.getUint16(offset, true) / 2; offset += 2;
    const totalDistance = data.getUint32(offset, true); offset += 4;
    const instantPower = data.getUint16(offset, true); offset += 2;
    const elapsedTime = data.getUint16(offset, true); offset += 2;
    const kcal = data.getUint16(offset, true); offset += 2;
    
    // 心率读取 + 修复255无效值
    const heartRateRaw = data.byteLength > offset ? data.getUint8(offset) : 0;
    const heartRate = (heartRateRaw === 255 || heartRateRaw === 0) ? 0 : heartRateRaw;

    return {
      instantSpeed, instantCadence, totalDistance, instantPower,
      elapsedTime, kcal, heartRate, heartRateRaw
    };
  },
  MobiV2: () => INITIAL_STATS,
  MobiV1: () => INITIAL_STATS,
  HuanTong: () => INITIAL_STATS,
};

// FTMS阻力指令
const protocolCommands = {
  FTMS: (level: number) => new Uint8Array([0x04, 0x00, level]),
  MobiV2: () => new Uint8Array(),
  MobiV1: () => new Uint8Array(),
  HuanTong: () => new Uint8Array(),
};

export function useBluetooth() {
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState<BikeStats>(INITIAL_STATS);
  const [error, setError] = useState('');
  const [protocol, setProtocol] = useState<ProtocolType>('Unknown');
  const [deviceName, setDeviceName] = useState<string>('未连接');
  const [rawPacket, setRawPacket] = useState<number[]>([]);
  
  const controlPoint = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const parserRef = useRef<(data: DataView) => BikeStats>(() => INITIAL_STATS);
  const commandBuilderRef = useRef<(level: number) => Uint8Array>(() => new Uint8Array());

  // 协议检测（完美匹配你的设备）
  const detectProtocol = (services: BluetoothRemoteGATTService[]): ProtocolType => {
    console.log('【协议检测】设备UUID:', services[0].uuid);
    if (services[0].uuid === UUIDS.FTMS.SERVICE) {
      console.log('✅ 匹配成功：FTMS标准协议');
      return 'FTMS';
    }
    return 'Unknown';
  };

  const connect = useCallback(async () => {
    try {
      setError('');
      if (!navigator.bluetooth) throw new Error('浏览器不支持蓝牙');
      console.log('【连接流程】开始连接');

      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [UUIDS.FTMS.SERVICE] }],
      });

      deviceRef.current = device;
      setDeviceName(device.name || '');
      const server = await device.gatt!.connect();
      const services = await server.getPrimaryServices();
      const detectedProtocol = detectProtocol(services);

      setProtocol(detectedProtocol);
      parserRef.current = parsers.FTMS;
      commandBuilderRef.current = protocolCommands.FTMS;

      const service = await server.getPrimaryService(UUIDS.FTMS.SERVICE);
      const chr = await service.getCharacteristic(UUIDS.FTMS.CHARACTERISTIC);
      
      await chr.startNotifications();
      chr.addEventListener('characteristicvaluechanged', (e) => {
        const v = (e.target as BluetoothRemoteGATTCharacteristic).value;
        if (v) {
          setRawPacket(Array.from(new Uint8Array(v.buffer)));
          setStats(parsers.FTMS(v));
        }
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
    isConnected, stats, error, protocol, deviceName, rawPacket,
    connect, disconnect, setResistance 
  };
}
