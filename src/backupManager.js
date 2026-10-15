// src/backupManager.js — Gerenciador de histórico visual de versões e snapshots (.lccut)
const fs = require('fs');
const path = require('path');
const os = require('os');

let customBackupsDir = null;

function setBackupsDir(dir) {
  customBackupsDir = dir;
}

function getBackupsDir() {
  if (customBackupsDir) {
    if (!fs.existsSync(customBackupsDir)) {
      try { fs.mkdirSync(customBackupsDir, { recursive: true }); } catch (_) {}
    }
    return customBackupsDir;
  }
  const fallback = path.join(os.homedir(), '.leccorcut', 'backups');
  if (!fs.existsSync(fallback)) {
    try { fs.mkdirSync(fallback, { recursive: true }); } catch (_) {}
  }
  return fallback;
}

function saveBackup(project, label = 'Automático') {
  if (!project) return { ok: false, error: 'Projeto inválido' };
  const dir = getBackupsDir();
  const id = Date.now();
  const cleanLabel = String(label).replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚãõâêîôûçÇ ]/g, '_');
  const filename = `backup_${id}_${cleanLabel}.lccut`;
  const filePath = path.join(dir, filename);

  const payload = {
    id,
    filename,
    label: cleanLabel,
    date: new Date().toISOString(),
    clipsCount: (project.clips || []).length,
    textsCount: (project.texts || []).length,
    audiosCount: (project.audios || []).length,
    overlaysCount: (project.overlays || []).length,
    project
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');

  // Manter no máximo 50 backups, removendo os mais antigos
  pruneBackups(dir, 50);

  return {
    ok: true,
    id,
    filename,
    filePath,
    label: cleanLabel,
    date: payload.date,
    clipsCount: payload.clipsCount
  };
}

function listBackups() {
  const dir = getBackupsDir();
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.lccut'));
  const list = [];

  for (const f of files) {
    try {
      const full = path.join(dir, f);
      const content = fs.readFileSync(full, 'utf8');
      const data = JSON.parse(content);
      list.push({
        id: data.id || f,
        filename: f,
        filePath: full,
        label: data.label || 'Snapshot',
        date: data.date || fs.statSync(full).mtime.toISOString(),
        clipsCount: data.clipsCount ?? (data.project?.clips?.length || 0),
        textsCount: data.textsCount ?? (data.project?.texts?.length || 0),
        audiosCount: data.audiosCount ?? (data.project?.audios?.length || 0),
        overlaysCount: data.overlaysCount ?? (data.project?.overlays?.length || 0)
      });
    } catch (_) {}
  }

  // Ordenar do mais novo para o mais antigo
  list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return list;
}

function restoreBackup(identifier) {
  const dir = getBackupsDir();
  const idStr = String(identifier || '');
  let targetFile = null;

  if (fs.existsSync(idStr)) {
    targetFile = idStr;
  } else {
    const direct = path.join(dir, idStr);
    if (fs.existsSync(direct)) {
      targetFile = direct;
    } else {
      // Buscar por id ou substring do nome
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.lccut'));
      const found = files.find(f => f.includes(idStr));
      if (found) targetFile = path.join(dir, found);
    }
  }

  if (!targetFile || !fs.existsSync(targetFile)) {
    return { ok: false, error: 'Backup não encontrado' };
  }

  try {
    const content = fs.readFileSync(targetFile, 'utf8');
    const data = JSON.parse(content);
    return {
      ok: true,
      id: data.id,
      label: data.label,
      date: data.date,
      project: data.project || data
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function deleteBackup(identifier) {
  const dir = getBackupsDir();
  const idStr = String(identifier || '');
  const direct = path.join(dir, idStr);
  let fileToDelete = null;

  if (fs.existsSync(direct)) fileToDelete = direct;
  else {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.lccut'));
    const found = files.find(f => f.includes(idStr));
    if (found) fileToDelete = path.join(dir, found);
  }

  if (fileToDelete && fs.existsSync(fileToDelete)) {
    try {
      fs.unlinkSync(fileToDelete);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  return { ok: false, error: 'Arquivo não localizado' };
}

function pruneBackups(dir, maxCount = 50) {
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.lccut'))
      .map(f => ({ name: f, path: path.join(dir, f), time: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (files.length > maxCount) {
      files.slice(maxCount).forEach(item => {
        try { fs.unlinkSync(item.path); } catch (_) {}
      });
    }
  } catch (_) {}
}

module.exports = {
  setBackupsDir,
  getBackupsDir,
  saveBackup,
  listBackups,
  restoreBackup,
  deleteBackup
};
