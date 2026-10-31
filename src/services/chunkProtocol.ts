export interface TransferStartMessage {
  type: 'TRANSFER_START';
  id: string;
  totalChunks: number;
  mimeType: string;
  totalBytes: number;
}

export interface TransferChunkMessage {
  type: 'TRANSFER_CHUNK';
  id: string;
  index: number;
  data: string;
}

export interface TransferEndMessage {
  type: 'TRANSFER_END';
  id: string;
}

export interface TransferAckMessage {
  type: 'TRANSFER_ACK';
  id: string;
  success: boolean;
}

export type WebRTCMessage =
  | TransferStartMessage
  | TransferChunkMessage
  | TransferEndMessage
  | TransferAckMessage;

export const CHUNK_SIZE = 16384; // 16 KB chunk size for WebRTC DataChannel reliability

/**
 * Splits a base64 or text payload into manageable chunks for WebRTC DataChannel transfer.
 */
export function chunkPayload(payload: string, transferId: string = crypto.randomUUID(), mimeType = 'image/jpeg'): {
  start: TransferStartMessage;
  chunks: TransferChunkMessage[];
  end: TransferEndMessage;
} {
  const totalLength = payload.length;
  const totalChunks = Math.ceil(totalLength / CHUNK_SIZE);
  const chunks: TransferChunkMessage[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalLength);
    chunks.push({
      type: 'TRANSFER_CHUNK',
      id: transferId,
      index: i,
      data: payload.slice(start, end),
    });
  }

  return {
    start: {
      type: 'TRANSFER_START',
      id: transferId,
      totalChunks,
      mimeType,
      totalBytes: totalLength,
    },
    chunks,
    end: {
      type: 'TRANSFER_END',
      id: transferId,
    },
  };
}

/**
 * Reassembles incoming chunks into full payload.
 */
export class ChunkReassembler {
  private activeTransfers = new Map<
    string,
    {
      totalChunks: number;
      mimeType: string;
      totalBytes: number;
      receivedChunks: Map<number, string>;
    }
  >();

  handleMessage(
    msg: WebRTCMessage,
    onProgress?: (progress: number, transferId: string) => void
  ): { complete: boolean; payload?: string; mimeType?: string; transferId?: string } {
    switch (msg.type) {
      case 'TRANSFER_START': {
        this.activeTransfers.set(msg.id, {
          totalChunks: msg.totalChunks,
          mimeType: msg.mimeType,
          totalBytes: msg.totalBytes,
          receivedChunks: new Map(),
        });
        if (onProgress) onProgress(0, msg.id);
        return { complete: false };
      }

      case 'TRANSFER_CHUNK': {
        const transfer = this.activeTransfers.get(msg.id);
        if (!transfer) return { complete: false };

        transfer.receivedChunks.set(msg.index, msg.data);
        const progress = transfer.receivedChunks.size / transfer.totalChunks;
        if (onProgress) onProgress(progress, msg.id);
        return { complete: false };
      }

      case 'TRANSFER_END': {
        const transfer = this.activeTransfers.get(msg.id);
        if (!transfer) return { complete: false };

        if (transfer.receivedChunks.size !== transfer.totalChunks) {
          throw new Error(
            `Incomplete transfer: received ${transfer.receivedChunks.size} of ${transfer.totalChunks} chunks`
          );
        }

        const orderedParts: string[] = [];
        for (let i = 0; i < transfer.totalChunks; i++) {
          orderedParts.push(transfer.receivedChunks.get(i) || '');
        }

        const fullPayload = orderedParts.join('');
        this.activeTransfers.delete(msg.id);

        return {
          complete: true,
          payload: fullPayload,
          mimeType: transfer.mimeType,
          transferId: msg.id,
        };
      }

      default:
        return { complete: false };
    }
  }

  reset() {
    this.activeTransfers.clear();
  }
}
