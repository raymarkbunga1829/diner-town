import type { Simulation } from '../game/sim';
import type { Game } from '../game/state';

export type PanelId = 'shop' | 'menu' | 'market' | 'staff' | 'manage';

export interface PanelTab {
  id: string;
  label: string;
}

/** A sheet's contents. Panels are re-rendered whenever the game state changes. */
export interface Panel {
  title: string;
  subtitle?: () => string;
  tabs?: PanelTab[];
  activeTab?: string;
  onTab?: (id: string) => void;
  render: (body: HTMLElement) => void;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/** The surface panels use to talk back to the running game. */
export interface AppApi {
  readonly game: Game;
  readonly sim: Simulation;
  toast(message: string, kind?: 'good' | 'bad' | 'info'): void;
  /** Re-render the open sheet and the status bar. */
  refresh(): void;
  openSheet(id: PanelId, tab?: string): void;
  closeSheet(): void;
  /** Enter build mode with a catalogue item ready to place. */
  startPlacing(defId: string): void;
  enterBuild(): void;
  exitBuild(): void;
  confirm(options: ConfirmOptions): Promise<boolean>;
  promptText(title: string, message: string, value: string): Promise<string | null>;
  /** Pan the camera to a tile, e.g. to show what a purchase affected. */
  focusTile(tx: number, ty: number): void;
  save(): void;
}
