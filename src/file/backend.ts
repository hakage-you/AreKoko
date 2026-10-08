// FileBackend（読み書きの抽象）と File System Access API / ダウンロードによる実装。
// 詳細設計UI 2.1、設計 10章。

declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite';
  }

  interface FileSystemHandle {
    queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  }

  interface OpenFilePickerOptions {
    multiple?: boolean;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
    excludeAcceptAllOption?: boolean;
  }

  interface SaveFilePickerOptions {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
    excludeAcceptAllOption?: boolean;
  }

  interface Window {
    showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  }
}

export interface FileStat {
  lastModified: number;
}

export interface FileBackend {
  readonly name: string;
  readonly canOverwrite: boolean;
  read(): Promise<{ text: string } & FileStat>;
  stat(): Promise<FileStat>;
  write(text: string): Promise<FileStat>;
}

/**
 * File System Access API（showOpenFilePicker）がブラウザで利用可能か判定する。
 */
export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

/**
 * File System Access API の FileSystemFileHandle を包むバックエンド（Chrome・Edge 等）。
 */
export class FsAccessBackend implements FileBackend {
  readonly canOverwrite = true;

  constructor(readonly handle: FileSystemFileHandle) {}

  get name(): string {
    return this.handle.name;
  }

  async read(): Promise<{ text: string } & FileStat> {
    const file = await this.handle.getFile();
    const text = await file.text();
    return { text, lastModified: file.lastModified };
  }

  async stat(): Promise<FileStat> {
    const file = await this.handle.getFile();
    return { lastModified: file.lastModified };
  }

  async write(text: string): Promise<FileStat> {
    const writable = await this.handle.createWritable();
    await writable.write(text);
    await writable.close();
    const file = await this.handle.getFile();
    return { lastModified: file.lastModified };
  }
}

/**
 * 上書き不可な環境向けのダウンロードによるバックエンド。
 */
export class DownloadBackend implements FileBackend {
  readonly canOverwrite = false;

  constructor(readonly name: string) {}

  async read(): Promise<{ text: string } & FileStat> {
    throw new Error('DownloadBackend は読み込みに対応していません');
  }

  async stat(): Promise<FileStat> {
    return { lastModified: 0 };
  }

  async write(text: string): Promise<FileStat> {
    if (typeof document !== 'undefined') {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = this.name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }
    return { lastModified: 0 };
  }
}

/** 書き込みの許可があるか確かめ、なければ求める。許可されたら true。 */
export async function ensureWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const descriptor: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
  try {
    if (handle.queryPermission && (await handle.queryPermission(descriptor)) === 'granted') return true;
    if (handle.requestPermission) return (await handle.requestPermission(descriptor)) === 'granted';
    return true; // 許可のAPIがない環境では、書くときに任せる
  } catch {
    return false;
  }
}

/**
 * 開くファイルを選択する。キャンセルされた場合は null を返す。
 * File System Access API がない環境では <input type="file"> で読み取り DownloadBackend を返す。
 */
export async function pickFileToOpen(): Promise<{ backend: FileBackend; text: string; stat: FileStat } | null> {
  if (supportsFileSystemAccess()) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'Arekoko JSON',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      const handle = handles[0];
      if (!handle) {
        return null;
      }
      const fsBackend = new FsAccessBackend(handle);
      const { text, lastModified } = await fsBackend.read();
      // 開いた直後（利用者の操作の続き）に書き込みの許可を得ておく。後で自動保存のタイマーから
      // 初めて書こうとすると、操作のない状態で許可を求めることになり失敗するため。
      // 断られたら、保存は書き出し（ダウンロード）にする。
      const backend: FileBackend = (await ensureWritePermission(handle)) ? fsBackend : new DownloadBackend(handle.name);
      return { backend, text, stat: { lastModified } };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return null;
      }
      throw err;
    }
  }

  if (typeof document === 'undefined') {
    return null;
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const text = await file.text();
        const stat: FileStat = { lastModified: file.lastModified };
        const backend = new DownloadBackend(file.name);
        resolve({ backend, text, stat });
      } catch (err) {
        reject(err);
      }
    };

    input.oncancel = () => {
      input.remove();
      resolve(null);
    };

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * 保存先ファイルを選択する。キャンセルされた場合は null を返す。
 * File System Access API がない環境では DownloadBackend を返す。
 */
export async function pickFileToSave(suggestedName: string): Promise<FileBackend | null> {
  if (supportsFileSystemAccess()) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'Arekoko JSON',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      return new FsAccessBackend(handle);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return null;
      }
      throw err;
    }
  }

  return new DownloadBackend(suggestedName);
}
