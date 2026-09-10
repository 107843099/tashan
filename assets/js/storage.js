/* Local project files stay in this browser. Backups contain only this library. */
(function (global) {
  'use strict';
  const DB_NAME = 'tashan-practice-library';
  const FORMAT = 'tashan-practice-library';
  const MB = 1024 * 1024;
  const LIMITS = { attachment: 20 * MB, coverFile: 5 * MB, total: 50 * MB, projects: 100 };
  const FILE_TYPES = {
    html: 'text/html', htm: 'text/html', zip: 'application/zip', md: 'text/markdown', markdown: 'text/markdown',
    txt: 'text/plain', json: 'application/json', pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif'
  };
  let connection;
  const error = message => new Error(message);
  const validId = id => typeof id === 'string' && /^local-[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(id);
  function requireId(id) {
    if (!validId(id)) throw error('本地项目 ID 无效，请重新保存项目。');
    return id;
  }
  function newId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return 'local-' + global.crypto.randomUUID();
    const random = new Uint32Array(3);
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') global.crypto.getRandomValues(random);
    else for (let i = 0; i < random.length; i++) random[i] = Math.floor(Math.random() * 0xffffffff);
    return 'local-' + Date.now().toString(36) + '-' + Array.from(random, n => n.toString(36)).join('-');
  }
  function plain(value, depth, seen) {
    if (depth > 32) throw error('项目资料层级过多，无法保存。');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object' || seen.has(value)) throw error('项目资料包含不支持的类型或循环引用。');
    const proto = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) throw error('项目资料需要使用普通对象、数组和文字。');
    seen.add(value);
    let result;
    if (Array.isArray(value)) result = value.map(item => plain(item, depth + 1, seen));
    else {
      result = {};
      for (const key of Object.keys(value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw error('项目资料包含不支持的字段。');
        if (value[key] !== undefined) result[key] = plain(value[key], depth + 1, seen);
      }
    }
    seen.delete(value);
    return result;
  }
  function fileInfo(file, field) {
    if (!file || typeof file !== 'object' || typeof file.name !== 'string' || !file.name.trim() || file.name.length > 255 || /[\\/\u0000-\u001f]/.test(file.name)) throw error('附件名称无效，请重新选择文件。');
    const match = /\.([a-z0-9]+)$/i.exec(file.name);
    const extension = match ? match[1].toLowerCase() : '';
    const type = FILE_TYPES[extension];
    if (!type || (field === 'coverFile' && !['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension))) throw error(field === 'coverFile' ? '封面仅支持 PNG、JPEG、WebP 或 GIF。' : '不支持此附件类型，请使用 HTML、ZIP、Markdown、文本、PDF、Office 文档或图片。');
    if (file.type !== undefined && typeof file.type !== 'string') throw error('附件格式信息无效。');
    // File choosers may report empty, text/plain or application/octet-stream for valid extensions.
    if (field === 'coverFile' && file.type && file.type !== type) throw error('封面格式与文件扩展名不一致。');
    return { name: file.name, type };
  }
  function normalize(record, isDraft) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw error('项目资料格式无效。');
    const metadata = {};
    for (const key of Object.keys(record)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw error('项目资料包含不支持的字段。');
      if (!['attachment', 'coverFile'].includes(key)) metadata[key] = record[key];
    }
    const result = plain(metadata, 0, new Set());
    if (new Blob([JSON.stringify(result)]).size > MB) throw error('单个项目的文字资料不能超过 1 MB。');
    if (!isDraft && result.id !== undefined) requireId(result.id);
    if (isDraft && result.id !== undefined && result.id !== '') requireId(result.id);
    for (const field of ['attachment', 'coverFile']) {
      if (record[field] === undefined || record[field] === null) continue;
      const info = fileInfo(record[field], field);
      const blob = record[field].blob;
      if (!(blob instanceof Blob)) throw error('附件内容无效，请重新选择文件。');
      if (field === 'coverFile' && blob.type && blob.type !== info.type) throw error('封面内容的格式与文件扩展名不一致。');
      if (blob.size > LIMITS[field]) throw error(field === 'coverFile' ? '封面不能超过 5 MB。' : '单个附件不能超过 20 MB。');
      result[field] = { ...info, blob };
    }
    return result;
  }
  function bytes(record) {
    if (!record) return 0;
    const metadata = { ...record };
    let size = 0;
    for (const field of ['attachment', 'coverFile']) {
      if (metadata[field]) size += metadata[field].blob.size;
      delete metadata[field];
    }
    return size + new Blob([JSON.stringify(metadata)]).size;
  }
  function capacity(projects, draft) {
    if (projects.length > LIMITS.projects) throw error('本地最多保存 100 个项目，请先导出备份并整理项目。');
    if (projects.reduce((sum, p) => sum + bytes(p), bytes(draft)) > LIMITS.total) throw error('本地资料总量不能超过 50 MB，请先导出备份并整理附件。');
  }
  function open() {
    if (!global.indexedDB) return Promise.reject(error('此浏览器暂不支持本地文件保存，请使用支持 IndexedDB 的浏览器。'));
    if (!connection) connection = new Promise((resolve, reject) => {
      const request = global.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onerror = () => { connection = null; reject(request.error || error('无法打开本地资料库。')); };
      request.onblocked = () => { connection = null; reject(error('另一个页面正在更新资料库，请关闭其他平台页面后重试。')); };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); connection = null; };
        resolve(db);
      };
    });
    return connection;
  }
  async function transaction(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['projects', 'meta'], mode);
      const stores = { projects: tx.objectStore('projects'), meta: tx.objectStore('meta') };
      let result, failure;
      const fail = reason => { failure = reason; try { tx.abort(); } catch (_) { reject(reason); } };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || error('本地资料保存未完成，请重试。'));
      tx.onerror = event => { failure = failure || event.target.error || tx.error; };
      try { operation(stores, value => { result = value; }, fail); } catch (reason) { fail(reason); }
    });
  }
  function snapshot(mode, operation) {
    return transaction(mode, (stores, done, fail) => {
      const projects = stores.projects.getAll();
      const draft = stores.meta.get('draft');
      let pending = 2;
      const loaded = () => {
        if (--pending) return;
        try { done(operation(projects.result, draft.result ? draft.result.value : null, stores)); }
        catch (reason) { fail(reason); }
      };
      projects.onsuccess = loaded;
      draft.onsuccess = loaded;
    });
  }
  async function encode(record) {
    if (!record) return null;
    const result = { ...record };
    for (const field of ['attachment', 'coverFile']) {
      if (!record[field]) continue;
      const file = record[field];
      const array = new Uint8Array(await file.blob.arrayBuffer());
      let binary = '';
      for (let index = 0; index < array.length; index += 0x4000) binary += String.fromCharCode.apply(null, array.subarray(index, index + 0x4000));
      result[field] = { name: file.name, type: file.type, base64: global.btoa(binary) };
    }
    return result;
  }
  function decode(record, isDraft) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw error('备份中的项目格式无效。');
    const result = { ...record };
    if (!isDraft) requireId(result.id);
    for (const field of ['attachment', 'coverFile']) {
      if (record[field] === undefined || record[field] === null) continue;
      const file = record[field];
      const info = fileInfo(file, field);
      if (typeof file.base64 !== 'string' || file.base64.length > Math.ceil(LIMITS[field] / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64)) throw error('备份中的附件内容无效或超过大小限制。');
      let binary;
      try { binary = global.atob(file.base64); } catch (_) { throw error('备份中的附件编码无效。'); }
      const array = Uint8Array.from(binary, char => char.charCodeAt(0));
      result[field] = { ...info, blob: new Blob([array], { type: info.type }) };
    }
    return normalize(result, isDraft);
  }
  global.PracticeStore = Object.freeze({
    list: () => snapshot('readonly', projects => projects.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))),
    get: async id => {
      requireId(id);
      return transaction('readonly', (stores, done) => { const request = stores.projects.get(id); request.onsuccess = () => done(request.result || null); });
    },
    put: async (record, options = {}) => {
      if (!options || typeof options !== 'object' || (options.clearDraft !== undefined && typeof options.clearDraft !== 'boolean')) throw error('项目保存选项无效。');
      const project = normalize(record, false);
      return snapshot('readwrite', (projects, draft, stores) => {
        if (!project.id) { do { project.id = newId(); } while (projects.some(p => p.id === project.id)); }
        const previous = projects.find(p => p.id === project.id);
        const now = new Date().toISOString();
        project.createdAt = previous ? previous.createdAt : project.createdAt || now;
        project.updatedAt = now;
        capacity(projects.filter(p => p.id !== project.id).concat(project), options.clearDraft ? null : draft);
        stores.projects.put(project);
        if (options.clearDraft) stores.meta.delete('draft');
        return project;
      });
    },
    remove: async id => { requireId(id); return transaction('readwrite', stores => stores.projects.delete(id)); },
    getDraft: () => snapshot('readonly', (_, draft) => draft),
    putDraft: async record => {
      const draft = normalize(record, true);
      return snapshot('readwrite', (projects, _, stores) => {
        capacity(projects, draft);
        stores.meta.put({ key: 'draft', value: draft });
        return draft;
      });
    },
    clearDraft: () => transaction('readwrite', stores => stores.meta.delete('draft')),
    exportAll: async () => {
      const data = await snapshot('readonly', (projects, draft) => ({ projects, draft }));
      const projects = [];
      for (const project of data.projects) projects.push(await encode(project));
      return new Blob([JSON.stringify({ format: FORMAT, version: 1, exportedAt: new Date().toISOString(), projects, draft: await encode(data.draft) }, null, 2)], { type: 'application/json' });
    },
    importBackup: async file => {
      if (!(file instanceof Blob) || file.size > 70 * MB) throw error('请选择小于 70 MB 的平台 JSON 备份文件。');
      let data;
      try { data = JSON.parse(await file.text()); } catch (_) { throw error('备份不是有效的 JSON 文件。'); }
      if (!data || data.format !== FORMAT || data.version !== 1 || !Array.isArray(data.projects) || data.projects.length > LIMITS.projects) throw error('此文件不是受支持的平台备份（版本 1）。');
      const projects = data.projects.map(project => {const decoded = decode(project, false); requireId(decoded.id); const now = new Date().toISOString(); if (!Number.isFinite(Date.parse(decoded.createdAt))) decoded.createdAt = now; if (!Number.isFinite(Date.parse(decoded.updatedAt))) decoded.updatedAt = decoded.createdAt; return decoded;});
      const draft = data.draft == null ? null : decode(data.draft, true);
      if (new Set(projects.map(p => p.id)).size !== projects.length) throw error('备份中存在重复的项目 ID，请检查备份文件。');
      capacity(projects, draft);
      return snapshot('readwrite', (existing, existingDraft, stores) => {
        const used = new Set(existing.map(p => p.id));
        const remapped = new Map();
        for (const project of projects) {
          if (used.has(project.id)) {
            const originalId = project.id;
            do { project.id = newId(); } while (used.has(project.id));
            remapped.set(originalId, project.id);
          }
          used.add(project.id);
        }
        if (!existingDraft && draft && remapped.has(draft.id)) draft.id = remapped.get(draft.id);
        const nextDraft = existingDraft || draft;
        capacity(existing.concat(projects), nextDraft);
        for (const project of projects) stores.projects.put(project);
        if (!existingDraft && draft) stores.meta.put({ key: 'draft', value: draft });
        return { count: projects.length };
      });
    }
  });
})(window);
