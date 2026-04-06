import { useState, useCallback, useRef } from 'react';

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
  heartRate: number;
}

export function useBluetooth() {
  const [isConnected, setIsConnected] = useState(false);
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
  const [logs, setLogs] = useState<string[]>([]);
  const controlPoint = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const deviceRef = useRef<BluetoothDevice | null>(null);

  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-8), msg]);

  // 莫比椭圆机 V1/V2 私有协议解析（含正确心率）
  const parseFTMSData = (data: DataView) => {
    try {
      const flags = data.getUint16(0, true);
      let offset = 2;

      const instantaneousSpeed = data.getUint16(offset, true) / 100; offset += 2;
      const instantaneousCadence = data.getUint16(offset, true) / 2; offset += 2;
      const totalDistance = data.getUint32(offset, true); offset += 4;
      const instantaneousPower = data.getUint16(offset, true); offset += 2;
      const elapsedTime = data.getUint16(offset, true); offset += 2;
      const kcal = data.getUint16(offset, true); offset += 2;
      const heartRateRaw = data.getUint8(offset); offset += 1;

      const heartRate = heartRateRaw > 0 && heartRateRaw < 250 ? heartRateRaw : 0;

      setStats(prev => ({
        ...prev,
        instantSpeed: instantaneousSpeed,
        instantCadence: instantaneousCadence,
        totalDistance: totalDistance,
        instantPower: instantaneousPower,
        elapsedTime: elapsedTime,
        kcal: kcal,
        heartRate: heartRate,
      }));
    } catch (e) {
      console.error('解析错误', e);
    }
  };

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
      addLog('已连接');
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const disconnect = useCallback(() => {
    deviceRef.current?.gatt?.disconnect();
    setIsConnected(false);
    controlPoint.current = null;
    setStats(s => ({ ...s, heartRate: 0 }));
  }, []);

  const setResistance = useCallback(async (level: number) => {
    try {
      if (!controlPoint.current) throw new Error('未连接');
      const v = Math.max(1, Math.min(24, level));
      await controlPoint.current.writeValueWithResponse(new Uint8Array([0x04, 0x00, v]));
    } catch {}
  }, []);

  return { isConnected, stats, error, connect, disconnect, setResistance, logs };
}
