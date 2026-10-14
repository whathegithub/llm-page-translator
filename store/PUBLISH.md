# Chrome 网上应用店发布手册

本目录是上架材料，不会打进扩展 ZIP。上传用的安装包在 `dist/llm-page-translator-<version>.zip`。

## 你需要先完成的两件事

1. 注册 [Chrome 网上应用店开发者账号](https://chrome.google.com/webstore/devconsole/)，一次性支付 5 美元，并开启两步验证。
2. 把 `store/privacy-policy.html` 发布到一个可公开访问的 **HTTPS** 地址，并把文中的 `REPLACE_WITH_YOUR_EMAIL` 换成你的联系邮箱。没有隐私政策链接，审核通常会拒绝。

可用 GitHub Pages、Cloudflare Pages 或任意静态托管。发布后把完整 URL 填到开发者后台 Privacy 页。

## 打包

在项目根目录执行：

```powershell
python scripts/generate_store_assets.py
python scripts/pack.py
```

ZIP 根目录必须直接包含 `manifest.json`。不要把 `store/`、`scripts/`、`AGENTS.md` 打进去。

## Store listing 填写

- 语言：中文（中国）
- 类别：生产力 / Productivity
- 可见性：公开

### 名称

LLM Page Translator

### 简短介绍（最多 132 字）

用你自己的大模型原位翻译网页，保留排版、链接和按钮，可随时停止或恢复原文。

### 详细介绍

LLM Page Translator 把翻译结果直接写回原文本节点，所以标题、段落、链接和按钮会留在原位置。

主要功能：
- 自定义 API 地址、模型和 API Key
- 支持 OpenAI Compatible、DeepSeek、Anthropic Messages 和 Google Gemini
- 点击后才注入当前标签页，不在所有网页常驻
- 主动翻译不超过 50 个单词的短文本；单个词会生成中文模拟发音
- 可随时停止翻译或恢复原文
- API Key 和翻译缓存只保存在本机 Chrome

使用前请先在弹窗中配置模型服务。保存配置时，Chrome 会请求访问该 API 域名的权限。不要在含有敏感信息的页面上启动翻译。

Chrome 内部页、Chrome 网上应用店、PDF 查看器和部分受保护页面无法注入。Canvas、图片内文字、输入框、代码块和跨域 iframe 当前不会翻译。

### 英文简短介绍（如需额外语言）

Translate web pages in place with your own LLM. Layout, links, and buttons stay put, and you can restore the original text anytime.

## 图片

上传这些文件：

| 用途 | 文件 | 尺寸 |
| --- | --- | --- |
| 商店小宣传图（必填） | `store/assets/promo-small-440x280.png` | 440×280 |
| 可选大图 | `store/assets/promo-marquee-1400x560.png` | 1400×560 |
| 截图 1 | `store/assets/screenshot-01-page.png` | 1280×800 |
| 截图 2 | `store/assets/screenshot-02-manual.png` | 1280×800 |
| 截图 3 | `store/assets/screenshot-03-settings.png` | 1280×800 |

扩展图标已包含在 ZIP 的 `icons/` 中。

## Privacy 页怎么填

### Single purpose

Translate webpage text and short user-entered text in place using a user-configured LLM API, while preserving page layout.

### 权限说明

- **storage**：Save the user’s API settings, language options, and a local translation cache on the device.
- **activeTab**：Access only the current tab after the user clicks the extension action.
- **scripting**：Inject the translation content script and styles into the current tab when the user starts page translation.
- **optional host permissions (`http://*/*`, `https://*/*`)**：Request access only to the API origin the user entered, so translation requests can be sent to that provider. The extension does not request access to all websites up front.

### Remote code

选择 **No, I am not using remote code.**

本扩展不会加载或执行远程 JavaScript。模型接口只返回翻译文本 / JSON。

### 数据用途勾选

勾选：

- Website content（当前页面文本、用户输入的短文本）
- Authentication information（用户自己的 API Key，仅用于请求其配置的模型服务）

不要勾选位置、健康、财务、浏览历史等无关项。

Limited Use 相关声明全部勾选同意。

### 隐私政策 URL

填你托管后的 `privacy-policy.html` 地址。

## 审核测试说明

可直接粘贴：

```
This extension is bring-your-own-key. It does not ship with a default API key.

1. Install the extension and open a public HTTP(S) page, for example https://en.wikipedia.org/wiki/Language
2. Open the popup.
3. Set protocol, API endpoint, model, and API key.
4. Click 测试连接 / Test connection. A tiny real request is sent to the configured API.
5. Click 翻译当前页面 to translate the current tab in place.
6. Click 停止 to stop, then 恢复原文 to restore original text.
7. Optional: paste a single English word into 主动翻译 to see a Chinese translation and a Chinese phonetic approximation.

Restricted pages such as chrome://, the Chrome Web Store, and PDFs cannot be injected.
```

如果审核人员没有模型 Key，翻译主路径无法验证。建议你准备一个限额很低的测试 Key，只在后台“Test instructions”里提供，不要写进商店公开描述。

## 上传步骤

1. 打开 https://chrome.google.com/webstore/devconsole/
2. Add new item，上传 `dist/llm-page-translator-*.zip`
3. 填写 Store listing、Privacy、Distribution
4. 上传宣传图和截图
5. Submit for review

首次审核可能需要几天到数周。如果被拒，按邮件里的政策条款改完再传新版本；每次用户可见改动都要增加 `manifest.json` 的 `version`。
