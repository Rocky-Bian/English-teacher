import { isClientScenario } from "./scenarios";
import type { ScenarioId } from "./types";

export const TTS_VOICE = "en-US-JennyNeural";
export const TTS_VOICE_CLIENT = "en-US-GuyNeural";
export const TTS_RATE = "-8%";
export const TTS_RATE_CLIENT = "-4%";
export const TTS_PITCH = "+1Hz";
export const TTS_PITCH_CLIENT = "-2Hz";
export const TTS_MAX_CHARS = 2500;

export function getTtsOptionsForScenario(scenarioId: ScenarioId) {
  if (isClientScenario(scenarioId)) {
    return {
      voice: TTS_VOICE_CLIENT,
      rate: TTS_RATE_CLIENT,
      pitch: TTS_PITCH_CLIENT,
    };
  }
  return {
    voice: TTS_VOICE,
    rate: TTS_RATE,
    pitch: TTS_PITCH,
  };
}
