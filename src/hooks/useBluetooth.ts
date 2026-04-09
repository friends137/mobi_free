import { useState, useCallback, useRef, useEffect } from 'react';

// ======================
// 100% 原作者原版UUID，一字未改
// ======================
export const UUIDS = {
  FTMS: {
    SERVICE: 0x1826,
    CHARACTERISTIC: 0x2ADA,
    CONTROL_POINT: 0x2AD9,
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
  heartRateRaw: number; // 新增：原始心率值，用于调试
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
// 100% 原作者原版解析，仅加日志+心率255→0修复
// ======================
const parsers = {
  FTMS: (data: DataView): BikeStats => {
    console.log('【FTMS解析】原始数据包字节:', Array.from(new Uint8Array(data.buffer)));
    let offset = 2;
    const instantSpeed = data.getUint16(offset, true) / 100; offset += 2;
    const instantCadence = data.getUint16(offset, true) / 2; offset += 2;
    const totalDistance = data.getUint32(offset, true); offset += 4;
    const instantPower = data.getUint16(offset, true); offset += 2;
    const elapsedTime = data.getUint16(offset, true); offset += 2;
    const kcal = data.getUint16(offset, true); offset += 2;
    const heartRateRaw = data.byteLength > offset ? data.getUint8(offset) : 255;
    const heartRate = heartRateRaw === 255 ? 0 : heartRateRaw;

    console.log('【FTMS解析结果】', { instantSpeed, instantCadence, instantPower, elapsedTime, heartRateRaw, heartRate });
    return {
      instantSpeed,
      instantCadence,
      totalDistance,
      instantPower,
      elapsedTime,
      kcal,
      heartRate,
      heartRateRaw
    };
  },
  MobiV2: (data: DataView): BikeStats => {
    console.log('【MobiV2解析】原始数据包字节:', Array.from(new Uint8Array(data.buffer)));
    if (data.byteLength < 20) {
      console.log('【MobiV2解析】数据包长度不足', data.byteLength);
      return INITIAL_STATS;
    }
    const header = data.getUint8(0);
    if (header !== 0xAA) {
      console.log('【MobiV2解析】头部不匹配', header);
      return INITIAL_STATS;
    }

    const cmd = data.getUint8(1);
    if (cmd !== 0x12) {
      console.log('【MobiV2解析】指令不匹配', cmd);
      return INITIAL_STATS;
    }

    const instantSpeed = data.getUint16(3, true) / 10;
    const instantCadence = data.getUint8(5);
    const instantPower = data.getUint16(6, true);
    const totalDistance = data.getUint32(8, true);
    const elapsedTime = data.getUint16(12, true);
    const kcal = data.getUint16(14, true);
    const heartRateRaw = data.getUint8(16);
    const heartRate = heartRateRaw === 255 ? 0 : heartRateRaw;

    console.log('【MobiV2解析结果】', { instantSpeed, instantCadence, instantPower, elapsedTime, heartRateRaw, heartRate });
    return {
      instantSpeed,
      instantCadence,
      totalDistance,
      instantPower,
      elapsedTime,
      kcal,
      heartRate,
      heartRateRaw
    };
  },
  MobiV1: (data: DataView): BikeStats => {
    console.log('【MobiV1解析】原始数据包字节:', Array.from(new Uint8Array(data.buffer)));
    if (data.byteLength < 13) {
      console.log('【MobiV1解析】数据包长度不足', data.byteLength);
      return INITIAL_STATS;
    }
    const header = data.getUint8(0);
    if (header !== 0xAA) {
      console.log('【MobiV1解析】头部不匹配', header);
      return INITIAL_STATS;
    }

    const cmd = data.getUint8(1);
    if (cmd !== 0x02) {
      console.log('【MobiV1解析】指令不匹配', cmd);
      return INITIAL_STATS;
    }

    const instantSpeed = data.getUint16(2, true) / 10;
    const instantCadence = data.getUint8(4);
    const instantPower = data.getUint16(5, true);
    const totalDistance = data.getUint32(7, true);
    const elapsedTime = data.getUint16(11, true);
    const kcal = 0;
    const heartRateRaw = data.byteLength > 13 ? data.getUint8(13) : 255;
    const heartRate = heartRateRaw === 255 ? 0 : heartRateRaw;

    console.log('【MobiV1解析结果】', { instantSpeed, instantCadence, instantPower, elapsedTime, heartRateRaw, heartRate });
    return {
      instantSpeed,
      instantCadence,
      totalDistance,
      instantPower,
      elapsedTime,
      kcal,
      heartRate,
      heartRateRaw
    };
  },
  HuanTong: (data: DataView): BikeStats => {
    console.log('【HuanTong解析】原始数据包字节:', Array.from(new Uint8Array(data.buffer)));
    if (data.byteLength < 16) {
      console.log('【HuanTong解析】数据包长度不足', data.byteLength);
      return INITIAL_STATS;
    }
    const header = data.getUint8(0);
    if (header !== 0xAA) {
      console.log('【HuanTong解析】头部不匹配', header);
      return INITIAL_STATS;
    }

    const cmd = data.getUint8(1);
    if (cmd !== 0x02) {
      console.log('【HuanTong解析】指令不匹配', cmd);
      return INITIAL_STATS;
    }

    const instantSpeed = data.getUint16(2, true) / 10;
    const instantCadence = data.getUint8(4);
    const instantPower = data.getUint16(5, true);
    const totalDistance = data.getUint32(7, true);
    const elapsedTime = data.getUint16(11, true);
    const kcal = data.getUint16(13, true);
    const heartRateRaw = data.getUint8(15);
    const heartRate = heartRateRaw === 255 ? 0 : heartRateRaw;

    console.log('【HuanTong解析结果】', { instantSpeed, instantCadence, instantPower, elapsedTime, heartRateRaw, heartRate });
    return {
      instantSpeed,
      instantCadence,
      totalDistance,
      instantPower,
      elapsedTime,
      kcal,
      heartRate,
      heartRateRaw
    };
  }
};

// ======================
// 100% 原作者原版阻力指令，一字未改
// ======================
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
  const [deviceName, setDeviceName] = useState<string>('未连接');
  const [rawPacket, setRawPacket] = useState<number[]>([]); // 原始数据包，用于页面显示
  
  const controlPoint = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const parserRef = useRef<(data: DataView) => BikeStats>(() => INITIAL_STATS);
  const commandBuilderRef = useRef<(level: number) => Uint8Array>(() => new Uint8Array());

  // ======================
  // 协议检测，加全量日志
  // ======================
  const detectProtocol = (services: BluetoothRemoteGATTService[]): ProtocolType => {
    console.log('【协议检测】设备所有服务UUID:', services.map(s => s.uuid));
    for (const service of services) {
      if (service.uuid === UUIDS.FTMS.SERVICE.toString()) {
        console.log('【协议检测】匹配到FTMS标准协议');
        return 'FTMS';
      }
      if (service.uuid === UUIDS.MobiV2.SERVICE.toLowerCase()) {
        console.log('【协议检测】匹配到MobiV2协议');
        return 'MobiV2';
      }
      if (service.uuid === UUIDS.MobiV1.SERVICE.toLowerCase()) {
        console.log('【协议检测】匹配到MobiV1协议');
        return 'MobiV1';
      }
      if (service.uuid === UUIDS.HuanTong.SERVICE.toLowerCase()) {
        console.log('【协议检测】匹配到HuanTong协议');
        return 'HuanTong';
      }
    }
    console.log('【协议检测】未匹配到任何支持的协议');
    return 'Unknown';
  };

  const connect = useCallback(async () => {
    try {
      setError('');
      if (!navigator.bluetooth) throw new Error('当前浏览器不支持Web Bluetooth API');
      console.log('【连接流程】开始请求蓝牙设备');

      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [UUIDS.FTMS.SERVICE] },
          { services: [UUIDS.MobiV2.SERVICE] },
          { services: [UUIDS.MobiV1.SERVICE] },
          { services: [UUIDS.HuanTong.SERVICE] },
        ],
        acceptAllDevices: false,
      });

      console.log('【连接流程】选中设备:', device.name, device.id);
      deviceRef.current = device;
      setDeviceName(device.name || '未知设备');

      const server = await device.gatt!.connect();
      console.log('【连接流程】GATT连接成功');
      
      const services = await server.getPrimaryServices();
      console.log('【连接流程】获取到服务数量:', services.length);
      
      const detectedProtocol = detectProtocol(services);
      if (detectedProtocol === 'Unknown') {
        throw new Error('不支持的设备协议，请查看控制台日志确认设备UUID');
      }

      setProtocol(detectedProtocol);
      parserRef.current = parsers[detectedProtocol];
      commandBuilderRef.current = protocolCommands[detectedProtocol];

      const uuidConfig = UUIDS[detectedProtocol];
      const service = await server.getPrimaryService(uuidConfig.SERVICE);
      console.log('【连接流程】获取到目标服务');
      
      const chr = await service.getCharacteristic(uuidConfig.CHARACTERISTIC);
      console.log('【连接流程】获取到数据特征值');
      
      await chr.startNotifications();
      console.log('【连接流程】已开启数据通知');
      
      chr.addEventListener('characteristicvaluechanged', (e) => {
        const v = (e.target as BluetoothRemoteGATTCharacteristic).value;
        if (v) {
          const packetArray = Array.from(new Uint8Array(v.buffer));
          setRawPacket(packetArray);
          const parsed = parserRef.current(v);
          setStats(parsed);
        }
      });

      controlPoint.current = await service.getCharacteristic(uuidConfig.CONTROL_POINT);
      console.log('【连接流程】获取到控制特征值，连接完成');
      setIsConnected(true);
    } catch (err: any) {
      console.error('【连接失败】', err);
      setError(err.message);
    }
  }, []);

  const disconnect = useCallback(() => {
    console.log('【断开连接】执行断开');
    deviceRef.current?.gatt?.disconnect();
    setIsConnected(false);
    setProtocol('Unknown');
    setDeviceName('未连接');
    controlPoint.current = null;
    setStats(INITIAL_STATS);
    setRawPacket([]);
  }, []);

  const setResistance = useCallback(async (level: number) => {
    try {
      if (!controlPoint.current || protocol === 'Unknown') throw new Error('设备未连接');
      const clamped = Math.max(1, Math.min(24, level));
      const command = commandBuilderRef.current(clamped);
      console.log('【设置阻力】档位:', clamped, '指令:', Array.from(command));
      await controlPoint.current.writeValueWithResponse(command);
    } catch (err) {
      console.error('【设置阻力失败】', err);
    }
  }, [protocol]);

  // 断开自动处理
  useEffect(() => {
    const device = deviceRef.current;
    if (!device) return;

    const onDisconnected = () => {
      console.log('【设备断开】连接已断开');
      setIsConnected(false);
      setProtocol('Unknown');
      setDeviceName('未连接');
      controlPoint.current = null;
    };

    device.addEventListener('gattserverdisconnected', onDisconnected);
    return () => device.removeEventListener('gattserverdisconnected', onDisconnected);
  }, []);

  return { 
    isConnected, 
    stats, 
    error, 
    protocol, 
    deviceName, 
    rawPacket,
    connect, 
    disconnect, 
    setResistance 
  };
}
