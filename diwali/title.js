// "Happy Diwali" + handle, drawn on a 2D canvas over the video so it stays
// readable (not mirrored). As the spark value passes conf.showAt the diya
// flame lights, "Diwali" writes itself on left to right with sparks at the
// writing edge, a swash underline follows and the handle fades in.

import * as THREE from 'three';
import { seededRandom } from '../shared/app.js';

export function createTitle(titleCanvas, conf) {
  const titleRandom = seededRandom(7);
  const rand = (min, max) => min + (max - min) * titleRandom();
  const smooth = (x) => x * x * (3 - 2 * x);

  const titleContext = titleCanvas.getContext('2d');
  const titleBuffer = document.createElement('canvas');
  const bufferContext = titleBuffer.getContext('2d');
  let titleLevel = 0;          // 0..1 eased reveal
  let titleOn = false;

  const twinkles = Array.from({ length: 16 }, () => ({
    x: rand(-0.15, 1.15), y: rand(-0.2, 1.25), speed: rand(2, 5), phase: rand(0, 6.3), size: rand(0.5, 1.2),
  }));

  function goldFill(context, top, bottom) {
    const gradient = context.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, '#fff6c2');
    gradient.addColorStop(0.35, '#ffd84a');
    gradient.addColorStop(0.7, '#f7a10f');
    gradient.addColorStop(1, '#ffe27a');
    return gradient;
  }

  function drawFlame(context, x, y, height, flicker) {
    const width = height * 0.42;
    context.save();
    context.translate(x, y);
    context.scale(1 + 0.04 * flicker, 1 - 0.05 * flicker);
    context.beginPath();
    context.moveTo(0, 0);
    context.bezierCurveTo(-width, -height * 0.25, -width * 0.35, -height * 0.7, 0.05 * width, -height);
    context.bezierCurveTo(width * 0.2, -height * 0.62, width, -height * 0.32, 0, 0);
    const gradient = context.createLinearGradient(0, 0, 0, -height);
    gradient.addColorStop(0, '#e8201a');
    gradient.addColorStop(0.45, '#ff7a12');
    gradient.addColorStop(1, '#ffe35a');
    context.fillStyle = gradient;
    context.fill();
    // inner core
    context.beginPath();
    context.ellipse(0.02 * width, -height * 0.3, width * 0.22, height * 0.22, 0, 0, Math.PI * 2);
    context.fillStyle = 'rgba(255,240,170,0.85)';
    context.fill();
    context.restore();
  }

  function drawStar(context, x, y, radius) {
    context.beginPath();
    for (let k = 0; k < 8; k++) {
      const r = k % 2 ? radius * 0.22 : radius;
      const angle = (k / 8) * Math.PI * 2;
      context.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    }
    context.closePath();
    context.fill();
  }

  function update(dt, time, sparkValue) {
    if (sparkValue > conf.showAt) titleOn = true;
    else if (sparkValue < conf.hideAt) titleOn = false;
    titleLevel = THREE.MathUtils.clamp(
      titleLevel + (titleOn ? dt / conf.revealSeconds : -dt / 0.45), 0, 1);

    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    const width = Math.round(window.innerWidth * pixelRatio);
    const height = Math.round(window.innerHeight * pixelRatio);
    if (titleCanvas.width !== width || titleCanvas.height !== height) {
      titleCanvas.width = width;
      titleCanvas.height = height;
    }
    titleContext.clearRect(0, 0, width, height);
    if (titleLevel <= 0) return;

    // ---- layout: size "Diwali" to fit the column, everything else follows it
    let bigSize = conf.size * height;
    titleContext.font = `700 ${bigSize}px "Diwali Display", Georgia, serif`;
    const fitWidth = titleContext.measureText(conf.diwali).width;
    bigSize *= Math.min(1, (conf.maxWidth * width) / fitWidth);
    const scriptSize = bigSize * 0.78;
    const bigFont = `700 ${bigSize}px "Diwali Display", Georgia, serif`;
    const scriptFont = `${scriptSize}px "Diwali Script", cursive`;
    bufferContext.font = bigFont;
    const diwaliWidth = bufferContext.measureText(conf.diwali).width;

    const pad = bigSize * 0.7;
    const blockWidth = diwaliWidth + pad * 2;
    const blockHeight = bigSize * 2.35 + pad;
    if (titleBuffer.width !== Math.ceil(blockWidth) || titleBuffer.height !== Math.ceil(blockHeight)) {
      titleBuffer.width = Math.ceil(blockWidth);
      titleBuffer.height = Math.ceil(blockHeight);
    }
    const ctx = bufferContext;
    ctx.clearRect(0, 0, titleBuffer.width, titleBuffer.height);
    const left = pad;
    const happyBaseline = pad * 0.4 + scriptSize * 0.85;
    const diwaliBaseline = happyBaseline + bigSize * 0.92;
    const handleY = diwaliBaseline + bigSize * 0.62;

    const eased = smooth(titleLevel);
    const write = smooth(THREE.MathUtils.clamp((titleLevel - 0.12) / 0.75, 0, 1));
    const writeX = left - bigSize * 0.1 + (diwaliWidth + bigSize * 0.45) * write;

    ctx.lineJoin = 'round';

    // "Happy" fades and floats in first
    ctx.save();
    ctx.globalAlpha = smooth(THREE.MathUtils.clamp(titleLevel * 1.8, 0, 1));
    ctx.font = scriptFont;
    ctx.textBaseline = 'alphabetic';
    const happyX = left + diwaliWidth * 0.16;
    const happyY = happyBaseline + (1 - eased) * bigSize * 0.15;
    ctx.lineWidth = scriptSize * 0.07;
    ctx.strokeStyle = 'rgba(70,18,0,0.85)';
    ctx.strokeText(conf.happy, happyX, happyY);
    ctx.fillStyle = goldFill(ctx, happyY - scriptSize * 0.8, happyY + scriptSize * 0.2);
    ctx.fillText(conf.happy, happyX, happyY);
    ctx.restore();

    // "Diwali" + its swash underline write on behind a moving edge
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, happyBaseline - bigSize * 0.2, writeX, titleBuffer.height);
    ctx.clip();
    ctx.font = bigFont;
    ctx.lineWidth = bigSize * 0.06;
    ctx.strokeStyle = 'rgba(70,18,0,0.85)';
    ctx.strokeText(conf.diwali, left, diwaliBaseline);
    ctx.fillStyle = goldFill(ctx, diwaliBaseline - bigSize * 0.75, diwaliBaseline + bigSize * 0.05);
    ctx.fillText(conf.diwali, left, diwaliBaseline);

    const swashY = diwaliBaseline + bigSize * 0.16;
    ctx.beginPath();
    ctx.moveTo(left - bigSize * 0.05, swashY + bigSize * 0.02);
    ctx.bezierCurveTo(left + diwaliWidth * 0.3, swashY + bigSize * 0.2,
                      left + diwaliWidth * 0.75, swashY - bigSize * 0.08,
                      left + diwaliWidth + bigSize * 0.12, swashY - bigSize * 0.02);
    ctx.bezierCurveTo(left + diwaliWidth + bigSize * 0.32, swashY,
                      left + diwaliWidth + bigSize * 0.28, swashY - bigSize * 0.28,
                      left + diwaliWidth + bigSize * 0.12, swashY - bigSize * 0.2);
    ctx.lineCap = 'round';
    ctx.lineWidth = bigSize * 0.075;
    ctx.strokeStyle = 'rgba(70,18,0,0.8)';
    ctx.stroke();
    ctx.lineWidth = bigSize * 0.035;
    ctx.strokeStyle = goldFill(ctx, swashY - bigSize * 0.3, swashY + bigSize * 0.2);
    ctx.stroke();
    ctx.restore();

    // shimmer band sweeping across the gold
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    const sweep = ((time * 0.35) % 1.6 - 0.3) * titleBuffer.width;
    const shine = ctx.createLinearGradient(sweep - bigSize, 0, sweep + bigSize, titleBuffer.height * 0.4);
    shine.addColorStop(0, 'rgba(255,255,255,0)');
    shine.addColorStop(0.5, 'rgba(255,255,240,0.55)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.fillRect(0, 0, titleBuffer.width, titleBuffer.height);
    ctx.restore();

    // diya flame lights first, sitting in front of the D like the reference
    const flicker = Math.sin(time * 19) * Math.sin(time * 7.7);
    ctx.save();
    ctx.globalAlpha = smooth(THREE.MathUtils.clamp(titleLevel * 3, 0, 1));
    drawFlame(ctx, left - bigSize * 0.2, diwaliBaseline - bigSize * 0.08, bigSize * 0.62, flicker);
    ctx.restore();

    // handle
    ctx.save();
    ctx.globalAlpha = smooth(THREE.MathUtils.clamp((titleLevel - 0.7) / 0.3, 0, 1));
    const handleSize = Math.max(11 * pixelRatio, bigSize * 0.2);
    ctx.font = `600 ${handleSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${handleSize * 0.12}px`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff8e8';
    ctx.shadowColor = 'rgba(60,15,0,0.9)';
    ctx.shadowBlur = handleSize * 0.4;
    ctx.fillText(conf.handle, left + diwaliWidth / 2, handleY);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.restore();

    // ---- put it on screen with a warm glow
    const scale = 0.9 + 0.1 * eased;
    const drawWidth = titleBuffer.width * scale;
    const drawHeight = titleBuffer.height * scale;
    const x = conf.x * width - drawWidth / 2;
    const y = conf.y * height - drawHeight / 2;
    const glowPulse = 0.85 + 0.15 * Math.sin(time * 3);
    titleContext.save();
    titleContext.shadowColor = `rgba(255,120,10,${0.95 * eased})`;
    titleContext.shadowBlur = bigSize * 0.45 * glowPulse;
    titleContext.drawImage(titleBuffer, x, y, drawWidth, drawHeight);
    titleContext.shadowColor = `rgba(255,220,90,${0.8 * eased})`;
    titleContext.shadowBlur = bigSize * 0.12;
    titleContext.drawImage(titleBuffer, x, y, drawWidth, drawHeight);
    titleContext.restore();

    // sparks riding the writing edge, and twinkles around the block
    titleContext.save();
    titleContext.globalCompositeOperation = 'lighter';
    const toScreenX = (bufferX) => x + bufferX * scale;
    const toScreenY = (bufferY) => y + bufferY * scale;
    if (write > 0.01 && write < 0.99) {
      for (let k = 0; k < 14; k++) {
        const sx = toScreenX(writeX + rand(-0.25, 0.35) * bigSize);
        const sy = toScreenY(diwaliBaseline - rand(0, 1.0) * bigSize);
        titleContext.fillStyle = titleRandom() < 0.5 ? 'rgba(255,240,180,0.95)' : 'rgba(255,150,40,0.9)';
        titleContext.beginPath();
        titleContext.arc(sx, sy, rand(1, 3) * pixelRatio, 0, Math.PI * 2);
        titleContext.fill();
      }
    }
    titleContext.fillStyle = 'rgba(255,236,170,0.95)';
    for (const star of twinkles) {
      const twinkle = Math.max(0, Math.sin(time * star.speed + star.phase));
      const alpha = twinkle * twinkle * THREE.MathUtils.clamp((titleLevel - 0.4) / 0.4, 0, 1);
      if (alpha < 0.02) continue;
      titleContext.globalAlpha = alpha;
      drawStar(titleContext, toScreenX(left + star.x * diwaliWidth), toScreenY(star.y * titleBuffer.height),
               star.size * bigSize * 0.11);
    }
    titleContext.restore();
  }

  return { update };
}
