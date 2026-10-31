import { Peer, type DataConnection } from 'peerjs';
import { chunkPayload, ChunkReassembler, type WebRTCMessage } from './chunkProtocol';

export interface WebRTCEvents {
  onSessionReady?: (sessionId: string) => void;
  onDeviceConnected?: (peerId: string) => void;
  onDeviceDisconnected?: () => void;
  onProgress?: (progress: number) => void;
  onPhotoReceived?: (dataUrl: string, mimeType: string) => void;
  onError?: (err: Error) => void;
}

export class WebRTCReceiver {
  private peer: Peer | null = null;
  private activeConn: DataConnection | null = null;
  private reassembler = new ChunkReassembler();
  private events: WebRTCEvents;

  constructor(events: WebRTCEvents) {
    this.events = events;
  }

  public init(customSessionId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const sessionId = customSessionId || `cphoto-${Math.random().toString(36).substring(2, 9)}`;

      this.peer = new Peer(sessionId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });

      this.peer.on('open', (id) => {
        if (this.events.onSessionReady) this.events.onSessionReady(id);
        resolve(id);
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (this.events.onError) this.events.onError(err);
        reject(err);
      });

      this.peer.on('connection', (conn) => {
        this.setupConnection(conn);
      });
    });
  }

  private setupConnection(conn: DataConnection) {
    this.activeConn = conn;

    conn.on('open', () => {
      if (this.events.onDeviceConnected) {
        this.events.onDeviceConnected(conn.peer);
      }
    });

    conn.on('data', (data) => {
      try {
        const msg = (typeof data === 'string' ? JSON.parse(data) : data) as WebRTCMessage;
        const result = this.reassembler.handleMessage(msg, (progress) => {
          if (this.events.onProgress) {
            this.events.onProgress(progress);
          }
        });

        if (result.complete && result.payload) {
          // Send acknowledgement back to mobile
          conn.send(
            JSON.stringify({
              type: 'TRANSFER_ACK',
              id: result.transferId,
              success: true,
            })
          );

          if (this.events.onPhotoReceived) {
            this.events.onPhotoReceived(result.payload, result.mimeType || 'image/jpeg');
          }
        }
      } catch (err) {
        console.error('Error handling data chunk:', err);
      }
    });

    conn.on('close', () => {
      this.activeConn = null;
      if (this.events.onDeviceDisconnected) {
        this.events.onDeviceDisconnected();
      }
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
      if (this.events.onError) this.events.onError(err);
    });
  }

  public destroy() {
    if (this.activeConn) {
      this.activeConn.close();
      this.activeConn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.reassembler.reset();
  }
}

export class WebRTCSender {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;

  public connect(targetSessionId: string): Promise<DataConnection> {
    return new Promise((resolve, reject) => {
      this.peer = new Peer({
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });

      this.peer.on('open', () => {
        const conn = this.peer!.connect(targetSessionId, { reliable: true });
        this.conn = conn;

        conn.on('open', () => {
          resolve(conn);
        });

        conn.on('error', (err) => {
          reject(err);
        });
      });

      this.peer.on('error', (err) => {
        reject(err);
      });
    });
  }

  public sendPhoto(
    dataUrl: string,
    mimeType = 'image/jpeg',
    onProgress?: (progress: number) => void
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.conn || !this.conn.open) {
        return reject(new Error('WebRTC connection is not open'));
      }

      const { start, chunks, end } = chunkPayload(dataUrl, crypto.randomUUID(), mimeType);

      // Listen for ACK from desktop
      const ackHandler = (raw: unknown) => {
        try {
          const msg = (typeof raw === 'string' ? JSON.parse(raw) : raw) as WebRTCMessage;
          if (msg.type === 'TRANSFER_ACK' && msg.id === start.id) {
            this.conn?.off('data', ackHandler);
            resolve(true);
          }
        } catch {
          // ignore
        }
      };
      this.conn.on('data', ackHandler);

      // Send start message
      this.conn.send(JSON.stringify(start));

      // Send chunks with small interval or sequential promises to not flood SCTP buffer
      let currentChunk = 0;
      const sendNextChunk = () => {
        if (currentChunk < chunks.length) {
          this.conn!.send(JSON.stringify(chunks[currentChunk]));
          currentChunk++;
          if (onProgress) {
            onProgress(currentChunk / chunks.length);
          }
          // Tiny microtask delay
          setTimeout(sendNextChunk, 10);
        } else {
          // Send end message
          this.conn!.send(JSON.stringify(end));
          // If no ACK received in 5s, resolve anyway as fallback
          setTimeout(() => {
            resolve(true);
          }, 5000);
        }
      };

      sendNextChunk();
    });
  }

  public destroy() {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}
