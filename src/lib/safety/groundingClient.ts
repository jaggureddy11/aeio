import { getApiKey } from '../ipc';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GroundingRequest {
  image: string; // base64 or file path
  instruction: string;
  targetAppName?: string;
  windowBounds?: WindowBounds;
  screenWidth?: number;
  screenHeight?: number;
}

export interface GroundingResult {
  coordinate: { x: number; y: number };
  boundingBox?: [number, number, number, number];
  confidence: number;
  rawOutput?: string;
  modelEndpoint: string;
}

/**
 * Validates whether a predicted coordinate is physically within target window bounds.
 */
export function validateCoordinateInBounds(
  coord: { x: number; y: number },
  bounds?: WindowBounds
): boolean {
  if (!bounds) return true;
  return (
    coord.x >= bounds.x &&
    coord.x <= bounds.x + bounds.width &&
    coord.y >= bounds.y &&
    coord.y <= bounds.y + bounds.height
  );
}

/**
 * Parses coordinate and bounding box from grounding model raw response.
 * Handles both JSON payloads and standard UI-TARS / Qwen2-VL text representations.
 */
export function parseGroundingResponse(
  rawText: string,
  screenWidth: number = 1920,
  screenHeight: number = 1080
): { coordinate: { x: number; y: number }; boundingBox?: [number, number, number, number]; confidence: number } {
  // Pattern 1: Direct JSON in response
  try {
    const parsed = JSON.parse(rawText);
    if (parsed.coordinate && Array.isArray(parsed.coordinate) && parsed.coordinate.length >= 2) {
      let x = Number(parsed.coordinate[0]);
      let y = Number(parsed.coordinate[1]);
      // Normalize if in 0..1000 scale
      if (x <= 1000 && y <= 1000 && screenWidth > 1000) {
        x = Math.round((x / 1000) * screenWidth);
        y = Math.round((y / 1000) * screenHeight);
      }
      const bbox = Array.isArray(parsed.bbox) && parsed.bbox.length === 4
        ? (parsed.bbox as [number, number, number, number])
        : undefined;
      return {
        coordinate: { x, y },
        boundingBox: bbox,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.95,
      };
    }
  } catch {
    // Continue to regex parsing
  }

  // Pattern 2: UI-TARS action string, e.g. click(point='[482, 319]') or click(start_box='(474, 311, 490, 327)')
  const pointMatch = rawText.match(/point=['"]?\[?(\d+)[,\s]+(\d+)\]?['"]?/i);
  if (pointMatch) {
    let x = parseInt(pointMatch[1], 10);
    let y = parseInt(pointMatch[2], 10);
    if (x <= 1000 && y <= 1000 && screenWidth > 1000) {
      x = Math.round((x / 1000) * screenWidth);
      y = Math.round((y / 1000) * screenHeight);
    }
    return { coordinate: { x, y }, confidence: 0.92 };
  }

  const boxMatch = rawText.match(/start_box=['"]?\([\[]?(\d+)[,\s]+(\d+)[,\s]+(\d+)[,\s]+(\d+)[\]]?\)?['"]?/i);
  if (boxMatch) {
    let x1 = parseInt(boxMatch[1], 10);
    let y1 = parseInt(boxMatch[2], 10);
    let x2 = parseInt(boxMatch[3], 10);
    let y2 = parseInt(boxMatch[4], 10);

    if (x2 <= 1000 && y2 <= 1000 && screenWidth > 1000) {
      x1 = Math.round((x1 / 1000) * screenWidth);
      y1 = Math.round((y1 / 1000) * screenHeight);
      x2 = Math.round((x2 / 1000) * screenWidth);
      y2 = Math.round((y2 / 1000) * screenHeight);
    }

    const centerX = Math.round((x1 + x2) / 2);
    const centerY = Math.round((y1 + y2) / 2);
    return {
      coordinate: { x: centerX, y: centerY },
      boundingBox: [x1, y1, x2, y2],
      confidence: 0.94,
    };
  }

  // Fallback: search for generic coordinate pairs in brackets [x, y]
  const pairMatch = rawText.match(/\[(\d+)[,\s]+(\d+)\]/);
  if (pairMatch) {
    let x = parseInt(pairMatch[1], 10);
    let y = parseInt(pairMatch[2], 10);
    if (x <= 1000 && y <= 1000 && screenWidth > 1000) {
      x = Math.round((x / 1000) * screenWidth);
      y = Math.round((y / 1000) * screenHeight);
    }
    return { coordinate: { x, y }, confidence: 0.85 };
  }

  throw new Error(`Unable to extract valid grounding coordinate from model response: "${rawText.slice(0, 100)}..."`);
}

/**
 * Sends image and instruction to Bring-Your-Own Grounding Endpoint (UI-TARS / Qwen2-VL).
 */
export async function resolveGroundingTarget(
  endpointUrl: string,
  request: GroundingRequest,
  apiKeyOverride?: string
): Promise<GroundingResult> {
  const url = endpointUrl.trim();
  if (!url) {
    throw new Error('Grounding Endpoint URL is not configured in Settings.');
  }

  let token = apiKeyOverride;
  if (!token) {
    try {
      token = await getApiKey('grounding');
    } catch {
      // Token may be optional for local vLLM / RunPod instances
    }
  }

  const screenW = request.screenWidth || 1920;
  const screenH = request.screenHeight || 1080;

  // Prepare standard vision grounding payload
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const payload = {
    image: request.image,
    instruction: request.instruction,
    temperature: 0.0,
    max_tokens: 256,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Grounding endpoint HTTP ${response.status}: ${errText.slice(0, 200)}`);
  }

  const responseText = await response.text();
  const parsed = parseGroundingResponse(responseText, screenW, screenH);

  // Perform Sanity Check against target window bounds if provided
  if (request.windowBounds) {
    const isInside = validateCoordinateInBounds(parsed.coordinate, request.windowBounds);
    if (!isInside) {
      throw new Error(
        `Grounding sanity check failed: Predicted coordinate (${parsed.coordinate.x}, ${parsed.coordinate.y}) ` +
        `falls outside target application window bounds ` +
        `({ x: ${request.windowBounds.x}, y: ${request.windowBounds.y}, w: ${request.windowBounds.width}, h: ${request.windowBounds.height} })`
      );
    }
  }

  return {
    coordinate: parsed.coordinate,
    boundingBox: parsed.boundingBox,
    confidence: parsed.confidence,
    rawOutput: responseText,
    modelEndpoint: url,
  };
}
