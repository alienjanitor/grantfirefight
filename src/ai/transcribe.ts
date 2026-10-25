import { AiResponseError } from "./claude";

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function transcribe(ai: Ai, audio: ArrayBuffer): Promise<string> {
  if (audio.byteLength === 0) throw new AiResponseError("The recording was empty.");
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new AiResponseError("That recording is too long. Keep answers under a few minutes.");
  const result = await ai.run("@cf/openai/whisper-large-v3-turbo", {
    audio: toBase64(new Uint8Array(audio)),
    task: "transcribe",
    language: "en",
    vad_filter: true,
    initial_prompt: "A fire chief describing a volunteer fire department, its calls, budget, and equipment such as SCBA, turnout gear, and apparatus.",
  });
  return result.text ?? "";
}
