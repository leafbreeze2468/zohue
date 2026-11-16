# 只使用 Firebase Spark 免費方案，不使用 Cloud Functions

做伙飲的前提是零支出：不綁信用卡，也就沒有被意外扣款的可能。因此後端只使用 Firebase Spark 方案的 Firestore 與 Hosting。額度用完時服務會暫停到隔日重置，不會收費。

Cloud Functions 與 Firebase Storage 在新專案都需要 Blaze 付費方案，所以不使用。截止鎖單、「團員只能改自己的點單」、團長管理連結這類權限與時間規則，全部以 Firestore Security Rules 實作，搭配匿名登入辨識裝置，不寫伺服器端程式。菜單只存文字，不存圖片。

## Considered Options

- **Cloudflare Pages + Workers + D1**：同樣免費、不綁卡，但要自己寫 API 與同步機制，開發量與 token 消耗較大。
- **Supabase 免費方案**：一週沒人使用就會暫停專案，不適合使用頻率不固定的工具。
- **無後端（團員把點單文字貼回 LINE，再由團長貼回工具彙總）**：體驗太差，失去工具的意義。

## Consequences

- 若日後需要伺服器端邏輯（例如排程刪除、金流 webhook），必須升級 Blaze 並綁卡，屬於需要使用者另行同意的支出決定。
- 30 天資料保留優先用 Firestore TTL；若 Spark 不支援，改為過期資料不顯示，再手動清理。
