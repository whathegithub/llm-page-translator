# LLM Page Translator

一个零构建依赖的 Chrome Manifest V3 网页翻译扩展。它把翻译结果直接写回原文本节点，因此链接、按钮、段落和页面布局会保留在原位置。

## 当前能力

- 自定义 API 地址、模型和 API Key。
- 支持 OpenAI-compatible、DeepSeek、Anthropic Messages 和 Google Gemini 协议。
- 可发送一条极小的真实请求，测试 API 权限、Key、模型与响应格式是否正常。
- 支持在弹窗中主动翻译不超过 50 个单词的短文本；单个词会额外生成中文模拟发音。
- 仅在用户点击翻译后注入当前标签页，不在所有网页常驻运行。
- 原位替换文本，可随时停止或恢复原文。
- 按字符数和片段数批量请求，限制并发，优先处理当前视口附近文本。
- 使用空闲时间分片扫描 DOM，避免长任务阻塞页面。
- 监听动态 DOM，支持常见 SPA 和无限滚动页面。
- 持久化 LRU 翻译缓存，减少重复请求、等待时间和费用。
- 失败重试、60 秒超时、严格 JSON 输出和提示词注入隔离。

## 本地安装

1. 打开 `chrome://extensions`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目目录。
5. 打开一个普通的 HTTP/HTTPS 网页，点击扩展图标完成配置并开始翻译。

保存配置时，Chrome 会请求访问所填写 API 域名的权限。扩展不会预先申请访问所有模型服务的权限。

## 打包发布

生成商店图标、宣传图，并打出可上传到 Chrome 网上应用店的 ZIP：

```powershell
python scripts/generate_store_assets.py
python scripts/pack.py
```

安装包在 `dist/llm-page-translator-<version>.zip`。上架文案、隐私政策、截图和后台填写说明见 `store/PUBLISH.md`。

## 常见服务配置

| 服务 | 协议 | API 地址示例 | 模型示例 |
| --- | --- | --- | --- |
| OpenAI | OpenAI Compatible | `https://api.openai.com/v1/chat/completions` | `gpt-5.6-luna` |
| DeepSeek | DeepSeek | `https://api.deepseek.com/chat/completions` | `deepseek-v4-flash` |
| OpenRouter | OpenAI Compatible | `https://openrouter.ai/api/v1/chat/completions` | 服务支持的模型 ID |
| Ollama | OpenAI Compatible | `http://localhost:11434/v1/chat/completions` | 本地模型名称 |
| Anthropic | Anthropic Messages | `https://api.anthropic.com/v1/messages` | Claude 模型 ID |
| Gemini | Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | Gemini 模型 ID |

不同服务的模型名称和兼容接口可能变化，请以服务商文档为准。

## 性能设计

处理链路是：空闲时间分片扫描 → 过滤不可翻译节点 → 视口附近优先 → 字符预算批处理 → 有界并发 → 缓存命中或请求模型 → 原位更新。

默认值为 2 个并发请求、每批约 2500 字符、最多 20 个文本片段。小模型或高限额服务可适当提高并发；遇到 429、输出截断或页面段落较长时，应降低并发或每批字符数。

## 隐私与限制

- API Key 与翻译缓存保存在 `chrome.storage.local`，不会由本项目发送到模型 API 之外的服务器。
- 网页文本会发送给你配置的模型服务。不要在含敏感信息的页面启动翻译。
- Chrome 内部页面、Chrome Web Store、PDF 查看器和部分受保护页面不允许内容脚本运行。
- Canvas、图片内文字、输入框、代码块和跨域 iframe 当前不会翻译。
- 个别不严格遵守 JSON 指令的模型可能导致某批翻译失败；可换用指令遵循能力更好的模型或减小批次。
