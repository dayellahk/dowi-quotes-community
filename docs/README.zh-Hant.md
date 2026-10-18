# 自行部署 Dowi Quotes

免費開源 Web／後端，讓報價資料保留於你選擇的伺服器。建立報價、分享客戶連結、記錄開啟及接受狀態。

採用 **AGPL-3.0-only**。此 repository 不包含官方 iOS App 原始碼或託管收費授權服務。Web 可獨立免費使用；伺服器、儲存、電郵、網域與備份由你負責。

官方 iOS 私服連接為 **USD 50／公司／月，包含 10 人（含管理員）**；額外用戶 USD 5／人／月。管理員為公司付費，員工不用各自購買 Apple 訂閱。iOS 目前為測試版本，開通及購買安排請聯絡 support@dayella.co。

[完整安裝步驟（英文）](INSTALL.md) · [員工及 iOS 授權](IOS.md) · [整合設定](INTEGRATIONS.md) · [主頁](../README.md)

本機試用：`npm ci` → `npm run setup:local` → `npm start`，開啟 `http://localhost:3000/login`。帳戶為 `admin@example.test`，隨機密碼存於私有 `.env`。示範資料全部虛構；正式部署首次啟動為空白工作區。帳戶設定支援驗證器雙重驗證及一次性恢復碼。

開源脫敏源碼包：`npm run check:release` 檢查後，執行 `npm run package:release` 產生不含 Git 歷史、客戶資料或憑證的 ZIP 及 SHA-256 清單。[脫敏範圍與驗證](SANITIZATION.md)

部署後請設定你的私隱聲明，使用個別員工帳戶，並定期測試備份還原。報價開啟紀錄只屬活動訊號，不能保證客戶已閱讀。
