export interface Palette {
  bg: string; // screen background
  card: string; // cards, header, input container
  text: string; // primary text
  textMuted: string; // secondary text
  border: string;
  primary: string; // accent
  primaryText: string; // text on primary
  inputBg: string;
  bubbleAssistant: string;
  bubbleAssistantBorder: string;
  bubbleUser: string;
  bubbleUserText: string;
  danger: string;
  overlay: string;
}

export const lightColors: Palette = {
  bg: "#f5f5f5",
  card: "#ffffff",
  text: "#1a1a1a",
  textMuted: "#888888",
  border: "#eeeeee",
  primary: "#007AFF",
  primaryText: "#ffffff",
  inputBg: "#f5f5f5",
  bubbleAssistant: "#ffffff",
  bubbleAssistantBorder: "#eeeeee",
  bubbleUser: "#007AFF",
  bubbleUserText: "#ffffff",
  danger: "#ff3b30",
  overlay: "rgba(0,0,0,0.4)",
};

export const darkColors: Palette = {
  bg: "#000000",
  card: "#1c1c1e",
  text: "#f2f2f7",
  textMuted: "#8e8e93",
  border: "#2c2c2e",
  primary: "#0a84ff",
  primaryText: "#ffffff",
  inputBg: "#2c2c2e",
  bubbleAssistant: "#1c1c1e",
  bubbleAssistantBorder: "#2c2c2e",
  bubbleUser: "#0a84ff",
  bubbleUserText: "#ffffff",
  danger: "#ff453a",
  overlay: "rgba(0,0,0,0.6)",
};
