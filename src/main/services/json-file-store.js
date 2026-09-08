'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Serialize the complete read-modify-write transaction, not just the final write.
class JsonFileStore {
  constructor({ filePath, defaults, normalize = value => value }) {
    this.filePath = filePath;
    this.defaults = defaults;
    this.normalize = normalize;
    this.tail = Promise.resolve();
  }
  read() {
    try { return this.normalize(JSON.parse(fs.readFileSync(this.filePath(), 'utf8'))); }
    catch (error) {
      if (error.code === 'ENOENT') return this.normalize(structuredClone(this.defaults));
      throw error;
    }
  }
  update(change) {
    const operation = async () => {
      const next = this.normalize(await change(this.read()));
      const file = this.filePath();
      const temporary = file + '.' + randomUUID() + '.tmp';
      await fsp.mkdir(path.dirname(file), { recursive: true });
      let handle;
      let ownsTemporary = false;
      try {
        handle = await fsp.open(temporary, 'wx');
        ownsTemporary = true;
        await handle.writeFile(JSON.stringify(next, null, 2), 'utf8');
        await handle.sync();
        await handle.close(); handle = null;
        await fsp.rename(temporary, file);
      } finally {
        await handle?.close();
        if (ownsTemporary) await fsp.rm(temporary, { force: true });
      }
      return next;
    };
    const result = this.tail.then(operation);
    this.tail = result.catch(() => {});
    return result;
  }
}
module.exports = { JsonFileStore };
