import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateCoordinateInBounds,
  parseGroundingResponse,
  resolveGroundingTarget,
  WindowBounds,
} from '../lib/safety/groundingClient';

describe('Phase 7: BYO Grounding Model Client & Sanity Checking', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateCoordinateInBounds', () => {
    const bounds: WindowBounds = { x: 100, y: 100, width: 800, height: 600 };

    it('returns true when coordinate is safely within window bounds', () => {
      expect(validateCoordinateInBounds({ x: 200, y: 250 }, bounds)).toBe(true);
      expect(validateCoordinateInBounds({ x: 100, y: 100 }, bounds)).toBe(true);
      expect(validateCoordinateInBounds({ x: 900, y: 700 }, bounds)).toBe(true);
    });

    it('returns false when coordinate is outside window bounds on x or y', () => {
      // Outside left
      expect(validateCoordinateInBounds({ x: 99, y: 300 }, bounds)).toBe(false);
      // Outside right
      expect(validateCoordinateInBounds({ x: 901, y: 300 }, bounds)).toBe(false);
      // Outside top
      expect(validateCoordinateInBounds({ x: 400, y: 99 }, bounds)).toBe(false);
      // Outside bottom
      expect(validateCoordinateInBounds({ x: 400, y: 701 }, bounds)).toBe(false);
    });

    it('returns true when no window bounds are provided', () => {
      expect(validateCoordinateInBounds({ x: 1500, y: 900 }, undefined)).toBe(true);
    });
  });

  describe('parseGroundingResponse', () => {
    it('parses JSON format with 0..1000 normalized coordinates and scales to display resolution', () => {
      const jsonResponse = JSON.stringify({
        coordinate: [500, 500],
        bbox: [480, 480, 520, 520],
        confidence: 0.98,
      });

      const parsed = parseGroundingResponse(jsonResponse, 1920, 1080);
      expect(parsed.coordinate).toEqual({ x: 960, y: 540 });
      expect(parsed.confidence).toBe(0.98);
      expect(parsed.boundingBox).toEqual([480, 480, 520, 520]);
    });

    it('parses JSON format with absolute pixel coordinates without abnormal rescaling', () => {
      const jsonResponse = JSON.stringify({
        coordinate: [1200, 800],
        confidence: 0.92,
      });

      const parsed = parseGroundingResponse(jsonResponse, 1920, 1080);
      expect(parsed.coordinate).toEqual({ x: 1200, y: 800 });
      expect(parsed.confidence).toBe(0.92);
    });

    it('parses UI-TARS action string with point format', () => {
      const rawText = "Thought: I need to click the search bar.\nAction: click(point='[500, 500]')";
      const parsed = parseGroundingResponse(rawText, 1920, 1080);
      expect(parsed.coordinate).toEqual({ x: 960, y: 540 });
      expect(parsed.confidence).toBeGreaterThan(0.9);
    });

    it('parses UI-TARS action string with start_box and computes center', () => {
      // 0..1000 normalized box: [200, 200, 400, 400] on 1000x1000 screen
      const rawText = "Action: click(start_box='(200, 200, 400, 400)')";
      const parsed = parseGroundingResponse(rawText, 1000, 1000);
      expect(parsed.coordinate).toEqual({ x: 300, y: 300 });
      expect(parsed.boundingBox).toEqual([200, 200, 400, 400]);
    });

    it('falls back to bracketed pair regex', () => {
      const rawText = 'Target located at [450, 350] on screen.';
      const parsed = parseGroundingResponse(rawText, 1000, 1000);
      expect(parsed.coordinate).toEqual({ x: 450, y: 350 });
    });

    it('throws descriptive error on malformed or empty output', () => {
      expect(() => parseGroundingResponse('No target found anywhere.', 1920, 1080)).toThrow(
        /Unable to extract valid grounding coordinate/
      );
    });
  });

  describe('resolveGroundingTarget', () => {
    it('throws error when endpoint URL is empty or whitespace', async () => {
      await expect(
        resolveGroundingTarget('   ', {
          image: 'base64...',
          instruction: 'click Save',
        })
      ).rejects.toThrow('Grounding Endpoint URL is not configured in Settings.');
    });

    it('dispatches request to BYO endpoint and parses response', async () => {
      const mockResponse = JSON.stringify({
        coordinate: [250, 250],
        confidence: 0.95,
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockResponse,
      } as unknown as Response);

      const result = await resolveGroundingTarget(
        'http://localhost:8000/v1/grounding',
        {
          image: 'data:image/png;base64,ABC',
          instruction: 'click File button',
          screenWidth: 1000,
          screenHeight: 1000,
        },
        'mock-bearer-token'
      );

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8000/v1/grounding',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-bearer-token',
          }),
        })
      );

      expect(result.coordinate).toEqual({ x: 250, y: 250 });
      expect(result.confidence).toBe(0.95);
      expect(result.modelEndpoint).toBe('http://localhost:8000/v1/grounding');
    });

    it('fails coordinate sanity check and rejects action if predicted point falls outside target window bounds', async () => {
      // Point at (950, 950) outside bounds [100, 100, 500, 500]
      const mockResponse = JSON.stringify({
        coordinate: [950, 950],
        confidence: 0.99,
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockResponse,
      } as unknown as Response);

      await expect(
        resolveGroundingTarget(
          'http://localhost:8000/v1/grounding',
          {
            image: 'data:image/png;base64,ABC',
            instruction: 'click window title',
            screenWidth: 1000,
            screenHeight: 1000,
            windowBounds: { x: 100, y: 100, width: 500, height: 500 },
          },
          'token'
        )
      ).rejects.toThrow(/Grounding sanity check failed/);
    });

    it('passes coordinate sanity check when predicted point is strictly inside target window bounds', async () => {
      const mockResponse = JSON.stringify({
        coordinate: [250, 250],
        confidence: 0.99,
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockResponse,
      } as unknown as Response);

      const result = await resolveGroundingTarget(
        'http://localhost:8000/v1/grounding',
        {
          image: 'data:image/png;base64,ABC',
          instruction: 'click window title',
          screenWidth: 1000,
          screenHeight: 1000,
          windowBounds: { x: 100, y: 100, width: 500, height: 500 },
        },
        'token'
      );

      expect(result.coordinate).toEqual({ x: 250, y: 250 });
    });
  });
});
