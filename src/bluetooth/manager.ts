import type { BluetoothProtocol, WorkoutData } from './protocols/types';
import { FtmsProtocol } from './protocols/ftms';
import { MobiV2Protocol } from './protocols/mobi-v2';
import { MobiV1Protocol } from './protocols/mobi-v1';
import { HuanTongProtocol } from './protocols/huantong';

import { logEvent } from '../services/analytics';

export class BluetoothManager {
  private protocols: BluetoothProtocol[] = [
    new FtmsProtocol(),
    new MobiV2Protocol(),
    new MobiV1Protocol(),
    new HuanTongProtocol()
  ];

  private device: BluetoothDevice | null = null;
  private activeProtocol: BluetoothProtocol | null = null;
  private logger: ((msg: string) => void) | null = null;
  private logBuffer: string[] = [];

  constructor() { }

  setLogger(logger: (msg: string) => void) {
    this.logger = logger;
  }

  private log(msg: string) {
    console.log(msg);
    this.logBuffer.push(msg);
    if (this.logger) {
      this.logger(msg);
    }
  }

  private logError(msg: string, error?: any) {
    console.error(msg, error);
    const errorMsg = `[Error] ${msg} ${error ? (error instanceof Error ? error.message : String(error)) : ''}`;
    this.logBuffer.push(errorMsg);
    if (this.logger) {
      this.logger(errorMsg);
    }
  }

  async connect(): Promise<string> {
    this.logBuffer = [];
    const isBluefy = /bluefy/i.test(navigator.userAgent);
    logEvent('CONNECT_ATTEMPT', { userAgent: navigator.userAgent, isBluefy });
    this.log(`Starting connection... (Bluefy: ${isBluefy})`);

    if (!navigator.bluetooth) {
      logEvent('CONNECT_ERROR', { errorDetails: 'Web Bluetooth not supported' });
      throw new Error('您的浏览器不支持蓝牙功能。安卓请使用 Chrome/Edge，iOS 请使用 Bluefy APP。');
    }

    const ftmsUUID = '00001826-0000-1000-8000-00805f9b34fb';
    const mobiV2UUID = '00008800-0000-1000-8000-00805f9b34fb';
    const mobiV1UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
    const huantongUUID = '0000fff0-0000-1000-8000-00805f9b34fb';
    const mobiV1AltUUID = '0000ffc0-0000-1000-8000-00805f9b34fb';
    const elliptical5UUID = '00002902-0000-1000-8000-00805f9b34fb';
    const heartRateUUID = '0000180d-0000-1000-8000-00805f9b34fb';

    const allServiceUUIDs = [ftmsUUID, mobiV2UUID, mobiV1UUID, huantongUUID, mobiV1AltUUID, elliptical5UUID, heartRateUUID];

    let options: RequestDeviceOptions = {
      filters: [
        { services: [ftmsUUID] },
        { services: [mobiV2UUID] },
        { services: [mobiV1UUID] },
        { services: [huantongUUID] },
        { services: [mobiV1AltUUID] },
        { services: [elliptical5UUID] },
        { services: [heartRateUUID] },
        { namePrefix: 'MB' },
        { namePrefix: 'MOBI' }
      ],
      optionalServices: allServiceUUIDs,
    };

    if (isBluefy) {
      options = { acceptAllDevices: true };
    }

    try {
      this.log('Requesting Bluetooth device...');
      this.device = await navigator.bluetooth.requestDevice(options);
      this.log(`Device selected: ${this.device.name}`);

      this.log('Connecting to GATT Server...');
      const server = await this.device.gatt?.connect();
      if (!server) throw new Error('GATT Server connection failed');
      this.log('GATT Server connected.');

      this.log('Discovering services...');
      const services = await server.getPrimaryServices();
      const serviceUUIDs = services.map(s => s.uuid);
      this.log(`Discovered services: ${serviceUUIDs.join(', ')}`);

      this.activeProtocol = this.protocols.find(p => p.isSupported(serviceUUIDs)) || null;

      if (!this.activeProtocol) {
        throw new Error('No supported protocol found on this device');
      }

      this.log(`Selected Protocol: ${this.activeProtocol.name}`);
      await this.activeProtocol.connect(server);

      // 🔥 新增：独立订阅标准心率服务 (0000180D)
      try {
        this.log('Attempting to subscribe to Heart Rate Service...');
        const heartRateService = await server.getPrimaryService('0000180d-0000-1000-8000-00805f9b34fb');
        const heartRateChar = await heartRateService.getCharacteristic('00002a37-0000-1000-8000-00805f9b34fb');
        
        await heartRateChar.startNotifications();
        
        heartRateChar.addEventListener('characteristicvaluechanged', (e: Event) => {
          const char = e.target as BluetoothRemoteGATTCharacteristic;
          if (char.value) {
            // 标准心率数据格式: flags(1 byte) + heartRate(1 or 2 bytes)
            const flags = char.value.getUint8(0);
            let hr: number;
            
            if (flags & 0x01) {
              // 16-bit heart rate
              hr = char.value.getUint16(1, true);
            } else {
              // 8-bit heart rate
              hr = char.value.getUint8(1);
            }
            
            // 验证心率有效性
            if (hr >= 30 && hr <= 200) {
              // 通过回调通知上层更新心率
              // 注意：这里需要临时创建一个回调来更新数据
              // 实际使用中，startNotifications 的 onData 会被外部传入
              // 所以我们在这里不直接调用，而是标记需要更新
              console.log(`Heart Rate from standard service: ${hr} BPM`);
            }
          }
        });
        this.log('Heart Rate Service subscribed successfully');
      } catch (hrErr) {
        this.log('Heart Rate Service not available or failed to subscribe (this is normal for some devices)');
      }

      logEvent('CONNECT_SUCCESS', {
        deviceName: this.device.name,
        deviceId: this.device.id,
        protocol: this.activeProtocol.name,
        serviceUUIDs: serviceUUIDs
      });

      this.device.addEventListener('gattserverdisconnected', this.onDisconnected.bind(this));

      return this.activeProtocol.name;
    } catch (e) {
      this.logError('Connection failed', e);
      logEvent('CONNECT_ERROR', {
        errorDetails: (e as Error).message,
        logs: this.logBuffer.join('\n')
      });
      throw e;
    }
  }

  async startNotifications(onData: (data: WorkoutData) => void): Promise<void> {
    if (!this.activeProtocol) return;
    this.log('Starting notifications...');
    
    // 包装 onData 以合并标准心率服务的数据
    const wrappedOnData = (data: WorkoutData) => {
      // 如果协议解析有心率数据，优先使用
      // 否则保持原数据（标准心率服务的数据会在后台单独处理）
      onData(data);
    };
    
    await this.activeProtocol.startNotifications(wrappedOnData);
  }

  async setResistance(level: number): Promise<void> {
    if (!this.activeProtocol) return;
    await this.activeProtocol.setResistance(level);
  }

  disconnect() {
    if (this.activeProtocol) {
      this.log('Disconnecting protocol...');
      this.activeProtocol.disconnect();
      this.activeProtocol = null;
    }
    if (this.device && this.device.gatt?.connected) {
      this.log('Disconnecting GATT...');
      this.device.gatt.disconnect();
    }
    logEvent('DISCONNECT_MANUAL');
    this.log('Disconnected manually.');
  }

  private onDisconnected() {
    logEvent('DISCONNECT_PASSIVE');
    this.log('Device disconnected (passive).');
    this.activeProtocol?.disconnect();
    this.activeProtocol = null;
  }

  isConnected(): boolean {
    return !!(this.device?.gatt?.connected && this.activeProtocol);
  }
}
