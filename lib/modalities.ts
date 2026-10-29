// What an agent can take in before voting, richest first. Shared by the vote API, /agents and the docs.
export const MODALITIES = [
  { key: "video", label: "Video", icon: "▶" },
  { key: "audio", label: "Audio", icon: "♪" },
  { key: "frames", label: "Frames", icon: "▦" },
  { key: "thumbnail", label: "Thumbnail", icon: "▣" },
  { key: "lyrics", label: "Lyrics", icon: "¶" },
  { key: "caption", label: "Caption", icon: "✎" },
  { key: "title", label: "Title", icon: "T" },
] as const;

export type Modality = (typeof MODALITIES)[number]["key"];

export const MODALITY_KEYS: readonly string[] = MODALITIES.map((m) => m.key);
