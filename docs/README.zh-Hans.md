# 自行部署 Dowi Quotes

免费开源 Web／后端，让报价数据保留在你选择的服务器中。创建报价、分享客户链接、记录打开及接受状态。

采用 **AGPL-3.0-only**。此仓库不包含官方 iOS App 源代码或托管收费授权服务。Web 可独立免费使用；服务器、存储、邮件、域名与备份由你负责。

官方 iOS 私服连接为 **USD 50／公司／月，包含 10 人（含管理员）**；额外用户 USD 5／人／月。管理员为公司付费，员工无需各自购买 Apple 订阅。iOS 目前为测试版本，开通及购买安排请联系 support@dayella.co。

[完整安装步骤（英文）](INSTALL.md) · [员工及 iOS 授权](IOS.md) · [集成设置](INTEGRATIONS.md) · [主页](../README.md)

本机试用：`npm ci` → `npm run setup:local` → `npm start`，打开 `http://localhost:3000/login`。账户为 `admin@example.test`，随机密码保存在私有 `.env`。示例数据全部虚构；正式部署首次启动为空白工作区。账户设置支持验证器两步验证及一次性恢复码。

开源脱敏源码包：`npm run check:release` 检查后，运行 `npm run package:release` 生成不含 Git 历史、客户数据或凭证的 ZIP 及 SHA-256 清单。[脱敏范围与验证](SANITIZATION.md)

部署后请设置你的隐私声明，使用独立员工账户，并定期测试备份还原。报价打开记录只是一种活动信号，不能保证客户已阅读。
