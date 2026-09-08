'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const { prepareSubtitleImage } = require('../../../src/main/services/subtitle-image-preprocessor');
function canvas() { const data = Buffer.alloc(240 * 120 * 4); for (let o = 3; o < data.length; o += 4) data[o] = 255; return { data, width: 240, height: 120, pixelOrder: 'rgba' }; }
function rect(image, x, y, w, h, color = [255,255,255,255]) { for (let yy=y; yy<y+h; yy++) for (let xx=x; xx<x+w; xx++) for (let c=0;c<4;c++) image.data[(yy*image.width+xx)*4+c]=color[c]; }
function textRow(image,y=50) { for(let x=80;x<=160;x+=20) rect(image,x,y,10,28); return image; }
function read(image) { return PNG.sync.read(prepareSubtitleImage(image)); }
function ink(image) { let total=0; for(let o=0;o<image.data.length;o+=4) if(image.data[o]<128)total++; return total; }
test('background blobs and disconnected lower fragments do not alter the subtitle mask',()=>{ const clean=textRow(canvas()), noisy=textRow(canvas());rect(noisy,0,0,65,42);rect(noisy,10,92,25,28);rect(noisy,170,108,4,3);assert.deepEqual(prepareSubtitleImage(noisy),prepareSubtitleImage(clean)); });
test('punctuation, apostrophes and dots above lowercase stems survive filtering',()=>{const plain=textRow(canvas()), marked=textRow(canvas());rect(marked,184,74,3,3);rect(marked,123,42,3,4);const a=read(plain),b=read(marked);assert.equal(ink(b)-ink(a),21);});
test('both subtitle lines remain in their original order and spacing',()=>{const image=textRow(canvas(),20);textRow(image,75);const out=read(image);assert.equal(ink(out),10*10*28);assert.ok(out.height>80);});
test('yellow RGBA and Electron BGRA inputs produce the same dark text and white border',()=>{const rgba=canvas();for(let x=80;x<=160;x+=20)rect(rgba,x,50,10,28,[255,210,20,255]);const bgra={...rgba,data:Buffer.from(rgba.data),pixelOrder:'bgra'};for(let o=0;o<bgra.data.length;o+=4)[bgra.data[o],bgra.data[o+2]]=[bgra.data[o+2],bgra.data[o]];assert.deepEqual(prepareSubtitleImage(bgra),prepareSubtitleImage(rgba));const out=read(rgba);assert.equal(out.data[0],255);assert.ok(ink(out)>0);});
test('blank and transparent frames stay blank; an isolated character is retained',()=>{const blank=canvas();assert.equal(ink(read(blank)),0);rect(blank,80,50,10,28,[255,255,255,0]);assert.equal(ink(read(blank)),0);rect(blank,80,50,10,28);assert.equal(ink(read(blank)),280);});
test('large and small letters are normalized to a bounded OCR input',()=>{const large=canvas();for(let x=80;x<=160;x+=20)rect(large,x,20,10,60);const small=canvas();for(let x=80;x<=160;x+=20)rect(small,x,50,4,10);assert.ok(read(large).height<80);assert.ok(read(small).height>30);});
test('rejects incomplete or invalid bitmap data',()=>{for(const input of [{},{width:-1,height:5,data:[]},{width:2,height:2,data:Buffer.alloc(2)}])assert.throws(()=>prepareSubtitleImage(input),/Invalid subtitle bitmap/);});
