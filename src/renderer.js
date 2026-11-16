/* 图片本身由 Canvas 绘制，独立于编辑器的布局和屏幕尺寸。 */
(() => {
  'use strict';
  const WIDTH = 1376;
  const HEIGHT = 928;
  const FONT = '"Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif';

  function path(ctx, x, y, w, h, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
  }

  function cover(ctx, image, x, y, w, h, focus = 0.5) {
    if (!image) return;
    const iw = image.naturalWidth || image.width;
    const ih = image.naturalHeight || image.height;
    const ratio = Math.max(w / iw, h / ih);
    const sw = w / ratio;
    const sh = h / ratio;
    ctx.drawImage(image, (iw - sw) / 2, (ih - sh) * focus, sw, sh, x, y, w, h);
  }

  function text(ctx, value, x, y, options = {}) {
    const { size = 16, weight = 400, color = '#17191e', maxWidth, minSize = size, italic = false } = options;
    let currentSize = size;
    const setFont = () => { ctx.font = `${italic ? 'italic ' : ''}${weight} ${currentSize}px ${FONT}`; };
    setFont();
    let content = String(value);
    if (maxWidth) {
      while (ctx.measureText(content).width > maxWidth && currentSize > minSize) {
        currentSize -= 1;
        setFont();
      }
      if (ctx.measureText(content).width > maxWidth) {
        while (content.length && ctx.measureText(content + '…').width > maxWidth) content = Array.from(content).slice(0, -1).join('');
        content += '…';
      }
    }
    ctx.fillStyle = color;
    ctx.fillText(content, x, y);
  }

  function wrappedText(ctx, value, x, y, maxWidth, options = {}) {
    const { size = 18, weight = 400, color = '#17191e', lineHeight = 27, maxLines = 3, italic = false } = options;
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`;
    const lines = [];
    let line = '';
    for (const character of Array.from(String(value))) {
      if (character === '\n') {
        lines.push(line);
        line = '';
      } else if (ctx.measureText(line + character).width > maxWidth && line) {
        lines.push(line);
        line = character;
      } else {
        line += character;
      }
    }
    if (line) lines.push(line);
    for (let index = 0; index < Math.min(lines.length, maxLines); index += 1) {
      const suffix = index === maxLines - 1 && lines.length > maxLines ? '…' : '';
      text(ctx, lines[index] + suffix, x, y + index * lineHeight, { size, weight, color, italic, maxWidth });
    }
    return Math.min(lines.length, maxLines) * lineHeight;
  }

  function gradient(ctx, x, y, h, stops) {
    const fill = ctx.createLinearGradient(x, y, x, y + h);
    stops.forEach(([offset, color]) => fill.addColorStop(offset, color));
    return fill;
  }

  function card(ctx, x, y, w, h, fill, radius = 33) {
    path(ctx, x, y, w, h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.52)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function pin(ctx, x, y, size, fill = '#dd4e60') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 24, size / 24);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.bezierCurveTo(-3, 8, -9, 2, -9, -4);
    ctx.arc(0, -4, 9, Math.PI, 0);
    ctx.bezierCurveTo(9, 2, 3, 8, 0, 12);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, -4, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function icon(ctx, image, x, y, size, fallback) {
    ctx.save();
    path(ctx, x, y, size, size, 14);
    ctx.clip();
    if (image) {
      cover(ctx, image, x, y, size, size);
    } else {
      ctx.fillStyle = '#ffffff33';
      ctx.fillRect(x, y, size, size);
      ctx.textAlign = 'center';
      text(ctx, fallback, x + size / 2, y + size / 2 + 11, { size: 29, color: '#fff', weight: 600 });
    }
    ctx.restore();
  }

  function drawSocial(ctx, kind, x, y, label) {
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(30,25,35,.10)';
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    if (kind === 'github') {
      // GitHub 标志轮廓；这里只绘制标志，不在导出图片中附加链接。
      ctx.scale(0.85, 0.85);
      const github = new Path2D('M 0 -12 C -6.6 -12 -12 -6.6 -12 0 C -12 5.3 -8.6 9.8 -3.8 11.4 C -3.2 11.5 -3 11.1 -3 10.8 L -3 8.6 C -6.3 9.3 -7 7 -7 7 C -7.5 5.6 -8.3 5.2 -8.3 5.2 C -9.4 4.5 -8.2 4.5 -8.2 4.5 C -7 4.6 -6.4 5.7 -6.4 5.7 C -5.3 7.4 -3.7 6.9 -3 6.6 C -2.9 5.9 -2.6 5.3 -2.3 5 C -4.9 4.7 -7.7 3.7 -7.7 -1 C -7.7 -2.4 -7.2 -3.6 -6.4 -4.5 C -6.5 -4.8 -7 -6.1 -6.3 -7.9 C -6.3 -7.9 -5.2 -8.2 -3 -6.7 C -1 -7.3 1 -7.3 3 -6.7 C 5.2 -8.2 6.3 -7.9 6.3 -7.9 C 7 -6.1 6.5 -4.8 6.4 -4.5 C 7.2 -3.6 7.7 -2.4 7.7 -1 C 7.7 3.7 4.9 4.7 2.3 5 C 2.7 5.4 3 6.1 3 7.1 L 3 10.8 C 3 11.1 3.2 11.5 3.8 11.4 C 8.6 9.8 12 5.3 12 0 C 12 -6.6 6.6 -12 0 -12 Z');
      ctx.fillStyle = '#26242a';
      ctx.fill(github);
    } else {
      ctx.textAlign = 'center';
      text(ctx, kind === 'x' ? '𝕏' : label, 0, 8, { size: kind === 'x' ? 25 : 15, weight: 500, maxWidth: 33 });
    }
    ctx.restore();
  }

  function drawTags(ctx, tags) {
    const colors = ['#206399', '#772199', '#263942', '#8e4b54', '#367d58'];
    const fills = ['rgba(236,249,255,.96)', 'rgba(249,236,255,.96)', 'rgba(219,247,249,.96)', 'rgba(255,236,239,.96)', 'rgba(231,248,235,.96)'];
    let x = 282;
    let y = 484;
    let row = 0;
    ctx.font = `650 13px ${FONT}`;
    for (const [index, tag] of tags.entries()) {
      const width = Math.min(281, ctx.measureText(tag).width + 24);
      if (x + width > 563) {
        row += 1;
        x = 282;
        y += 37;
      }
      if (row >= 2) break;
      path(ctx, x, y, width, 29, 15);
      ctx.fillStyle = fills[index % fills.length];
      ctx.fill();
      text(ctx, tag, x + 12, y + 19, { size: 13, weight: 650, color: colors[index % colors.length], maxWidth: width - 24 });
      x += width + 7;
    }
    return y + (tags.length ? 29 : 0);
  }

  function drawSmallCard(ctx, config, assets, x, width, kind) {
    const y = 500;
    const height = 258;
    const color = config.color;
    const base = gradient(ctx, x, y, height, [[0, color + '88'], [1, color + 'b5']]);
    card(ctx, x, y, width, height, base);
    ctx.save();
    path(ctx, x, y, width, height, 33);
    ctx.clip();
    if (assets[kind + 'Background']) {
      cover(ctx, assets[kind + 'Background'], x, y, width, height);
      ctx.fillStyle = color + '40';
      ctx.fillRect(x, y, width, height);
    }
    ctx.fillStyle = kind === 'project' ? 'rgba(14,58,113,.46)' : 'rgba(145,112,29,.46)';
    ctx.fillRect(x, 654, width, 104);
    ctx.restore();

    const images = config.icons.map((key, index) => assets[kind + 'Icon' + index] || assets[key]);
    if (kind === 'project') {
      icon(ctx, images[0], x + 42, 550, 56, '◌');
      text(ctx, '←', x + 113, 587, { size: 27, color: '#ffffffa8' });
      icon(ctx, images[1], x + 145, 550, 56, '⌘');
    } else {
      images.forEach((image, index) => icon(ctx, image, x + 29 + index * 68, 554, 48, ['▦', '◉', '♫'][index]));
    }
    const ink = kind === 'project' ? '#f5fbff' : '#302919';
    text(ctx, config.eyebrow, x + 24, 694, { size: 13, weight: 600, color: ink, maxWidth: width - 48 });
    wrappedText(ctx, config.title, x + 24, 723, width - 48, { size: 21, weight: 800, color: ink, lineHeight: 25, maxLines: 1 });
    text(ctx, config.subtitle, x + 24, 747, { size: 15, weight: 600, color: ink, maxWidth: width - 48 });
  }

  function render(canvas, state, assets, map, scale = 1) {
    canvas.width = WIDTH * scale;
    canvas.height = HEIGHT * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.imageSmoothingQuality = 'high';
    const background = document.createElement('canvas');
    background.width = canvas.width;
    background.height = canvas.height;
    const bg = background.getContext('2d');
    bg.scale(scale, scale);
    bg.fillStyle = gradient(bg, 0, 0, HEIGHT, [[0, '#9bb0c8'], [.46, '#ecc0b4'], [.52, '#7f98aa'], [1, '#608198']]);
    bg.fillRect(0, 0, WIDTH, HEIGHT);
    if (state.appearance.backgroundMode === 'image') cover(bg, assets.background, 0, 0, WIDTH, HEIGHT, state.appearance.backgroundFocus / 100);
    bg.fillStyle = `rgba(9,15,25,${state.appearance.darkness / 100})`;
    bg.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.drawImage(background, 0, 0, WIDTH, HEIGHT);

    ctx.save();
    ctx.shadowColor = 'rgba(7,18,31,.28)';
    ctx.shadowBlur = 30 * scale;
    ctx.shadowOffsetY = 12 * scale;
    path(ctx, 208, 114, 962, 690, 10);
    ctx.fillStyle = '#a7acb033';
    ctx.fill();
    ctx.restore();
    ctx.save();
    path(ctx, 208, 114, 962, 690, 10);
    ctx.clip();
    ctx.filter = `blur(${state.appearance.blur * scale}px)`;
    ctx.drawImage(background, 0, 0, WIDTH, HEIGHT);
    ctx.filter = 'none';
    const opacity = state.appearance.glass / 100;
    ctx.fillStyle = gradient(ctx, 208, 114, 690, [[0, `rgba(221,223,236,${opacity})`], [1, `rgba(181,179,192,${opacity * 0.87})`]]);
    ctx.fillRect(208, 114, 962, 690);
    // 卡片后面的暗影与暖色高光保留原参考图的磨砂层次。
    const shade = ctx.createRadialGradient(710, 650, 10, 710, 650, 365);
    shade.addColorStop(0, 'rgba(13,25,35,.55)');
    shade.addColorStop(1, 'rgba(13,25,35,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(208, 114, 962, 690);
    ctx.restore();
    path(ctx, 208, 114, 962, 690, 10);
    ctx.strokeStyle = 'rgba(255,255,255,.27)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ['#ff655f', '#ffbd43', '#36cb56'].forEach((fill, index) => {
      ctx.beginPath();
      ctx.arc(256 + index * 22, 149, 7.2, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    });
    text(ctx, state.appearance.windowTitle, 331, 154, { size: 14, weight: 650, color: '#3c434c', maxWidth: 590 });

    card(ctx, 248, 174, 345, 584, gradient(ctx, 248, 174, 584, [[0, 'rgba(237,198,185,.79)'], [.63, 'rgba(239,210,217,.63)'], [1, 'rgba(194,212,217,.58)']]));
    ctx.save();
    path(ctx, 249, 175, 343, 582, 32);
    ctx.clip();
    cover(ctx, assets.cover, 249, 175, 343, 152, state.profile.coverFocus / 100);
    if (assets.profileBackground) {
      cover(ctx, assets.profileBackground, 249, 327, 343, 430);
      ctx.fillStyle = 'rgba(247,226,233,.55)';
      ctx.fillRect(249, 327, 343, 430);
    }
    ctx.restore();

    ctx.save();
    ctx.shadowColor = '#25323d20';
    ctx.shadowBlur = 7 * scale;
    ctx.shadowOffsetY = 2 * scale;
    ctx.beginPath();
    ctx.arc(333, 329, 51, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(333, 329, 48.5, 0, Math.PI * 2);
    ctx.clip();
    cover(ctx, assets.avatar, 284.5, 280.5, 97, 97);
    ctx.restore();

    text(ctx, state.profile.name, 282, 433, { size: 36, weight: 850, color: '#050608', maxWidth: 279, minSize: 24 });
    text(ctx, state.profile.handle, 282, 462, { size: 16, color: '#525258', maxWidth: 279 });
    const tagsBottom = drawTags(ctx, state.profile.tags);
    const signatureY = Math.max(568, tagsBottom + 46);
    const signatureHeight = wrappedText(ctx, state.profile.signature ? `“ ${state.profile.signature} ”` : '', 282, signatureY, 279, { size: 21, weight: 750, italic: true, lineHeight: 29, maxLines: 3 });
    const socialY = Math.min(712, Math.max(630, signatureY + signatureHeight + 22));
    state.profile.socials.slice(0, 4).forEach((label, index) => {
      const kind = label.toLowerCase() === 'github' ? 'github' : label.toLowerCase() === 'x' ? 'x' : 'text';
      drawSocial(ctx, kind, 304 + index * 57, socialY, label);
    });

    card(ctx, 609, 174, 505, 309, '#e2ebdb');
    ctx.save();
    path(ctx, 610, 175, 503, 307, 32);
    ctx.clip();
    cover(ctx, map.image, 609, 174, 505, 309);
    if (state.location.mode === 'online') {
      ctx.beginPath();
      ctx.arc(861.5, 319.5, 17, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffffb5';
      ctx.fill();
      // 图钉尖端严格落在地图的地理中心，而不是用图标中心充当位置。
      pin(ctx, 861.5, 313.5, 30);
    }
    ctx.fillStyle = gradient(ctx, 609, 174, 309, [[0, '#ffffff00'], [.40, '#ffffff00'], [.70, '#ffffff78'], [1, '#fffffff4']]);
    ctx.fillRect(609, 174, 505, 309);
    path(ctx, 639, 355, 83, 23, 11.5);
    ctx.fillStyle = '#ffffffec';
    ctx.fill();
    pin(ctx, 651, 366, 11);
    text(ctx, state.location.mode === 'online' ? '当前坐标' : '我的位置', 663, 371, { size: 10, weight: 650, color: '#b93643' });
    text(ctx, state.location.title, 638, 425, { size: 36, weight: 850, maxWidth: 444, minSize: 25 });
    text(ctx, state.location.caption, 638, 450, { size: 17, weight: 500, maxWidth: 444 });
    if (map.attribution) text(ctx, map.attribution, 799, 473, { size: 10, color: '#4d5755', maxWidth: 294 });
    ctx.restore();

    drawSmallCard(ctx, state.project, assets, 609, 244, 'project');
    drawSmallCard(ctx, state.hobbies, assets, 869, 244, 'hobbies');
    return canvas;
  }

  window.ProfileRenderer = Object.freeze({ render, width: WIDTH, height: HEIGHT, cover, pin });
})();
