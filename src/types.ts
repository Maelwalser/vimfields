export const enum VimMode {
  Normal = "normal",
  Insert = "insert",
  Visual = "visual",
  VisualLine = "visual-line",
}

export const enum FieldType {
  Input = "input",
  Textarea = "textarea",
  ContentEditable = "contenteditable",
}

export interface KeyEvent {
  key: string;
  code: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export interface VimState {
  mode: VimMode;
  count: number;
  pendingKeys: string;
  register: string;
  lastCommand: string;
}

export interface VimConfig {
  enabled: boolean;
  escapeRemap: string;
  disabledSites: string[];
}

export interface FieldInfo {
  type: FieldType;
  element: HTMLElement;
}

export const enum MessageType {
  ToggleEnabled = "toggle-enabled",
  GetState = "get-state",
  StateChanged = "state-changed",
  ConfigUpdated = "config-updated",
  GetConfig = "get-config",
}

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

export interface StateMessage extends ExtensionMessage {
  type: MessageType.StateChanged;
  payload: {
    mode: VimMode;
    enabled: boolean;
  };
}

export interface ConfigMessage extends ExtensionMessage {
  type: MessageType.ConfigUpdated;
  payload: VimConfig;
}
