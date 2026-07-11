'use strict';

const fsPromises = require('node:fs/promises');
const pathModule = require('node:path');

function pad(value, length = 2) {
  return String(value).padStart(length, '0');
}

function createSampleFolderName(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`;
}

function nullableString(value) {
  return typeof value === 'string' ? value : null;
}

function nullableNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function nullableBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function nullableArea(area) {
  return {
    x: nullableNumber(area?.x),
    y: nullableNumber(area?.y),
    width: nullableNumber(area?.width),
    height: nullableNumber(area?.height)
  };
}

function createMetadata(sample) {
  return {
    createdAt: nullableString(sample.createdAt),
    appVersion: nullableString(sample.appVersion),
    captureMode: ['manual', 'automatic'].includes(sample.captureMode) ? sample.captureMode : null,
    tracking: {
      state: nullableString(sample.tracking?.state),
      reacquireCount: nullableNumber(sample.tracking?.reacquireCount),
      areaSource: ['manual', 'automatic'].includes(sample.tracking?.areaSource) ? sample.tracking.areaSource : null,
      lineCountEstimate: nullableNumber(sample.tracking?.lineCountEstimate),
      areaAdapted: nullableBoolean(sample.tracking?.areaAdapted),
      adaptationReason: nullableString(sample.tracking?.adaptationReason)
    },
    ocrArea: nullableArea(sample.ocrArea),
    screen: {
      width: nullableNumber(sample.screen?.width),
      height: nullableNumber(sample.screen?.height),
      scaleFactor: nullableNumber(sample.screen?.scaleFactor)
    },
    ocr: {
      text: nullableString(sample.ocr?.text),
      confidence: nullableNumber(sample.ocr?.confidence),
      durationMs: nullableNumber(sample.ocr?.durationMs)
    },
    decision: {
      accepted: nullableBoolean(sample.decision?.accepted),
      reason: nullableString(sample.decision?.reason),
      normalizedText: nullableString(sample.decision?.normalizedText)
    },
    translation: {
      requested: nullableBoolean(sample.translation?.requested),
      completed: nullableBoolean(sample.translation?.completed),
      durationMs: nullableNumber(sample.translation?.durationMs)
    }
  };
}

class OcrDiagnosticSampleService {
  constructor({ getUserDataPath, getAppVersion, fs = fsPromises, path = pathModule, now = () => new Date(), random = () => Math.random() }) {
    this.getUserDataPath = getUserDataPath;
    this.getAppVersion = getAppVersion;
    this.fs = fs;
    this.path = path;
    this.now = now;
    this.random = random;
    this.lastSample = null;
  }

  diagnosticsPath() {
    return this.path.join(this.getUserDataPath(), 'ocr-diagnostics');
  }

  recordCompletedCycle(sample) {
    if (!Buffer.isBuffer(sample?.sourceImage) || !Buffer.isBuffer(sample?.ocrInputImage)) return false;
    this.lastSample = {
      frameId: nullableNumber(sample.frameId),
      sourceImage: Buffer.from(sample.sourceImage),
      ocrInputImage: Buffer.from(sample.ocrInputImage),
      createdAt: new Date(this.now()).toISOString(),
      appVersion: this.getAppVersion(),
      captureMode: sample.captureMode,
      tracking: {
        state: nullableString(sample.tracking?.state),
        reacquireCount: nullableNumber(sample.tracking?.reacquireCount),
        areaSource: ['manual', 'automatic'].includes(sample.tracking?.areaSource) ? sample.tracking.areaSource : null,
        lineCountEstimate: nullableNumber(sample.tracking?.lineCountEstimate),
        areaAdapted: nullableBoolean(sample.tracking?.areaAdapted),
        adaptationReason: nullableString(sample.tracking?.adaptationReason)
      },
      ocrArea: nullableArea(sample.ocrArea),
      screen: {
        width: nullableNumber(sample.screen?.width),
        height: nullableNumber(sample.screen?.height),
        scaleFactor: nullableNumber(sample.screen?.scaleFactor)
      },
      ocr: {
        text: nullableString(sample.ocr?.text),
        confidence: nullableNumber(sample.ocr?.confidence),
        durationMs: nullableNumber(sample.ocr?.durationMs)
      },
      decision: { accepted: null, reason: null, normalizedText: null },
      translation: { requested: null, completed: null, durationMs: null }
    };
    return true;
  }

  updateLastCycle(frameId, update) {
    if (!this.lastSample || !Number.isFinite(frameId) || this.lastSample.frameId !== frameId || !update || typeof update !== 'object') return false;
    if (update.decision) {
      this.lastSample.decision = {
        accepted: nullableBoolean(update.decision.accepted),
        reason: nullableString(update.decision.reason),
        normalizedText: nullableString(update.decision.normalizedText)
      };
    }
    if (update.translation) {
      this.lastSample.translation = {
        requested: nullableBoolean(update.translation.requested),
        completed: nullableBoolean(update.translation.completed),
        durationMs: nullableNumber(update.translation.durationMs)
      };
    }
    return true;
  }

  async saveLastSample() {
    if (!this.lastSample) return { ok: false, error: 'NO_COMPLETED_OCR_SAMPLE' };
    const name = createSampleFolderName(this.now());
    const root = this.diagnosticsPath();
    const finalPath = this.path.join(root, name);
    const temporaryPath = this.path.join(root, `.${name}.tmp-${Math.floor(this.random() * 1e9)}`);
    try {
      await this.fs.mkdir(root, { recursive: true });
      await this.fs.mkdir(temporaryPath);
      await this.fs.writeFile(this.path.join(temporaryPath, 'source.png'), this.lastSample.sourceImage);
      await this.fs.writeFile(this.path.join(temporaryPath, 'ocr-input.png'), this.lastSample.ocrInputImage);
      await this.fs.writeFile(this.path.join(temporaryPath, 'metadata.json'), JSON.stringify(createMetadata(this.lastSample), null, 2), 'utf8');
      await this.fs.rename(temporaryPath, finalPath);
      return { ok: true };
    } catch (_error) {
      try { await this.fs.rm(temporaryPath, { recursive: true, force: true }); } catch (_) {}
      return { ok: false, error: 'SAVE_FAILED' };
    }
  }
}

module.exports = { OcrDiagnosticSampleService, createMetadata, createSampleFolderName };
