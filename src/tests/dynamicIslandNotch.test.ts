import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  showNotchWindow,
  hideNotchWindow,
  toggleNotchWindow,
  resizeNotchWindow,
  getNotchWindowState,
} from '../lib/ipc';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('Dynamic Island / Notch Window Tauri IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls show_notch_window via Tauri invoke', async () => {
    (invoke as any).mockResolvedValueOnce(true);
    const res = await showNotchWindow();
    expect(invoke).toHaveBeenCalledWith('show_notch_window');
    expect(res).toBe(true);
  });

  it('calls hide_notch_window via Tauri invoke', async () => {
    (invoke as any).mockResolvedValueOnce(true);
    const res = await hideNotchWindow();
    expect(invoke).toHaveBeenCalledWith('hide_notch_window');
    expect(res).toBe(true);
  });

  it('calls toggle_notch_window via Tauri invoke', async () => {
    (invoke as any).mockResolvedValueOnce(true);
    const res = await toggleNotchWindow();
    expect(invoke).toHaveBeenCalledWith('toggle_notch_window');
    expect(res).toBe(true);
  });

  it('calls resize_notch_window with dimensions', async () => {
    (invoke as any).mockResolvedValueOnce(true);
    const res = await resizeNotchWindow(440, 160);
    expect(invoke).toHaveBeenCalledWith('resize_notch_window', { width: 440, height: 160 });
    expect(res).toBe(true);
  });

  it('retrieves current notch window state', async () => {
    const mockState = {
      isVisible: true,
      width: 380,
      height: 48,
      isExpanded: false,
    };
    (invoke as any).mockResolvedValueOnce(mockState);
    const state = await getNotchWindowState();
    expect(invoke).toHaveBeenCalledWith('get_notch_window_state');
    expect(state).toEqual(mockState);
  });
});
