(() => {
  'use strict';
  const DEFAULT_STATE = {
    profile: {
      name: '你的名字', handle: '@your_handle', tags: ['创作者', '旅行', '摄影'],
      signature: '记录生活，也记录热爱。', socials: ['GitHub'], coverFocus: 50,
    },
    location: { mode: 'online', lat: 30.248, lon: 120.151, zoom: 12, title: '示例位置 · 杭州', caption: '选择城市，或在地图中点选你的位置。', imageAttribution: '' },
    project: { eyebrow: '作品与想法', title: '你的项目', subtitle: '把想法变成作品', color: '#608cb5', icons: ['idea', 'code'] },
    hobbies: { eyebrow: '兴趣爱好', title: '发现日常', subtitle: '旅行 · 音乐 · 自然', color: '#c1b66e', icons: ['compass', 'headphones', 'music'] },
    appearance: { windowTitle: '个人名片', backgroundMode: 'image', backgroundFocus: 50, darkness: 7, blur: 22, glass: 35 },
  };
  const CITIES = {
    wenzhou: { lat: 28.015, lon: 120.665, title: '浙江 · 温州' },
    hangzhou: { lat: 30.248, lon: 120.151, title: '浙江 · 杭州' },
    shanghai: { lat: 31.2304, lon: 121.4737, title: '上海' },
    beijing: { lat: 39.9042, lon: 116.4074, title: '北京' },
    guangzhou: { lat: 23.1291, lon: 113.2644, title: '广东 · 广州' },
    chengdu: { lat: 30.5728, lon: 104.0668, title: '四川 · 成都' },
    tokyo: { lat: 35.6812, lon: 139.7671, title: '日本 · 东京' },
  };
  const IMAGE_SLOTS = ['avatar', 'cover', 'background', 'profileBackground', 'mapImage', 'projectBackground', 'hobbiesBackground', 'projectIcon0', 'projectIcon1', 'hobbiesIcon0', 'hobbiesIcon1', 'hobbiesIcon2'];
  const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const MAP_WIDTH = 505;
  const MAP_HEIGHT = 309;
  const ATTRIBUTION = '© OpenStreetMap contributors';
  const MAX_LAT = 85.051128;
  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  let state = clone(DEFAULT_STATE);
  let assets = {};
  let originals = {};
  let uploads = {};
  let mapData;
  let currentMapKey = '';
  let mapReady = false;
  let mapRequest = 0;
  let renderFrame;
  let busy = false;
  let searchTime = 0;
  const tileCache = new Map();
  const mapCache = new Map();

  function notify(message, error = false) {
    $('status').textContent = message;
    $('status').classList.toggle('error', error);
  }

  function readPath(object, key) {
    const [section, field] = key.split('.');
    return object[section][field];
  }

  function assignPath(object, key, value) {
    const [section, field] = key.split('.');
    object[section][field] = value;
  }

  function decodeImage(data) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('图片无法解码，请使用 PNG、JPG 或 WebP。'));
      image.src = data;
    });
  }

  function validCoordinates(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -MAX_LAT && lat <= MAX_LAT && lon >= -180 && lon <= 180;
  }

  function worldPoint(lat, lon, zoom) {
    const size = 256 * 2 ** zoom;
    const radians = lat * Math.PI / 180;
    return { x: (lon + 180) / 360 * size, y: (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * size };
  }

  function coordinates(x, y, zoom) {
    const size = 256 * 2 ** zoom;
    return { lon: ((x / size * 360 + 180) % 360 + 360) % 360 - 180, lat: Math.max(-MAX_LAT, Math.min(MAX_LAT, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI)) };
  }

  function locationKey(location) {
    return `${location.lat.toFixed(6)},${location.lon.toFixed(6)},${location.zoom}`;
  }

  function setMapStatus(message, error = false) {
    $('map-status').textContent = message;
    $('map-status').style.color = error ? '#ba5660' : '';
    $('retry-map').hidden = !error;
  }

  function refreshButtons() {
    $('export-png').disabled = busy || !mapReady;
    $('save-config').disabled = busy;
  }

  function syncForm() {
    document.querySelectorAll('[data-bind]').forEach((input) => { input.value = readPath(state, input.dataset.bind); });
    document.querySelectorAll('[data-output]').forEach((output) => { output.value = readPath(state, output.dataset.output); });
    $('tags').value = state.profile.tags.join(', ');
    $('socials').value = state.profile.socials.join(', ');
    $('latitude').value = state.location.lat;
    $('longitude').value = state.location.lon;
    $('map-zoom').value = state.location.zoom;
    $('zoom-label').value = state.location.zoom;
    $('online-controls').hidden = state.location.mode !== 'online';
    $('image-map-controls').hidden = state.location.mode !== 'image';
    $('avatar-thumbnail').src = uploads.avatar || DEFAULT_ASSETS.avatar;
    $('cover-thumbnail').src = uploads.cover || DEFAULT_ASSETS.cover;
    $('background-thumbnail').src = uploads.background || DEFAULT_ASSETS.background;
    const city = Object.entries(CITIES).find(([, value]) => Math.abs(state.location.lat - value.lat) < 0.000001 && Math.abs(state.location.lon - value.lon) < 0.000001);
    $('city').value = city ? city[0] : 'custom';
  }

  function drawPicker(shiftX = 0, shiftY = 0) {
    if (!mapData) return;
    const canvas = $('map-picker');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e5edde';
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    ctx.drawImage(mapData.image, shiftX, shiftY, MAP_WIDTH, MAP_HEIGHT);
    if (mapReady) ProfileRenderer.pin(ctx, MAP_WIDTH / 2, MAP_HEIGHT / 2 - 12.5, 25);
  }

  function renderNow() {
    if (!mapData) return;
    ProfileRenderer.render($('preview'), state, assets, mapData);
    drawPicker();
    refreshButtons();
  }

  function scheduleRender() {
    cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(renderNow);
    document.querySelectorAll('[data-output]').forEach((output) => { output.value = readPath(state, output.dataset.output); });
  }

  function messageMap(message) {
    const canvas = document.createElement('canvas');
    canvas.width = MAP_WIDTH;
    canvas.height = MAP_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e9efed';
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    ctx.font = '15px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#899f9a';
    ctx.textAlign = 'center';
    ctx.fillText(message, MAP_WIDTH / 2, 90);
    return { image: canvas, attribution: '' };
  }

  async function fetchTile(zoom, x, y) {
    const count = 2 ** zoom;
    const wrapX = ((x % count) + count) % count;
    if (y < 0 || y >= count) return null;
    const key = `${zoom}/${wrapX}/${y}`;
    if (tileCache.has(key)) return tileCache.get(key);
    const url = `https://tile.openstreetmap.org/${key}.png`;
    const task = (async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000), credentials: 'omit', cache: 'default' });
      if (!response.ok) throw new Error(`地图服务器返回 ${response.status}。`);
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('地图服务器未返回图片。');
      return createImageBitmap(blob);
    })();
    tileCache.set(key, task);
    try {
      const image = await task;
      if (tileCache.size > 48) tileCache.delete(tileCache.keys().next().value);
      return image;
    } catch (error) {
      tileCache.delete(key);
      throw error;
    }
  }

  async function loadOnlineMap(location) {
    const key = locationKey(location);
    if (mapCache.has(key)) return mapCache.get(key);
    // OSM 要求浏览器请求携带正常的 HTTP Referer；file:// 不符合其瓦片政策。
    // 不伪造 Referer，而是通过本机启动器提供真正的本地 HTTP 编辑器。
    if (window.location.protocol === 'file:') throw new Error('新位置请使用 start-generator.cmd 启动生成器。直接打开 HTML 仅支持默认地图、已有快照或上传截图。');
    const center = worldPoint(location.lat, location.lon, location.zoom);
    const left = center.x - MAP_WIDTH / 2;
    const top = center.y - MAP_HEIGHT / 2;
    const canvas = document.createElement('canvas');
    canvas.width = MAP_WIDTH;
    canvas.height = MAP_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e2ecdf';
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    const jobs = [];
    for (let y = Math.floor(top / 256); y <= Math.floor((top + MAP_HEIGHT - 1) / 256); y += 1) {
      for (let x = Math.floor(left / 256); x <= Math.floor((left + MAP_WIDTH - 1) / 256); x += 1) jobs.push({ x, y });
    }
    let index = 0;
    async function worker() {
      while (index < jobs.length) {
        const { x, y } = jobs[index++];
        const image = await fetchTile(location.zoom, x, y);
        if (image) ctx.drawImage(image, Math.round(x * 256 - left), Math.round(y * 256 - top));
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker));
    const result = { image: canvas, attribution: ATTRIBUTION };
    mapCache.set(key, result);
    if (mapCache.size > 12) mapCache.delete(mapCache.keys().next().value);
    return result;
  }

  async function updateMap() {
    const request = ++mapRequest;
    const location = clone(state.location);
    if (location.mode === 'image') {
      mapReady = Boolean(assets.mapImage);
      mapData = mapReady ? { image: assets.mapImage, attribution: location.imageAttribution } : messageMap('请上传一张地图图片');
      currentMapKey = '';
      if (!mapReady) notify('请上传地图图片，或切换回真实地图。', true);
      renderNow();
      return;
    }
    mapReady = false;
    mapData = messageMap('正在加载真实地图…');
    setMapStatus('正在加载当前位置的地图…');
    renderNow();
    try {
      const result = await loadOnlineMap(location);
      if (request !== mapRequest) return;
      mapData = result;
      currentMapKey = locationKey(location);
      mapReady = true;
      setMapStatus(`已定位：${location.lat.toFixed(5)}, ${location.lon.toFixed(5)} · 缩放 ${location.zoom}`);
      notify('已更新地图，可以导出图片。');
      renderNow();
    } catch (error) {
      if (request !== mapRequest) return;
      mapData = messageMap('地图未加载，请联网重试或上传截图');
      mapReady = false;
      currentMapKey = '';
      setMapStatus(`加载失败：${error.message} 请检查网络，或改用地图截图。`, true);
      notify('地图加载失败，已暂停导出，避免把旧地图当作新位置。', true);
      renderNow();
    }
  }

  function setLocation(lat, lon, title) {
    if (!validCoordinates(lat, lon)) {
      notify('坐标无效：纬度范围 ±85.051128°，经度范围 ±180°。', true);
      return false;
    }
    state.location.lat = Math.round(lat * 1e6) / 1e6;
    state.location.lon = Math.round(lon * 1e6) / 1e6;
    if (title) state.location.title = title;
    if (title && title !== DEFAULT_STATE.location.title && state.location.caption === DEFAULT_STATE.location.caption) state.location.caption = '欢迎来找我玩！';
    state.location.mode = 'online';
    syncForm();
    void updateMap();
    return true;
  }

  function fileData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('文件读取失败。'));
      reader.readAsDataURL(file);
    });
  }

  async function normalizeImage(data) {
    if (typeof data !== 'string' || data.length > 23 * 1024 * 1024 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) throw new Error('图片格式或数据不正确。');
    const image = await decodeImage(data);
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 80000000) throw new Error('图片像素过多，请先缩小图片。');
    const ratio = Math.min(1, 2800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const normalized = canvas.toDataURL('image/png');
    return { data: normalized, image: await decodeImage(normalized) };
  }

  async function uploadFile(input) {
    const file = input.files[0];
    if (!file) return;
    try {
      if (!SUPPORTED_TYPES.includes(file.type)) throw new Error('仅支持 PNG、JPG 和 WebP 图片。');
      if (file.size > 15 * 1024 * 1024) throw new Error('单张图片不能超过 15 MB。');
      const key = input.dataset.asset;
      const original = await decodeImage(await fileData(file));
      if (original.naturalWidth * original.naturalHeight > 80000000) throw new Error('图片像素过多，请先缩小图片。');
      const selection = await ImageCropper.select(original, key);
      if (!selection) { notify('已取消取景，原图片保持不变。'); return; }
      const normalized = await normalizeImage(selection);
      uploads[key] = normalized.data;
      assets[key] = normalized.image;
      if (key === 'background') state.appearance.backgroundMode = 'image';
      if (key === 'mapImage') state.location.mode = 'image';
      syncForm();
      if (key === 'mapImage') await updateMap();
      else scheduleRender();
      notify('图片已更换，导出时会使用新素材。');
    } catch (error) {
      notify(error.message, true);
    } finally {
      input.value = '';
    }
  }

  function clearAsset(key) {
    delete uploads[key];
    if (originals[key]) assets[key] = originals[key];
    else delete assets[key];
    syncForm();
    scheduleRender();
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function pngBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG 编码失败，请降低导出尺寸重试。')), 'image/png'));
  }

  async function exportPng() {
    if (!mapReady || busy) {
      notify('请先完成地图加载或上传地图图片，再导出。', true);
      return;
    }
    busy = true;
    refreshButtons();
    notify('正在生成高清 PNG…');
    try {
      const scale = Number($('export-scale').value);
      const canvas = document.createElement('canvas');
      ProfileRenderer.render(canvas, state, assets, mapData, scale);
      const blob = await pngBlob(canvas);
      const name = state.profile.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 40) || '个人名片';
      download(blob, `${name}-个人名片-${canvas.width}x${canvas.height}.png`);
      notify(`PNG 已生成：${canvas.width} × ${canvas.height}。若浏览器询问下载权限，请允许保存。`);
      canvas.width = 1;
      canvas.height = 1;
    } catch (error) {
      notify(`导出失败：${error.message}`, true);
    } finally {
      busy = false;
      refreshButtons();
    }
  }

  async function saveConfig() {
    try {
      const config = { version: 1, state: clone(state), images: clone(uploads) };
      if (mapReady && state.location.mode === 'online' && currentMapKey === locationKey(state.location)) {
        const snapshot = document.createElement('canvas');
        snapshot.width = MAP_WIDTH;
        snapshot.height = MAP_HEIGHT;
        snapshot.getContext('2d').drawImage(mapData.image, 0, 0, MAP_WIDTH, MAP_HEIGHT);
        config.mapSnapshot = { key: currentMapKey, data: snapshot.toDataURL('image/png') };
      }
      download(new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }), '个人名片配置.json');
      notify('配置已保存，包含你上传的图片和当前地图，之后可离线导入。');
    } catch (error) {
      notify(`配置保存失败：${error.message}`, true);
    }
  }

  function validateState(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('配置缺少内容。');
    const result = clone(DEFAULT_STATE);
    const limits = {
      'profile.name': 60, 'profile.handle': 80, 'profile.signature': 140,
      'location.title': 80, 'location.caption': 120, 'location.imageAttribution': 100,
      'project.eyebrow': 90, 'project.title': 60, 'project.subtitle': 80,
      'hobbies.eyebrow': 90, 'hobbies.title': 60, 'hobbies.subtitle': 80,
      'appearance.windowTitle': 60,
    };
    for (const [key, limit] of Object.entries(limits)) {
      const value = input[key.split('.')[0]]?.[key.split('.')[1]];
      if (typeof value !== 'string' || value.length > limit) throw new Error(`配置字段 ${key} 无效。`);
      assignPath(result, key, value);
    }
    const ranges = {
      'profile.coverFocus': [0, 100], 'location.lat': [-MAX_LAT, MAX_LAT], 'location.lon': [-180, 180],
      'location.zoom': [3, 17], 'appearance.backgroundFocus': [0, 100], 'appearance.darkness': [0, 60],
      'appearance.blur': [0, 50], 'appearance.glass': [10, 75],
    };
    for (const [key, [min, max]] of Object.entries(ranges)) {
      const value = input[key.split('.')[0]]?.[key.split('.')[1]];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (key === 'location.zoom' && !Number.isInteger(value))) throw new Error(`配置字段 ${key} 超出范围。`);
      assignPath(result, key, value);
    }
    for (const [key, maxLength, itemLimit] of [['tags', 8, 32], ['socials', 4, 8]]) {
      const values = input.profile?.[key];
      if (!Array.isArray(values) || values.length > maxLength || values.some((value) => typeof value !== 'string' || value.length > itemLimit)) throw new Error(`配置 ${key} 无效。`);
      result.profile[key] = values.slice();
    }
    for (const card of ['project', 'hobbies']) {
      if (typeof input[card]?.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(input[card].color)) throw new Error('卡片颜色无效。');
      result[card].color = input[card].color;
    }
    if (!['online', 'image'].includes(input.location?.mode) || !['image', 'gradient'].includes(input.appearance?.backgroundMode)) throw new Error('配置模式无效。');
    result.location.mode = input.location.mode;
    result.appearance.backgroundMode = input.appearance.backgroundMode;
    return result;
  }

  async function importConfig(file) {
    if (!file) return;
    try {
      if (file.size > 80 * 1024 * 1024) throw new Error('配置文件过大，最大支持 80 MB。');
      const config = JSON.parse(await file.text());
      if (config.version !== 1) throw new Error('不支持此配置版本。');
      const nextState = validateState(config.state);
      if (!config.images || typeof config.images !== 'object' || Array.isArray(config.images)) throw new Error('图片配置不正确。');
      const nextUploads = {};
      const nextAssets = { ...originals };
      for (const key of Object.keys(config.images)) {
        if (!IMAGE_SLOTS.includes(key)) throw new Error(`配置包含未知图片字段：${key}`);
        const normalized = await normalizeImage(config.images[key]);
        nextUploads[key] = normalized.data;
        nextAssets[key] = normalized.image;
      }
      let snapshot;
      if (config.mapSnapshot) {
        if (config.mapSnapshot.key !== locationKey(nextState.location)) throw new Error('地图快照与坐标不一致。');
        snapshot = await normalizeImage(config.mapSnapshot.data);
      }
      // 只有全部字段和图片验证完成之后才替换当前项目，失败不会损坏已有配置。
      ++mapRequest;
      state = nextState;
      uploads = nextUploads;
      assets = nextAssets;
      if (snapshot) mapCache.set(config.mapSnapshot.key, { image: snapshot.image, attribution: ATTRIBUTION });
      syncForm();
      await updateMap();
      notify(mapReady ? '配置已导入，图片与文字已恢复。' : '配置已导入，但地图尚未就绪，请检查地图设置。', !mapReady);
    } catch (error) {
      notify(`配置未导入：${error.message}`, true);
    }
  }

  async function searchPlace() {
    const query = $('place-query').value.trim();
    if (!query) { notify('请先输入要搜索的地点。', true); return; }
    if (Date.now() - searchTime < 1100) { notify('请稍等一秒后再搜索。', true); return; }
    searchTime = Date.now();
    $('search-place').disabled = true;
    $('search-results').replaceChildren();
    notify('正在查找地点…');
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '4', 'accept-language': 'zh-CN' }).toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(12000), credentials: 'omit' });
      if (!response.ok) throw new Error(`地点服务返回 ${response.status}。`);
      const results = await response.json();
      if (!Array.isArray(results)) throw new Error('地点服务返回格式不正确。');
      if (!results.length) { notify('没有找到地点，可试试城市名称，或直接输入经纬度。', true); return; }
      for (const result of results) {
        const lat = Number(result.lat);
        const lon = Number(result.lon);
        if (!validCoordinates(lat, lon) || typeof result.display_name !== 'string') continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = result.display_name;
        button.addEventListener('click', () => {
          setLocation(lat, lon, query);
          $('search-results').replaceChildren();
        });
        $('search-results').append(button);
      }
      notify('请选择搜索结果，地图将更新到对应坐标。');
    } catch (error) {
      notify(`地点查询失败：${error.message} 可改用城市选择或经纬度。`, true);
    } finally {
      $('search-place').disabled = false;
    }
  }

  function wireMapPicker() {
    const canvas = $('map-picker');
    let drag;
    function point(event) {
      const bounds = canvas.getBoundingClientRect();
      return { x: (event.clientX - bounds.left) * MAP_WIDTH / bounds.width, y: (event.clientY - bounds.top) * MAP_HEIGHT / bounds.height };
    }
    canvas.addEventListener('pointerdown', (event) => {
      if (!mapReady || state.location.mode !== 'online') return;
      drag = { ...point(event), world: worldPoint(state.location.lat, state.location.lon, state.location.zoom) };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const current = point(event);
      drawPicker(current.x - drag.x, current.y - drag.y);
    });
    canvas.addEventListener('pointerup', (event) => {
      if (!drag) return;
      const current = point(event);
      const dx = current.x - drag.x;
      const dy = current.y - drag.y;
      const click = Math.hypot(dx, dy) < 5;
      const next = coordinates(drag.world.x + (click ? current.x - MAP_WIDTH / 2 : -dx), drag.world.y + (click ? current.y - MAP_HEIGHT / 2 : -dy), state.location.zoom);
      drag = null;
      setLocation(next.lat, next.lon);
    });
    canvas.addEventListener('pointercancel', () => { drag = null; drawPicker(); });
    canvas.addEventListener('keydown', (event) => {
      if (!mapReady) return;
      const offsets = { ArrowLeft: [-50, 0], ArrowRight: [50, 0], ArrowUp: [0, -50], ArrowDown: [0, 50] };
      if (!offsets[event.key]) return;
      event.preventDefault();
      const center = worldPoint(state.location.lat, state.location.lon, state.location.zoom);
      const [dx, dy] = offsets[event.key];
      const next = coordinates(center.x + dx, center.y + dy, state.location.zoom);
      setLocation(next.lat, next.lon);
    });
  }

  function wireEditor() {
    const tabs = [...document.querySelectorAll('[data-panel]')];
    function selectTab(tab) {
      tabs.forEach((item) => {
        const active = item === tab;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
        $('panel-' + item.dataset.panel).hidden = !active;
      });
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectTab(tab));
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        selectTab(tabs[next]);
        tabs[next].focus();
      });
    });
    document.querySelectorAll('[data-bind]').forEach((input) => input.addEventListener('input', () => {
      const key = input.dataset.bind;
      assignPath(state, key, input.type === 'range' ? Number(input.value) : input.value);
      if (key === 'location.mode' || key === 'location.imageAttribution') {
        syncForm();
        void updateMap();
      } else scheduleRender();
    }));
    $('tags').addEventListener('input', () => {
      state.profile.tags = $('tags').value.split(/[,，]/).map((tag) => tag.trim().slice(0, 32)).filter(Boolean).slice(0, 8);
      scheduleRender();
    });
    $('socials').addEventListener('input', () => {
      state.profile.socials = $('socials').value.split(/[,，]/).map((label) => label.trim().slice(0, 8)).filter(Boolean).slice(0, 4);
      scheduleRender();
    });
    document.querySelectorAll('[data-asset]').forEach((input) => input.addEventListener('change', () => void uploadFile(input)));
    document.querySelectorAll('[data-clear]').forEach((button) => button.addEventListener('click', () => clearAsset(button.dataset.clear)));
    for (const card of ['project', 'hobbies']) $('reset-' + card + '-icons').addEventListener('click', () => {
      IMAGE_SLOTS.filter((slot) => slot.startsWith(card + 'Icon')).forEach(clearAsset);
    });
    $('city').addEventListener('change', () => {
      const city = CITIES[$('city').value];
      if (city) setLocation(city.lat, city.lon, city.title);
    });
    $('apply-location').addEventListener('click', () => {
      const lat = $('latitude').value.trim();
      const lon = $('longitude').value.trim();
      if (!lat || !lon) { notify('请完整填写纬度和经度。', true); return; }
      setLocation(Number(lat), Number(lon));
    });
    let zoomTimer;
    function zoomTo(zoom) {
      state.location.zoom = Math.max(3, Math.min(17, zoom));
      syncForm();
      clearTimeout(zoomTimer);
      ++mapRequest;
      mapReady = false;
      mapData = messageMap('正在调整地图缩放…');
      renderNow();
      refreshButtons();
      zoomTimer = setTimeout(() => void updateMap(), 220);
    }
    $('map-zoom').addEventListener('input', () => zoomTo(Number($('map-zoom').value)));
    $('zoom-in').addEventListener('click', () => zoomTo(state.location.zoom + 1));
    $('zoom-out').addEventListener('click', () => zoomTo(state.location.zoom - 1));
    $('retry-map').addEventListener('click', () => void updateMap());
    $('search-place').addEventListener('click', () => void searchPlace());
    $('place-query').addEventListener('keydown', (event) => { if (event.key === 'Enter') void searchPlace(); });
    $('use-geolocation').addEventListener('click', () => {
      if (!navigator.geolocation) { notify('当前浏览器不支持设备定位，请输入坐标。', true); return; }
      notify('正在请求设备位置；若浏览器不允许，可使用城市或坐标。');
      navigator.geolocation.getCurrentPosition((position) => setLocation(position.coords.latitude, position.coords.longitude, '我的位置'), (error) => notify(`设备定位未成功：${error.message} 可直接输入坐标。`, true), { timeout: 10000, maximumAge: 60000 });
    });
    $('export-png').addEventListener('click', () => void exportPng());
    $('save-config').addEventListener('click', () => void saveConfig());
    $('load-config').addEventListener('change', async () => {
      const file = $('load-config').files[0];
      $('load-config').value = '';
      await importConfig(file);
    });
    $('restore-scene').addEventListener('click', () => {
      clearAsset('background');
      state.appearance = clone(DEFAULT_STATE.appearance);
      syncForm();
      scheduleRender();
    });
    $('reset-all').addEventListener('click', async () => {
      if (!confirm('恢复所有默认内容？请先保存你需要的配置。')) return;
      state = clone(DEFAULT_STATE);
      assets = { ...originals };
      uploads = {};
      syncForm();
      await updateMap();
      notify('已恢复通用默认配置。');
    });
    wireMapPicker();
  }

  async function main() {
    try {
      $('export-png').disabled = true;
      const decoded = await Promise.all(Object.entries(DEFAULT_ASSETS).map(async ([key, data]) => [key, await decodeImage(data)]));
      originals = Object.fromEntries(decoded);
      assets = { ...originals };
      mapCache.set(locationKey(DEFAULT_STATE.location), { image: originals.mapDefault, attribution: ATTRIBUTION });
      wireEditor();
      syncForm();
      await updateMap();
      notify('图片已准备好。编辑内容后，点击「导出 PNG」保存。');
      window.generatorReady = true;
      // 验证入口不参与界面，也不包含文件系统或远程写入能力。
      window.generator = Object.freeze({
        getState: () => clone(state), isMapReady: () => mapReady,
        render: (scale = 1) => {
          if (![1, 2, 3].includes(scale) || !mapReady) throw new Error('地图未就绪或导出尺寸无效。');
          return ProfileRenderer.render(document.createElement('canvas'), state, assets, mapData, scale).toDataURL('image/png');
        },
      });
    } catch (error) {
      notify(`初始化失败：${error.message}`, true);
      console.error(error);
    }
  }

  void main();
})();
