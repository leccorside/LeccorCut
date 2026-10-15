'use strict';
/**
 * proxyManager.js — Fase 10: Sistema de Mídia Proxy e Pré-Render
 *
 * Gera versões leves (720p/540p, H.264 ultrafast) de mídias pesadas (4K/8K)
 * em segundo plano para reprodução fluida na timeline.
 * Equivalente ao sistema de proxy do CapCut (Cache/frameThumbnail + mediainfo).
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const EventEmitter = require('events');

class ProxyManager extends EventEmitter {
  constructor() {
    super();
    this._proxyDir = null;
    this._jobs = new Map();        // filePath -> { promise, proc }
    this._proxyMap = new Map();    // filePath -> proxyPath
    this._ffmpegPath = null;
  }

  /** Inicializa o gerenciador com o diretório de cache e o caminho do FFmpeg. */
  init(ffmpegPath, cacheDir) {
    this._ffmpegPath = ffmpegPath;
    this._proxyDir = path.join(cacheDir, 'proxy_media');
    if (!fs.existsSync(this._proxyDir)) {
      fs.mkdirSync(this._proxyDir, { recursive: true });
    }
  }

  /** Gera um hash curto e estável para o caminho do arquivo de origem. */
  _fileHash(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex').slice(0, 12);
  }

  /** Retorna o caminho do proxy gerado para um arquivo fonte. */
  getProxyPath(srcPath) {
    const hash = this._fileHash(srcPath);
    return path.join(this._proxyDir, `proxy_${hash}.mp4`);
  }

  /** Verifica se um proxy já existe em disco para o arquivo. */
  hasProxy(srcPath) {
    const proxyPath = this.getProxyPath(srcPath);
    return fs.existsSync(proxyPath);
  }

  /**
   * Inicia a geração do proxy para um arquivo em background.
   * Emite evento 'proxy-progress' com { srcPath, percent, done, error, proxyPath }.
   *
   * @param {string} srcPath - Caminho do arquivo original (4K/8K).
   * @param {Object} opts - Opções { targetHeight: 720|540, crf: 28 }
   * @returns {Promise<string>} - Caminho do arquivo proxy gerado.
   */
  generateProxy(srcPath, opts = {}) {
    const targetH = opts.targetHeight || 720;
    const crf = opts.crf || 28;
    const proxyPath = this.getProxyPath(srcPath);

    // Já gerado: retorna imediatamente
    if (fs.existsSync(proxyPath)) {
      this._proxyMap.set(srcPath, proxyPath);
      return Promise.resolve(proxyPath);
    }

    // Já está sendo gerado: aguarda
    if (this._jobs.has(srcPath)) {
      return this._jobs.get(srcPath).promise;
    }

    const promise = new Promise((resolve, reject) => {
      // Escala para altura alvo mantendo a proporção, forçando dimensões pares
      const scaleFilter = `scale=-2:${targetH}`;

      const args = [
        '-v', 'error',
        '-i', srcPath,
        '-vf', scaleFilter,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', String(crf),
        '-c:a', 'aac', '-b:a', '96k',
        '-movflags', '+faststart',
        '-progress', 'pipe:1',
        '-y',
        proxyPath
      ];

      const proc = spawn(this._ffmpegPath, args);
      let duration = 0;
      let lastTime = 0;
      let stdoutBuf = '';

      // Captura duração total via stderr se disponível
      proc.stderr.on('data', (d) => {
        const s = d.toString();
        const dm = s.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
        if (dm) {
          duration = parseInt(dm[1], 10) * 3600 + parseInt(dm[2], 10) * 60 + parseFloat(dm[3]);
        }
      });

      // Lê o progresso via stdout (flag -progress pipe:1)
      proc.stdout.on('data', (d) => {
        stdoutBuf += d.toString();
        const lines = stdoutBuf.split('\n');
        stdoutBuf = lines.pop();
        for (const line of lines) {
          const m = line.match(/^out_time_us=(\d+)/);
          if (m) {
            lastTime = parseInt(m[1], 10) / 1000000;
            const percent = duration > 0 ? Math.min(99, Math.round(lastTime / duration * 100)) : 0;
            this.emit('proxy-progress', { srcPath, percent, done: false, proxyPath });
          }
        }
      });

      proc.on('error', (err) => {
        this._jobs.delete(srcPath);
        this.emit('proxy-progress', { srcPath, percent: 0, done: true, error: err.message, proxyPath: null });
        reject(err);
      });

      proc.on('close', (code) => {
        this._jobs.delete(srcPath);
        if (code === 0 && fs.existsSync(proxyPath)) {
          this._proxyMap.set(srcPath, proxyPath);
          this.emit('proxy-progress', { srcPath, percent: 100, done: true, proxyPath });
          resolve(proxyPath);
        } else {
          const msg = `Proxy falhou para ${srcPath} (código ${code})`;
          this.emit('proxy-progress', { srcPath, percent: 0, done: true, error: msg, proxyPath: null });
          reject(new Error(msg));
        }
      });
    });

    this._jobs.set(srcPath, { promise });
    return promise;
  }

  /**
   * Retorna estatísticas do diretório de cache de proxies.
   * @returns {{ count: number, totalBytes: number, totalMB: string, dir: string }}
   */
  getCacheStats() {
    if (!this._proxyDir || !fs.existsSync(this._proxyDir)) {
      return { count: 0, totalBytes: 0, totalMB: '0.00', dir: this._proxyDir };
    }
    const files = fs.readdirSync(this._proxyDir).filter(f => f.endsWith('.mp4'));
    let totalBytes = 0;
    for (const f of files) {
      try {
        totalBytes += fs.statSync(path.join(this._proxyDir, f)).size;
      } catch (_) {}
    }
    return {
      count: files.length,
      totalBytes,
      totalMB: (totalBytes / 1024 / 1024).toFixed(2),
      dir: this._proxyDir
    };
  }

  /**
   * Remove todos os arquivos proxy do cache.
   * @returns {{ removed: number, freedBytes: number }}
   */
  clearCache() {
    if (!this._proxyDir || !fs.existsSync(this._proxyDir)) {
      return { removed: 0, freedBytes: 0 };
    }
    const files = fs.readdirSync(this._proxyDir).filter(f => f.endsWith('.mp4'));
    let removed = 0;
    let freedBytes = 0;
    for (const f of files) {
      const fp = path.join(this._proxyDir, f);
      try {
        freedBytes += fs.statSync(fp).size;
        fs.unlinkSync(fp);
        removed++;
      } catch (_) {}
    }
    this._proxyMap.clear();
    return { removed, freedBytes };
  }

  /**
   * Remove o proxy de um arquivo específico.
   * @param {string} srcPath
   */
  deleteProxy(srcPath) {
    const proxyPath = this.getProxyPath(srcPath);
    if (fs.existsSync(proxyPath)) {
      try { fs.unlinkSync(proxyPath); } catch (_) {}
    }
    this._proxyMap.delete(srcPath);
  }

  /**
   * Retorna o caminho do proxy se disponível, ou o caminho original se não.
   * Útil para a lógica de reprodução na timeline.
   * @param {string} srcPath
   * @returns {string}
   */
  resolvePlaybackPath(srcPath) {
    if (this._proxyMap.has(srcPath)) return this._proxyMap.get(srcPath);
    const proxyPath = this.getProxyPath(srcPath);
    if (fs.existsSync(proxyPath)) {
      this._proxyMap.set(srcPath, proxyPath);
      return proxyPath;
    }
    return srcPath;
  }

  /**
   * Lista todos os proxies disponíveis em cache.
   * @returns {Array<{ srcHash: string, proxyPath: string, sizeMB: string }>}
   */
  listProxies() {
    if (!this._proxyDir || !fs.existsSync(this._proxyDir)) return [];
    return fs.readdirSync(this._proxyDir)
      .filter(f => f.endsWith('.mp4'))
      .map(f => {
        const fp = path.join(this._proxyDir, f);
        let size = 0;
        try { size = fs.statSync(fp).size; } catch (_) {}
        return {
          srcHash: f.replace('proxy_', '').replace('.mp4', ''),
          proxyPath: fp,
          sizeMB: (size / 1024 / 1024).toFixed(2)
        };
      });
  }
}

module.exports = new ProxyManager();
