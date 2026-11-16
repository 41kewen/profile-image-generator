/* 取景只在用户确认后应用；未确认时不改变项目图片。 */
(() => {
  'use strict';
  const targets = {
    avatar: [1, 1, '头像'], cover: [343, 152, '顶部封面'],
    background: [1376, 928, '全景背景'], profileBackground: [343, 430, '简介背景'],
    mapImage: [505, 309, '地图截图'], projectBackground: [244, 258, '项目背景'],
    hobbiesBackground: [244, 258, '兴趣背景'],
  };
  let pending = null;
  const $ = (id) => document.getElementById(id);
  function select(image, slot) {
    if (pending) return Promise.reject(new Error('请先完成当前图片的取景。'));
    const [width, height, label] = targets[slot] || [1, 1, '卡片图标'];
    const dialog = $('crop-dialog');
    const canvas = $('crop-canvas');
    const ctx = canvas.getContext('2d');
    const iw = image.naturalWidth;
    const ih = image.naturalHeight;
    const aspect = width / height;
    const baseWidth = Math.min(iw, ih * aspect);
    const viewScale = Math.min((canvas.width - 72) / iw, (canvas.height - 72) / ih);
    const origin = { x: (canvas.width - iw * viewScale) / 2, y: (canvas.height - ih * viewScale) / 2 };
    let zoom = 1;
    let center = { x: iw / 2, y: ih / 2 };
    let drag;
    let settled = false;
    const previousFocus = document.activeElement;
    $('crop-title').textContent = `手动取景 · ${label}`;
    $('crop-dimensions').textContent = `原图 ${iw} × ${ih} · 目标比例 ${width}:${height}`;
    $('crop-zoom').value = '1';
    $('crop-zoom-value').value = '1.0×';

    function rectangle() {
      const w = baseWidth / zoom;
      const h = w / aspect;
      center.x = Math.max(w / 2, Math.min(iw - w / 2, center.x));
      center.y = Math.max(h / 2, Math.min(ih - h / 2, center.y));
      return { x: center.x - w / 2, y: center.y - h / 2, w, h };
    }
    function draw() {
      const rect = rectangle();
      const x = origin.x + rect.x * viewScale;
      const y = origin.y + rect.y * viewScale;
      const w = rect.w * viewScale;
      const h = rect.h * viewScale;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#202b35';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, origin.x, origin.y, iw * viewScale, ih * viewScale);
      ctx.fillStyle = '#101923aa';
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(x, y, w, h);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = '#ffffff70';
      ctx.lineWidth = 1;
      for (const fraction of [1 / 3, 2 / 3]) {
        ctx.beginPath();
        ctx.moveTo(x + w * fraction, y); ctx.lineTo(x + w * fraction, y + h);
        ctx.moveTo(x, y + h * fraction); ctx.lineTo(x + w, y + h * fraction);
        ctx.stroke();
      }
      const preview = $('crop-result');
      const p = preview.getContext('2d');
      preview.width = 280;
      preview.height = Math.max(1, Math.round(280 / aspect));
      p.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, preview.width, preview.height);
      $('crop-selection').textContent = `选区 ${Math.round(rect.w)} × ${Math.round(rect.h)} 像素`;
      $('crop-zoom-value').value = `${zoom.toFixed(1)}×`;
    }
    function point(event) {
      const bounds = canvas.getBoundingClientRect();
      return { x: (event.clientX - bounds.left) * canvas.width / bounds.width / viewScale,
        y: (event.clientY - bounds.top) * canvas.height / bounds.height / viewScale };
    }
    const controller = new AbortController();
    const options = { signal: controller.signal };
    return new Promise((resolve, reject) => {
      pending = resolve;
      function finish(mode, initialError = null) {
        if (settled) return;
        settled = true;
        let result = null;
        let failure = initialError;
        try {
          if (mode !== 'cancel') {
            const output = document.createElement('canvas');
            // 使用固定目标比例，渲染器无需再切掉用户确认的选区。
            const targetWidth = width === 1 ? 512 : width * 2;
            const targetHeight = height === 1 ? 512 : height * 2;
            output.width = targetWidth;
            output.height = targetHeight;
            const out = output.getContext('2d');
            out.imageSmoothingQuality = 'high';
            const rect = rectangle();
            out.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, targetWidth, targetHeight);
            result = output.toDataURL('image/png');
          }
        } catch (error) { failure = error; }
        controller.abort();
        pending = null;
        dialog.close();
        previousFocus?.focus();
        if (failure) reject(failure);
        else resolve(result);
      }
      $('crop-zoom').addEventListener('input', () => { zoom = Number($('crop-zoom').value); draw(); }, options);
      $('crop-reset').addEventListener('click', () => {
        zoom = 1; center = { x: iw / 2, y: ih / 2 }; $('crop-zoom').value = '1'; draw();
      }, options);
      $('crop-confirm').addEventListener('click', () => finish('crop'), options);
      $('crop-cancel').addEventListener('click', () => finish('cancel'), options);
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish('cancel'); }, options);
      dialog.addEventListener('close', () => finish('cancel'), options);
      canvas.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        drag = { start: point(event), center: { ...center } };
        canvas.setPointerCapture(event.pointerId);
      }, options);
      canvas.addEventListener('pointermove', (event) => {
        if (!drag) return;
        const current = point(event);
        center = { x: drag.center.x + current.x - drag.start.x, y: drag.center.y + current.y - drag.start.y };
        draw();
      }, options);
      canvas.addEventListener('pointerup', () => { drag = null; }, options);
      canvas.addEventListener('pointercancel', () => { drag = null; }, options);
      canvas.addEventListener('keydown', (event) => {
        const movement = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!movement) return;
        event.preventDefault();
        center.x += movement[0] * iw / (event.shiftKey ? 20 : 100);
        center.y += movement[1] * ih / (event.shiftKey ? 20 : 100);
        draw();
      }, options);
      try { dialog.showModal(); draw(); } catch (error) { finish('cancel', error); }
    });
  }
  window.ImageCropper = Object.freeze({ select });
})();
