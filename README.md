# Side Translate

Side Translate 是一款浏览器扩展，帮助你并排阅读网页原文与译文，并同步滚动、对照段落和划选内容。

## 安装

下载 [Side Translate 0.6.8 安装包](https://github.com/zhaoqingxia06/WebTranslator/raw/refs/heads/main/Side-Translate-0.6.8.zip)，解压后打开 Chrome 的扩展程序管理页面，开启开发者模式，选择「加载已解压的扩展程序」，选择解压后的文件夹。也可下载仓库源码并选择其中的 bilingual 文件夹。

## 功能

- 点击扩展启动网页翻译，选择目标语言。
- 原文和译文双向同步滚动，按段落校准位置。
- 选择原文后尝试高亮对应译文，支持词语、短语和跨句选区。
- 根据网页点缀色设置译文高亮，并检查文字对比度。
- 页面以目标语言为主时显示同语言提示，图片以占位形式呈现。

翻译通过 Google 翻译非正式接口处理，网页文字会发送至该服务。部分划选可能无法准确定位。不同网站的布局、同步和高亮效果仍需实际验证。需求和验收记录见 [需求清单](bilingual-reader-requirements.md)。
