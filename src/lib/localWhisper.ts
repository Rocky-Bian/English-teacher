import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const SCRIPT_PATH = path.join(process.cwd(), "scripts", "transcribe.py");

function resolvePython(): string {
  if (process.env.WHISPER_PYTHON) return process.env.WHISPER_PYTHON;

  const venvPython = path.join(process.cwd(), ".venv", "bin", "python3");
  if (fs.existsSync(venvPython)) return venvPython;

  return "python3";
}

function guessExtension(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  return "audio";
}

export class LocalWhisperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalWhisperError";
  }
}

export async function transcribeAudioBuffer(
  audioBuffer: Buffer,
  mimeType: string
): Promise<string> {
  if (!fs.existsSync(SCRIPT_PATH)) {
    throw new LocalWhisperError("缺少 scripts/transcribe.py");
  }

  const ext = guessExtension(mimeType);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inputPath = path.join(os.tmpdir(), `emma-stt-${id}.${ext}`);

  fs.writeFileSync(inputPath, audioBuffer);

  const python = resolvePython();

  try {
    const text = await runTranscription(python, inputPath);
    if (!text) {
      throw new LocalWhisperError("没识别到内容");
    }
    return text;
  } catch (error) {
    if (error instanceof LocalWhisperError) throw error;
    throw new LocalWhisperError(
      error instanceof Error ? error.message : "本地 Whisper 转写失败"
    );
  } finally {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
  }
}

function runTranscription(python: string, audioPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(python, [SCRIPT_PATH, audioPath], {
      cwd: process.cwd(),
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new LocalWhisperError(
            "找不到 Python。请安装 Python 3 并运行: pip3 install -r requirements-whisper.txt"
          )
        );
        return;
      }
      reject(error);
    });

    proc.on("close", (code) => {
      const text = stdout.trim();
      if (code === 0 && text) {
        resolve(text);
        return;
      }

      const detail = stderr.trim() || stdout.trim();
      if (detail.includes("faster-whisper")) {
        reject(
          new LocalWhisperError(
            "请先安装 faster-whisper: pip3 install -r requirements-whisper.txt"
          )
        );
        return;
      }

      reject(
        new LocalWhisperError(
          detail || `本地 Whisper 退出码 ${code ?? "unknown"}`
        )
      );
    });
  });
}
