import { useState, useCallback, useRef, useEffect } from 'react';

// 协议UUID定义（原作者原版，完全不动）
export const UUIDS = {
  FTMS: {
    SERVICE: 0x1826,
    CHARACTERISTIC: 0x2ADA,
    CONTROL_POINT: 0x2AD9,
  },
  MOBI_V2: {
    SERVICE: '0000ffb0-0000-1000-8000-00805f9b34fb',
    CHARACTERISTIC: '0000ffb2-0000-1000-8000-00805f9b34fb',
    CONTROL_POINT: '0000ffb1-0000-1000-8000-00805f9b34fb',
  },
  MOBI_V1: {
    SERVICE: '0000fff0-0000-1000-8000-00805f9b34fb',
    CHARACTERISTIC: '0000fff4-0000-1000-8000-00805f9b34fb',
    CONTROL_POINT: '0000fff2-0000-1000-8000-00805f9b34fb',
  },
  HUANTONG: {
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

// 协议解析函数（原作者原版，完全不动，仅心率修复）
const parsers = {
  FTMS: (data: DataView): BikeStats => {
    let offset = 2;
    const instantSpeed = data.getUint16(offset, true) / 100; offset += 2;
    const instantCadence = data.getUint16(offset, true) / 2; offset += 2;
    const totalDistance = data.getUint32(offset, true); offset += 4;
    const instantPower = data.getUint16(offset, true); offset += 2;
    const elapsedTime = data.getUint16(offset, true); offset += 2;
    const kcal = data.getUint16(offset, true); offset += 2;
    const heartRateRaw = data.getUint8(offset);
    // ✅ 唯一修改：心率255→0
    const heartRate = heartRateRaw === 255 ? 0 : heartRateRaw;

    return {
      instantSpeed,
      instantCadence,
      totalDistance,
      instantPower,
      elapsedTime,
      kcal,
      heartRate
    };
  },
  MobiV2: (data: DataView): BikeStats => {
    if (data.byteLength < 20) return INITIAL_STATS;
    const header = data.getUint8(0);
    if (header !== 0xAA) return INITIAL_STATS;

    const cmd = data.getUint8(1);
    if (cmd !== 0x12) return INITIAL_STATS;

    const instantSpeed = data.getUint16(3, true) / 10;
    const instantCadence = data.getUint8(5);
    const instantPower = data.getUint16(6, true);
    const totalDistance = data.getUint32(8, true);
    const elapsedTime = data.getUint16(12, true);
    const kcal = data.getUint16(14, true);
    const heartRateRaw = data.getUint8(16);
    // ✅ 唯一修改：心率255→0
    const heartRate = heartRateRaw === 255 ? 0 : heartRateRaw;

    return {
      instantSpeed,
      instantCadence,
      totalDistance,
      instantPower,
      elapsedTime,
      kcal,
      heartRate
    };
  },
  MobiV1: (data: DataView): BikeStats => {
    if (data.byteLength < 13) return INITIAL_STATS;
    const header = data.getUint8(0);
    if (header !== 0xAA) return INITIAL_STATS;

    const cmd = data.getUint8(1);
    if (cmd !== 0x02) return INITIAL_STATS;

    const instantSpeed = data.getUint16(2, true) / 10;
    const instantCadence = data.getUint8(4);
    const instantPower = data.getUint16(5, true);
    const totalDistance = data.getUint32(7, true);
    const elapsedTime = data.getUint16(11, true);
    const kcal = 0;
    const heartRateRaw = data.getUint8(13);
    // ✅ 唯一修改：心率255→0
    const heartRate = heartRateRaw === 255 ? 0 : heartRateRaw;

    return {
      instantSpeed,
      instantCadence,
      totalDistance,
      instantPower,
      elapsedTime,
      kcal,
      heartRate
    };
  },
  HuanTong: (data: DataView): BikeStats => {
    if (data.byteLength < 16) return INITIAL_STATS;
    const header = data.getUint8(0);
    if (header !== 0xAA) return INITIAL_STATS;

    const cmd = data.getUint8(1);
    if (cmd !== 0x02) return INITIAL_STATS;

    const instantSpeed = data.getUint16(2, true) / 10;
    const instantCadence = data.getUint8(4);
    const instantPower = data.getUint16(5, true);
    const totalDistance = data.getUint32(7, true);
    const elapsedTime = data.getUint16(11, true);
    const kcal = data.getUint16(13, true);
    const heartRateRaw = data.getUint8(15);
    // ✅ 唯一修改：心率255→0
    const heartRate = heartRateRaw === 255 ? 0 : heartRateRaw;

    return {
      instantSpeed,
      instantCadence,
      totalDistance,
      instantPower,
      elapsedTime,
      kcal,
      heartRate
    };
  }
};

// 阻力控制指令（原作者原版，完全不动）
const protocolCommands = {
  FTMS: (level: number) => new Uint8Array([0x04, 0x00, level]),
  MobiV2: (level: number) => {
    const buf = new Uint8Array(5);
    buf[0] = 0xAA;
    buf[1] = 0x03;
    buf[2] = 0x01;
    buf[3] = level;
    buf[4] = buf.reduce((a, b) => a + b, 0) & 0xFF;
    return buf;
  },
  MobiV1: (level: number) => {
    const buf = new Uint8Array(5);
    buf[0] = 0xAA;
    buf[1] = 0x03;
    buf[2] = 0x01;
    buf[3] = level;
    buf[4] = buf.reduce((a, b) => a + b, 0) & 0xFF;
    return buf;
  },
  HuanTong: (level: number) => {
    const buf = new Uint8Array(5);
    buf[0] = 0xAA;
    buf[1] = 0x03;
    buf[2] = 0x01;
    buf[3] = level;
    buf[4] = buf.reduce((a, b) => a + b, 0) & 0xFF;
    return buf;
  }
};

export function useBluetooth() {
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState<BikeStats>(INITIAL_STATS);
  const [error, setError] = useState('');
  const [protocol, setProtocol] = useState<ProtocolType>('Unknown');
  
  const controlPoint = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const parserRef = useRef<(data: DataView) => BikeStats>(() => INITIAL_STATS);
  const commandBuilderRef = useRef<(level: number) => Uint8Array>(() => new Uint8Array());

  // 协议自动识别（原作者原版，完全不动）
  const detectProtocol = (services: BluetoothRemoteGATTService[]): ProtocolType => {
    for (const service of services) {
      if (service.uuid === UUIDS.FTMS.SERVICE.toString()) return 'FTMS';
      if (service.uuid === UUIDS.MOBI_V2.SERVICE) return 'MobiV2';
      if (service.uuid === UUIDS.MOBI_V1.SERVICE) return 'MobiV1';
      if (service.uuid === UUIDS.HUANTONG.SERVICE) return 'HuanTong';
    }
    return 'Unknown';
  };

  const connect = useCallback(async () => {
    try {
      setError('');
      if (!navigator.bluetooth) throw new Error('当前浏览器不支持蓝牙');

      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [UUIDS.FTMS.SERVICE] },
          { services: [UUIDS.MOBI_V2.SERVICE] },
          { services: [UUIDS.MOBI_V1.SERVICE] },
          { services: [UUIDS.HUANTONG.SERVICE] },
        ],
      });

      deviceRef.current = device;
      const server = await device.gatt!.connect();
      const services = await server.getPrimaryServices();
      
      const detectedProtocol = detectProtocol(services);
      if (detectedProtocol === 'Unknown') throw new Error('不支持的设备协议');

      setProtocol(detectedProtocol);
      parserRef.current = parsers[detectedProtocol];
      commandBuilderRef.current = protocolCommands[detectedProtocol];

      const uuidConfig = UUIDS[detectedProtocol];
      const service = await server.getPrimaryService(uuidConfig.SERVICE);
      const chr = await service.getCharacteristic(uuidConfig.CHARACTERISTIC);
      
      await chr.startNotifications();
      chr.addEventListener('characteristicvaluechanged', (e) => {
        const v = (e.target as BluetoothRemoteGATTCharacteristic).value;
        if (v) {
          const parsed = parserRef.current(v);
          setStats(parsed);
        }
      });

      controlPoint.current = await service.getCharacteristic(uuidConfig.CONTROL_POINT);
      setIsConnected(true);
    } catch (err: any) {
      setError(err.message);
      console.error('连接失败', err);
    }
  }, []);

  const disconnect = useCallback(() => {
    deviceRef.current?.gatt?.disconnect();
    setIsConnected(false);
    setProtocol('Unknown');
    controlPoint.current = null;
    setStats(INITIAL_STATS);
  }, []);

  const setResistance = useCallback(async (level: number) => {
    try {
      if (!controlPoint.current || protocol === 'Unknown') throw new Error('设备未连接');
      const clamped = Math.max(1, Math.min(24, level));
      const command = commandBuilderRef.current(clamped);
      await controlPoint.current.writeValueWithResponse(command);
    } catch (err) {
      console.error('设置阻力失败', err);
    }
  }, [protocol]);

  // 断开自动重连处理（原作者原版）
  useEffect(() => {
    const device = deviceRef.current;
    if (!device) return;

    const onDisconnected = () => {
      setIsConnected(false);
      setProtocol('Unknown');
      controlPoint.current = null;
    };

    device.addEventListener('gattserverdisconnected', onDisconnected);
    return () => device.removeEventListener('gattserverdisconnected', onDisconnected);
  }, []);

  return { isConnected, stats, error, protocol, connect, disconnect, setResistance };
}
