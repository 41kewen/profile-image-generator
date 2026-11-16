# 项目开发规范

- 原生 JavaScript、Canvas 2D 和 Windows PowerShell；PNG 由 Canvas 直接绘制，不使用网页截图生成。
- 图片渲染位于 `src/renderer.js`，编辑、配置与地图位于 `src/app.js`，界面位于 `src/editor.html` 与 `src/style.css`。
- 保持四板块、圆角毛玻璃构图。默认内容必须是通用内容，不能引入真实账号、参考头像或用户主页资料。
- 默认装饰图在 `assets/`，地图单独保留来源和许可。不要把用户参考截图或本机配置提交到仓库。
- 先改源码，再 `npm run build`；不要手工修补 `dist/`。
- `npm test` 使用固定地图响应；只在明确需要时运行 `npm run test:online`，不让 CI 反复请求公共地图服务器。
- 在线瓦片请求必须从真正的 HTTP 编辑器发出，遵守正常 Referer 和地图使用政策，不能伪造来源。
- 本机服务只绑定 `127.0.0.1`，不开放目录或局域网。Windows 成品不要求用户安装 Node.js 或 Python。
- 修改后验证真实 PNG 导出并查看成图；不能只用 HTTP 200 或 Canvas 成功判断地图内容正确。
- 不提交密钥、凭据、`validation/`、构建产物、缓存和本机绝对路径。依赖使用 npm，并同步锁文件。
