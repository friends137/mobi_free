import type { BluetoothProtocol, WorkoutData } from './types';

export class MobiV1Protocol implements BluetoothProtocol {
  name = 'Mobi V1 (Legacy)';

  private static DATA_CHAR_UUID = '0000ffe4-0000-1000-8000-00805f9b34fb';
  private static CONTROL_CHAR_UUID = '0000ffeb-0000-1000-8000-00805f9b34fb';
  private static WRITE_CHAR_UUID = '0000ffe3-0000-1000-8000-00805f9b34fb';
  private static AUX_DATA_CHAR_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

  private dataChar: BluetoothRemoteGATTCharacteristic | null = null;
  private auxDataChar: BluetoothRemoteGATTCharacteristic | null = null;
  private controlChar: BluetoothRemoteGATTCharacteristic | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;

  private lastControlPacket: DataView | null = null;

  isSupported(serviceUUIDs: string[]): boolean {
    return serviceUUIDs.some(uuid => 
      uuid.toLowerCase().includes('ffe0') || uuid.toLowerCase().includes('ffc0')
    );
  }

  async connect(server: BluetoothRemoteGATTServer): Promise<void> {
    const services = await server.getPrimaryServices();
    const service = services.find(s => 
      s.uuid.toLowerCase().includes('ffe0') || s.uuid.toLowerCase().includes('ffc0')
    );

    if (!service) {
      throw new Error('Mobi V1 Service (FFE0/FFC0) not found on device');
    }

    try {
      this.dataChar = await service.getCharacteristic(MobiV1Protocol.DATA_CHAR_UUID);
      this.writeChar = await service.getCharacteristic(MobiV1Protocol.WRITE_CHAR_UUID);

      try {
        this.controlChar = await service.getCharacteristic(MobiV1Protocol.CONTROL_CHAR_UUID);
      } catch (e) {
        console.warn('Mobi V1: Control char (FFEB) not found, resistance control might not work', e);
      }

      try {
        this.auxDataChar = await service.getCharacteristic(MobiV1Protocol.AUX_DATA_CHAR_UUID);
      } catch (e) {
        console.warn('Mobi V1: Aux Data char (FFE1) not found', e);
      }

      console.log('Mobi V1 connected');
    } catch (e) {
      console.warn('Mobi V1 init failed', e);
      throw e;
    }
  }

  async startNotifications(onData: (data: WorkoutData) => void): Promise<void> {
    const handleCharValue = (e: Event) => {
      const char = e.target as BluetoothRemoteGATTCharacteristic;
      if (char.value) {
        const data = this.parseData(char.value);
        if (data) onData(data);
      }
    };

    if (this.dataChar) {
      await this.dataChar.startNotifications();
      this.dataChar.addEventListener('characteristicvaluechanged', handleCharValue);
    }

    if (this.auxDataChar) {
      await this.auxDataChar.startNotifications();
      this.auxDataChar.addEventListener('characteristicvaluechanged', handleCharValue);
    }

    if (this.controlChar) {
      await this.controlChar.startNotifications();
      this.controlChar.addEventListener('characteristicvaluechanged', (e: Event) => {
        const char = e.target as BluetoothRemoteGATTCharacteristic;
        if (char.value) {
          this.lastControlPacket = char.value;
          const data = this.parseData(char.value);
          if (data) onData(data);
        }
      });
    }
  }

  async setResistance(level: number): Promise<void> {
    if (!this.writeChar || !this.lastControlPacket) {
      console.warn('Cannot set resistance: No write char or no control packet received yet');
      return;
    }

    const safeLevel = Math.min(Math.max(level, 1), 24);
    const data = new Uint8Array(this.lastControlPacket.buffer);
    
    if (data.length < 7) {
      console.warn('Control packet too short', data);
      return;
    }

    const cmd = new Uint8Array([
      0xAB,
      0x03,
      0x00,
      data[3],
      data[4],
      safeLevel & 0xFF,
      data[6]
    ]);

    await this.writeChar.writeValue(cmd);
  }

  disconnect(): void {
    this.dataChar = null;
    this.controlChar = null;
    this.writeChar = null;
    this.lastControlPacket = null;
  }

  private parseData(view: DataView): WorkoutData | null {
    const buffer = new Uint8Array(view.buffer);
    
    if (buffer[0] !== 0xAB) return null;

    const cmd = buffer[1];
    const data: WorkoutData = {};

    // 解析速度 (0x0A = 速度包)
    if (cmd === 0x0A && buffer.length >= 4) {
      const speedVal = (buffer[2] << 8) | buffer[3];
      data.instantSpeed = speedVal / 10.0;
    }

    // 解析阻力级别 (字节5)
    if (view.byteLength >= 7) {
      const currentLevel = view.getUint8(5);
      if (currentLevel >= 1 && currentLevel <= 24) {
        data.resistanceLevel = currentLevel;
      }
    }

    // 🔥 新增：心率解析
    // 方案1: 心率可能在字节6位置（常见于莫比旧协议）
    if (buffer.length >= 8) {
      const heartRate = buffer[6];
      // 有效心率范围 30-200 BPM
      if (heartRate >= 30 && heartRate <= 200) {
        data.heartRate = heartRate;
      }
    }

    // 方案2: 如果是心率专用包 (0x0D)，解析心率
    if (cmd === 0x0D && buffer.length >= 4) {
      const hr = buffer[3];
      if (hr >= 30 && hr <= 200) {
        data.heartRate = hr;
      }
    }

    // 方案3: 尝试从辅助数据通道解析心率 (FFE1)
    // 部分设备心率在单独的通道发送
    if (buffer.length >= 10) {
      const altHr = buffer[9];
      if (altHr >= 30 && altHr <= 200 && !data.heartRate) {
        data.heartRate = altHr;
      }
    }

    return data;
  }
}
