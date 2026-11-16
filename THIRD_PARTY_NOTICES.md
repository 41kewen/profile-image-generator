# 第三方来源与许可

## 项目代码与装饰素材

项目代码和 `assets/*.svg` 装饰素材使用 MIT 许可，见 `LICENSE`。

默认头像、封面、风景与小卡片图标为本项目原创矢量图形。它们不包含用户提供的截图、照片、账号、头像或旧主页内容。用户上传的图片由用户自行确认使用权，不属于本项目许可范围。

## OpenStreetMap

`assets/map-default.png` 是杭州示例位置的地图，由 OpenStreetMap 标准地图瓦片拼接。位置与来源记录在 `assets/sources.json`。

- 地图署名：© OpenStreetMap contributors。
- 瓦片地址：`https://tile.openstreetmap.org/{z}/{x}/{y}.png`。
- 地图数据库：Open Database License (ODbL) 1.0。
- 标准地图图像：CC BY-SA 2.0。此许可单独适用于地图图像，不因仓库代码采用 MIT 而改变。
- 版权和署名说明：<https://www.openstreetmap.org/copyright>。
- CC BY-SA 2.0：<https://creativecommons.org/licenses/by-sa/2.0/>。
- 瓦片使用政策：<https://operations.osmfoundation.org/policies/tiles/>。
- 地点查询：Nominatim，<https://operations.osmfoundation.org/policies/nominatim/>。

在线与默认地图均保留署名。地图不是“永久免费商业 API”承诺；使用者需要遵守服务政策。自动测试默认使用固定瓦片，不请求这些公共服务；在线检查只在显式运行 `npm run test:online` 时执行。

## GitHub 标识

GitHub 社交标识用于表示用户选择的社交平台，不代表本项目与 GitHub 存在合作或隶属关系。GitHub 商标权归其各自权利人所有。

## 开发依赖

Playwright（Apache-2.0）和 sharp（Apache-2.0，及其依赖的各自许可）仅用于开发测试，不内嵌到最终用户生成器。
