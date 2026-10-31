import { describe, it, expect, vi } from 'vitest';
import { chunkPayload, ChunkReassembler, CHUNK_SIZE } from '../services/chunkProtocol';

describe('chunkProtocol', () => {
  it('correctly chunks small payload into single chunk', () => {
    const payload = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const { start, chunks, end } = chunkPayload(payload, 'test-id-1', 'image/png');

    expect(start.totalChunks).toBe(1);
    expect(start.id).toBe('test-id-1');
    expect(start.mimeType).toBe('image/png');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].data).toBe(payload);
    expect(end.id).toBe('test-id-1');
  });

  it('correctly chunks large payload exceeding CHUNK_SIZE', () => {
    const largePayload = 'A'.repeat(CHUNK_SIZE * 2 + 500);
    const { start, chunks, end } = chunkPayload(largePayload, 'test-id-2');

    expect(start.totalChunks).toBe(3);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].data.length).toBe(CHUNK_SIZE);
    expect(chunks[1].data.length).toBe(CHUNK_SIZE);
    expect(chunks[2].data.length).toBe(500);
    expect(end.id).toBe('test-id-2');
  });

  it('reassembles chunks into original payload with progress tracking', () => {
    const original = 'Hello WebRTC DataChannel! '.repeat(2000);
    const { start, chunks, end } = chunkPayload(original, 'test-id-3', 'text/plain');

    const reassembler = new ChunkReassembler();
    const progressSpy = vi.fn();

    expect(reassembler.handleMessage(start, progressSpy).complete).toBe(false);

    for (let i = 0; i < chunks.length; i++) {
      expect(reassembler.handleMessage(chunks[i], progressSpy).complete).toBe(false);
    }

    const result = reassembler.handleMessage(end, progressSpy);
    expect(result.complete).toBe(true);
    expect(result.payload).toBe(original);
    expect(result.mimeType).toBe('text/plain');
    expect(result.transferId).toBe('test-id-3');

    expect(progressSpy).toHaveBeenCalledWith(0, 'test-id-3');
    expect(progressSpy).toHaveBeenCalledWith(1, 'test-id-3');
  });
});
